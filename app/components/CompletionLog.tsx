'use client'

// 【完書誌 · Reading Chronicle】
// 記錄每一日睇完嘅書（自動記錄讀完嘅電子書，亦支援手動補記實體書／得到專欄）
// 兩種檢視：編年時間軸（按年／月歸檔，帶朱砂「閱畢」印章）＋ 藏書畫廊（書封展架）

import { useEffect, useMemo, useState } from 'react'
import { Plus, X, Pencil, Trash2, BookCheck, LayoutGrid, List, Sparkles } from 'lucide-react'
import { BookCompletion, BookData, completionStorage } from '../utils/storage'

const CN_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const CN_WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

const LITERARY_SPINES = [
  'linear-gradient(155deg, #2C3531 0%, #1C2320 100%)', // 墨松綠
  'linear-gradient(155deg, #5C3D2E 0%, #3A251B 100%)', // 熟褐
  'linear-gradient(155deg, #2D3A4B 0%, #1B2430 100%)', // 藏青
  'linear-gradient(155deg, #6B2D2C 0%, #451B1A 100%)', // 棗紅
  'linear-gradient(155deg, #4A4238 0%, #2F2922 100%)', // 褐灰
  'linear-gradient(155deg, #354F52 0%, #223538 100%)', // 黛綠
  'linear-gradient(155deg, #463F57 0%, #2C2738 100%)', // 藕紫
  'linear-gradient(155deg, #7C5A34 0%, #52391F 100%)', // 赭石
]

function hashSpine(title: string): string {
  let h = 0
  for (let i = 0; i < title.length; i++) h = title.charCodeAt(i) + ((h << 5) - h)
  return LITERARY_SPINES[Math.abs(h) % LITERARY_SPINES.length]
}

function entryKey(c: BookCompletion): string {
  return c.id || `${c.date}::${c.bookTitle.trim()}`
}

function formatEditorialDate(dateStr: string): { monthDay: string; weekday: string; shortDot: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return { monthDay: dateStr, weekday: '', shortDot: dateStr }
  const dt = new Date(y, m - 1, d)
  return {
    monthDay: `${m}月${d}日`,
    weekday: CN_WEEKDAYS[dt.getDay()] || '',
    shortDot: `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`,
  }
}

interface CompletionLogProps {
  books?: BookData[]
  refreshKey?: number
}

