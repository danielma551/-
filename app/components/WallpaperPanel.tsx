'use client'

// 【🖼️ 壁紙設定面板】揀原創場景／上傳自己相；模糊、淡化、句子墊底

import { useRef, useState } from 'react'
import { X, Upload, Loader2 } from 'lucide-react'
import { PRESETS, presetUrl, WallpaperSettings, saveCustomImage } from '../utils/wallpapers'

interface Props {
  modeLabel: string
  value: WallpaperSettings
  customUrl: string | null
  onChange: (s: WallpaperSettings) => void
  onCustomUploaded: () => void
  onClose: () => void
}

export default function WallpaperPanel({ modeLabel, value, customUrl, onChange, onCustomUploaded, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (p: Partial<WallpaperSettings>) => onChange({ ...value, ...p })

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setErr('請揀相片檔'); return }
    setBusy(true); setErr('')
    try { await saveCustomImage(f); onCustomUploaded(); set({ id: 'custom' }) }
    catch { setErr('讀唔到呢張相，換一張試吓') }
    setBusy(false)
  }

  const Tile = ({ id, name, bg }: { id: WallpaperSettings['id']; name: string; bg?: string | null }) => (
    <button onClick={() => set({ id })} className="text-left group" title={name}>
      <div className="w-full rounded-lg overflow-hidden border-2 transition-colors"
        style={{ aspectRatio: '16 / 10', borderColor: value.id === id ? '#6366f1' : 'transparent', background: bg ? `${bg} center / cover no-repeat` : '#f3f4f6', boxShadow: '0 1px 3px rgba(0,0,0,.12)' }}>
        {!bg && <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">{id === 'custom' ? '未上傳' : '無'}</div>}
      </div>
      <p className={`text-xs mt-1 ${value.id === id ? 'text-indigo-600 font-semibold' : 'text-gray-600'}`}>{name}</p>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">🖼️ 壁紙 <span className="text-xs font-normal text-gray-400">· {modeLabel}</span></h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Tile id="none" name="無壁紙" />
          {PRESETS.map(p => <Tile key={p.id} id={p.id} name={p.name} bg={presetUrl(p.id)} />)}
        </div>

        <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-24 flex-shrink-0"><Tile id="custom" name="自己嘅相" bg={customUrl ? `url("${customUrl}")` : null} /></div>
            <div className="flex-1">
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {customUrl ? '換一張相' : '上傳相片'}
              </button>
              <p className="text-[11px] text-gray-400 mt-1.5">🔒 只存喺呢部機</p>
              {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>

        {value.id !== 'none' && (
          <div className="mt-4 space-y-3">
            <label className="block">
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>模糊度</span><span className="tabular-nums">{value.blur}px</span></div>
              <input type="range" min={0} max={20} step={1} value={value.blur} onChange={e => set({ blur: Number(e.target.value) })} className="w-full accent-indigo-600" />
            </label>
            <label className="block">
              <div className="flex justify-between text-xs text-gray-500 mb-1"><span>淡化（越高字越易睇）</span><span className="tabular-nums">{value.wash}%</span></div>
              <input type="range" min={0} max={90} step={5} value={value.wash} onChange={e => set({ wash: Number(e.target.value) })} className="w-full accent-indigo-600" />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={value.backing} onChange={e => set({ backing: e.target.checked })} className="accent-indigo-600" />
              句子下面墊一層半透明底
            </label>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-4">普通模式同紙本模式可以揀唔同壁紙；墨水屏模式唔顯示壁紙。</p>
      </div>
    </div>
  )
}
