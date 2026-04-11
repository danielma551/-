// 【字典查詢 API】
// 支援：
//   - 中文詞語 → 從現代漢語詞典 MOBI 文件中查詢（帶快取）
//   - 英文單詞 → 從 Free Dictionary API 查詢（免費，無需 API Key）

import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// 全局快取：已解析並清理好的字典純文字（只在首次請求時初始化）
let dictPlainText: string | null = null

// ─────────────────────────────────────────
// MOBI 解析：PalmDoc 解壓縮（LZ77 變體）
// ─────────────────────────────────────────
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

// ─────────────────────────────────────────
// 從 MOBI 提取純文字（解壓 + 清理 HTML）
// ─────────────────────────────────────────
function extractMobiPlainText(filePath: string): string {
  const buf = readFileSync(filePath)
  const numRecords = buf.readUInt16BE(76)

  const offsets: number[] = []
  for (let i = 0; i < numRecords; i++) {
    offsets.push(buf.readUInt32BE(78 + i * 8))
  }

  const rec0 = offsets[0]
  const compression = buf.readUInt16BE(rec0)
  const textRecordCount = buf.readUInt16BE(rec0 + 8)

  const parts: Buffer[] = []
  for (let r = 1; r <= textRecordCount && r < offsets.length; r++) {
    const start = offsets[r]
    const end = r + 1 < offsets.length ? offsets[r + 1] : buf.length
    // 每條記錄的最後 2 個字節是填充位，需去除以避免亂碼
    const rawChunk = buf.slice(start, Math.max(start, end - 2))
    parts.push(compression === 2 ? decompressPalmDoc(rawChunk) : rawChunk)
  }

  const raw = Buffer.concat(parts)
  const html = (() => {
    try { return raw.toString('utf-8') } catch { return raw.toString('latin1') }
  })()

  return cleanHtmlToText(html)
}

// 將 HTML 轉為乾淨的純文字
function cleanHtmlToText(html: string): string {
  return html
    // 先把塊級標籤轉換成換行，保留結構
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    // 去除所有 HTML 標籤
    .replace(/<[^>]+>/g, '')
    // 解碼常見 HTML 實體
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCharCode(parseInt(code)) } catch { return '' }
    })
    .replace(/&[a-zA-Z]+;/g, '')
    // 移除控制字符（保留換行 \n = 0x0a）
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '')
    // 多個空白（含空格）轉換為換行，這樣詞條之間會有分隔（與原始 MOBI 格式一致）
    .replace(/\s{2,}/g, '\n')
    // 壓縮多餘換行
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─────────────────────────────────────────
// 在純文字中查找中文詞條
// 現代漢語詞典格式：詞語 pīnyīn 【詞性】釋義
// ─────────────────────────────────────────
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lookupChineseWord(plainText: string, word: string): string | null {
  const esc = escapeRegex(word)

  // 策略：詞條標題後面必定緊跟拼音（含聲調字母，Unicode U+00C0-U+024F）
  // 不強制行首，因為 MOBI 格式不保證詞條一定在新行開始
  const headRe = new RegExp(
    esc + '\\s{0,3}[a-z]*[\\u00C0-\\u024F][a-z\\u00C0-\\u024F·]*',
    'g'
  )

  const m = headRe.exec(plainText)
  if (!m) return null

  const entryStart = m.index

  // 尋找下一個詞條的起始位置（中文字符 + 拼音聲調）
  const nextHeadRe = /[\u4e00-\u9fff]{1,4}\s{0,3}[a-z]*[\u00C0-\u024F][a-z\u00C0-\u024F·]*/g
  nextHeadRe.lastIndex = entryStart + word.length + 5

  const nextM = nextHeadRe.exec(plainText)
  // 最多取 800 個字符，避免返回過長的文字
  const entryEnd = nextM
    ? Math.min(nextM.index, entryStart + 800)
    : Math.min(entryStart + 800, plainText.length)

  const raw = plainText.slice(entryStart, entryEnd).trim()

  // 最後清理：去除殘留的奇怪字符
  return raw
    .replace(/[^\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u0020-\u007e\u00c0-\u024f\n【】（）「」『』、。，；：！？…]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─────────────────────────────────────────
// 英文詞典：使用免費的 dictionaryapi.dev
// ─────────────────────────────────────────
interface DictApiMeaning {
  partOfSpeech: string
  definitions: { definition: string; example?: string }[]
}

interface DictApiEntry {
  word: string
  phonetic?: string
  phonetics?: { text?: string }[]
  meanings: DictApiMeaning[]
}

async function lookupEnglishWord(word: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return null
    const data: DictApiEntry[] = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null

    const entry = data[0]
    const lines: string[] = []

    // 單詞 + 音標
    const phonetic =
      entry.phonetic ??
      entry.phonetics?.find((p) => p.text)?.text ??
      ''
    lines.push(`${entry.word}${phonetic ? '  ' + phonetic : ''}`)

    // 每種詞性最多顯示 2 條釋義
    for (const meaning of entry.meanings.slice(0, 4)) {
      lines.push(`\n【${meaning.partOfSpeech}】`)
      for (const def of meaning.definitions.slice(0, 2)) {
        lines.push(`• ${def.definition}`)
        if (def.example) lines.push(`  e.g. ${def.example}`)
      }
    }

    return lines.join('\n')
  } catch {
    return null
  }
}

// ─────────────────────────────────────────
// 語言偵測
// ─────────────────────────────────────────
function containsChinese(word: string): boolean {
  return /[\u4e00-\u9fff]/.test(word)
}

// ─────────────────────────────────────────
// GET /api/dict?word=...
// ─────────────────────────────────────────
export async function GET(request: NextRequest) {
  const word = request.nextUrl.searchParams.get('word')?.trim()
  if (!word) {
    return NextResponse.json({ error: '請提供查詢詞語' }, { status: 400 })
  }

  try {
    if (containsChinese(word)) {
      // ── 中文：使用現代漢語詞典 MOBI ──
      if (!dictPlainText) {
        const dictPath = join(process.cwd(), '[3_01]现代汉语词典.mobi')
        if (!existsSync(dictPath)) {
          return NextResponse.json(
            { error: '字典文件不存在，請確認 MOBI 文件在項目根目錄' },
            { status: 404 }
          )
        }
        dictPlainText = extractMobiPlainText(dictPath)
      }

      const definition = lookupChineseWord(dictPlainText, word)
      if (!definition) {
        return NextResponse.json({ definition: null, message: `找不到「${word}」的解釋` })
      }
      return NextResponse.json({ definition, source: 'mobi' })
    } else {
      // ── 英文：使用 Free Dictionary API ──
      const definition = await lookupEnglishWord(word)
      if (!definition) {
        return NextResponse.json({ definition: null, message: `No definition found for "${word}"` })
      }
      return NextResponse.json({ definition, source: 'en-api' })
    }
  } catch (error) {
    return NextResponse.json({ error: `解析錯誤：${String(error)}` }, { status: 500 })
  }
}