export default function CompletionLog({ books = [], refreshKey }: CompletionLogProps) {
  const [items, setItems] = useState<BookCompletion[]>([])
  const [view, setView] = useState<'timeline' | 'gallery'>('timeline')
  const [yearFilter, setYearFilter] = useState<string>('all')

  // 新增／編輯彈窗狀態
  const [modalOpen, setModalOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formBookId, setFormBookId] = useState('')
  const [formDate, setFormDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [formNote, setFormNote] = useState('')
  const [formFav, setFormFav] = useState(false)

  const reload = () => setItems(completionStorage.getAll())

  useEffect(() => {
    reload()
  }, [refreshKey])

  // 書架封面查詢表（優先按 bookId，其次按書名）
  const bookLookup = useMemo(() => {
    const byId = new Map<string, BookData>()
    const byTitle = new Map<string, BookData>()
    for (const b of books) {
      byId.set(b.id, b)
      byTitle.set(b.title.trim(), b)
    }
    return { byId, byTitle }
  }, [books])

  const getBookMeta = (c: BookCompletion): BookData | undefined =>
    bookLookup.byId.get(c.bookId) || bookLookup.byTitle.get(c.bookTitle.trim())

  const years = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      const y = (it.date || '').slice(0, 4)
      if (y) set.add(y)
    }
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [items])

  const thisYear = String(new Date().getFullYear())
  const thisYearCount = useMemo(
    () => items.filter(it => (it.date || '').startsWith(thisYear)).length,
    [items, thisYear]
  )

  const filtered = useMemo(() => {
    if (yearFilter === 'all') return items
    return items.filter(it => (it.date || '').startsWith(yearFilter))
  }, [items, yearFilter])

  // 編年分組：Year -> Month -> BookCompletion[]
  const grouped = useMemo(() => {
    const byYear = new Map<string, Map<number, BookCompletion[]>>()
    for (const it of filtered) {
      const y = (it.date || '').slice(0, 4) || '未知'
      const m = parseInt((it.date || '').slice(5, 7), 10) || 0
      if (!byYear.has(y)) byYear.set(y, new Map())
      const ym = byYear.get(y)!
      if (!ym.has(m)) ym.set(m, [])
      ym.get(m)!.push(it)
    }
    return [...byYear.entries()].map(([year, monthsMap]) => ({
      year,
      months: [...monthsMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, list]) => ({
          month,
          label: month >= 1 && month <= 12 ? CN_MONTHS[month - 1] : '未標記月份',
          list,
        })),
    }))
  }, [filtered])

  const openAddModal = () => {
    setEditingKey(null)
    setFormTitle('')
    setFormBookId('')
    setFormDate(new Date().toLocaleDateString('en-CA'))
    setFormNote('')
    setFormFav(false)
    setModalOpen(true)
  }

  const openEditModal = (c: BookCompletion) => {
    setEditingKey(entryKey(c))
    setFormTitle(c.bookTitle)
    setFormBookId(c.bookId || '')
    setFormDate(c.date || new Date().toLocaleDateString('en-CA'))
    setFormNote(c.note || '')
    setFormFav(!!c.favorite)
    setModalOpen(true)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const title = formTitle.trim()
    if (!title || !formDate) return
    if (editingKey) {
      completionStorage.update(editingKey, {
        bookTitle: title,
        bookId: formBookId || `manual-${Date.now()}`,
        date: formDate,
        note: formNote,
        favorite: formFav,
      })
    } else {
      completionStorage.add({
        bookTitle: title,
        bookId: formBookId || `manual-${Date.now()}`,
        date: formDate,
        note: formNote,
        favorite: formFav,
      })
    }
    setModalOpen(false)
    reload()
  }

  const handleDelete = (c: BookCompletion, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`要移除《${c.bookTitle}》嘅完書記錄嗎？`)) return
    completionStorage.remove(entryKey(c))
    reload()
  }

  return (
    <section className="mb-12">
      <div
        className="rounded-2xl border p-5 sm:p-7 shadow-sm relative overflow-hidden"
        style={{
          background: '#FDFBF7',
          borderColor: '#EAE4D7',
        }}
      >
        {/* 頂部編輯部風格標題欄 */}
        <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b" style={{ borderColor: '#EDE7DA' }}>
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-[5px] text-[11px] font-serif-tc font-bold tracking-tighter select-none"
                style={{
                  color: '#B44C3A',
                  border: '1.5px solid rgba(180, 76, 58, 0.55)',
                  background: 'rgba(180, 76, 58, 0.04)',
                }}
              >
                閱
              </span>
              <h2 className="font-serif-tc text-xl sm:text-2xl font-bold tracking-wide" style={{ color: '#2B2620' }}>
                完書誌
              </h2>
              <span className="text-[11px] tracking-[0.18em] uppercase hidden sm:inline" style={{ color: '#A39886' }}>
                Reading Chronicle
              </span>
            </div>
            <p className="text-xs sm:text-sm mt-1.5 tabular-nums" style={{ color: '#7D7365' }}>
              {items.length === 0
                ? '讀完每一本書，都會喺度留低日期同印記'
                : `${thisYear} 年已閱畢 ${thisYearCount} 本 · 累計 ${items.length} 本`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 年份篩選 */}
            {years.length > 1 && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: '#F3EEE3' }}>
                <button
                  onClick={() => setYearFilter('all')}
                  className="px-2.5 py-1 rounded-md text-xs transition-colors"
                  style={yearFilter === 'all'
                    ? { background: '#FFFFFF', color: '#2B2620', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                    : { color: '#7D7365' }}
                >
                  全部
                </button>
                {years.map(y => (
                  <button
                    key={y}
                    onClick={() => setYearFilter(y)}
                    className="px-2.5 py-1 rounded-md text-xs tabular-nums transition-colors"
                    style={yearFilter === y
                      ? { background: '#FFFFFF', color: '#2B2620', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                      : { color: '#7D7365' }}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}

            {/* 視圖切換：編年 / 書廊 */}
            {items.length > 0 && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: '#F3EEE3' }}>
                <button
                  onClick={() => setView('timeline')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors"
                  style={view === 'timeline'
                    ? { background: '#FFFFFF', color: '#2B2620', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                    : { color: '#7D7365' }}
                  title="編年時間軸"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>編年</span>
                </button>
                <button
                  onClick={() => setView('gallery')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors"
                  style={view === 'gallery'
                    ? { background: '#FFFFFF', color: '#2B2620', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                    : { color: '#7D7365' }}
                  title="藏書畫廊"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>書廊</span>
                </button>
              </div>
            )}

            {/* 手動補記一本 */}
            <button
              onClick={openAddModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors shadow-sm"
              style={{ background: '#2B2620', color: '#FDFBF7' }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>記低一本</span>
            </button>
          </div>
        </div>

        {/* 內容區 */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div
              className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
              style={{ background: '#F3EEE3', color: '#9C8F7B' }}
            >
              <BookCheck className="w-6 h-6" />
            </div>
            <p className="font-serif-tc text-base font-semibold" style={{ color: '#4A4238' }}>
              仲未有完書印記
            </p>
            <p className="text-xs mt-1.5 max-w-sm mx-auto leading-relaxed" style={{ color: '#938878' }}>
              讀完書架入面嘅最後一句會自動記低；亦可以按右上角「記低一本」，補記以前睇完嘅實體書或專欄。
            </p>
          </div>
        ) : view === 'timeline' ? (
          /* ── 視圖一：編年時間軸 ── */
          <div className="mt-6 space-y-8">
            {grouped.map(({ year, months }) => (
              <div key={year}>
                {/* 年份大標題 */}
                <div className="flex items-baseline gap-3 mb-4">
                  <span className="font-serif-tc text-2xl font-bold tabular-nums tracking-tight" style={{ color: '#2B2620' }}>
                    {year}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: '#A39886' }}>
                    共 {months.reduce((s, m) => s + m.list.length, 0)} 本
                  </span>
                  <div className="flex-1 h-px" style={{ background: '#EDE7DA' }} />
                </div>

                <div className="space-y-6">
                  {months.map(({ month, label, list }) => (
                    <div key={`${year}-${month}`} className="grid sm:grid-cols-[72px_1fr] gap-3 sm:gap-5">
                      {/* 左側月份標籤 */}
                      <div className="pt-1">
                        <span
                          className="inline-block font-serif-tc text-sm font-semibold tracking-widest"
                          style={{ color: '#8C7F6D' }}
                        >
                          {label}
                        </span>
                      </div>

                      {/* 右側時間線卡片列表 */}
                      <div className="relative pl-5 space-y-3 border-l" style={{ borderColor: '#E5DEC9' }}>
                        {list.map((c) => {
                          const meta = getBookMeta(c)
                          const dt = formatEditorialDate(c.date)
                          const key = entryKey(c)
                          return (
                            <div
                              key={key}
                              onClick={() => openEditModal(c)}
                              className="group relative flex items-center gap-4 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md"
                              style={{
                                background: '#FFFFFF',
                                borderColor: '#EFEAE0',
                              }}
                            >
                              {/* 時間軸墨點 */}
                              <span
                                className="absolute -left-[25px] top-6 w-2.5 h-2.5 rounded-full border-2"
                                style={{
                                  background: c.favorite ? '#B44C3A' : '#FDFBF7',
                                  borderColor: c.favorite ? '#B44C3A' : '#C6BBA8',
                                }}
                              />

                              {/* 迷你立體書封 */}
                              <div
                                className="relative w-12 sm:w-14 aspect-[2/3] rounded-[5px] overflow-hidden flex-shrink-0 shadow-sm flex items-center justify-center p-1.5"
                                style={meta?.coverImage
                                  ? { backgroundImage: `url(${meta.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                                  : { background: meta?.coverColor || hashSpine(c.bookTitle) }}
                              >
                                {/* 書脊微光 */}
                                <span
                                  className="absolute inset-y-0 left-0 w-1.5"
                                  style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.28), rgba(0,0,0,0.18))' }}
                                />
                                {!meta?.coverImage && (
                                  <span
                                    className="relative font-serif-tc text-[9px] leading-tight text-center line-clamp-4 px-0.5"
                                    style={{ color: '#F5EFE2' }}
                                  >
                                    {c.bookTitle}
                                  </span>
                                )}
                              </div>

                              {/* 書名、日期、心得 */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3
                                    className="font-serif-tc text-base sm:text-[17px] font-bold truncate"
                                    style={{ color: '#2B2620' }}
                                    title={c.bookTitle}
                                  >
                                    《{c.bookTitle}》
                                  </h3>
                                  {c.favorite && (
                                    <span
                                      className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full"
                                      style={{ background: 'rgba(180, 76, 58, 0.09)', color: '#B44C3A' }}
                                    >
                                      <Sparkles className="w-2.5 h-2.5" /> 值得重讀
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs mt-1 tabular-nums flex items-center gap-2" style={{ color: '#8C8172' }}>
                                  <span>{dt.monthDay}</span>
                                  {dt.weekday && <span style={{ color: '#BDB3A3' }}>· {dt.weekday}</span>}
                                </p>

                                {c.note && (
                                  <p
                                    className="mt-2 text-xs sm:text-sm leading-relaxed line-clamp-2 pl-2.5 border-l-2"
                                    style={{ color: '#5C5449', borderColor: '#E5DEC9' }}
                                  >
                                    {c.note}
                                  </p>
                                )}
                              </div>

                              {/* 右側朱砂「閱畢」印章 + hover 編輯／刪除 */}
                              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                <span
                                  className="font-serif-tc text-[11px] font-bold tracking-widest px-1.5 py-0.5 rounded-[4px] select-none"
                                  style={{
                                    color: '#B44C3A',
                                    border: '1px solid rgba(180, 76, 58, 0.45)',
                                    background: 'rgba(180, 76, 58, 0.03)',
                                  }}
                                >
                                  閱畢
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditModal(c) }}
                                    className="p-1 rounded-md hover:bg-stone-100"
                                    style={{ color: '#8C8172' }}
                                    title="編輯日期或心得"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => handleDelete(c, e)}
                                    className="p-1 rounded-md hover:bg-red-50 hover:text-red-600"
                                    style={{ color: '#A39886' }}
                                    title="移除記錄"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── 視圖二：藏書畫廊 ── */
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-7">
            {filtered.map((c) => {
              const meta = getBookMeta(c)
              const dt = formatEditorialDate(c.date)
              const key = entryKey(c)
              return (
                <div
                  key={key}
                  onClick={() => openEditModal(c)}
                  className="group cursor-pointer flex flex-col"
                >
                  <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-md group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-200">
                    <div
                      className="w-full h-full flex flex-col items-center justify-center p-4 relative"
                      style={meta?.coverImage
                        ? { backgroundImage: `url(${meta.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : { background: meta?.coverColor || hashSpine(c.bookTitle) }}
                    >
                      <span
                        className="absolute inset-y-0 left-0 w-2"
                        style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.22), rgba(0,0,0,0.18))' }}
                      />
                      {meta?.coverImage && <div className="absolute inset-0 bg-black/15" />}
                      {!meta?.coverImage && (
                        <p className="relative font-serif-tc text-sm font-semibold text-center leading-relaxed line-clamp-5 px-1" style={{ color: '#F7F1E5' }}>
                          {c.bookTitle}
                        </p>
                      )}
                    </div>
                    {/* 右上角微型朱砂印 */}
                    <span
                      className="absolute top-2 right-2 font-serif-tc text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] backdrop-blur-sm"
                      style={{
                        background: 'rgba(253, 251, 247, 0.9)',
                        color: '#B44C3A',
                        border: '1px solid rgba(180, 76, 58, 0.45)',
                      }}
                    >
                      閱畢
                    </span>
                  </div>
                  {/* 展牌式底座文字 */}
                  <div className="mt-2.5 pt-2 border-t" style={{ borderColor: '#EAE4D7' }}>
                    <p className="font-serif-tc text-xs sm:text-sm font-bold line-clamp-1" style={{ color: '#2B2620' }}>
                      {c.bookTitle}
                    </p>
                    <p className="text-[11px] mt-0.5 tabular-nums flex items-center justify-between" style={{ color: '#938878' }}>
                      <span>{dt.shortDot}</span>
                      {c.favorite && <span style={{ color: '#B44C3A' }}>✦</span>}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 新增／編輯完書彈窗 */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(30, 26, 22, 0.45)', backdropFilter: 'blur(3px)' }}
          onClick={() => setModalOpen(false)}
        >
          <form
            onSubmit={handleSave}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
            style={{
              background: '#FDFBF7',
              borderColor: '#E5DEC9',
              animation: 'panel-in 180ms var(--ease-out) both',
            }}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b" style={{ borderColor: '#EDE7DA' }}>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-serif-tc font-bold"
                  style={{ color: '#B44C3A', border: '1px solid rgba(180,76,58,0.5)' }}
                >
                  閱
                </span>
                <h3 className="font-serif-tc text-lg font-bold" style={{ color: '#2B2620' }}>
                  {editingKey ? '編輯完書記錄' : '記低一本睇完嘅書'}
                </h3>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-stone-100" style={{ color: '#8C8172' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 快速揀書架上嘅書 */}
            {!editingKey && books.filter(b => b.id !== 'daily-review' && b.title.trim() !== '每日温習' && b.title.trim() !== '每日溫習').length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium mb-1.5" style={{ color: '#7D7365' }}>由書架快速揀選（或直接喺下面輸入書名）</p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {books
                    .filter(b => b.id !== 'daily-review' && b.title.trim() !== '每日温習' && b.title.trim() !== '每日溫習')
                    .slice(0, 12)
                    .map(b => {
                    const selected = formBookId === b.id
                    return (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => { setFormTitle(b.title); setFormBookId(b.id) }}
                        className="px-2.5 py-1 rounded-full text-xs border transition-colors truncate max-w-[180px]"
                        style={selected
                          ? { background: '#2B2620', color: '#FDFBF7', borderColor: '#2B2620' }
                          : { background: '#FFFFFF', color: '#4A4238', borderColor: '#E5DEC9' }}
                      >
                        {b.title}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#5C5449' }}>書名／專欄名</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={e => { setFormTitle(e.target.value); setFormBookId('') }}
                  placeholder="例如：活著、薛兆豐經濟學講堂…"
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none bg-white"
                  style={{ borderColor: '#DDD5C4', color: '#2B2620' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#5C5449' }}>睇完日期</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none bg-white tabular-nums"
                  style={{ borderColor: '#DDD5C4', color: '#2B2620' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#5C5449' }}>一句話留念（可留空）</label>
                <textarea
                  rows={2}
                  value={formNote}
                  onChange={e => setFormNote(e.target.value)}
                  placeholder="寫低睇完呢本書嘅感受或者最深印象嘅一句…"
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none bg-white resize-none leading-relaxed"
                  style={{ borderColor: '#DDD5C4', color: '#2B2620' }}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formFav}
                  onChange={e => setFormFav(e.target.checked)}
                  className="rounded accent-[#B44C3A]"
                />
                <span className="text-xs font-medium" style={{ color: '#5C5449' }}>✦ 標記為「值得重讀」</span>
              </label>
            </div>

            <div className="flex gap-2.5 mt-6 pt-4 border-t" style={{ borderColor: '#EDE7DA' }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ background: '#FFFFFF', color: '#5C5449', borderColor: '#DDD5C4' }}
              >
                取消
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold shadow-sm"
                style={{ background: '#B44C3A', color: '#FDFBF7' }}
              >
                蓋印「閱畢」
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
