// 【🚇 閱讀地鐵站】將一本書分成「站」
// 1) 書本身有章節（EPUB／收入書架嘅課程）→ 直接用
// 2) 冇 → 喺內文搵「第X章／第X講／序言／後記／Chapter 1」等標題（目錄重複嘅取最後一次出現）
// 3) 都搵唔到 → 大約每 300 句（約 15 分鐘）設一個站，用嗰段開頭幾個字做站名

import type { ChapterMark } from './storage'
import { PARA_SEP } from './epubParser'

export interface Station { title: string; startIndex: number; auto?: boolean }

const CN_NUM = '一二三四五六七八九十百千零〇两兩\\d'
const HEAD_RE = new RegExp(
  `^\\s*(第[${CN_NUM}]+[章節节回講讲篇部卷集課课]|序[章言幕]?|前言|引言|楔子|導言|导言|尾聲|尾声|後記|后记|結語|结语|附錄|附录|Chapter\\s*\\d+|CHAPTER\\s*\\d+|Part\\s*\\d+|PART\\s*\\d+)` +
  `[\\s:：·.、]*([^\\s，。！？,.!?；;：:]{0,14})`,
)

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

function detectHeadings(sentences: string[]): Station[] {
  const found: Station[] = []
  const limit = Math.min(sentences.length, 200000)
  for (let i = 0; i < limit; i++) {
    const s = sentences[i]
    if (!s || s === PARA_SEP || s.length > 80 || s.startsWith('data:image/')) continue
    const m = HEAD_RE.exec(s)
    if (!m) continue
    const title = clean(m[1] + (m[2] ? ' ' + m[2] : ''))
    found.push({ title, startIndex: i })
  }
  // 目錄：同一標題出現多次 → 只留最後一次（正文嗰次）
  const lastByTitle = new Map<string, number>()
  found.forEach((f, k) => lastByTitle.set(f.title, k))
  let out = found.filter((f, k) => lastByTitle.get(f.title) === k)
  // 擠埋一齊（相隔 < 8 句）多數係目錄 → 剔走
  out = out.filter((f, k) => {
    const next = out[k + 1]
    return !next || next.startIndex - f.startIndex >= 8
  })
  return out
}

function evenStations(sentences: string[]): Station[] {
  const n = sentences.length
  const step = Math.max(300, Math.ceil(n / 40))
  const out: Station[] = []
  for (let start = 0, k = 1; start < n; start += step, k++) {
    let j = start
    while (j < n && (sentences[j] === PARA_SEP || sentences[j]?.startsWith('data:image/'))) j++
    const head = clean(sentences[j] || '').replace(/[，。！？,.!?；;：:]+$/, '').slice(0, 8)
    out.push({ title: `第 ${k} 站${head ? ' · ' + head : ''}`, startIndex: start, auto: true })
  }
  return out
}

export function computeStations(sentences: string[], chapters?: ChapterMark[]): Station[] {
  if (!sentences.length) return []
  let st: Station[]
  if (chapters && chapters.length >= 2) {
    st = chapters.map(c => ({ title: clean(c.title) || '未命名', startIndex: Math.max(0, Math.min(c.startIndex, sentences.length - 1)) }))
  } else {
    const h = detectHeadings(sentences)
    st = h.length >= 3 ? h : evenStations(sentences)
  }
  st.sort((a, b) => a.startIndex - b.startIndex)
  if (!st.length || st[0].startIndex > 0) {
    st.unshift({ title: chapters?.[0]?.title ? clean(chapters[0].title) : '起點', startIndex: 0, auto: true })
  }
  // 同一位置重複 → 留後面嗰個
  return st.filter((s, k) => !st[k + 1] || st[k + 1].startIndex !== s.startIndex)
}

// 而家喺邊個站（二分搜尋）
export function stationAt(stations: Station[], index: number): number {
  let lo = 0, hi = stations.length - 1, ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (stations[mid].startIndex <= index) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}
