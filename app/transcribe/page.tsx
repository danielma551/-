'use client'

// 【音頻轉文字】用 Whisper（transformers.js，瀏覽器本機跑）：
// 完全免費、開源、唔使 API key、唔上傳伺服器（私隱好），支援中英混合。
// 首次要下載模型（有快取），長音頻會慢啲。

import { useRef, useState } from 'react'
import { ArrowLeft, Upload, Loader2, Copy, Download, FileAudio, Plus } from 'lucide-react'
import { reviewStorage } from '../utils/storage'

type Phase = 'idle' | 'loadingModel' | 'decoding' | 'transcribing' | 'done' | 'error'

const MODELS = [
  { id: 'Xenova/whisper-base', label: 'base（快 · ~150MB）' },
  { id: 'Xenova/whisper-small', label: 'small（準 · ~250MB）' },
]
const LANGS = [
  { id: 'auto', label: '自動偵測' },
  { id: 'chinese', label: '中文' },
  { id: 'english', label: 'English' },
]

// 用變數避免 webpack 靜態分析，直接由 CDN 動態載入 transformers.js
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'

export default function TranscribePage() {
  const [model, setModel] = useState(MODELS[0].id)
  const [lang, setLang] = useState('auto')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [saved, setSaved] = useState(false)
  const pipeRef = useRef<{ id: string; fn: any } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 解碼音頻 → 單聲道 16kHz Float32Array（Whisper 要求）
  const decodeAudio = async (file: File): Promise<Float32Array> => {
    const buf = await file.arrayBuffer()
    const AC = (window.AudioContext || (window as any).webkitAudioContext)
    const ctx = new AC()
    const decoded = await ctx.decodeAudioData(buf)
    ctx.close()
    const rate = 16000
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0)
  }

  const getPipeline = async () => {
    if (pipeRef.current && pipeRef.current.id === model) return pipeRef.current.fn
    setPhase('loadingModel'); setStatusMsg('載入模型中（首次要下載，有快取）…'); setProgress(0)
    const mod: any = await import(/* webpackIgnore: true */ TRANSFORMERS_URL)
    mod.env.allowLocalModels = false
    mod.env.useBrowserCache = true
    const fn = await mod.pipeline('automatic-speech-recognition', model, {
      progress_callback: (p: any) => {
        if (p.status === 'progress' && typeof p.progress === 'number') setProgress(Math.round(p.progress))
      },
    })
    pipeRef.current = { id: model, fn }
    return fn
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setText(''); setSaved(false)
    try {
      const transcriber = await getPipeline()
      setPhase('decoding'); setStatusMsg('解碼音頻中…')
      const audio = await decodeAudio(file)
      setPhase('transcribing'); setStatusMsg('轉錄中…（長音頻需要耐心）')
      const opts: any = { chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' }
      if (lang !== 'auto') opts.language = lang
      const out = await transcriber(audio, opts)
      const result = (Array.isArray(out) ? out.map((o: any) => o.text).join('') : out.text) || ''
      setText(result.trim())
      setPhase('done'); setStatusMsg('')
    } catch (err) {
      console.error(err)
      setPhase('error')
      setStatusMsg(err instanceof Error ? err.message : '轉錄失敗，請換一個檔案或模型再試')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const busy = phase === 'loadingModel' || phase === 'decoding' || phase === 'transcribing'

  const copy = () => { navigator.clipboard?.writeText(text) }
  const downloadTxt = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = (fileName.replace(/\.[^.]+$/, '') || 'transcript') + '.txt'
    a.click(); URL.revokeObjectURL(url)
  }
  const addToNotes = () => {
    if (!text.trim()) return
    reviewStorage.addMany([text.trim()], `轉錄 · ${fileName}`)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between mb-6">
          <a href="/" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> 書架</a>
          <h1 className="text-lg font-bold text-gray-800">🎙️ 音頻轉文字</h1>
          <span className="w-12" />
        </div>

        {/* 設定 */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">模型</label>
              <select value={model} onChange={e => setModel(e.target.value)} disabled={busy}
                className="w-full h-10 px-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400 disabled:opacity-50">
                {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">語言</label>
              <select value={lang} onChange={e => setLang(e.target.value)} disabled={busy}
                className="w-full h-10 px-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400 disabled:opacity-50">
                {LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
          </div>

          {/* 上傳 */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="mt-4 w-full py-5 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 flex flex-col items-center gap-1.5 transition-colors"
          >
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            <span className="text-sm font-medium">{busy ? statusMsg : '上傳音頻（MP3 / M4A / WAV / OGG…）'}</span>
            {phase === 'loadingModel' && progress > 0 && (
              <span className="w-40 h-1.5 bg-indigo-100 rounded-full overflow-hidden mt-1">
                <span className="block h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac" className="hidden" onChange={handleFile} />
          {fileName && !busy && <p className="mt-2 text-xs text-gray-400 flex items-center gap-1.5"><FileAudio className="w-3.5 h-3.5" /> {fileName}</p>}
          <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
            🔒 完全喺你瀏覽器本機處理，唔會上傳。首次要下載模型（之後有快取）；長音頻需要啲時間，過程中唔好閂頁。
          </p>
        </div>

        {phase === 'error' && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">⚠️ {statusMsg}</div>
        )}

        {/* 結果 */}
        {(text || phase === 'done') && (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">轉錄結果</span>
              <div className="flex items-center gap-1">
                <button onClick={copy} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="複製"><Copy className="w-4 h-4" /></button>
                <button onClick={downloadTxt} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="下載 .txt"><Download className="w-4 h-4" /></button>
                <button onClick={addToNotes} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg" title="加入每日温習筆記">
                  <Plus className="w-3.5 h-3.5" /> {saved ? '已加入' : '加入筆記'}
                </button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={12}
              placeholder="轉錄文字會喺呢度出現，可以直接編輯…"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed outline-none focus:border-indigo-400 resize-y"
            />
          </div>
        )}
      </div>
    </main>
  )
}
