// 【每日外刊】用 DeepSeek 生成一篇外刊精讀（英文 + 中文翻譯 + 語言講解，友鄰優課風格），
// 存入固定的「外刊」書；每天一篇，作為新章節追加到書末。

import { BookData } from './storage'
import { getAllBooksFromIDB, saveBookToIDB } from './bookDB'

export const EXTERNAL_BOOK_ID = 'external-reading'
const BOOK_TITLE = '外刊'
const PARA_SEP = ' '   // 與 epubParser / Reader 一致的段落分隔符
const LAST_DATE_KEY = 'external-reading-last-date'

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-v4-flash'   // deepseek-chat 已於 2026-07-24 停用

interface RawSentence { en?: string; zh?: string }
interface RawParagraph { sentences?: RawSentence[]; notes?: string }
interface RawGloss { word?: string; note?: string }
interface RawArticle { title?: string; title_zh?: string; paragraphs?: RawParagraph[]; glossary?: RawGloss[] }

const PROMPT = `你是一位英語外刊精讀老師，風格類似「友鄰優課」。請生成一篇高質量、地道的英文短文（模仿 The Economist / The Atlantic / The New Yorker 等外刊的語言風格與思辨視角），主題有趣、有思想性，適合中高級英語學習者。

要求：
1. 全文約 5 段，每段 2-4 句，總長適中（不要太長）。
2. 內容必須真實、準確，基於真實世界的常識與事實；不可捏造具體數據、研究、人名或引言。可寫觀點、觀察與常識性論述，但凡涉及事實必須真確，寧可含糊也不要虛構。
3. 「以標點斷句」提供英中對照：把每段拆到「短句／從句」層級——每遇到逗號 , 、句號 . 、分號 ; 、問號 ? 、感嘆號 ! 就斷成一節（標點保留在該節末），每一節一個 en/zh 對照：
   - en：該節英文原文
   - zh：該節對應的中文翻譯（逐節對照）
4. 每段另給 notes：語言講解（用中文，挑重點詞彙／地道搭配／句型／修辭或文化背景，親切有洞見）。
5. 另給 glossary：從全文挑 6-10 個值得學習的英文詞或詞組，每個給 note（可以是詞義、用法、詞源／歷史、文化背景，由你決定，用中文，精簡有洞見）。word 用文章中的原形或常見詞形。
6. 嚴格只輸出 JSON，不要任何多餘文字或 markdown：
{"title":"English Title","title_zh":"中文標題","paragraphs":[{"sentences":[{"en":"...","zh":"..."}],"notes":"..."}],"glossary":[{"word":"...","note":"..."}]}`

const GLOSSARY_KEY = 'external-glossary'

// 詞彙表（跨天累積）：word(小寫) → note
export function getGlossary(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(GLOSSARY_KEY) || '{}') } catch { return {} }
}
function saveGlossary(gloss: RawGloss[]) {
  if (typeof window === 'undefined' || !Array.isArray(gloss)) return
  const map = getGlossary()
  for (const g of gloss) {
    if (g?.word && g?.note) map[g.word.trim().toLowerCase()] = g.note.trim()
  }
  try { localStorage.setItem(GLOSSARY_KEY, JSON.stringify(map)) } catch { /* 配額滿略過 */ }
}
// 查詞：去掉前後標點後對照詞彙表
export function lookupGlossary(word: string): string | null {
  if (!word) return null
  const map = getGlossary()
  const raw = word.trim().toLowerCase()
  const stripped = raw.replace(/^[^a-z]+|[^a-z]+$/g, '')
  return map[stripped] || map[raw] || null
}

export function todayStr(): string {
  return new Date().toLocaleDateString('en-CA')   // YYYY-MM-DD（本地時區）
}

export function alreadyGeneratedToday(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(LAST_DATE_KEY) === todayStr()
}

// 解析 DeepSeek 回傳（容錯：去 ```json 圍欄、取第一個 {...}）
function parseArticle(raw: string): RawArticle {
  let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const s = text.indexOf('{'); const e = text.lastIndexOf('}')
  if (s !== -1 && e !== -1 && e > s) text = text.slice(s, e + 1)
  return JSON.parse(text)
}

async function callDeepSeek(apiKey: string): Promise<RawArticle> {
  const res = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: PROMPT }],
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: 3200,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? res.status
    throw new Error(`DeepSeek API 錯誤: ${msg}`)
  }
  const content: string = data.choices?.[0]?.message?.content ?? ''
  if (!content) throw new Error('AI 沒有回傳內容')
  const article = parseArticle(content)
  if (!article.paragraphs || article.paragraphs.length === 0) throw new Error('生成內容格式不正確')
  return article
}

// 把文章轉成閱讀器的「句子」卡片：
// 標題 →（每句一張卡：上英文、下中文）→ 該段講解 💡 → 段落分隔，逐段重複。
function buildCards(a: RawArticle, dateLabel: string): string[] {
  const cards: string[] = []
  const title = (a.title || 'Today’s Reading').trim()
  const titleZh = (a.title_zh || '').trim()
  cards.push(`📰 ${dateLabel}｜${title}${titleZh ? `\n${titleZh}` : ''}`)
  cards.push(PARA_SEP)
  for (const p of a.paragraphs || []) {
    for (const s of p.sentences || []) {
      const en = (s.en || '').trim()
      const zh = (s.zh || '').trim()
      if (!en && !zh) continue
      // 一張卡：上面英文，下面中文（閱讀器 white-space: pre-wrap 會保留換行）
      cards.push(zh ? `${en}\n\n${zh}` : en)
    }
    if (p.notes && p.notes.trim()) cards.push(`💡 ${p.notes.trim()}`)
    cards.push(PARA_SEP)
  }
  return cards
}

// 生成今日外刊並追加到「外刊」書，回傳 { book, startIndex }（startIndex = 今日文章開頭，方便直接跳讀）
export async function generateTodayArticle(apiKey: string): Promise<{ book: BookData; startIndex: number }> {
  const article = await callDeepSeek(apiKey)
  const dateLabel = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
  const cards = buildCards(article, dateLabel)

  const books = await getAllBooksFromIDB()
  const now = Date.now()
  let book = books.find(b => b.id === EXTERNAL_BOOK_ID)
  if (!book) {
    book = {
      id: EXTERNAL_BOOK_ID, title: BOOK_TITLE, sentences: [], currentIndex: 0,
      uploadDate: now, lastReadDate: now, coverColor: '#0f766e', chapters: [],
    }
  }
  const startIndex = book.sentences.length
  const chapterTitle = `${dateLabel} ${(article.title_zh || article.title || '外刊精讀').trim()}`
  book.chapters = [...(book.chapters || []), { title: chapterTitle, startIndex }]
  book.sentences = [...book.sentences, ...cards]
  book.lastReadDate = now

  await saveBookToIDB(book)
  saveGlossary(article.glossary || [])   // 存詞彙表，供閱讀時「向外延伸」解釋卡
  if (typeof window !== 'undefined') localStorage.setItem(LAST_DATE_KEY, todayStr())
  return { book, startIndex }
}

// 取「外刊」書與最新一篇文章的開頭 index（用於「已生成則直接打開」）
export async function getExternalBook(): Promise<{ book: BookData; startIndex: number } | null> {
  const books = await getAllBooksFromIDB()
  const book = books.find(b => b.id === EXTERNAL_BOOK_ID)
  if (!book) return null
  const last = book.chapters && book.chapters.length > 0 ? book.chapters[book.chapters.length - 1].startIndex : 0
  return { book, startIndex: last }
}
