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

// 把筆記內容拆成句子（按 。！？；… ! ? 同換行斷開，標點保留喺句末）
function splitSentences(text: string): string[] {
  const SEP = '\u0001'
  const parts = text
    .replace(/([\u3002\uff01\uff1f\uff1b\u2026])/g, '$1' + SEP)      // 中文句末標點
    .replace(/([.!?])(\s+|$)/g, '$1' + SEP)                              // 英文句末標點（後接空白或結尾）
    .split(new RegExp(SEP + '|\\n+'))
    .map(s => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : [text]
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
  const builtStamp = `${today}|v2`   // v2：一頁一句（格式變更時 bump 版本以強制重建）
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

  // 跳到第一張今日未温習嘅卡（全部温習晒就由第一頁開始）
  const notes = new Map(reviewStorage.getAll().map(n => [n.id, n]))
  const idx = book.sentences.findIndex(s => {
    const pg = parseReviewPage(s)
    return !!pg && !isReviewedToday(notes.get(pg.id))
  })
  return { book, startIndex: idx >= 0 ? idx : 0 }
}
