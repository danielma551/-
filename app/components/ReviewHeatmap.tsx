// 【温習熱圖】
// GitHub 風格格子：當天有温習就有顏色（琥珀色系，同閱讀熱圖區分）。
// 同時係「每日温習」嘅入口：開始温習掣 + 卡片管理掣 + 仲有幾多張未温。

'use client'

import { useEffect, useState } from 'react'
import { Sparkles, BookText } from 'lucide-react'
import { reviewStorage } from '../utils/storage'

// 按張數決定格子顏色（0 → 灰；越多越深琥珀）
function cellColor(count: number, max: number): string {
  if (count === 0) return '#ebedf0'
  const ratio = Math.min(count / Math.max(max * 0.75, 1), 1)
  if (ratio < 0.25) return '#fde68a'
  if (ratio < 0.5)  return '#fbbf24'
  if (ratio < 0.75) return '#d97706'
  return '#92400e'
}

const WEEKDAY_LABELS = ['一', '三', '五']
const WEEKDAY_INDICES = [1, 3, 5]

interface Props {
  onStart: () => void    // 開始温習（打開每日温習書）
  onManage: () => void   // 卡片管理（Flomo 匯入／搜尋／刪除）
  refreshKey?: number    // 變更時重新讀取數據（例如温習完返嚟）
}

export default function ReviewHeatmap({ onStart, onManage, refreshKey }: Props) {
  const [days, setDays] = useState<{ date: string; count: number }[]>([])
  const [remaining, setRemaining] = useState(0)
  const [total, setTotal] = useState(0)
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null)

  useEffect(() => {
    // 熱圖數據 = 記錄值 與 由 lastReviewed 推算值 取較大者
    // （推算值補返「熱圖功能上線前」嘅温習記錄，以及跨裝置同步返嚟嘅卡）
    const heat: Record<string, number> = { ...reviewStorage.getHeat() }
    const derived: Record<string, number> = {}
    for (const n of reviewStorage.getAll()) {
      if (n.lastReviewed) {
        const d = new Date(n.lastReviewed).toLocaleDateString('en-CA')
        derived[d] = (derived[d] || 0) + 1
      }
    }
    for (const [d, c] of Object.entries(derived)) {
      if (c > (heat[d] || 0)) heat[d] = c
    }
    const list: { date: string; count: number }[] = []
    const d = new Date()
    d.setDate(d.getDate() - 363)
    for (let i = 0; i < 364; i++) {
      const key = d.toLocaleDateString('en-CA')
      list.push({ date: key, count: heat[key] || 0 })
      d.setDate(d.getDate() + 1)
    }
    setDays(list)
    setRemaining(reviewStorage.remainingInCycle())
    setTotal(reviewStorage.stats().total)
  }, [refreshKey])

  const totalReviewed = days.reduce((s, d) => s + d.count, 0)
  const maxCount = Math.max(...days.map(d => d.count), 1)

  const today = new Date()
  const todayDow = today.getDay()
  const grid = days.map((d, i) => {
    const daysAgo = 363 - i
    const dow = ((todayDow - daysAgo) % 7 + 7) % 7
    return { ...d, dow }
  })

  const weeks: typeof grid[] = []
  let week: typeof grid = []
  const firstDow = grid[0]?.dow ?? 0
  for (let pad = 0; pad < firstDow; pad++) week.push({ date: '', count: 0, dow: pad })
  for (const cell of grid) {
    week.push(cell)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push({ date: '', count: 0, dow: week.length })
    weeks.push(week)
  }

  const monthLabels: { label: string; weekIdx: number }[] = []
  let lastMonth = ''
  weeks.forEach((w, wi) => {
    const firstReal = w.find(c => c.date)
    if (!firstReal) return
    const month = firstReal.date.slice(0, 7)
    if (month !== lastMonth) {
      const [, mm] = month.split('-')
      monthLabels.push({ label: `${parseInt(mm)}月`, weekIdx: wi })
      lastMonth = month
    }
  })

  const CELL = 11

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      {/* 標題列：入口 + 統計 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <div className="w-1 h-5 bg-amber-400 rounded-full" />
          <h2 className="text-base font-semibold text-amber-600">温習熱圖</h2>
          {total > 0 && (
            <span className="text-xs text-gray-400 ml-2">
              仲有 <span className="font-semibold text-amber-600">{remaining.toLocaleString()}</span> 張未温（共 {total.toLocaleString()} 張）
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onStart}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors shadow-sm"
            title="打開每日温習書（今日份，一頁一句）"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>開始温習</span>
          </button>
          <button
            onClick={onManage}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-full border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-sm font-medium transition-colors"
            title="加筆記／瀏覽所有筆記"
          >
            <BookText className="w-3.5 h-3.5" />
            <span>筆記</span>
          </button>
        </div>
      </div>

      {totalReviewed === 0 ? (
        <p className="text-sm text-gray-300 text-center py-6">開始温習後，呢度會顯示你嘅温習熱圖</p>
      ) : (
        <div className="relative overflow-x-auto">
          {/* 月份標籤行 */}
          <div className="flex mb-1 ml-6" style={{ gap: 2 }}>
            {weeks.map((_, wi) => {
              const label = monthLabels.find(m => m.weekIdx === wi)
              return (
                <div key={wi} style={{ width: CELL, flexShrink: 0, fontSize: 9, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                  {label ? label.label : ''}
                </div>
              )
            })}
          </div>

          <div className="flex" style={{ gap: 2 }}>
            {/* 星期標籤列 */}
            <div className="flex flex-col mr-1" style={{ gap: 2 }}>
              {[0, 1, 2, 3, 4, 5, 6].map(dow => (
                <div key={dow} style={{ width: 14, height: CELL, fontSize: 8, color: '#9ca3af', lineHeight: `${CELL}px`, textAlign: 'right' }}>
                  {WEEKDAY_INDICES.includes(dow) ? WEEKDAY_LABELS[WEEKDAY_INDICES.indexOf(dow)] : ''}
                </div>
              ))}
            </div>

            {/* 格子主體 */}
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: 2 }}>
                {w.map((cell, di) => (
                  <div
                    key={di}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 2,
                      backgroundColor: cell.date ? cellColor(cell.count, maxCount) : 'transparent',
                      cursor: cell.date && cell.count > 0 ? 'pointer' : 'default',
                    }}
                    onMouseEnter={e => {
                      if (!cell.date) return
                      const rect = (e.target as HTMLElement).getBoundingClientRect()
                      setTooltip({ date: cell.date, count: cell.count, x: rect.left + rect.width / 2, y: rect.top })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* 圖例 */}
          <div className="flex items-center gap-1 mt-3 justify-end">
            <span className="text-xs text-gray-400 mr-1">少</span>
            {['#ebedf0', '#fde68a', '#fbbf24', '#d97706', '#92400e'].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
            ))}
            <span className="text-xs text-gray-400 ml-1">多</span>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-800 text-white text-xs px-2 py-1 rounded-lg pointer-events-none shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y - 36, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
        >
          {tooltip.date}：{tooltip.count > 0 ? `温習 ${tooltip.count} 張` : '未温習'}
        </div>
      )}
    </div>
  )
}
