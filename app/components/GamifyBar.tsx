// 【閱讀冒險卡】
// 這個文件負責：書架頁顯示遊戲化狀態 — 等級稱號、XP 進度條、連續打卡、擊殺數。
// 跟 ReadingTrend 同一套卡片樣式（白卡 + 細邊 + 左側色條），融入現有書架風格。

'use client'

import { useEffect, useState } from 'react'
import { gamifyStorage, levelForXP, getStreak, MONSTERS } from '../utils/gamify'

export default function GamifyBar() {
  // 等 client mount 先讀 localStorage，避免 SSR mismatch
  const [stats, setStats] = useState<{ xp: number; kills: number; streak: number } | null>(null)
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    setStats({
      xp: gamifyStorage.get().xp,
      kills: gamifyStorage.totalKills(),
      streak: getStreak(),
    })
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimated(true)))
  }, [])

  if (!stats) return null

  const lv = levelForXP(stats.xp)
  const fresh = stats.xp === 0 && stats.kills === 0 && stats.streak === 0

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-1 h-5 bg-indigo-500 rounded-full" />
          <h2 className="text-base font-semibold text-indigo-600">閱讀冒險</h2>
          <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-semibold">
            Lv.{lv.level} {lv.title}
          </span>
        </div>
        {/* 右側：連續打卡 + 擊殺 */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span title="連續閱讀天數">🔥 {stats.streak} 天</span>
          <span title="累計擊敗怪物">⚔️ {stats.kills} 隻</span>
        </div>
      </div>

      {fresh ? (
        <p className="text-sm text-gray-300 text-center py-2">
          設定閱讀目標即可召喚怪物，每讀一句就是一次攻擊 ⚔️
        </p>
      ) : (
        <>
          {/* XP 進度條 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(lv.progress * 100, 100)}%`,
                  background: 'linear-gradient(90deg,#818cf8,#4f46e5)',
                  transformOrigin: 'left center',
                  transform: animated ? 'scaleX(1)' : 'scaleX(0)',
                  transition: 'transform 600ms var(--ease-out)',
                }}
              />
            </div>
            <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
              {lv.xpInLevel} / {lv.xpNeeded} XP
            </span>
          </div>
          {/* 擊殺明細（有擊殺先顯示） */}
          {stats.kills > 0 && (
            <div className="flex items-center gap-3 mt-2.5">
              {MONSTERS.map(m => {
                const n = gamifyStorage.get().kills[m.id] ?? 0
                if (n === 0) return null
                return (
                  <span key={m.id} className="text-xs text-gray-400" title={`${m.name} ×${n}`}>
                    {m.emoji} ×{n}
                  </span>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
