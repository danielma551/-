'use client'

// 【外刊解釋卡】選中外刊中「有解釋」的詞時，在同頁向外滑出一張解釋卡。
// 桌面：右側滑入；手機：底部滑入。點卡外或 ✕ 關閉。

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  word: string
  note: string
  onClose: () => void
}

export default function GlossaryCard({ word, note, onClose }: Props) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 20)
    return () => clearTimeout(t)
  }, [])

  const close = () => { setShown(false); setTimeout(onClose, 260) }

  return (
    <div className="fixed inset-0 z-[55]" onClick={close} style={{ pointerEvents: 'auto' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute rounded-2xl shadow-2xl border border-teal-100 bg-white
                   right-4 top-1/2 w-[320px] max-w-[86vw]
                   max-sm:right-3 max-sm:left-3 max-sm:w-auto max-sm:top-auto max-sm:bottom-4 max-sm:translate-y-0"
        style={{
          transform: shown ? 'translateY(-50%) translateX(0)' : 'translateY(-50%) translateX(24px)',
          opacity: shown ? 1 : 0,
          transition: 'opacity .26s ease, transform .26s ease',
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600">外刊詞解</span>
            <span className="text-lg font-bold text-gray-800">{word}</span>
          </div>
          <button onClick={close} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-5 pt-1">
          <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{note}</p>
        </div>
      </div>
    </div>
  )
}
