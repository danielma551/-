// 【閱讀速度折線圖】
// 顯示最近 30 次 session 的「句/分鐘」速度折線圖。
// 資料來自 speedStorage，每次閱讀 session 結束後自動記錄。

'use client'

import { useEffect, useState } from 'react'
import { speedStorage, SpeedRecord } from '../utils/storage'

export default function SpeedChart() {
  const [records, setRecords] = useState<SpeedRecord[]>([])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    setRecords(speedStorage.getLast30())
  }, [])

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
        <div className="flex items-center space-x-2 mb-4">
          <div className="w-1 h-5 bg-orange-400 rounded-full" />
          <h2 className="text-base font-semibold text-orange-500">閱讀速度</h2>
        </div>
        <p className="text-sm text-gray-300 text-center py-6">閱讀後將顯示你的速度趨勢</p>
      </div>
    )
  }

  const speeds = records.map(r => r.speed)
  const maxSpeed = Math.max(...speeds, 1)
  const minSpeed = Math.min(...speeds)
  const avgSpeed = Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
  const latest = records[records.length - 1]

  // SVG 折線圖尺寸
  const W = 400
  const H = 80
  const PAD = { left: 6, right: 6, top: 10, bottom: 4 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const xOf = (i: number) => PAD.left + (i / Math.max(records.length - 1, 1)) * chartW
  const yOf = (speed: number) => {
    const range = maxSpeed - minSpeed || 1
    return PAD.top + chartH - ((speed - minSpeed) / range) * chartH
  }

  const polyline = records.map((r, i) => `${xOf(i)},${yOf(r.speed)}`).join(' ')
  // fill area under line
  const areaPoints = [
    `${xOf(0)},${PAD.top + chartH}`,
    ...records.map((r, i) => `${xOf(i)},${yOf(r.speed)}`),
    `${xOf(records.length - 1)},${PAD.top + chartH}`,
  ].join(' ')

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-1 h-5 bg-orange-400 rounded-full" />
          <h2 className="text-base font-semibold text-orange-500">閱讀速度</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>平均 <span className="font-semibold text-gray-600">{avgSpeed}</span> 句/分</span>
          <span>最近 <span className="font-semibold text-orange-500">{latest.speed}</span> 句/分</span>
        </div>
      </div>

      {/* SVG 折線圖 */}
      <div
        className="relative w-full"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: 80 }}
        >
          {/* 漸層填充 */}
          <defs>
            <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={areaPoints} fill="url(#speedGrad)" />
          <polyline
            points={polyline}
            fill="none"
            stroke="#fb923c"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* 懸停點 */}
          {records.map((r, i) => (
            <circle
              key={i}
              cx={xOf(i)}
              cy={yOf(r.speed)}
              r={hoverIdx === i ? 4 : 2.5}
              fill={hoverIdx === i ? '#ea580c' : '#fb923c'}
              stroke="white"
              strokeWidth="1"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverIdx(i)}
            />
          ))}
        </svg>

        {/* Hover tooltip */}
        {hoverIdx !== null && (() => {
          const r = records[hoverIdx]
          const xPct = (hoverIdx / Math.max(records.length - 1, 1)) * 100
          return (
            <div
              className="absolute bg-gray-800 text-white text-xs px-2 py-1 rounded-lg pointer-events-none shadow-lg"
              style={{
                left: `${xPct}%`,
                top: -32,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              {r.date} · {r.speed} 句/分 · {r.sentences} 句
            </div>
          )
        })()}
      </div>

      {/* 底部統計 */}
      <div className="flex justify-between mt-2 text-xs text-gray-300">
        <span>{records[0]?.date}</span>
        <span>共 {records.length} 次紀錄</span>
        <span>{records[records.length - 1]?.date}</span>
      </div>
    </div>
  )
}
