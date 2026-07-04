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

  // ── 彩色版（5c）：米色霧化覆蓋層 + 白圓 + 雨的漣漪，無卡片 ──
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{
        background: 'rgba(240,234,218,0.78)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
        opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease`,
      }}
      onClick={close}
    >
      <style>{`
        @keyframes rippleOut { 0% { transform: scale(0.45); opacity: 0.6 } 100% { transform: scale(1.7); opacity: 0 } }
      `}</style>

      <div className="relative flex items-center justify-center" style={{ width: 150, height: 150 }} onClick={(e) => e.stopPropagation()}>
        {/* 漣漪：只在吸氣時向外散開 */}
        <div className="absolute inset-0" style={{ opacity: inhaling ? 1 : 0, transition: 'opacity .8s ease' }}>
          {[0, 1.3, 2.6].map((delay, i) => (
            <div key={i} style={{
              position: 'absolute', left: '50%', top: '50%', width: 150, height: 150, marginLeft: -75, marginTop: -75,
              borderRadius: '999px', border: `1.5px solid rgba(96,165,250,${[0.55, 0.45, 0.35][i]})`,
              animation: `rippleOut 4s ease-out ${delay}s infinite`,
            }} />
          ))}
        </div>

        {/* 主圓 */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 112, height: 112, borderRadius: '999px',
            background: '#ffffff', border: '2px solid #5eead4', boxShadow: '0 8px 30px rgba(20,184,166,0.18)',
            transform: `scale(${big ? 1.15 : 0.62})`,
            transition: `transform ${big ? INHALE_MS : EXHALE_MS}ms ease-in-out`,
          }}
        >
          <span style={{ fontSize: 17, fontWeight: 500, letterSpacing: 6, paddingLeft: 6, color: '#0f766e' }}>{inhaling ? '吸氣' : '呼氣'}</span>
        </div>
      </div>

      <p style={{ fontSize: 12.5, letterSpacing: '0.15em', color: '#8d867a', marginTop: 22 }}>休息一下 · 眼睛望遠處</p>
      <p style={{ fontSize: 10.5, color: '#c4bca6', marginTop: 8 }}>點任意處跳過</p>
    </div>
  )
}
