'use client'

// 【呼吸休息卡片】每看完 4 個循環出現，引導一次吸氣→呼氣後自動消失。
// 非鋪滿全屏：置中細卡片 + 淡背景。純 CSS + 計時器。
// 重點：用 onCloseRef + 時間線（只在掛載時排程一次），避免父層重渲染重置計時器。

import { useEffect, useRef, useState } from 'react'

interface Props {
  onClose: () => void
  rounds?: number   // 呼吸次數，預設 1 次（吸 4 秒 + 呼 4 秒 ≈ 8 秒）
  eink?: boolean    // 墨水屏：黑白、圓圈一步切換（避免殘影）
}

const INHALE_MS = 4000
const EXHALE_MS = 4000

const FADE_MS = 400

export default function BreathingOverlay({ onClose, rounds = 1, eink = false }: Props) {
  const [phase, setPhase] = useState<'inhale' | 'exhale'>('inhale')
  const [big, setBig] = useState(false)   // 圓圈大細：吸氣時放大
  const [visible, setVisible] = useState(false)   // 淡入淡出（墨水屏除外）
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose            // 每次 render 更新，計時器讀最新的

  // 提前淡出後才真正關閉（墨水屏即時關閉，避免刷新殘影）
  const beginClose = useRef(() => {
    if (eink) { onCloseRef.current(); return }
    setVisible(false)
    setTimeout(() => onCloseRef.current(), FADE_MS)
  })

  useEffect(() => {
    // 掛載即淡入
    const fadeIn = setTimeout(() => setVisible(true), 20)
    const timers: ReturnType<typeof setTimeout>[] = [fadeIn]
    let t = 80   // 掛載後先由「細」狀態起步，等一格再吸氣 → 睇到放大動畫
    for (let r = 0; r < rounds; r++) {
      const inAt = t
      const outAt = t + INHALE_MS
      timers.push(setTimeout(() => { setPhase('inhale'); setBig(true) }, inAt))
      timers.push(setTimeout(() => { setPhase('exhale'); setBig(false) }, outAt))
      t = outAt + EXHALE_MS
    }
    timers.push(setTimeout(() => beginClose.current(), t))
    return () => timers.forEach(clearTimeout)
  }, [rounds])

  const inhaling = phase === 'inhale'
  const close = () => beginClose.current()

  // ── 墨水屏版：黑白、無漸變／陰影、圓圈一步切換 ──
  if (eink) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.25)' }} onClick={close}>
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
                width: big ? 160 : 90, height: big ? 160 : 90,
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

  // ── 彩色版：置中細卡片（非鋪滿全屏）+ 淡入淡出 ──
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
      onClick={close}
    >
      <div
        className="flex flex-col items-center rounded-3xl px-10 py-8 shadow-2xl"
        style={{
          background: 'linear-gradient(160deg,#1e3a5f,#0f2038)',
          transform: visible ? 'scale(1)' : 'scale(0.94)',
          transition: `transform ${FADE_MS}ms ease`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-white/80 text-sm font-medium mb-1">休息一下 🌙</p>
        <p className="text-white/40 text-xs mb-6">跟住圓圈呼吸 · 放鬆眼睛</p>

        <div className="relative flex items-center justify-center" style={{ width: 190, height: 190 }}>
          {/* 光暈 */}
          <div
            className="absolute rounded-full"
            style={{
              width: 190, height: 190,
              background: 'radial-gradient(circle, rgba(96,165,250,0.30) 0%, rgba(96,165,250,0) 70%)',
              transform: `scale(${big ? 1 : 0.55})`,
              transition: `transform ${big ? INHALE_MS : EXHALE_MS}ms ease-in-out`,
            }}
          />
          {/* 主圓 */}
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 110, height: 110,
              background: 'linear-gradient(150deg,#60a5fa,#3b82f6)',
              boxShadow: '0 0 40px rgba(96,165,250,0.45)',
              transform: `scale(${big ? 1.25 : 0.62})`,
              transition: `transform ${big ? INHALE_MS : EXHALE_MS}ms ease-in-out`,
            }}
          >
            <span className="text-white text-lg font-medium tracking-widest">{inhaling ? '吸氣' : '呼氣'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
