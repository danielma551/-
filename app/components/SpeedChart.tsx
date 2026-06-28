// 【閱讀速度折線圖】— 視覺升級版
// 顯示最近 30 次 session 的「句/分鐘」速度趨勢。
// 資料來自 speedStorage，每次閱讀 session 結束後自動記錄。
// 升級：平滑曲線、漸層填充、平均參考線、最近值脈動標記、懸停導引線 + tooltip。

'use client'

import { useEffect, useRef, useState } from 'react'
import { speedStorage, SpeedRecord } from '../utils/storage'

// Catmull-Rom → 平滑貝茲路徑（讓折線變柔順曲線）
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : ''
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const t = 0.16
    const c1x = p1.x + (p2.x - p0.x) * t
    const c1y = p1.y + (p2.y - p0.y) * t
    const c2x = p2.x - (p3.x - p1.x) * t
    const c2y = p2.y - (p3.y - p1.y) * t
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

export default function SpeedChart() {
  const [records, setRecords] = useState<SpeedRecord[]>([])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRecords(speedStorage.getLast30())
  }, [])

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
        <div className="flex items-center space-x-2 mb-4">
          <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(180deg,#fb923c,#f97316)' }} />
          <h2 className="text-base font-semibold text-orange-500">閱讀速度</h2>
        </div>
        <p className="text-sm text-gray-300 text-center py-6">閱讀後將顯示你的速度趨勢</p>
      </div>
    )
  }

  const speeds = records.map(r => r.speed)
  const n = records.length
  const maxSpeed = Math.max(...speeds, 1)
  const minSpeed = Math.min(...speeds)
  const avgSpeed = Math.round(speeds.reduce((a, b) => a + b, 0) / n)
  const latest = records[n - 1]

  // SVG 折線圖尺寸（用 viewBox 拉伸，preserveAspectRatio=none）
  const W = 1000
  const H = 180
  const PAD = { left: 8, right: 8, top: 24, bottom: 18 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // 上下留白讓波形不貼邊
  const span = (maxSpeed - minSpeed) * 0.18 || 1
  const lo = minSpeed - span
  const hi = maxSpeed + span

  const xOf = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * chartW
  const yOf = (speed: number) => PAD.top + chartH - ((speed - lo) / (hi - lo)) * chartH

  const pts = records.map((r, i) => ({ x: xOf(i), y: yOf(r.speed) }))
  const linePath = smoothPath(pts)
  const areaPath = `${linePath} L ${xOf(n - 1).toFixed(2)} ${(PAD.top + chartH).toFixed(2)} L ${xOf(0).toFixed(2)} ${(PAD.top + chartH).toFixed(2)} Z`

  const avgY = yOf(avgSpeed)
  const lastX = xOf(n - 1)
  const lastY = yOf(latest.speed)
  const gridYs = [0.25, 0.5, 0.75].map(f => PAD.top + f * chartH)

  // 趨勢徽章（最近 vs 平均）
  const diff = latest.speed - avgSpeed
  const up = diff >= 0

  // 懸停：用滑鼠 x 對應最近的資料點
  const handleMove = (e: React.MouseEvent) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHoverIdx(Math.round(frac * (n - 1)))
  }

  const hr = hoverIdx != null ? records[hoverIdx] : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      {/* 標題列 + 統計 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(180deg,#fb923c,#f97316)' }} />
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-bold text-gray-800">閱讀速度</h2>
              <span
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: up ? '#f0fdf4' : '#fef2f2', color: up ? '#16a34a' : '#dc2626' }}
              >
                {up ? '▲' : '▼'} {up ? '高於' : '低於'}平均 {Math.abs(diff)}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">近 {n} 次閱讀 · {records[0].date} 至 {latest.date}</p>
          </div>
        </div>
        <div className="flex items-stretch">
          <div className="text-right pr-4">
            <div className="text-[11px] font-semibold text-gray-300 mb-0.5">平均</div>
            <div className="flex items-baseline gap-0.5 justify-end">
              <span className="text-[22px] font-bold text-gray-600 leading-none">{avgSpeed}</span>
              <span className="text-[11px] text-gray-400">句/分</span>
            </div>
          </div>
          <div className="w-px bg-gray-100" />
          <div className="text-right pl-4">
            <div className="text-[11px] font-semibold text-orange-300 mb-0.5">最近</div>
            <div className="flex items-baseline gap-0.5 justify-end">
              <span className="text-[22px] font-bold text-orange-500 leading-none">{latest.speed}</span>
              <span className="text-[11px] text-orange-400">句/分</span>
            </div>
          </div>
        </div>
      </div>

      {/* 折線圖 */}
      <div
        ref={wrapRef}
        className="relative w-full"
        style={{ height: 180 }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: 180, overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="speedArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" stopOpacity="0.22" />
              <stop offset="60%" stopColor="#fb923c" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="speedLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fdba74" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>

          {/* 基準格線 */}
          {gridYs.map((y, i) => (
            <line key={i} x1={0} y1={y} x2={W} y2={y} stroke="#f3f4f6" strokeWidth={1} />
          ))}
          {/* 平均參考線 */}
          <line x1={0} y1={avgY} x2={W} y2={avgY} stroke="#e5e7eb" strokeWidth={1.2} strokeDasharray="4 4" />

          {/* 區域 + 曲線 */}
          <path d={areaPath} fill="url(#speedArea)" />
          <path
            d={linePath}
            fill="none"
            stroke="url(#speedLine)"
            strokeWidth={2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* 最近值脈動標記 */}
          <circle cx={lastX} cy={lastY} r={4.5} fill="#f97316" stroke="white" strokeWidth={2.5} />

          {/* 懸停導引線 + 點 */}
          {hr && hoverIdx != null && (
            <>
              <line x1={xOf(hoverIdx)} y1={0} x2={xOf(hoverIdx)} y2={H} stroke="#fdba74" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={xOf(hoverIdx)} cy={yOf(hr.speed)} r={5} fill="#ea580c" stroke="white" strokeWidth={2.5} />
            </>
          )}
        </svg>

        {/* tooltip */}
        {hr && hoverIdx != null && (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              top: -6,
              left: `${(hoverIdx / Math.max(n - 1, 1)) * 100}%`,
              transform: 'translate(-50%,-100%)',
            }}
          >
            <div className="bg-gray-800 text-white px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
              <div className="text-sm font-bold leading-tight">
                {hr.speed} <span className="text-[10px] font-normal opacity-70">句/分</span>
              </div>
              <div className="text-[10.5px] opacity-60 mt-0.5">{hr.date} · {hr.sentences} 句</div>
            </div>
          </div>
        )}
      </div>

      {/* 底部統計 */}
      <div className="flex justify-between items-center mt-3 text-xs text-gray-300">
        <span>{records[0].date}</span>
        <span className="text-gray-400">共 {n} 次紀錄 · 最快 {maxSpeed} 句/分</span>
        <span>{latest.date}</span>
      </div>
    </div>
  )
}
