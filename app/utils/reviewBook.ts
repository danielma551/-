// 【每日温習書】把今日要温習的 24 張筆記做成一本虛擬書：
// 一頁一張卡，只保留重要信息（書本名稱／日期／內容），喺閱讀器入面翻頁温習，
// 每頁有「✓ 温習咗」掣確認先計入循環。

import { BookData, ReviewNote, reviewStorage } from './storage'
import { getAllBooksFromIDB, saveBookToIDB } from './bookDB'

export const REVIEW_BOOK_ID = 'daily-review'
export const REVIEW_NOTE_PREFIX = 'data:review-note;'
const BOOK_TITLE = '每日温習'
const BOOK_DATE_KEY = 'review-book-date'   // 呢本書係邊一日嘅（每日重建一次）

// 一頁卡片嘅內容（序列化存入 sentences）
export interface ReviewPage {
  id: string        // 對應 ReviewNote.id（撳 ✓ 時標記温習）
  text: string      // 呢一頁顯示嘅一句
  source?: string   // 書本名稱
  date: string      // 建立日期 YYYY-MM-DD
  meta?: string     // 附加資訊（章節／時間／標籤）
  si?: number       // 第幾句（1 起）
  sc?: number       // 呢張筆記共幾多句
}

// 把筆記內容拆成句子——同平時閱讀一樣嘅斷句規則（epubParser）：
// 按 。！？；，：（及英文 .!?;,:）斷開，標點保留喺句末
function splitSentences(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\n+/)) {
    const t = line.trim()
    if (!t) continue
    const matched = t.match(/[^.!?\u3002\uff01\uff1f;\uff1b,\uff0c:\uff1a]+[.!?\u3002\uff01\uff1f;\uff1b,\uff0c:\uff1a]+/g)
    if (matched) {
      out.push(...matched.map(m => m.trim()).filter(Boolean))
      // 行尾冇標點嘅殘句都要保留
      const joined = matched.join('')
      if (joined.length < t.length) {
        const rest = t.slice(joined.length).trim()
        if (rest) out.push(rest)
      }
    } else {
      out.push(t)
    }
  }
  return out.length > 0 ? out : [text]
}

// 一張筆記 → 多頁（每頁一句；最後一句嗰頁先有 ✓ 掣）
export function encodeReviewPages(n: ReviewNote): string[] {
  const date = new Date(n.createdAt).toLocaleDateString('en-CA')
  const sens = splitSentences(n.text)
  return sens.map((s, i) => {
    const pg: ReviewPage = {
      id: n.id, text: s, source: n.source, date,
      meta: i === sens.length - 1 ? n.meta : undefined,   // meta 只喺最後一頁顯示
      si: i + 1, sc: sens.length,
    }
    return REVIEW_NOTE_PREFIX + encodeURIComponent(JSON.stringify(pg))
  })
}

export function parseReviewPage(s: string): ReviewPage | null {
  if (!s || !s.startsWith(REVIEW_NOTE_PREFIX)) return null
  try {
    return JSON.parse(decodeURIComponent(s.slice(REVIEW_NOTE_PREFIX.length))) as ReviewPage
  } catch { return null }
}

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA')
}

export function isReviewedToday(n: ReviewNote | undefined): boolean {
  return !!n?.lastReviewed && new Date(n.lastReviewed).toLocaleDateString('en-CA') === todayStr()
}

// 打開（必要時重建）每日温習書：回傳 { book, startIndex }
// - 每日第一次打開：按循環抽今日一批卡，重建書頁
// - 同日再打開：沿用書頁，跳到第一張未温習嘅卡
export async function openReviewBook(limit = 24): Promise<{ book: BookData; startIndex: number }> {
  const { queue } = reviewStorage.resumeOrStartDaily(limit)
  const today = todayStr()
  const books = await getAllBooksFromIDB()
  let book = books.find(b => b.id === REVIEW_BOOK_ID)
  const builtStamp = `${today}|v3`   // v3：斷句規則對齊閱讀（含逗號），bump 版本以強制重建
  const builtDate = typeof window !== 'undefined' ? localStorage.getItem(BOOK_DATE_KEY) : null

  if (!book || builtDate !== builtStamp || book.sentences.length === 0) {
    if (queue.length === 0) throw new Error('今日冇可温習嘅卡片（可能已全部温習完，聽日再嚟）')
    const now = Date.now()
    book = {
      id: REVIEW_BOOK_ID,
      title: BOOK_TITLE,
      sentences: queue.flatMap(encodeReviewPages),
      currentIndex: 0,
      uploadDate: book?.uploadDate ?? now,
      lastReadDate: now,
      coverColor: '#b45309',
      chapters: [{ title: `${today} · ${queue.length} 張`, startIndex: 0 }],
    }
    await saveBookToIDB(book)
    if (typeof window !== 'undefined') localStorage.setItem(BOOK_DATE_KEY, builtStamp)
  }

  // 續讀位置：取「離開嗰陣嘅頁數」同「第一張未温卡」較後者
  // （揭過但未撳 ✓ 嘅卡唔會迫你由頭嚟過；撳咗 ✓ 嘅卡直接跳過）
  const notes = new Map(reviewStorage.getAll().map(n => [n.id, n]))
  const firstUnreviewed = book.sentences.findIndex(s => {
    const pg = parseReviewPage(s)
    return !!pg && !isReviewedToday(notes.get(pg.id))
  })
  const saved = Math.min(Math.max(book.currentIndex || 0, 0), book.sentences.length - 1)
  const startIndex = Math.max(firstUnreviewed >= 0 ? firstUnreviewed : 0, saved)
  return { book, startIndex }
}
