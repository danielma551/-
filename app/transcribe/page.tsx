'use client'

// 【音頻轉文字】用 Whisper（transformers.js，瀏覽器本機跑）：
// 完全免費、開源、唔使 API key、唔上傳伺服器（私隱好），支援中英混合。
// 首次要下載模型（有快取），長音頻會慢啲。

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Upload, Loader2, Copy, Download, FileAudio, Plus, BookOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { reviewStorage, generateBookId, BookData } from '../utils/storage'
import { saveBookToIDB } from '../utils/bookDB'
import { splitIntoSentences } from '../utils/epubParser'
import { saveBookAudio } from '../utils/bookAudioDB'
import { Converter } from 'opencc-js/t2cn'

// 繁 → 簡（Whisper 中文常出繁體或繁簡夾雜，統一轉做簡體）
const toSimplified = Converter({ from: 't', to: 'cn' })

// 由 Whisper 時間戳段落 → 按閱讀規則分句，並估計每句開始秒數（段內按字數比例）
function buildSentencesWithTimes(
  chunks: { text: string; timestamp: [number, number | null] }[] | undefined,
  fullText: string,
  duration: number,
): { sentences: string[]; times: number[] } {
  const sentences: string[] = []
  const times: number[] = []
  if (Array.isArray(chunks) && chunks.length > 0) {
    chunks.forEach((c, ci) => {
      const parts = splitIntoSentences(c.text || '')
      if (parts.length === 0) return
      const start = Number(c.timestamp?.[0] ?? 0)
      const nextStart = chunks[ci + 1]?.timestamp?.[0]
      const end = Number(c.timestamp?.[1] ?? nextStart ?? duration ?? start)
      const total = parts.reduce((n, x) => n + x.length, 0) || 1
      let acc = 0
      for (const part of parts) {
        sentences.push(part)
        times.push(+(start + (Math.max(end - start, 0) * acc) / total).toFixed(2))
        acc += part.length
      }
    })
  }
  if (sentences.length === 0) {
    const parts = splitIntoSentences(fullText)
    const total = parts.reduce((n, x) => n + x.length, 0) || 1
    let acc = 0
    for (const part of parts) {
      sentences.push(part)
      times.push(+((duration * acc) / total).toFixed(2))
      acc += part.length
    }
  }
  return { sentences, times }
}

type Phase = 'idle' | 'loadingModel' | 'decoding' | 'transcribing' | 'done' | 'error'

// transformers.js v3：支援 WebGPU（用顯示卡計，快好多）；冇 WebGPU 自動退返 CPU
const MODELS = [
  { id: 'base', repo: 'onnx-community/whisper-base', label: 'base（快 · ~80MB）' },
  { id: 'small', repo: 'onnx-community/whisper-small', label: 'small（準 · ~250MB）' },
  { id: 'turbo', repo: 'onnx-community/whisper-large-v3-turbo', label: 'large-v3-turbo（最準 · ~560MB · 需 WebGPU）' },
]
// 中英混合：指定中文模式 → Whisper 會保留夾雜嘅英文字（自動偵測只睇頭 30 秒，易判錯成英文、成篇變英文）
const LANGS = [
  { id: 'mixed', label: '中英混合（推薦）' },
  { id: 'chinese', label: '中文' },
  { id: 'english', label: 'English' },
  { id: 'auto', label: '自動偵測' },
]

// 用變數避免 webpack 靜態分析，直接由 CDN 動態載入 transformers.js
// 用 /+esm 端點：正式 ESM 打包，模型類型（whisper 等）先會齊全註冊
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js'

