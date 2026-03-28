// 【字典查詢 API】
// 這個文件負責：解析現代漢語詞典 MOBI 文件，根據查詢詞語返回解釋。
// 流程：首次請求時解析 MOBI，之後快取在記憶體中，後續查詢直接用快取。

import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// 全局快取：解析過的字典文字
let dictHtml: string | null = null

// PalmDoc 解壓縮算法（MOBI 使用的 LZ77 變體）
function decompressPalmDoc(data: Buffer): Buffer {
  const result: number[] = []
  let i = 0
  while (i < data.length) {
    const b = data[i++]
    if (b === 0) {
      result.push(0)
    } else if (b <= 8) {
      for (let j = 0; j < b && i < data.length; j++) result.push(data[i++])
    } else if (b <= 0x7f) {
      result.push(b)
    } else if (b <= 0xbf) {
      if (i >= data.length) break
      const c = data[i++]
      const d = (b << 8) | c
      const length = (d & 7) + 3
      const offset = (d >> 3) & 0x7ff
      const pos = result.length - offset
      for (let j = 0; j < length; j++) result.push(pos + j >= 0 ? (result[pos + j] ?? 0) : 0)
    } else {
      // 0xC0-0xFF：空格編碼
      result.push(b ^ 0x80)
      result.push(0x20)
    }
  }
  return Buffer.from(result)
}

// 從 MOBI 文件提取所有 HTML 文字
function extractMobiHtml(filePath: string): string {
  const buf = readFileSync(filePath)

  // 讀取 PalmDB 記錄數量（固定在偏移 76）
  const numRecords = buf.readUInt16BE(76)

  // 讀取每條記錄的起始偏移量
  const offsets: number[] = []
  for (let i = 0; i < numRecords; i++) {
    offsets.push(buf.readUInt32BE(78 + i * 8))
  }

  // 記錄 0：PalmDoc 頭 + MOBI 頭
  const rec0 = offsets[0]
  const compression = buf.readUInt16BE(rec0)       // 1=無壓縮, 2=PalmDoc
  const textRecordCount = buf.readUInt16BE(rec0 + 8) // 文字記錄數量

  // 提取並解壓縮文字記錄（記錄 1 開始）
  const parts: Buffer[] = []
  for (let r = 1; r <= textRecordCount && r < offsets.length; r++) {
    const start = offsets[r]
    const end = r + 1 < offsets.length ? offsets[r + 1] : buf.length
    const chunk = buf.slice(start, end)
    parts.push(compression === 2 ? decompressPalmDoc(chunk) : chunk)
  }

  // 嘗試 UTF-8 解碼（中文字典通常是 UTF-8）
  const raw = Buffer.concat(parts)
  try {
    return raw.toString('utf-8')
  } catch {
    return raw.toString('latin1')
  }
}

// 去除 HTML 標籤，保留純文字
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/g, '')
    .replace(/\s{2,}/g, '\n')
    .trim()
}

// 將詞語轉為 RegExp 安全字串（避免特殊字符干擾）
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 找下一個詞條的起始位置（下一個「詞語 + 拼音」模式），用來截斷當前詞條
function findNextEntry(text: string, from: number): number {
  // 詞條模式：1-4 個中文字符後跟空格和拼音（含聲調字母）
  const nextEntryRe = /[\u4e00-\u9fff]{1,4}\s{0,3}[a-z]*[\u00C0-\u024F][a-z\u00C0-\u024F·]*/g
  nextEntryRe.lastIndex = from
  const m = nextEntryRe.exec(text)
  return m ? m.index : text.length
}

// 在字典純文字中查找詞語，使用「詞語 + 拼音聲調」作為詞條識別標準
function lookupWord(html: string, word: string): string | null {
  const plain = stripHtml(html)
  const esc = escapeRegex(word)

  // 核心策略：詞條標題後面必定跟著拼音（包含聲調字母 ā á ǎ à ē é ě è 等）
  // Unicode U+00C0-U+024F 涵蓋所有帶聲調的拼音字母
  const headwordRe = new RegExp(
    esc + '\\s{0,3}[a-z]*[\\u00C0-\\u024F][a-z\\u00C0-\\u024F·]*',
    'g'
  )

  let bestMatch: string | null = null
  let m: RegExpExecArray | null

  while ((m = headwordRe.exec(plain)) !== null) {
    const entryStart = m.index
    // 找到下一個詞條的位置，用來截斷當前詞條（最多取 600 字符）
    const nextEntry = findNextEntry(plain, entryStart + word.length + 5)
    const entryEnd = Math.min(entryStart + 600, nextEntry)
    const entryText = plain.slice(entryStart, entryEnd).trim()

    // 優先返回第一個匹配（詞典按拼音排序，第一個最可能是正確詞條）
    bestMatch = entryText
    break
  }

  return bestMatch
}

export async function GET(request: NextRequest) {
  // 讀取查詢詞語
  const word = request.nextUrl.searchParams.get('word')?.trim()
  if (!word) {
    return NextResponse.json({ error: '請提供查詢詞語' }, { status: 400 })
  }

  try {
    // 第一次請求時解析 MOBI，之後使用快取
    if (!dictHtml) {
      const dictPath = join(process.cwd(), '[3_01]现代汉语词典.mobi')
      if (!existsSync(dictPath)) {
        return NextResponse.json({ error: '字典文件不存在，請確認 MOBI 文件在項目根目錄' }, { status: 404 })
      }
      dictHtml = extractMobiHtml(dictPath)
    }

    const definition = lookupWord(dictHtml, word)
    if (!definition) {
      return NextResponse.json({ definition: null, message: `找不到「${word}」的解釋` })
    }

    return NextResponse.json({ definition })
  } catch (error) {
    return NextResponse.json({ error: `解析錯誤：${String(error)}` }, { status: 500 })
  }
}
