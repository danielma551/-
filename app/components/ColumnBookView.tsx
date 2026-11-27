'use client'

// 【專欄書內頁】書架撳入「得到頭条」呢類專欄書，先顯示文章列表（標題／摘要／日期／閱讀），
// 撳文章先入閱讀器。

import { BookData, columnReadStorage } from '../utils/storage'
import { getGeneratedCover } from '../utils/coverArt'
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

function coverOf(book: BookData, ch: { startIndex: number }): string {
  const chs = book.chapters || []
  const i = chs.findIndex(c => c.startIndex === ch.startIndex)
  const end = chs[i + 1]?.startIndex ?? book.sentences.length
  for (let k = ch.startIndex; k < Math.min(end, ch.startIndex + 8); k++) {
    const s = book.sentences[k]
    if (s && s.startsWith('img:')) return s.slice(4)
  }
  return ''
}

interface Props {
  book: BookData
  onBack: () => void
  onOpenArticle: (startIndex: number) => void
}

export default function ColumnBookView({ book, onBack, onOpenArticle }: Props) {
  const chapters = [...(book.chapters || [])].sort((a, c) => book.chronological ? (a.date || 0) - (c.date || 0) : (c.date || 0) - (a.date || 0))

  return (
    <main className="cc-app min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <button onClick={onBack} className="cc-back">
          <ArrowLeft className="w-4 h-4" /> 我的書架
        </button>

        <header className="mb-6">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-12 h-12 rounded-2xl border-[3px] border-[#2E2A26] bg-[#6ED3B6] shadow-[3px_3px_0_#2E2A26] -rotate-6">
              <Rss className="w-6 h-6 text-[#2E2A26]" />
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2E2A26]">{book.title}</h1>
            <span className="cc-chip text-[#2E2A26]">{chapters.length} 篇</span>
          </div>
          <p className="mt-2 text-sm font-bold text-[#7A6E63]">精挑细淘，得到头条。每个工作日一篇。</p>
        </header>

        <div className="grid gap-4">
          {chapters.map(ch => {
            const read = columnReadStorage.isRead(`${book.id}:${ch.startIndex}`)
            return (
              <button
                key={`${ch.startIndex}-${ch.title}`}
                onClick={() => onOpenArticle(ch.startIndex)}
                className={`cc-card cc-row w-full text-left px-5 py-5 sm:px-6 sm:py-6 ${read ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {(() => {
                    const cover = coverOf(book, ch)
                    return cover ? (
                      <img
                        src={cover}
                        alt=""
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-16 h-[86px] flex-shrink-0 object-cover rounded-xl border-[3px] border-[#2E2A26] shadow-[3px_3px_0_#2E2A26]"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="w-16 h-[86px] flex-shrink-0 rounded-xl border-[3px] border-[#2E2A26] shadow-[3px_3px_0_#2E2A26] bg-cover bg-center"
                        style={{ backgroundImage: getGeneratedCover({ title: ch.title }) }}
                      />
                    )
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className={`text-lg sm:text-xl font-extrabold leading-snug line-clamp-2 ${read ? 'text-[#7A6E63]' : 'text-[#2E2A26]'}`}>
                      {ch.title}
                    </p>
                    <p className="mt-1.5 text-sm sm:text-[15px] leading-relaxed text-[#7A6E63] line-clamp-2">
                      {summaryOf(book, ch)}
                    </p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-2">
                    <span className="text-xs font-bold text-[#7A6E63] whitespace-nowrap">{relDate(ch.date)}</span>
                    {read ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full border-[2.5px] border-[#2E2A26] bg-[#D9F5EA] text-xs font-extrabold text-[#146B52] whitespace-nowrap">
                        ✓ 已讀
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-4 py-1.5 rounded-full border-[2.5px] border-[#2E2A26] bg-[#FF7A59] shadow-[2px_2px_0_#2E2A26] text-sm font-extrabold text-[#2E2A26] whitespace-nowrap">
                        閱讀
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}

          {chapters.length === 0 && (
            <p className="cc-card px-5 py-10 text-center text-sm font-bold text-[#7A6E63]">仲未有任何文章</p>
          )}
        </div>
      </div>
    </main>
  )
}
