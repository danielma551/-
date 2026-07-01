'use client'

// 【呼吸休息動畫】每看完 4 個循環出現，引導使用者跟圓圈一吸一呼、放鬆眼睛。
// 純 CSS + 計時器，無外部依賴。自動完成或可跳過。

import { useEffect, useRef, useState } from 'react'

interface Props {
  onClose: () => void
  rounds?: number   // 呼吸次數，預設 3 次（約 24 秒）
}

const INHALE_MS = 4000
const EXHALE_MS = 4000

export default function BreathingOverlay({ onClose, rounds = 3 }: Props) {
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
