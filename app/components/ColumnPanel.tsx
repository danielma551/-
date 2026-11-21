'use client'

// 【專欄文章列表】將「得到頭條」呢類專欄書，用文章列表（標題／摘要／日期／閱讀）顯示，
// 同 RSS 訂閱面板一樣嘅風格。點「閱讀」會喺閱讀器打開嗰一章。

import { useEffect, useMemo, useState } from 'react'
import { BookData } from '../utils/storage'
import { getAllBooksFromIDB } from '../utils/bookDB'
import { Rss } from 'lucide-react'

interface Props {
  onOpenBook: (book: BookData, sentenceIndex: number) => void
}

const PARA_SEP = '\u2029'

function relDate(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff <= 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff < 7) return `${diff} 天前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function summaryOf(book: BookData, chapterIndex: number): string {
  const chs = book.chapters || []
  const start = chs[chapterIndex]?.startIndex ?? 0
  const end = chs[chapterIndex + 1]?.startIndex ?? book.sentences.length
  const text = book.sentences.slice(start, end)
    .filter(s => s && s !== PARA_SEP && !s.startsWith('img:'))
    .join('')
  return text.replace(/\s+/g, ' ').slice(0, 120)
}

export default function ColumnPanel({ onOpenBook }: Props) {
  const [books, setBooks] = useState<BookData[]>([])

  useEffect(() => {
    getAllBooksFromIDB().then(all => {
      // 專欄書：有帶日期嘅章節，或者書名係「得到頭條」
      setBooks(all.filter(b => (b.chapters || []).some(c => c.date) || b.title.includes('得到头条')))
    })
  }, [])

  const panels = useMemo(() => books.map(b => {
    const chs = [...(b.chapters || [])]
    // 有日期就由新到舊；冇日期維持原本次序
    chs.sort((a, c) => (c.date || 0) - (a.date || 0))
    return { book: b, chapters: chs }
  }), [books])

  if (!panels.length) return null

  return (
    <div className="space-y-4">
      {panels.map(({ book, chapters }) => (
        <div key={book.id} className="rounded-xl border border-gray-100 bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <div className="flex items-center gap-2 min-w-0">
              <Rss className="w-4 h-4 text-sky-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-800 truncate">{book.title}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">{chapters.length} 篇</span>
            </div>
          </div>
          {chapters.map((ch, idx) => (
            <button
              key={`${ch.startIndex}-${ch.title}`}
              onClick={() => onOpenBook(book, ch.startIndex)}
              className="w-full text-left px-4 py-3 border-t border-gray-50 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">{ch.title}</p>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{summaryOf(book, (book.chapters || []).indexOf(ch))}</p>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <span className="text-xs text-gray-300 whitespace-nowrap">{relDate(ch.date)}</span>
                  <span className="text-xs text-blue-400">閱讀</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
