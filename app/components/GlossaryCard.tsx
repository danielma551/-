'use client'

// 【外刊詞解卡】方案 1b：畫面底部中央浮動卡（bottom sheet）。
// 點有虛線底的單詞開啟；含發音（speechSynthesis）與「加入每日溫習」。

import { useEffect, useState } from 'react'
import { X, Volume2, Plus, Check } from 'lucide-react'
import { reviewStorage } from '../utils/storage'

interface Props {
  word: string
  note: string
  phonetic?: string   // 若詞彙表無音標則不顯示
  onClose: () => void
}

export default function GlossaryCard({ word, note, phonetic, onClose }: Props) {
  const [shown, setShown] = useState(false)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 20)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setShown(false); setTimeout(onClose, 260) } }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 換詞時重置「已加入」狀態
  useEffect(() => { setAdded(false) }, [word])

  const close = () => { setShown(false); setTimeout(onClose, 260) }

  const speak = () => {
    try {
      const u = new SpeechSynthesisUtterance(word)
      u.lang = 'en-US'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch { /* 不支援則略過 */ }
  }

  const addToReview = () => {
    if (added) return
    reviewStorage.addImported([{ text: `${word}\n\n${note}`, source: '外刊詞解' }])
    setAdded(true)
  }

  return (
    <div className="fixed inset-0 z-[55]" onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 26, left: '50%', width: 560, maxWidth: '88vw',
          background: '#ffffff', border: '1px solid #ccfbf1', borderRadius: 16,
          boxShadow: '0 20px 50px rgba(0,0,0,0.13)', padding: '18px 22px 16px',
          transform: shown ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(16px)',
          opacity: shown ? 1 : 0,
          transition: 'opacity 260ms ease, transform 260ms ease',
        }}
      >
        {/* Header */}
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2.5">
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#f0fdfa', color: '#0d9488' }}>外刊詞解</span>
            <span style={{ fontSize: 19, fontWeight: 700, color: '#1f2937' }}>{word}</span>
            {phonetic && <span style={{ fontSize: 12.5, color: '#9ca3af' }}>{phonetic}</span>}
          </div>
          <button onClick={close} style={{ padding: 6, borderRadius: 8, color: '#9ca3af' }} className="hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 解釋 */}
        <p style={{ fontSize: 13.5, lineHeight: 1.75, color: '#4b5563', margin: '8px 0 12px', whiteSpace: 'pre-wrap' }}>{note}</p>

        {/* 動作列 */}
        <div className="flex gap-2">
          <button
            onClick={speak}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', color: '#4b5563', fontSize: 12.5 }}
            className="inline-flex items-center gap-1.5 hover:bg-gray-50 transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5" style={{ stroke: '#0d9488' }} /> 發音
          </button>
          <button
            onClick={addToReview}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', color: added ? '#0d9488' : '#4b5563', fontSize: 12.5 }}
            className="inline-flex items-center gap-1.5 hover:bg-gray-50 transition-colors"
          >
            {added
              ? <><Check className="w-3.5 h-3.5" style={{ stroke: '#0d9488' }} /> 已加入</>
              : <><Plus className="w-3.5 h-3.5" style={{ stroke: '#0d9488' }} /> 加入每日溫習</>}
          </button>
        </div>
      </div>
    </div>
  )
}
