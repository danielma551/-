'use client'

// 【專欄書內頁】書架撳入「得到頭条」呢類專欄書，先顯示文章列表（大圖＋標題），
// 撳文章先入閱讀器。

import { useEffect, useState } from 'react'
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

// 封面：優先 chapter.cover（得到文章頂部大圖），其次章節內第一個 img:，最後自動生成
function coverOf(book: BookData, ch: { startIndex: number; cover?: string }): string {
  if (ch.cover) return ch.cover
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

const PER_PAGE = 30

export default function ColumnBookView({ book, onBack, onOpenArticle }: Props) {
  const chapters = [...(book.chapters || [])].sort((a, c) => book.chronological ? (a.date || 0) - (c.date || 0) : (c.date || 0) - (a.date || 0))
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [book.id])
  const pageCount = Math.max(1, Math.ceil(chapters.length / PER_PAGE))
  const shown = chapters.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)

  return (
    <main className="cc-app min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <button onClick={onBack} className="cc-back">
          <ArrowLeft className="w-4 h-4" /> 我的書架
        </button>

        <header className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="grid place-items-center w-12 h-12 rounded-2xl border-[3px] border-[#2E2A26] bg-[#6ED3B6] shadow-[3px_3px_0_#2E2A26] -rotate-6">
              <Rss className="w-6 h-6 text-[#2E2A26]" />
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#2E2A26]">{book.title}</h1>
            <span className="cc-chip text-[#2E2A26] whitespace-nowrap">{chapters.length} 篇</span>
          </div>
          <p className="mt-2 text-sm font-bold text-[#7A6E63]">精挑细淘，得到头条。每个工作日一篇。</p>
        </header>

        <div className="grid gap-5 sm:grid-cols-2">
          {shown.map(ch => {
            const read = columnReadStorage.isRead(`${book.id}:${ch.startIndex}`)
            const cover = coverOf(book, ch)
            return (
              <button
                key={`${ch.startIndex}-${ch.title}`}
                onClick={() => onOpenArticle(ch.startIndex)}
                className={`cc-card cc-row overflow-hidden text-left p-0 ${read ? 'opacity-70' : ''}`}
              >
                <div className="relative w-full aspect-[16/10] overflow-hidden bg-[#FFE3D9]">
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-full h-full bg-cover bg-center"
                      style={{ backgroundImage: getGeneratedCover({ title: ch.title }) }}
                    />
                  )}
                  <span className="absolute left-3 top-3 inline-flex items-center px-2.5 py-1 rounded-full border-[2.5px] border-[#2E2A26] bg-[#FFD166] text-[11px] font-extrabold text-[#2E2A26] shadow-[2px_2px_0_#2E2A26]">
                    {relDate(ch.date)}
                  </span>
                  {read && (
                    <span className="absolute right-3 top-3 inline-flex items-center px-2.5 py-1 rounded-full border-[2.5px] border-[#2E2A26] bg-[#D9F5EA] text-[11px] font-extrabold text-[#146B52] shadow-[2px_2px_0_#2E2A26]">
                      ✓ 已讀
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className={`text-lg font-extrabold leading-snug line-clamp-2 ${read ? 'text-[#7A6E63]' : 'text-[#2E2A26]'}`}>
                    {ch.title}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-[#7A6E63]">{relDate(ch.date)}</span>
                    {read ? (
                      <span className="text-xs font-extrabold text-[#146B52]">✓ 已讀</span>
                    ) : (
                      <span className="inline-flex items-center px-3.5 py-1 rounded-full border-[2.5px] border-[#2E2A26] bg-[#FF7A59] shadow-[2px_2px_0_#2E2A26] text-xs font-extrabold text-[#2E2A26]">
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

        {pageCount > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              disabled={page === 0}
              className="cc-btn cc-btn-ghost disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← 上一頁
            </button>
            <span className="text-sm font-extrabold text-[#2E2A26] tabular-nums">第 {page + 1} / {pageCount} 頁</span>
            <button
              onClick={() => { setPage(p => Math.min(pageCount - 1, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              disabled={page >= pageCount - 1}
              className="cc-btn cc-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一頁 →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
