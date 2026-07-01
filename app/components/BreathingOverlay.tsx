'use client'

// 【呼吸休息卡片】每看完 4 個循環出現，引導一次吸氣／呼氣後自動消失。
// 非鋪滿全屏：置中細卡片 + 淡背景。純 CSS + 計時器。

import { useEffect, useRef, useState } from 'react'

interface Props {
  onClose: () => void
  rounds?: number   // 呼吸次數，預設 1 次（約 8 秒）
  eink?: boolean    // 墨水屏：黑白高對比、圓圈一步切換（避免殘影）
}

const INHALE_MS = 4000
const EXHALE_MS = 4000

export default function BreathingOverlay({ onClose, rounds = 1, eink = false }: Props) {
  const [phase, setPhase] = useState<'inhale' | 'exhale'>('inhale')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let left = rounds
    let ph: 'inhale' | 'exhale' = 'inhale'
    setPhase('inhale')
    const step = () => {
      if (ph === 'inhale') {
        ph = 'exhale'
        setPhase('exhale')
        timerRef.current = setTimeout(step, EXHALE_MS)
      } else {
        left -= 1
        if (left <= 0) { onClose(); return }
        ph = 'inhale'
        setPhase('inhale')
        timerRef.current = setTimeout(step, INHALE_MS)
      }
    }
    timerRef.current = setTimeout(step, INHALE_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [rounds, onClose])

  const inhaling = phase === 'inhale'

  // ── 墨水屏版：黑白、無漸變／陰影、圓圈一步切換 ──
  if (eink) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.25)' }} onClick={onClose}>
        <div
          className="flex flex-col items-center"
          style={{ background: '#fff', border: '2px solid #000', borderRadius: 12, padding: '28px 40px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ color: '#000', fontSize: 14, fontWeight: 700, marginBottom: 20 }}>休息一下 · 跟住圓圈呼吸</p>
          <div className="flex items-center justify-center" style={{ width: 180, height: 180 }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: inhaling ? 160 : 90, height: inhaling ? 160 : 90,
                borderRadius: '50%', border: '4px solid #000', background: '#fff', transition: 'none',
              }}
            >
              <span style={{ color: '#000', fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>{inhaling ? '吸氣' : '呼氣'}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── 彩色版：置中細卡片（非鋪滿全屏）──
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex flex-col items-center rounded-3xl px-10 py-8 shadow-2xl"
        style={{ background: 'linear-gradient(160deg,#1e3a5f,#0f2038)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-white/80 text-sm font-medium mb-1">休息一下 🌙</p>
        <p className="text-white/40 text-xs mb-6">跟住圓圈呼吸 · 放鬆眼睛</p>

        <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
          {/* 光暈 */}
          <div
            className="absolute rounded-full"
            style={{
              width: 180, height: 180,
              background: 'radial-gradient(circle, rgba(96,165,250,0.30) 0%, rgba(96,165,250,0) 70%)',
              transform: `scale(${inhaling ? 1 : 0.6})`,
              transition: `transform ${inhaling ? INHALE_MS : EXHALE_MS}ms ease-in-out`,
            }}
          />
          {/* 主圓 */}
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 110, height: 110,
              background: 'linear-gradient(150deg,#60a5fa,#3b82f6)',
              boxShadow: '0 0 40px rgba(96,165,250,0.45)',
              transform: `scale(${inhaling ? 1.2 : 0.72})`,
              transition: `transform ${inhaling ? INHALE_MS : EXHALE_MS}ms ease-in-out`,
            }}
          >
            <span className="text-white text-lg font-medium tracking-widest">{inhaling ? '吸氣' : '呼氣'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
