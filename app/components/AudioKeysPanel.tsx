'use client'

// 【錄音快捷鍵設定】睇 + 改：撳「＋」再撳你想用嘅鍵（可以夾 Shift / Ctrl / Alt / ⌘）。

import { useEffect, useState } from 'react'
import { X, Plus, RotateCcw } from 'lucide-react'
import {
  AudioAction, AudioKeyConfig, AUDIO_ACTIONS, DEFAULT_AUDIO_KEYS,
  comboOf, prettyCombo, saveAudioKeys,
} from '../utils/audioKeys'

interface Props {
  config: AudioKeyConfig
  onChange: (c: AudioKeyConfig) => void
  onClose: () => void
  reservedKeys: string[]      // 已經用咗做其他功能嘅鍵（例如翻頁）
  isEink: boolean
}

export default function AudioKeysPanel({ config, onChange, onClose, reservedKeys, isEink }: Props) {
  const [capturing, setCapturing] = useState<AudioAction | null>(null)
  const [note, setNote] = useState('')

  const commit = (c: AudioKeyConfig) => { onChange(c); saveAudioKeys(c) }

  // 錄鍵：用 capture 階段攔截，唔會觸發閱讀器嘅快捷鍵
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setCapturing(null); setNote(''); return }
      const combo = comboOf(e)
      if (!combo) return   // 淨係撳咗 Shift 等修飾鍵，繼續等
      if (reservedKeys.includes(combo)) {
        setNote(`「${prettyCombo(combo)}」已經用咗做翻頁／返回，揀過第二個`)
        return
      }
      const keys = { ...config.keys }
      let moved = ''
      for (const a of AUDIO_ACTIONS) {
        if (a.id !== capturing && keys[a.id]?.includes(combo)) {
          keys[a.id] = keys[a.id].filter(k => k !== combo)
          moved = a.label(config)
        }
      }
      const cur = (keys[capturing] || []).filter(k => k !== combo)
      keys[capturing] = cur.length >= 2 ? [cur[0], combo] : [...cur, combo]
      commit({ ...config, keys })
      setNote(moved ? `已由「${moved}」搬過嚟` : '')
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, config, reservedKeys])

  const removeKey = (a: AudioAction, k: string) => {
    commit({ ...config, keys: { ...config.keys, [a]: config.keys[a].filter(x => x !== k) } })
  }

  const chip = isEink
    ? { border: '1.5px solid #000', background: '#fff', color: '#000', borderRadius: 0 }
    : { border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', borderRadius: 8 }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={e => { e.stopPropagation(); if (!capturing) onClose() }}>
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: isEink ? 0 : 16, border: isEink ? '2px solid #000' : 'none',
          boxShadow: isEink ? 'none' : '0 20px 50px rgba(0,0,0,0.2)', padding: 20,
          animation: isEink ? undefined : 'panel-in 200ms cubic-bezier(0.23,1,0.32,1) both',
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold" style={{ color: isEink ? '#000' : '#1f2937' }}>⌨️ 錄音快捷鍵</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: isEink ? '#000' : '#9ca3af' }}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: isEink ? '#333' : '#9ca3af' }}>撳「＋」然後撳你想用嘅鍵（可以夾 Shift／Ctrl／Alt／⌘）；每個功能最多兩個鍵。</p>

        {/* 跳轉秒數 */}
        <div className="flex items-center gap-3 mb-4 text-sm" style={{ color: isEink ? '#000' : '#374151' }}>
          <label className="flex items-center gap-1.5">短跳
            <select value={config.shortJump} onChange={e => commit({ ...config, shortJump: Number(e.target.value) })}
              className="px-2 py-1 rounded border text-sm" style={{ borderColor: isEink ? '#000' : '#e5e7eb' }}>
              {[3, 5, 10, 15].map(n => <option key={n} value={n}>{n} 秒</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">長跳
            <select value={config.longJump} onChange={e => commit({ ...config, longJump: Number(e.target.value) })}
              className="px-2 py-1 rounded border text-sm" style={{ borderColor: isEink ? '#000' : '#e5e7eb' }}>
              {[15, 30, 60, 120].map(n => <option key={n} value={n}>{n} 秒</option>)}
            </select>
          </label>
        </div>

        {/* 各功能 */}
        <div className="space-y-1.5">
          {AUDIO_ACTIONS.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-2 py-1">
              <span className="text-sm" style={{ color: isEink ? '#000' : '#374151' }}>{a.label(config)}</span>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {(config.keys[a.id] || []).map(k => (
                  <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold" style={{ ...chip, fontFamily: 'ui-monospace, monospace' }}>
                    {prettyCombo(k)}
                    <button onClick={() => removeKey(a.id, k)} title="移除" style={{ opacity: 0.6 }}>×</button>
                  </span>
                ))}
                <button
                  onClick={() => { setCapturing(a.id); setNote('') }}
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-medium"
                  style={capturing === a.id
                    ? { background: isEink ? '#000' : '#4f46e5', color: '#fff', borderRadius: isEink ? 0 : 8 }
                    : { color: isEink ? '#000' : '#6b7280', border: isEink ? '1px dashed #000' : '1px dashed #d1d5db', borderRadius: isEink ? 0 : 8 }}
                >
                  {capturing === a.id ? '撳一個鍵…（Esc 取消）' : <><Plus className="w-3 h-3" /> 加鍵</>}
                </button>
              </div>
            </div>
          ))}
        </div>

        {note && <p className="text-xs mt-3" style={{ color: isEink ? '#000' : '#d97706' }}>{note}</p>}

        <div className="flex items-center justify-between mt-5 pt-3" style={{ borderTop: isEink ? '1px solid #000' : '1px solid #f3f4f6' }}>
          <span className="text-xs" style={{ color: isEink ? '#333' : '#9ca3af' }}>← / → 照舊係上一句 / 下一句</span>
          <button onClick={() => { commit(DEFAULT_AUDIO_KEYS); setNote('已還原預設') }}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5"
            style={{ color: isEink ? '#000' : '#6b7280', border: isEink ? '1px solid #000' : '1px solid #e5e7eb', borderRadius: isEink ? 0 : 8 }}>
            <RotateCcw className="w-3 h-3" /> 還原預設
          </button>
        </div>
      </div>
    </div>
  )
}
