'use client'

// 【🚇 閱讀地鐵線】取代全書薄條：每章一個站，列車跟住進度行；到站「叮咚～」＋站名提示

import { useEffect, useRef, useState } from 'react'
import { Station, stationAt } from '../utils/stations'

const LINE = '#10b981'      // 地鐵線顏色（綠）
const TRACK = '#e5e7eb'

// 叮咚（WebAudio，好細聲）
function chime() {
  try {
    if (localStorage.getItem('subway-chime') === 'off') return
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext)
    const ctx = new Ctx()
    const tone = (f: number, t: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.6)
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.65)
    }
    tone(988, 0); tone(784, 0.28)
    setTimeout(() => ctx.close(), 1200)
  } catch { /* ignore */ }
}

export default function SubwayLine({ stations, index, total, marginTop = 8 }: { stations: Station[]; index: number; total: number; marginTop?: number }) {
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const [ring, setRing] = useState<{ pct: number; key: number } | null>(null)
  const prevRef = useRef<number | null>(null)
  const cur = stationAt(stations, index)
  const next = stations[cur + 1]
  const pct = total > 1 ? Math.min(100, (index / (total - 1)) * 100) : 0
  const posOf = (i: number) => (total > 1 ? (i / (total - 1)) * 100 : 0)

  // 到站：向前行過咗一個站嘅起點
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = index
    if (prev === null || index <= prev || index - prev > 50) return   // 跳頁／倒退唔算
    const a = stationAt(stations, prev), b = stationAt(stations, index)
    if (b > a) {
      const s = stations[b]
      const k = Date.now()
      setToast({ text: `叮咚～ 已到站：${s.title}`, key: k })
      setRing({ pct: posOf(s.startIndex), key: k })
      chime()
      setTimeout(() => setToast(t => (t?.key === k ? null : t)), 2600)
      setTimeout(() => setRing(r => (r?.key === k ? null : r)), 900)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stations])

  if (!stations.length || total < 2) return null
  const many = stations.length > 24

  return (
    <div style={{ marginTop, position: 'relative' }}>
      <style>{`
        @keyframes subway-ring { 0% { transform: translate(-50%,-50%) scale(1); opacity: .8 } 100% { transform: translate(-50%,-50%) scale(2.8); opacity: 0 } }
        @keyframes subway-toast { 0% { opacity: 0; transform: translate(-50%, 6px) } 12% { opacity: 1; transform: translate(-50%, 0) } 85% { opacity: 1 } 100% { opacity: 0 } }
      `}</style>
      {/* 路線 */}
      <div style={{ position: 'relative', height: 14 }} title={`全書 ${index + 1}/${total} 句 · 第 ${cur + 1}/${stations.length} 站`}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 5, height: 4, borderRadius: 99, background: TRACK }} />
        <div style={{ position: 'absolute', left: 0, top: 5, height: 4, borderRadius: 99, background: LINE, width: `${pct}%`, transition: 'width .35s ease-out' }} />
        {stations.map((s, k) => {
          const passed = k <= cur
          const size = many ? 6 : 9
          return (
            <div key={k} title={s.title} style={{
              position: 'absolute', left: `${posOf(s.startIndex)}%`, top: 7, width: size, height: size, borderRadius: 99,
              transform: 'translate(-50%,-50%)', background: passed ? LINE : '#fff',
              border: `${many ? 1.5 : 2}px solid ${passed ? LINE : '#cbd5e1'}`, boxSizing: 'border-box', zIndex: 1,
            }} />
          )
        })}
        {ring && <div key={ring.key} style={{ position: 'absolute', left: `${ring.pct}%`, top: 7, width: 10, height: 10, borderRadius: 99, border: `2px solid ${LINE}`, animation: 'subway-ring .9s ease-out forwards', pointerEvents: 'none', zIndex: 2 }} />}
        {/* 列車 */}
        <span style={{ position: 'absolute', left: `${Math.min(pct, 98.5)}%`, top: 7, transform: 'translate(-50%,-62%)', fontSize: 13, lineHeight: 1, zIndex: 3, transition: 'left .35s ease-out', pointerEvents: 'none' }}>🚇</span>
      </div>
      {/* 站名 */}
      <div className="flex justify-between items-baseline gap-2" style={{ fontSize: 11, marginTop: 2, color: '#6b7280' }}>
        <span className="truncate" style={{ minWidth: 0 }}>
          <span style={{ color: LINE, fontWeight: 600 }}>● </span>{stations[cur].title}
        </span>
        {next
          ? <span className="whitespace-nowrap tabular-nums">下一站：<b style={{ color: '#374151', fontWeight: 600 }}>{next.title.length > 14 ? next.title.slice(0, 14) + '…' : next.title}</b> · 仲有 {next.startIndex - index} 句</span>
          : <span className="whitespace-nowrap">終點站 🏁 · 仲有 {Math.max(total - 1 - index, 0)} 句</span>}
      </div>
      {/* 到站提示 */}
      {toast && (
        <div key={toast.key} style={{
          position: 'absolute', left: '50%', top: 34, zIndex: 30, whiteSpace: 'nowrap', pointerEvents: 'none',
          background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 999,
          padding: '6px 14px', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 14px rgba(16,185,129,.18)',
          animation: 'subway-toast 2.6s ease-out forwards',
        }}>🚇 {toast.text}</div>
      )}
    </div>
  )
}
