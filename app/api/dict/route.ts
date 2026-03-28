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

// 在字典文字中查找詞語，返回包含解釋的段落
function lookupWord(html: string, word: string): string | null {
  // 搜尋詞語在 HTML 中的位置
  const idx = html.indexOf(word)
  if (idx === -1) return null

  // 往前找段落起始，往後找段落結尾，截取上下文
  const contextStart = Math.max(0, idx - 100)
  const contextEnd = Math.min(html.length, idx + 600)
  const context = html.slice(contextStart, contextEnd)

  return stripHtml(context).trim()
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
