// 【字典查詢 API】
// 支援：
//   - 中文詞語 → 從新華詞典純文字檔查詢（xinhua_dict.txt，帶快取）
//   - 英文單詞 → 從 Free Dictionary API 查詢（免費，無需 API Key）

import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// 全局快取：已解析並清理好的字典純文字（只在首次請求時初始化）
let dictPlainText: string | null = null

// ─────────────────────────────────────────
// 在純文字中查找中文詞條
// 新華詞典格式：
//   單字：「阿 ㈠ ā 前缀...」行首直接是字頭
//   多字：「[ 阿門 ] 釋義...」方括號包裹
//   詞條之間用 \n\n 分隔
// ─────────────────────────────────────────
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lookupChineseWord(plainText: string, word: string): string | null {
  const esc = escapeRegex(word)
  let m: RegExpExecArray | null = null

  if (word.length > 1) {
    // 多字詞條：優先找「[ 詞組 ]」格式
    m = new RegExp('\\[\\s*' + esc + '\\s*\\]', 'g').exec(plainText)
    // 降級：行首直接匹配
    if (!m) m = new RegExp('^' + esc + '[ \\t]', 'gm').exec(plainText)
    // 最後保底：全文
    if (!m) m = new RegExp(esc, 'g').exec(plainText)
  } else {
    // 單字詞條：行首嚴格匹配，避免誤中釋義內文
    m = new RegExp('^' + esc + '[ \\t]', 'gm').exec(plainText)
    if (!m) m = new RegExp(esc + '[ \\t]', 'g').exec(plainText)
  }

  if (!m) return null
  const entryStart = m.index

  // 新華詞典用 \n\n 雙換行分隔詞條，最多取 600 字符
  const nextDouble = plainText.indexOf('\n\n', entryStart + 5)
  const entryEnd = nextDouble > 0
    ? Math.min(nextDouble, entryStart + 600)
    : Math.min(entryStart + 600, plainText.length)

  return plainText
    .slice(entryStart, entryEnd)
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
  return /[一-鿿]/.test(word)
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
      // ── 中文：使用新華詞典純文字檔 ──
      if (!dictPlainText) {
        const dictPath = join(process.cwd(), 'xinhua_dict.txt')
        if (!existsSync(dictPath)) {
          return NextResponse.json(
            { error: '字典文件不存在，請確認 xinhua_dict.txt 在項目根目錄' },
            { status: 404 }
          )
        }
        dictPlainText = readFileSync(dictPath, 'utf-8')
      }

      const definition = lookupChineseWord(dictPlainText, word)
      if (!definition) {
        return NextResponse.json({ definition: null, message: `找不到「${word}」的解釋` })
      }
      return NextResponse.json({ definition, source: 'xinhua' })
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
