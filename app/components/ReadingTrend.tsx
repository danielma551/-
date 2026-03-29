// 【30天閱讀趨勢圖】
// 這個文件負責：在主頁顯示最近 30 天的閱讀柱狀圖。
// 每一根柱子代表那天讀了幾句話，柱子越高代表讀得越多。
// 資料存在 localStorage，翻下一句時自動累計。

'use client'

import { useEffect, useState } from 'react'
import { historyStorage } from '../utils/storage'

export default function ReadingTrend() {
  // 最近 30 天的閱讀資料：每天的日期和句數
  const [days, setDays] = useState<{ date: string; count: number }[]>([])

  // 原始 localStorage 資料（用於診斷）
  const [rawData, setRawData] = useState<string>('讀取中...')

  // 頁面載入時從 localStorage 讀取記錄
  useEffect(() => {
    setDays(historyStorage.getLast30Days())
    // 直接讀 localStorage 確認數據是否存在
    const raw = typeof window !== 'undefined'
      ? localStorage.getItem('reading-history') ?? '（空）'
      : '（伺服器端）'
    setRawData(raw)
  }, [])

  // 計算最大值，用於決定柱子的相對高度
  const maxCount = Math.max(...days.map(d => d.count), 1)

  // 計算近 30 天總句數
  const totalSentences = days.reduce((sum, d) => sum + d.count, 0)

  // 計算有閱讀的天數
  const activeDays = days.filter(d => d.count > 0).length

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      {/* 標題列：顯示標題和統計摘要 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {/* 左側綠色裝飾條 */}
          <div className="w-1 h-5 bg-green-500 rounded-full" />
          <h2 className="text-base font-semibold text-green-600">30 天趨勢</h2>
        </div>
        {/* 右側小統計：有資料時才顯示 */}
        {totalSentences > 0 && (
          <div className="flex items-center space-x-4 text-xs text-gray-400">
            <span>{activeDays} 天有閱讀</span>
            <span>共 {totalSentences} 句</span>
          </div>
        )}
      </div>

      {/* 診斷行：顯示 localStorage 原始內容 */}
      <p className="text-xs text-gray-300 mb-2 break-all">📦 {rawData}</p>

      {/* 沒有閱讀記錄時顯示提示 */}
      {totalSentences === 0 ? (
        <p className="text-sm text-gray-300 text-center py-6">開始閱讀後，這裡將顯示你的閱讀趨勢</p>
      ) : (
        /* 柱狀圖區域 */
        <div className="flex items-end space-x-0.5 h-24">
          {days.map((day, i) => {
            // 計算柱子高度比例（最高的柱子佔滿 100%）
            const heightPct = maxCount > 0 ? (day.count / maxCount) * 100 : 0
            // 取日期中的「日」數字作為標籤（例如 "2026-03-28" → "28"）
            const dayNum = day.date.split('-')[2]
            // 每 3 天顯示一次日期標籤，避免太擠
            const showLabel = i % 3 === 0

            return (
              <div key={day.date} className="flex flex-col items-center flex-1">
                {/* 柱子本體 */}
                <div className="w-full flex items-end" style={{ height: '80px' }}>
                  <div
                    className="w-full rounded-sm transition-all duration-300"
                    style={{
                      // 有閱讀的天用綠色，沒有閱讀的天用淺灰色細線
                      height: day.count > 0 ? `${Math.max(heightPct, 4)}%` : '2px',
                      backgroundColor: day.count > 0 ? '#4ade80' : '#e5e7eb',
                      minHeight: day.count > 0 ? '4px' : '2px'
                    }}
                    title={`${day.date}: ${day.count} 句`}
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
