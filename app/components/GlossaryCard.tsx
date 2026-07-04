'use client'

// 【外刊解釋卡】選中／點擊外刊中「有解釋」的詞時，由該詞向外延伸一條線 + 動畫，帶出解釋卡。
// 有 anchor（詞的螢幕座標）時：畫連線 + 卡片定位在詞旁；無 anchor 時：退回右側滑入。

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  word: string
  note: string
  anchor?: { x: number; y: number }
  onClose: () => void
}

const CARD_W = 300
const GAP = 64

export default function GlossaryCard({ word, note, anchor, onClose }: Props) {
  const [shown, setShown] = useState(false)
  const [vw, setVw] = useState(0)
  const [vh, setVh] = useState(0)

  useEffect(() => {
    setVw(window.innerWidth); setVh(window.innerHeight)
    const t = setTimeout(() => setShown(true), 20)
    return () => clearTimeout(t)
  }, [])

  const close = () => { setShown(false); setTimeout(onClose, 260) }

  // 依 anchor 計算卡片位置與連線端點
  const layout = useMemo(() => {
    if (!anchor || !vw) return null
    const cardH = 150
    let placeRight = anchor.x + GAP + CARD_W <= vw - 16
    let left = placeRight ? anchor.x + GAP : anchor.x - GAP - CARD_W
    left = Math.max(16, Math.min(left, vw - CARD_W - 16))
    let top = anchor.y - 28
    top = Math.max(16, Math.min(top, vh - cardH - 16))
    // 連線由詞 → 卡片靠近詞嗰邊
    const cardConnX = placeRight ? left : left + CARD_W
    const cardConnY = top + 28
    const mx = (anchor.x + cardConnX) / 2
    const path = `M ${anchor.x} ${anchor.y} C ${mx} ${anchor.y}, ${mx} ${cardConnY}, ${cardConnX} ${cardConnY}`
    return { left, top, path, placeRight, cardConnX, cardConnY }
  }, [anchor, vw, vh])

  // 無 anchor：退回右側滑入卡
  if (!layout) {
    return (
      <div className="fixed inset-0 z-[55]" onClick={close}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute rounded-2xl shadow-2xl border border-teal-100 bg-white right-4 top-1/2 w-[320px] max-w-[86vw]"
          style={{ transform: shown ? 'translateY(-50%) translateX(0)' : 'translateY(-50%) translateX(24px)', opacity: shown ? 1 : 0, transition: 'opacity .26s ease, transform .26s ease' }}
        >
          <Body word={word} note={note} onClose={close} />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[55]" onClick={close}>
      {/* 連線 + 端點（動畫繪製）*/}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
        <circle cx={anchor!.x} cy={anchor!.y} r={4} fill="#14b8a6"
          style={{ opacity: shown ? 1 : 0, transition: 'opacity .2s ease' }} />
        <path
          d={layout.path}
          fill="none" stroke="#14b8a6" strokeWidth={2} strokeLinecap="round"
          style={{
            strokeDasharray: 600,
            strokeDashoffset: shown ? 0 : 600,
            transition: 'stroke-dashoffset .5s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
        <circle cx={layout.cardConnX} cy={layout.cardConnY} r={3} fill="#14b8a6"
          style={{ opacity: shown ? 1 : 0, transition: 'opacity .2s ease .35s' }} />
      </svg>

      {/* 卡片：由連線末端展開 */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute rounded-2xl shadow-2xl border border-teal-100 bg-white"
        style={{
          left: layout.left, top: layout.top, width: CARD_W, maxWidth: '86vw',
          transformOrigin: layout.placeRight ? 'left center' : 'right center',
          transform: shown ? 'scale(1)' : 'scale(0.85)',
          opacity: shown ? 1 : 0,
          transition: 'opacity .28s ease .18s, transform .28s cubic-bezier(0.34,1.56,0.64,1) .18s',
        }}
      >
        <Body word={word} note={note} onClose={close} />
      </div>
    </div>
  )
}

function Body({ word, note, onClose }: { word: string; note: string; onClose: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600">外刊詞解</span>
          <span className="text-lg font-bold text-gray-800">{word}</span>
        </div>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-5 pb-5 pt-1">
        <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{note}</p>
      </div>
    </>
  )
}
