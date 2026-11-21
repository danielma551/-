'use client'

// 【專欄書內頁】書架撳入「得到頭条」呢類專欄書，先顯示文章列表（標題／摘要／日期／閱讀），
// 撳文章先入閱讀器。

import { BookData, columnReadStorage } from '../utils/storage'
import { ArrowLeft, Rss } from 'lucide-react'

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

function summaryOf(book: BookData, ch: { startIndex: number }): string {
  const chs = book.chapters || []
  const i = chs.indexOf(ch as never)
  const start = ch.startIndex ?? 0
  const end = chs[i + 1]?.startIndex ?? book.sentences.length
  const text = book.sentences.slice(start, end)
    .filter(s => s && s !== PARA_SEP && !s.startsWith('img:'))
    .join('')
  return text.replace(/\s+/g, ' ').slice(0, 140)
}

interface Props {
  book: BookData
  onBack: () => void
  onOpenArticle: (startIndex: number) => void
}

export default function ColumnBookView({ book, onBack, onOpenArticle }: Props) {
  const chapters = [...(book.chapters || [])].sort((a, c) => (c.date || 0) - (a.date || 0))

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <header className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 書架
          </button>
        </header>

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2 min-w-0">
              <Rss className="w-4 h-4 text-sky-500 flex-shrink-0" />
              <h1 className="font-serif-tc text-lg font-bold text-gray-900 truncate">{book.title}</h1>
              <span className="text-xs text-gray-400 flex-shrink-0">{chapters.length} 篇</span>
            </div>
          </div>

          {chapters.map(ch => {
            const read = columnReadStorage.isRead(`${book.id}:${ch.startIndex}`)
            return (
              <button
                key={`${ch.startIndex}-${ch.title}`}
                onClick={() => onOpenArticle(ch.startIndex)}
                className={`w-full text-left px-5 py-4 border-t border-gray-50 transition-colors ${read ? 'opacity-50 hover:bg-gray-50' : 'hover:bg-blue-50'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium line-clamp-2 leading-snug ${read ? 'text-gray-400' : 'text-gray-800'}`}>{ch.title}</p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{summaryOf(book, ch)}</p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <span className="text-xs text-gray-300 whitespace-nowrap">{relDate(ch.date)}</span>
                    {read
                      ? <span className="text-xs text-green-400">✓ 已讀</span>
                      : <span className="text-xs text-blue-400">閱讀</span>}
                  </div>
                </div>
              </button>
            )
          })}

          {chapters.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-gray-400">仲未有任何文章</p>
          )}
        </div>
      </div>
    </main>
  )
}
