'use client'

// 【呼吸休息動畫】每看完 4 個循環出現，引導使用者跟圓圈一吸一呼、放鬆眼睛。
// 純 CSS + 計時器，無外部依賴。自動完成或可跳過。

import { useEffect, useRef, useState } from 'react'

interface Props {
  onClose: () => void
  rounds?: number   // 呼吸次數，預設 3 次（約 24 秒）
  eink?: boolean    // 墨水屏：黑白高對比、無漸變光暈、圓圈一步切換（避免殘影）
}

const INHALE_MS = 4000
const EXHALE_MS = 4000

export default function BreathingOverlay({ onClose, rounds = 3, eink = false }: Props) {
  const [phase, setPhase] = useState<'inhale' | 'exhale'>('inhale')
  const [roundsLeft, setRoundsLeft] = useState(rounds)
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
        setRoundsLeft(left)
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

  // ── 墨水屏版：黑白、無漸變／陰影、圓圈一步切換（transition none，減少刷新殘影）──
  if (eink) {
    return (
      <div
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
        style={{ background: '#fff' }}
        onClick={onClose}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className="absolute top-6 right-6 text-sm px-4 py-2"
          style={{ border: '1.5px solid #000', borderRadius: 4, fontWeight: 700, background: '#fff', color: '#000' }}
        >
          跳過
        </button>

        <p style={{ color: '#000', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>看完四個循環，休息一下</p>
        <p style={{ color: '#000', fontSize: 12, marginBottom: 36 }}>跟住圓圈呼吸 · 放鬆眼睛</p>

        <div className="flex items-center justify-center" style={{ width: 260, height: 260 }} onClick={(e) => e.stopPropagation()}>
          <div
            className="flex items-center justify-center"
            style={{
              width: inhaling ? 220 : 120,
              height: inhaling ? 220 : 120,
              borderRadius: '50%',
              border: '4px solid #000',
              background: '#fff',
              transition: 'none',   // 墨水屏：即時切換，唔做平滑動畫
            }}
          >
            <span style={{ color: '#000', fontSize: 26, fontWeight: 700, letterSpacing: 4 }}>
              {inhaling ? '吸氣' : '呼氣'}
            </span>
          </div>
        </div>

        <p style={{ color: '#000', fontSize: 12, marginTop: 36 }}>剩 {roundsLeft} 次 · 完成後自動繼續</p>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{
        background: 'radial-gradient(circle at 50% 45%, #1e3a5f 0%, #0f2038 60%, #0a1628 100%)',
      }}
      onClick={onClose}
    >
      {/* 跳過 */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute top-6 right-6 text-white/60 hover:text-white text-sm px-4 py-2 rounded-full border border-white/20 hover:border-white/40 transition-colors"
      >
        跳過
      </button>

      <p className="text-white/70 text-sm mb-1 tracking-wide">看完四個循環，休息一下 🌙</p>
      <p className="text-white/40 text-xs mb-10">跟住圓圈呼吸 · 放鬆眼睛</p>

      {/* 呼吸圓圈 */}
      <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }} onClick={(e) => e.stopPropagation()}>
        {/* 外圈光暈 */}
        <div
          className="absolute rounded-full"
          style={{
            width: 300, height: 300,
            background: 'radial-gradient(circle, rgba(96,165,250,0.28) 0%, rgba(96,165,250,0) 70%)',
            transform: `scale(${inhaling ? 1 : 0.6})`,
            transition: `transform ${inhaling ? INHALE_MS : EXHALE_MS}ms ease-in-out`,
          }}
        />
        {/* 主圓 */}
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: 180, height: 180,
            background: 'linear-gradient(150deg, #60a5fa, #3b82f6)',
            boxShadow: '0 0 60px rgba(96,165,250,0.5)',
            transform: `scale(${inhaling ? 1.25 : 0.75})`,
            transition: `transform ${inhaling ? INHALE_MS : EXHALE_MS}ms ease-in-out`,
          }}
        >
          <span className="text-white text-xl font-medium tracking-widest">
            {inhaling ? '吸氣' : '呼氣'}
          </span>
        </div>
      </div>

      <p className="text-white/40 text-xs mt-10">剩 {roundsLeft} 次 · 完成後自動繼續</p>
    </div>
  )
}