export default function TranscribePage() {
  const router = useRouter()
  // 記住上次揀嘅模型同語言（掛載後先讀，避免 SSR hydration 唔一致）
  const [model, setModelState] = useState('small')
  const [device, setDevice] = useState<'webgpu' | 'wasm' | ''>('')
  const [hasGPU, setHasGPU] = useState<boolean | null>(null)
  useEffect(() => {
    const g = (navigator as any).gpu
    if (!g) { setHasGPU(false); return }
    g.requestAdapter().then((a: any) => setHasGPU(!!a)).catch(() => setHasGPU(false))
  }, [])
  const [lang, setLangState] = useState('mixed')
  useEffect(() => {
    const m = localStorage.getItem('transcribe-model')
    if (m && MODELS.some(x => x.id === m)) setModelState(m)
    const l = localStorage.getItem('transcribe-lang')
    if (l && LANGS.some(x => x.id === l)) setLangState(l)
  }, [])
  const setModel = (v: string) => { setModelState(v); try { localStorage.setItem('transcribe-model', v) } catch {} }
  const setLang = (v: string) => { setLangState(v); try { localStorage.setItem('transcribe-lang', v) } catch {} }
  const langRef = useRef(lang)
  useEffect(() => { langRef.current = lang }, [lang])
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [saved, setSaved] = useState(false)
  // 進度細節
  const [audioDur, setAudioDur] = useState(0)     // 音頻長度（秒）
  const [chunkDone, setChunkDone] = useState(0)   // 已處理段數
  const [chunkTotal, setChunkTotal] = useState(0) // 估計總段數
  const [elapsed, setElapsed] = useState(0)       // 轉錄已用時（秒）
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fmt = (s: number) => { const m = Math.floor(s / 60); const x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, '0')}` }

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  useEffect(() => () => { stopTimer(); workerRef.current?.terminate() }, [])

  // 主線程解碼 → 單聲道 16kHz Float32Array（Whisper 要求）；推理喺 Worker 做，唔阻塞畫面
  const decodeAudio = async (file: File): Promise<{ data: Float32Array; duration: number }> => {
    const buf = await file.arrayBuffer()
    const AC = (window.AudioContext || (window as any).webkitAudioContext)
    // 直接用 16kHz context 解碼 → 免另外重採樣（大部分瀏覽器支援）
    let ctx: AudioContext
    try { ctx = new AC({ sampleRate: 16000 }) } catch { ctx = new AC() }
    const decoded = await ctx.decodeAudioData(buf)
    const srcRate = ctx.sampleRate || decoded.sampleRate
    ctx.close()
    // 混成單聲道
    let mono: Float32Array
    if (decoded.numberOfChannels === 1) {
      mono = decoded.getChannelData(0).slice()
    } else {
      const L = decoded.getChannelData(0), R = decoded.getChannelData(1)
      mono = new Float32Array(L.length)
      for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) / 2
    }
    // 若唔係 16kHz（後備 context），做線性重採樣
    let data = mono
    if (srcRate !== 16000) {
      const ratio = 16000 / srcRate
      const outLen = Math.round(mono.length * ratio)
      data = new Float32Array(outLen)
      for (let i = 0; i < outLen; i++) {
        const pos = i / ratio
        const i0 = Math.floor(pos), i1 = Math.min(i0 + 1, mono.length - 1)
        const f = pos - i0
        data[i] = mono[i0] * (1 - f) + mono[i1] * f
      }
    }
    return { data, duration: data.length / 16000 }
  }

  // 轉錄完 → 自動變成書架上一本書（按閱讀規則分句）+ 連 mp3 一齊存
  const fileObjRef = useRef<File | null>(null)
  const durationRef = useRef(0)
  const [createdBookId, setCreatedBookId] = useState<string | null>(null)
  const [bookMsg, setBookMsg] = useState('')
  const createBookFromTranscript = async (fullText: string, chunks: any[]) => {
    const file = fileObjRef.current
    if (!file || !fullText?.trim()) return
    try {
      const { sentences, times } = buildSentencesWithTimes(chunks, fullText, durationRef.current)
      if (sentences.length === 0) return
      const now = Date.now()
      const title = file.name.replace(/\.[^.]+$/, '') || '錄音'
      const id = generateBookId(title)
      const book: BookData = {
        id, title: `🎧 ${title}`, sentences, currentIndex: 0,
        uploadDate: now, lastReadDate: now, coverColor: '#4f46e5',
      }
      await saveBookToIDB(book)
      await saveBookAudio({ bookId: id, blob: file, name: file.name, times, savedAt: now })
      setCreatedBookId(id)
      setBookMsg(`已加入書架：${sentences.length} 句，閱讀時會自動播放錄音 🎧`)
    } catch (err) {
      console.error(err)
      setBookMsg('加入書架失敗（可能係瀏覽器空間不足）')
    }
  }

  // 建立 Worker（背景線程行 transformers.js 推理）
  const ensureWorker = (): Worker => {
    if (workerRef.current) return workerRef.current
    const code = `
      import { pipeline, env } from '${TRANSFORMERS_URL}';
      env.allowLocalModels = false; env.useBrowserCache = true;
      let transcriber = null, curKey = null;

      // 偵測 WebGPU（有就用顯示卡；仲睇吓支唔支援 fp16）
      async function detect() {
        try {
          if (!self.navigator || !self.navigator.gpu) return { device: 'wasm', f16: false };
          const adapter = await self.navigator.gpu.requestAdapter();
          if (!adapter) return { device: 'wasm', f16: false };
          return { device: 'webgpu', f16: adapter.features.has('shader-f16') };
        } catch (e) { return { device: 'wasm', f16: false }; }
      }
      function dtypeFor(model, dev) {
        if (dev.device !== 'webgpu') return 'q8';
        if (model === 'base') return { encoder_model: 'fp32', decoder_model_merged: 'q4' };
        if (model === 'small') return { encoder_model: dev.f16 ? 'fp16' : 'fp32', decoder_model_merged: 'q4' };
        return { encoder_model: dev.f16 ? 'q4f16' : 'q4', decoder_model_merged: dev.f16 ? 'q4f16' : 'q4' };
      }
      async function load(model, repo, dev) {
        const files = {};
        return pipeline('automatic-speech-recognition', repo, {
          device: dev.device,
          dtype: dtypeFor(model, dev),
          progress_callback: (p) => {
            if (p.status === 'progress' && p.file) {
              files[p.file] = { l: p.loaded || 0, t: p.total || 0 };
              let L = 0, T = 0;
              for (const k in files) { L += files[k].l; T += files[k].t; }
              if (T > 0) self.postMessage({ type: 'dl', progress: Math.round((L / T) * 100) });
            }
          },
        });
      }

      self.onmessage = async (e) => {
        const { model, repo, audio, lang } = e.data;
        try {
          let dev = await detect();
          if (model === 'turbo' && dev.device !== 'webgpu') {
            throw new Error('large-v3-turbo 需要 WebGPU，呢個瀏覽器唔支援，請改用 base 或 small');
          }
          const key = model + '|' + dev.device;
          if (!transcriber || curKey !== key) {
            self.postMessage({ type: 'phase', phase: 'loadingModel', device: dev.device });
            try {
              transcriber = await load(model, repo, dev);
            } catch (gpuErr) {
              // WebGPU 開唔到（驅動／顯示卡唔支援）→ 自動退返 CPU
              if (dev.device === 'webgpu' && model !== 'turbo') {
                dev = { device: 'wasm', f16: false };
                self.postMessage({ type: 'phase', phase: 'loadingModel', device: 'wasm', fallback: true });
                transcriber = await load(model, repo, dev);
              } else throw gpuErr;
            }
            curKey = model + '|' + dev.device;
          }
          self.postMessage({ type: 'phase', phase: 'transcribing', device: dev.device });
          const opts = {
            chunk_length_s: 30, stride_length_s: 5, task: 'transcribe', return_timestamps: true,
            // 每計完一段（一次 generate）就回報進度
            streamer: { put() {}, end() { self.postMessage({ type: 'chunk' }); } },
          };
          if (lang === 'mixed' || lang === 'chinese') opts.language = 'chinese';
          else if (lang === 'english') opts.language = 'english';
          const out = await transcriber(audio, opts);
          const o = Array.isArray(out) ? out[0] : out;
          const txt = Array.isArray(out) ? out.map(x => x.text).join('') : out.text;
          const chunks = (o && Array.isArray(o.chunks)) ? o.chunks.map(c => ({ text: c.text, timestamp: c.timestamp })) : [];
          self.postMessage({ type: 'done', text: (txt || '').trim(), chunks });
        } catch (err) {
          self.postMessage({ type: 'error', message: String((err && err.message) || err) });
        }
      };
    `
    const blob = new Blob([code], { type: 'text/javascript' })
    const w = new Worker(URL.createObjectURL(blob), { type: 'module' })
    w.onmessage = (e: MessageEvent) => {
      const d = e.data
      if (d.type === 'phase') {
        setPhase(d.phase)
        if (d.device) setDevice(d.device)
        if (d.phase === 'transcribing') {
          const t0 = Date.now()
          stopTimer()
          timerRef.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500)
        }
      } else if (d.type === 'dl') {
        setProgress(d.progress)
      } else if (d.type === 'chunk') {
        setChunkDone(n => n + 1)
      } else if (d.type === 'done') {
        stopTimer()
        // 中文模式：統一轉簡體（英文字唔受影響）
        const zh = langRef.current !== 'english'
        const outText: string = zh ? toSimplified(d.text || '') : d.text
        const outChunks = zh && Array.isArray(d.chunks)
          ? d.chunks.map((c: any) => ({ ...c, text: toSimplified(c.text || '') }))
          : d.chunks
        setText(outText)
        setPhase('done')
        createBookFromTranscript(outText, outChunks)
      } else if (d.type === 'error') {
        stopTimer()
        setPhase('error')
        setStatusMsg(d.message || '轉錄失敗，請換一個檔案或模型再試')
      }
    }
    workerRef.current = w
    return w
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setText(''); setSaved(false); setStatusMsg('')
    fileObjRef.current = file; setCreatedBookId(null); setBookMsg('')
    setAudioDur(0); setChunkDone(0); setChunkTotal(0); setElapsed(0)
    try {
      setPhase('decoding')
      const { data: audio, duration } = await decodeAudio(file)
      setAudioDur(duration)
      durationRef.current = duration
      setChunkTotal(Math.max(1, Math.ceil(duration / 20)))   // 每段有效前進約 20s
      const worker = ensureWorker()
      // 傳走 audio.buffer（轉移擁有權，零複製）
      worker.postMessage({ model, repo: MODELS.find(m => m.id === model)?.repo || MODELS[1].repo, audio, lang }, [audio.buffer])
    } catch (err) {
      console.error(err)
      setPhase('error')
      setStatusMsg(err instanceof Error ? `解碼失敗：${err.message}` : '解碼失敗，請換一個音頻檔再試')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // 依階段組出即時進度文字
  const deviceTag = device === 'webgpu' ? '⚡ GPU 加速 · ' : device === 'wasm' ? '🐢 CPU · ' : ''
  const liveLabel = (): string => {
    if (phase === 'loadingModel') return `${deviceTag}載入模型中…${progress > 0 ? ` ${progress}%` : ''}`
    if (phase === 'decoding') return '解碼音頻中…'
    if (phase === 'transcribing') {
      const dur = audioDur > 0 ? `音頻 ${fmt(audioDur)} · ` : ''
      const seg = chunkTotal > 0 ? `第 ${Math.min(chunkDone + 1, chunkTotal)}/${chunkTotal} 段 · ` : ''
      return `${deviceTag}轉錄中… ${dur}${seg}已用 ${elapsed}s`
    }
    return ''
  }
  const transPct = chunkTotal > 0 ? Math.min(Math.round((chunkDone / chunkTotal) * 100), 99) : 0

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
                {MODELS.map(m => <option key={m.id} value={m.id} disabled={m.id === 'turbo' && hasGPU === false}>{m.label}</option>)}
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

          {hasGPU !== null && (
            <p className={`mt-2 text-[11px] ${hasGPU ? 'text-emerald-600' : 'text-amber-600'}`}>
              {hasGPU ? '⚡ 呢個瀏覽器支援 WebGPU：會用顯示卡加速轉錄' : '🐢 呢個瀏覽器冇 WebGPU：會用 CPU 轉錄（較慢），建議用電腦版 Chrome／Edge'}
            </p>
          )}
          {/* 上傳 */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="mt-4 w-full py-5 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 flex flex-col items-center gap-1.5 transition-colors"
          >
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            <span className="text-sm font-medium">{busy ? liveLabel() : '上傳音頻（MP3 / M4A / WAV / OGG…）'}</span>
            {/* 模型下載進度 */}
            {phase === 'loadingModel' && progress > 0 && (
              <span className="w-52 h-1.5 bg-indigo-100 rounded-full overflow-hidden mt-1">
                <span className="block h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
              </span>
            )}
            {/* 轉錄進度 */}
            {phase === 'transcribing' && chunkTotal > 0 && (
              <span className="w-52 h-1.5 bg-indigo-100 rounded-full overflow-hidden mt-1">
                <span className="block h-full bg-indigo-500 transition-all duration-300" style={{ width: `${transPct}%` }} />
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
        {/* 已同步到閱讀 */}
        {bookMsg && (
          <div className={`mb-4 px-4 py-3 rounded-xl border text-sm flex items-center justify-between gap-3 ${createdBookId ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
            <span>{bookMsg}</span>
            {createdBookId && (
              <button
                onClick={() => router.push(`/?open=${encodeURIComponent(createdBookId)}`)}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"
              >
                <BookOpen className="w-4 h-4" /> 去閱讀
              </button>
            )}
          </div>
        )}

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
