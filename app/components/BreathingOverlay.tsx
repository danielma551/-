'use client'

// 【呼吸休息卡片】每看完 4 個循環出現，引導一次吸氣→呼氣後自動消失。
// 卡通版：奶油霧化背景 + 貼紙卡 + 粗邊圓圈（吸氣珊瑚、呼氣薄荷）。
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

const CC_FONT = '"Yuanti SC", "Hiragino Maru Gothic ProN", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'

export default function BreathingOverlay({ onClose, rounds = 1, eink = false }: Props) {
  const [phase, setPhase] = useState<'inhale' | 'exhale'>('inhale')
  const [big, setBig] = useState(false)
  const [visible, setVisible] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const beginClose = useRef(() => {
    if (eink) { onCloseRef.current(); return }
    setVisible(false)
    setTimeout(() => onCloseRef.current(), FADE_MS)
  })

  useEffect(() => {
    const fadeIn = setTimeout(() => setVisible(true), 20)
    const timers: ReturnType<typeof setTimeout>[] = [fadeIn]
    let t = 80
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

  // ── 墨水屏：黑白、粗邊、無漸變／陰影、圓圈一步切換 ──
  if (eink) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.28)', fontFamily: CC_FONT }}
        onClick={close}
      >
        <div
          className="flex flex-col items-center"
          style={{ background: '#fff', border: '3px solid #000', borderRadius: 16, padding: '26px 38px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ color: '#000', fontSize: 13, fontWeight: 800, letterSpacing: 2, marginBottom: 18 }}>休息一下 · 跟住圓圈呼吸</p>
          <div className="flex items-center justify-center" style={{ width: 180, height: 180 }}>
            <div
              className="flex items-center justify-center"
              style={{
                width: big ? 156 : 92, height: big ? 156 : 92,
                borderRadius: '50%', border: '5px solid #000', background: '#fff', transition: 'none',
              }}
            >
              <span style={{ color: '#000', fontSize: 20, fontWeight: 800, letterSpacing: 5 }}>{inhaling ? '吸氣' : '呼氣'}</span>
            </div>
          </div>
          <p style={{ color: '#000', fontSize: 12, fontWeight: 700, marginTop: 16 }}>點任意處跳過</p>
        </div>
      </div>
    )
  }

  // ── 卡通彩色版：奶油霧化 + 白貼紙卡 + 粗邊圓 ──
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{
        background: 'rgba(46,42,38,0.28)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease`, fontFamily: CC_FONT,
      }}
      onClick={close}
    >
      <style>{`
        @keyframes rippleOut { 0% { transform: scale(0.45); opacity: 0.55 } 100% { transform: scale(1.55); opacity: 0 } }
      `}</style>

      <div
        className="relative flex flex-col items-center"
        style={{
          background: '#FFFDF6', border: '3px solid #2E2A26', borderRadius: 28,
          boxShadow: '6px 6px 0 #2E2A26', padding: '28px 40px 24px',
          transform: 'rotate(-1deg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
          <span
            className="grid place-items-center"
            style={{ width: 30, height: 30, borderRadius: '50%', background: '#6ED3B6', border: '2.5px solid #2E2A26', boxShadow: '2px 2px 0 #2E2A26' }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2E2A26" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 19c0-7 4-12 12-14 1 8-3 13-10 13" /><path d="M5 19c3-4 6-6 10-8" />
            </svg>
          </span>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#7A6E63', letterSpacing: '0.08em' }}>休息一下 · 跟住圓圈呼吸</p>
        </div>

        <div className="relative flex items-center justify-center" style={{ width: 200, height: 200 }}>
          <div className="absolute inset-0" style={{ opacity: inhaling ? 1 : 0, transition: 'opacity .6s ease' }}>
            {[0, 1.3, 2.6].map((delay, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute', left: '50%', top: '50%', width: 170, height: 170, marginLeft: -85, marginTop: -85,
                  borderRadius: '999px', border: '2.5px solid rgba(255,122,89,0.5)',
                  animation: `rippleOut 4s ease-out ${delay}s infinite`,
                }}
              />
            ))}
          </div>

          <div
            className="flex items-center justify-center"
            style={{
              width: 150, height: 150, borderRadius: '999px',
              background: inhaling ? '#FFE3D9' : '#DFF5EC',
              border: '4px solid #2E2A26',
              boxShadow: '0 6px 0 rgba(46,42,38,0.14)',
              transform: `scale(${big ? 1.12 : 0.64})`,
              transition: `transform ${big ? INHALE_MS : EXHALE_MS}ms cubic-bezier(.37,0,.63,1), background .6s ease`,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 6, paddingLeft: 6, color: '#2E2A26' }}>
              {inhaling ? '吸氣' : '呼氣'}
            </span>
          </div>
        </div>

        <p style={{ fontSize: 12, fontWeight: 800, color: '#7A6E63', marginTop: 14, letterSpacing: '0.04em' }}>
          吸氣 4 秒 · 呼氣 4 秒 · 點任意處跳過
        </p>
      </div>
    </div>
  )
}
