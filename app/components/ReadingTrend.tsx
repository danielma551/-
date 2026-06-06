// 【30天閱讀趨勢圖】
// 這個文件負責：在主頁顯示最近 30 天的閱讀柱狀圖。
// 每一根柱子代表那天讀了幾句話，柱子越高代表讀得越多。
// 資料存在 localStorage，翻下一句時自動累計。
// 完書那天的柱子頂部會顯示 🏁 小旗標記。

'use client'

import { useEffect, useState, useRef } from 'react'
import { historyStorage, completionStorage, BookCompletion } from '../utils/storage'

export default function ReadingTrend() {
  const [days, setDays] = useState<{ date: string; count: number }[]>([])
  const [completions, setCompletions] = useState<BookCompletion[]>([])
  // 控制動畫是否已觸發（進入 viewport 後才播）
  const [animated, setAnimated] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDays(historyStorage.getLast30Days())
    setCompletions(completionStorage.getAll())
  }, [])

  // IntersectionObserver：進入畫面後才播動畫（Emil 原則）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setAnimated(true) },
      { threshold: 0.2 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const maxCount = Math.max(...days.map(d => d.count), 1)
  const totalSentences = days.reduce((sum, d) => sum + d.count, 0)
  const activeDays = days.filter(d => d.count > 0).length

  // 把完書記錄整理成以日期為 key 的 Map，方便查詢
  const completionsByDate = completions.reduce<Record<string, BookCompletion[]>>((acc, c) => {
    if (!acc[c.date]) acc[c.date] = []
    acc[c.date].push(c)
    return acc
  }, {})

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-1 h-5 bg-green-500 rounded-full" />
          <h2 className="text-base font-semibold text-green-600">30 天趨勢</h2>
        </div>
        {totalSentences > 0 && (
          <div className="flex items-center space-x-4 text-xs text-gray-400">
            <span>{activeDays} 天有閱讀</span>
            <span>共 {totalSentences} 句</span>
          </div>
        )}
      </div>

      {totalSentences === 0 ? (
        <p className="text-sm text-gray-300 text-center py-6">開始閱讀後，這裡將顯示你的閱讀趨勢</p>
      ) : (
        <div ref={containerRef} className="flex items-end space-x-0.5 h-24">
          {days.map((day, i) => {
            const heightPct = maxCount > 0 ? (day.count / maxCount) * 100 : 0
            const dayNum = day.date.split('-')[2]
            const showLabel = i % 3 === 0
            const finishedBooks = completionsByDate[day.date] ?? []
            const hasCompletion = finishedBooks.length > 0

            return (
              <div key={day.date} className="flex flex-col items-center flex-1 relative">
                {/* 完書旗標：柱子頂部顯示 🏁，hover 顯示書名 tooltip */}
                {hasCompletion && day.count > 0 && (
                  <div
                    className="absolute text-center"
                    style={{
                      // 放在柱子頂部上方 2px，柱子高度計算出來定位
                      bottom: `calc(${Math.max(heightPct, 4)}% + 18px)`,
                      fontSize: '10px',
                      lineHeight: 1,
                      zIndex: 10,
                      cursor: 'default',
                      // 入場動畫：比柱子稍晚出現
                      opacity: animated ? 1 : 0,
                      transform: animated ? 'translateY(0)' : 'translateY(4px)',
                      transition: `opacity 300ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 15 + 200}ms, transform 300ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 15 + 200}ms`,
                    }}
                    title={finishedBooks.map(b => `📖 ${b.bookTitle}`).join('\n')}
                  >
                    🏁
                  </div>
                )}

                {/* 柱子本體：用 scaleY 做生長動畫（Emil 原則：只動 transform/opacity，GPU 加速） */}
                <div className="w-full flex items-end" style={{ height: '80px' }}>
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: day.count > 0 ? `${Math.max(heightPct, 4)}%` : '2px',
                      backgroundColor: hasCompletion && day.count > 0 ? '#22c55e' : (day.count > 0 ? '#4ade80' : '#e5e7eb'),
                      minHeight: day.count > 0 ? '4px' : '2px',
                      transformOrigin: 'bottom center',
                      // 進入 viewport 後才播動畫，每根柱子錯開 15ms
                      transform: animated ? 'scaleY(1)' : 'scaleY(0)',
                      opacity: animated ? 1 : (day.count > 0 ? 0 : 1),
                      transition: animated
                        ? `transform 400ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 15}ms, opacity 300ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 15}ms`
                        : 'none',
                    }}
                    title={`${day.date}: ${day.count} 句${hasCompletion ? '\n' + finishedBooks.map(b => `📖 ${b.bookTitle} 讀完！`).join('\n') : ''}`}
                  />
                </div>

                {/* 日期標籤 */}
                <span className="text-gray-400 mt-1" style={{ fontSize: '9px' }}>
                  {showLabel ? dayNum : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
