// 【閱讀熱圖】
// GitHub 風格的 52 週 × 7 天格子，顏色深淺代表當天讀了幾句。
// 資料來自 historyStorage，只在瀏覽器端渲染。

'use client'

import { useEffect, useState } from 'react'
import { historyStorage } from '../utils/storage'

// 按句數決定格子顏色（0 → 灰；越多越深綠）
function cellColor(count: number, max: number): string {
  if (count === 0) return '#ebedf0'
  const ratio = Math.min(count / Math.max(max * 0.75, 1), 1)
  if (ratio < 0.25) return '#9be9a8'
  if (ratio < 0.5)  return '#40c463'
  if (ratio < 0.75) return '#30a14e'
  return '#216e39'
}

// 取當週星期幾的中文縮寫（週一 = 1）
const WEEKDAY_LABELS = ['一', '三', '五']   // 只顯示 3 個避免擠
const WEEKDAY_INDICES = [1, 3, 5]            // 對應 getDay() 的哪一天（0=日）

export default function ReadingHeatmap() {
  const [days, setDays] = useState<{ date: string; count: number }[]>([])
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null)

  useEffect(() => {
    setDays(historyStorage.getLast364Days())
  }, [])

  const totalSentences = days.reduce((s, d) => s + d.count, 0)
  const activeDays = days.filter(d => d.count > 0).length
  const maxCount = Math.max(...days.map(d => d.count), 1)

  // 把 364 天分成 52 週（每週 7 天，週日＝第一行）
  // 補齊最前面讓第一格對準正確星期幾
  const today = new Date()
  // 今天是週幾（0=日 … 6=六）
  const todayDow = today.getDay()
  // days[363] = 今天, days[0] = 363天前
  // 我們讓最後一週最右邊的格子 = 今天
  // 計算每個 day 的 dayOfWeek
  const grid: { date: string; count: number; dow: number }[] = days.map((d, i) => {
    // i=0 是 363 天前；i=363 是今天
    const daysAgo = 363 - i
    const dow = ((todayDow - daysAgo) % 7 + 7) % 7
    return { ...d, dow }
  })

  // 按週分組
  const weeks: typeof grid[] = []
  let week: typeof grid = []
  // 找第一天的 dow，把不足一週的前置補空
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

  // 月份標籤：掃描每週第一格，取不同月份的位置
  const monthLabels: { label: string; weekIdx: number }[] = []
  let lastMonth = ''
  weeks.forEach((w, wi) => {
    const firstReal = w.find(c => c.date)
    if (!firstReal) return
    const month = firstReal.date.slice(0, 7)   // 'YYYY-MM'
    if (month !== lastMonth) {
      const [, mm] = month.split('-')
      monthLabels.push({ label: `${parseInt(mm)}月`, weekIdx: wi })
      lastMonth = month
    }
  })

  const CELL = 11   // px，格子大小（含 1px gap）

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-1 h-5 bg-indigo-400 rounded-full" />
          <h2 className="text-base font-semibold text-indigo-600">閱讀熱圖</h2>
        </div>
        {totalSentences > 0 && (
          <div className="flex items-center space-x-4 text-xs text-gray-400">
            <span>{activeDays} 天有閱讀</span>
            <span>共 {totalSentences.toLocaleString()} 句</span>
          </div>
        )}
      </div>

      {totalSentences === 0 ? (
        <p className="text-sm text-gray-300 text-center py-6">開始閱讀後，這裡將顯示你的閱讀熱圖</p>
      ) : (
        <div className="relative overflow-x-auto">
          {/* 月份標籤行 */}
          <div className="flex mb-1 ml-6" style={{ gap: 2 }}>
            {weeks.map((_, wi) => {
              const label = monthLabels.find(m => m.weekIdx === wi)
              return (
                <div
                  key={wi}
                  style={{ width: CELL, flexShrink: 0, fontSize: 9, color: '#9ca3af', whiteSpace: 'nowrap' }}
                >
                  {label ? label.label : ''}
                </div>
              )
            })}
          </div>

          <div className="flex" style={{ gap: 2 }}>
            {/* 星期標籤列 */}
            <div className="flex flex-col mr-1" style={{ gap: 2 }}>
              {[0, 1, 2, 3, 4, 5, 6].map(dow => (
                <div
                  key={dow}
                  style={{
                    width: 14,
                    height: CELL,
                    fontSize: 8,
                    color: '#9ca3af',
                    lineHeight: `${CELL}px`,
                    textAlign: 'right',
                  }}
                >
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
            {['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
            ))}
            <span className="text-xs text-gray-400 ml-1">多</span>
          </div>
        </div>
      )}

      {/* Tooltip（fixed 定位，跟隨滑鼠）*/}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-800 text-white text-xs px-2 py-1 rounded-lg pointer-events-none shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y - 36,
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.date}：{tooltip.count > 0 ? `${tooltip.count} 句` : '未閱讀'}
        </div>
      )}
    </div>
  )
}
