'use client'

// 【單本書閱讀日曆】顯示呢本書邊一日有睇過（月曆格式，可揭月）。
// 資料來自 bookReadingStorage（每本書每日句數）。

import { useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { bookReadingStorage } from '../utils/storage'

interface Props {
  bookId: string
  bookTitle: string
  onClose: () => void
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

export default function BookCalendar({ bookId, bookTitle, onClose }: Props) {
  const days = bookReadingStorage.getBookDays(bookId)
  const stats = bookReadingStorage.getStats(bookId)
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })

  const year = month.getFullYear()
  const mon = month.getMonth()
  const firstDow = new Date(year, mon, 1).getDay()
  const daysInMonth = new Date(year, mon + 1, 0).getDate()
  const todayStr = new Date().toLocaleDateString('en-CA')

  // 本月讀咗幾多日
  const monthKeys = Object.keys(days).filter(d => d.startsWith(`${year}-${String(mon + 1).padStart(2, '0')}`) && days[d] > 0)
  const maxCount = Math.max(...Object.values(days), 1)

  const cellColor = (count: number): string => {
    if (!count) return '#f3f4f6'
    const r = Math.min(count / Math.max(maxCount * 0.7, 1), 1)
    if (r < 0.25) return '#bfdbfe'
    if (r < 0.5) return '#60a5fa'
    if (r < 0.75) return '#3b82f6'
    return '#1d4ed8'
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5"
        style={{ animation: 'panel-in 200ms cubic-bezier(0.23,1,0.32,1) both' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 標題 */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-800 truncate" title={bookTitle}>📅 {bookTitle}</h2>
            <p className="text-xs text-gray-400 mt-1">
              共 <span className="font-semibold text-blue-600">{stats.totalDays}</span> 日有閱讀
              {stats.streak > 0 && <> · 連續 <span className="font-semibold text-blue-600">{stats.streak}</span> 日 🔥</>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* 月份切換 */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setMonth(new Date(year, mon - 1, 1))} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-700">{year} 年 {mon + 1} 月 · {monthKeys.length} 日</span>
          <button
            onClick={() => setMonth(new Date(year, mon + 1, 1))}
            disabled={year === new Date().getFullYear() && mon === new Date().getMonth()}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 星期標題 */}
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {WEEK.map(w => <div key={w} className="text-center text-[11px] text-gray-400">{w}</div>)}
        </div>
        {/* 日期格 */}
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />
            const key = `${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            const count = days[key] || 0
            const isToday = key === todayStr
            return (
              <div
                key={i}
                title={count > 0 ? `${key}：讀咗 ${count} 句` : key}
                className="aspect-square rounded-lg flex items-center justify-center text-xs font-medium"
                style={{
                  background: cellColor(count),
                  color: count > 0 && count >= maxCount * 0.5 ? '#fff' : '#6b7280',
                  outline: isToday ? '2px solid #f59e0b' : undefined,
                  outlineOffset: isToday ? '-2px' : undefined,
                }}
              >
                {d}
              </div>
            )
          })}
        </div>

        {/* 圖例 */}
        <div className="flex items-center justify-end gap-1 mt-3">
          <span className="text-[11px] text-gray-400 mr-1">少</span>
          {['#f3f4f6', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8'].map(c => (
            <div key={c} style={{ width: 11, height: 11, borderRadius: 3, background: c }} />
          ))}
          <span className="text-[11px] text-gray-400 ml-1">多</span>
        </div>
      </div>
    </div>
  )
}
