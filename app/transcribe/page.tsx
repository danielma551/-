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
  { id: 'base', repo: 'onnx-community/whisper-base', label: 'base（快 · 約 200MB）' },
  { id: 'small', repo: 'onnx-community/whisper-small', label: 'small（準 · 約 290MB）' },
  { id: 'turbo', repo: 'onnx-community/whisper-large-v3-turbo', label: 'large-v3-turbo（最準 · 約 720MB · 需 WebGPU）' },
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
  const [dlInfo, setDlInfo] = useState<{ done: number; total: number; speed: number } | null>(null)
  const [retryNote, setRetryNote] = useState('')
  useEffect(() => {
    // 請瀏覽器長期保留模型快取（避免幾百 MB 模型被自動清走）
    try { (navigator as any).storage?.persist?.() } catch {}
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
  const createBookFromTranscript = async (fullText: string, chunks: any[]): Promise<{ id: string; n: number } | null> => {
    const file = fileObjRef.current
    if (!file || !fullText?.trim()) return null
    try {
      const { sentences, times } = buildSentencesWithTimes(chunks, fullText, durationRef.current)
      if (sentences.length === 0) return null
      const now = Date.now()
      const title = file.name.replace(/\.[^.]+$/, '') || '錄音'
      const id = generateBookId(title)
      const book: BookData = {
        id, title: `🎧 ${title}`, sentences, currentIndex: 0,
        uploadDate: now, lastReadDate: now, coverColor: '#4f46e5', kind: 'audio',
      }
      await saveBookToIDB(book)
      await saveBookAudio({ bookId: id, blob: file, name: file.name, times, savedAt: now })
      setCreatedBookId(id)
      setBookMsg(`已加入「🎧 錄音」文件夾：${sentences.length} 句，閱讀時會自動播放錄音`)
      return { id, n: sentences.length }
    } catch (err) {
      console.error(err)
      setBookMsg('加入書架失敗（可能係瀏覽器空間不足）')
      return null
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
      // ⚠️ 實測：WebGPU 用 fp16 會出亂碼（">> >> >>"）→ 一律唔用 fp16
      // base：fp32 encoder + q4 decoder（實測正確）；small／turbo：q4 + q4（實測正確，體積細好多）
      function dtypeFor(model, dev) {
        if (dev.device !== 'webgpu') return 'q8';
        if (model === 'base') return { encoder_model: 'fp32', decoder_model_merged: 'q4' };
        return { encoder_model: 'q4', decoder_model_merged: 'q4' };
      }
      // ── 斷點續傳下載：大模型檔切 8MB 一塊，斷線自動重試，閂咗頁再開都接得返 ──
      const SUFFIX = { fp32: '', fp16: '_fp16', q4: '_q4', q4f16: '_q4f16', q8: '_quantized' };
      function bigFiles(dt) {
        const e = typeof dt === 'string' ? dt : dt.encoder_model;
        const d = typeof dt === 'string' ? dt : dt.decoder_model_merged;
        return ['onnx/encoder_model' + SUFFIX[e] + '.onnx', 'onnx/decoder_model_merged' + SUFFIX[d] + '.onnx'];
      }
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      async function fetchPart(url, start, end, onBytes) {
        const ctrl = new AbortController();
        let last = Date.now();
        const dog = setInterval(() => { if (Date.now() - last > 15000) ctrl.abort(); }, 2000);   // 15 秒冇數據 = 卡住，轉線重試
        try {
          const r = await fetch(url, { headers: { Range: 'bytes=' + start + '-' + end }, signal: ctrl.signal });
          if (r.status !== 206) { const err = new Error('HTTP ' + r.status); err.status = r.status; throw err; }
          const reader = r.body.getReader();
          const chunks = []; let got = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value); got += value.length; last = Date.now(); onBytes(value.length);
          }
          if (got !== end - start + 1) { onBytes(-got); throw new Error('size mismatch'); }
          return new Blob(chunks);
        } finally { clearInterval(dog); }
      }
      // 兩條線路：Hugging Face（美國 CDN）＋ ModelScope 魔搭（國內 CDN），內容逐 byte 一樣
      function srcUrl(src, repo, f) {
        return src === 0
          ? 'https://huggingface.co/' + repo + '/resolve/main/' + f
          : 'https://modelscope.cn/models/' + repo + '/resolve/master/' + f;
      }
      // 自適應揀線路：邊條快就多用邊條；卡住／被限速嘅線路冷卻一陣
      const SRC = [
        { speed: 0, cool: 0, fails: 0 },   // 0 = Hugging Face
        { speed: 0, cool: 0, fails: 0 },   // 1 = ModelScope
      ];
      function pickSrc(avoid) {
        const now = Date.now();
        const ok = [0, 1].filter(i => i !== avoid && SRC[i].cool <= now);
        if (ok.length === 0) return avoid === 0 ? 1 : 0;
        if (ok.length === 1) return ok[0];
        if (Math.random() < 0.15) return ok[Math.floor(Math.random() * 2)];   // 偶爾試吓另一條，睇佢有冇變快
        return SRC[1].speed >= SRC[0].speed ? 1 : 0;
      }
      function srcGood(i, bytes, ms) {
        const sp = bytes / Math.max(ms, 1) * 1000;
        SRC[i].speed = SRC[i].speed ? SRC[i].speed * 0.6 + sp * 0.4 : sp;
        SRC[i].fails = 0;
      }
      function srcBad(i) {
        SRC[i].fails++;
        SRC[i].speed *= 0.5;
        SRC[i].cool = Date.now() + Math.min(120000, 15000 * Math.pow(2, SRC[i].fails - 1));
      }
      const SMALL_FILES = ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json'];
      async function prefetch(repo, dt) {
        const cache = await caches.open('transformers-cache');
        const keyOf = (f) => 'https://huggingface.co/' + repo + '/resolve/main/' + f;   // transformers.js 用嘅快取鍵

        // 1) 細檔：邊條線路得就用邊條
        for (const f of SMALL_FILES) {
          if (await cache.match(keyOf(f))) continue;
          let ok = false;
          for (let attempt = 0; attempt < 4 && !ok; attempt++) {
            for (const src of [1, 0]) {
              try {
                const r = await fetch(srcUrl(src, repo, f));
                if (r.status === 404) { ok = true; break; }   // 呢個 repo 冇呢個檔 → 交返 transformers.js
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const b = await r.blob();
                await cache.put(keyOf(f), new Response(b, { headers: { 'Content-Length': String(b.size), 'Content-Type': 'application/json' } }));
                ok = true; break;
              } catch (e) { /* 試另一條線路 */ }
            }
            if (!ok) await sleep(1500 * (attempt + 1));
          }
        }

        // 2) 大模型檔：分塊、6 條連線並行、兩條線路輪流用
        const files = bigFiles(dt);
        const need = [];
        for (const f of files) if (!(await cache.match(keyOf(f)))) need.push(f);
        if (need.length === 0) return;
        let tree = null;
        for (let a = 0; a < 5 && !tree; a++) {
          try { tree = await (await fetch('https://huggingface.co/api/models/' + repo + '/tree/main/onnx')).json(); }
          catch (e) { await sleep(2000 * (a + 1)); }
        }
        if (!tree) return;   // 攞唔到大小 → 交返 transformers.js 自己下載
        const PART = 4 * 1024 * 1024;
        const items = [];
        for (const f of need) {
          const meta = tree.find(x => x.path === f);
          if (meta && meta.size) items.push({ f: f, key: keyOf(f), size: meta.size, parts: Math.ceil(meta.size / PART) });
        }
        // 清走舊版（8MB 一塊）留低嘅碎片
        for (const it of items) for (let i = 0; i < Math.ceil(it.size / (8 * 1024 * 1024)); i++) await cache.delete(it.key + '?part=' + i);
        const total = items.reduce((n, it) => n + it.size, 0);
        let done = 0;
        const tasks = [];
        for (const it of items) for (let i = 0; i < it.parts; i++) {
          if (await cache.match(it.key + '?c4=' + i)) done += Math.min(PART, it.size - i * PART);
          else tasks.push({ it: it, i: i });
        }
        let speed = 0, lastT = Date.now(), lastDone = done;
        const report = () => {
          const now = Date.now();
          if (now - lastT >= 1000) {
            const inst = (done - lastDone) / ((now - lastT) / 1000);
            speed = speed ? speed * 0.7 + inst * 0.3 : inst;
            lastT = now; lastDone = done;
          }
          self.postMessage({ type: 'dl2', done: done, total: total, speed: speed });
        };
        report();
        let failed = null;
        const worker = async (w) => {
          while (tasks.length && !failed) {
            const t = tasks.shift();
            const start = t.i * PART, end = Math.min(t.it.size, start + PART) - 1;
            let ok = false, lastSrc = -1;
            for (let attempt = 0; attempt < 12 && !ok; attempt++) {
              const src = pickSrc(lastSrc);   // 揀而家最快嘅線路；上次失敗嗰條避開
              const t0 = Date.now();
              try {
                const b = await fetchPart(srcUrl(src, repo, t.it.f), start, end, (n) => { done += n; report(); });
                await cache.put(t.it.key + '?c4=' + t.i, new Response(b));
                srcGood(src, b.size, Date.now() - t0);
                ok = true;
              } catch (e) {
                srcBad(src); lastSrc = src;
                if (attempt >= 2) self.postMessage({ type: 'retry', attempt: attempt });
                await sleep(Math.min(8000, 500 * Math.pow(2, attempt)));
              }
            }
            if (!ok) failed = new Error('網絡唔穩，下載多次失敗。已下載嘅部分會保留，再撳上傳就會接住落去');
          }
        };
        await Promise.all([0, 1, 2, 3, 4, 5].map(worker));
        if (failed) throw failed;

        // 3) 砌返成個檔，放入 transformers.js 用嘅快取
        for (const it of items) {
          const blobs = [];
          for (let i = 0; i < it.parts; i++) blobs.push(await (await cache.match(it.key + '?c4=' + i)).blob());
          const full = new Blob(blobs);
          if (full.size !== it.size) throw new Error('模型檔大小唔啱，請再試一次');
          await cache.put(it.key, new Response(full, { headers: { 'Content-Length': String(full.size), 'Content-Type': 'application/octet-stream' } }));
          for (let i = 0; i < it.parts; i++) await cache.delete(it.key + '?c4=' + i);
        }
      }

      async function load(model, repo, dev) {
        await prefetch(repo, dtypeFor(model, dev));   // 大檔先用續傳下載器攞齊
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
      } else if (d.type === 'dl2') {
        setDlInfo({ done: d.done, total: d.total, speed: d.speed })
        setRetryNote('')
      } else if (d.type === 'retry') {
        setRetryNote(`網絡唔穩，自動重試中（第 ${d.attempt} 次）…`)
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
        createBookFromTranscript(outText, outChunks).then(res => {
          finishItemRef.current?.(res ? 'done' : 'error', res ? { bookId: res.id, info: `${res.n} 句` } : { info: outText.trim() ? '建書失敗' : '冇轉到文字' })
        })
      } else if (d.type === 'error') {
        stopTimer()
        const wasLoading = phaseRef.current === 'loadingModel'
        setPhase('error')
        setStatusMsg(d.message || '轉錄失敗，請換一個檔案或模型再試')
        finishItemRef.current?.('error', { info: d.message || '轉錄失敗' }, wasLoading)
      }
    }
    workerRef.current = w
    return w
  }

  // ── 批量轉錄：排隊逐個轉（模型只載一次），每個完成就變成一本書 ──
  type QItem = { id: string; file: File; status: 'waiting' | 'working' | 'done' | 'error'; bookId?: string; info?: string }
  const [queue, setQueue] = useState<QItem[]>([])
  const queueRef = useRef<QItem[]>([])
  const setQ = (fn: (q: QItem[]) => QItem[]) => { queueRef.current = fn(queueRef.current); setQueue(queueRef.current) }
  const curItemRef = useRef<string | null>(null)
  const phaseRef = useRef<Phase>('idle')
  useEffect(() => { phaseRef.current = phase }, [phase])
  const finishItemRef = useRef<((status: 'done' | 'error', extra: { bookId?: string; info?: string }, abortAll?: boolean) => void) | null>(null)

  const startItem = async (item: QItem) => {
    curItemRef.current = item.id
    setQ(q => q.map(x => x.id === item.id ? { ...x, status: 'working' } : x))
    const file = item.file
    setFileName(file.name); setText(''); setSaved(false); setStatusMsg('')
    fileObjRef.current = file; setCreatedBookId(null); setBookMsg(''); setRetryNote('')
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
      const msg = err instanceof Error ? `解碼失敗：${err.message}` : '解碼失敗，請換一個音頻檔再試'
      setStatusMsg(msg)
      finishItemRef.current?.('error', { info: '解碼失敗' })
    }
  }
  const processNext = () => {
    const next = queueRef.current.find(x => x.status === 'waiting')
    if (!next) { curItemRef.current = null; return }
    startItem(next)
  }
  finishItemRef.current = (status, extra, abortAll) => {
    const id = curItemRef.current
    setQ(q => q.map(x => {
      if (x.id === id) return { ...x, status, ...extra }
      if (abortAll && x.status === 'waiting') return { ...x, status: 'error', info: '模型載入失敗，未轉' }
      return x
    }))
    curItemRef.current = null
    setTimeout(processNext, 300)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (fileRef.current) fileRef.current.value = ''
    if (files.length === 0) return
    const items: QItem[] = files.map((f, i) => ({ id: `${Date.now()}-${i}-${f.name}`, file: f, status: 'waiting' }))
    setQ(q => [...q, ...items])
    if (!curItemRef.current) processNext()   // 冇嘢做緊就即刻開始；做緊就排隊
  }
  const clearFinished = () => setQ(q => q.filter(x => x.status === 'waiting' || x.status === 'working'))
  const queueBusy = queue.some(x => x.status === 'working' || x.status === 'waiting')
  const queuePos = (() => {
    const idx = queue.findIndex(x => x.status === 'working')
    return queue.length > 1 && idx >= 0 ? `（第 ${idx + 1}/${queue.length} 個）` : ''
  })()

  // 依階段組出即時進度文字
  const deviceTag = device === 'webgpu' ? '⚡ GPU 加速 · ' : device === 'wasm' ? '🐢 CPU · ' : ''
  const liveLabel = (): string => {
    if (phase === 'loadingModel') {
      if (retryNote) return retryNote
      if (dlInfo && dlInfo.total > 0 && dlInfo.done < dlInfo.total) {
        const mb = (n: number) => (n / 1048576).toFixed(0)
        const left = dlInfo.speed > 0 ? Math.ceil((dlInfo.total - dlInfo.done) / dlInfo.speed / 60) : 0
        return `${deviceTag}下載模型 ${mb(dlInfo.done)} / ${mb(dlInfo.total)} MB${dlInfo.speed > 0 ? ` · ${(dlInfo.speed / 1048576).toFixed(2)} MB/秒 · 約剩 ${left} 分鐘` : ''}（雙線路並行 · 斷線自動續傳）`
      }
      return `${deviceTag}載入模型中…${progress > 0 ? ` ${progress}%` : ''}`
    }
    if (phase === 'decoding') return `${queuePos}解碼音頻中…`
    if (phase === 'transcribing') {
      const dur = audioDur > 0 ? `音頻 ${fmt(audioDur)} · ` : ''
      const seg = chunkTotal > 0 ? `第 ${Math.min(chunkDone + 1, chunkTotal)}/${chunkTotal} 段 · ` : ''
      return `${queuePos}${deviceTag}轉錄中… ${dur}${seg}已用 ${elapsed}s`
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
              <select value={model} onChange={e => setModel(e.target.value)} disabled={busy || queueBusy}
                className="w-full h-10 px-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400 disabled:opacity-50">
                {MODELS.map(m => <option key={m.id} value={m.id} disabled={m.id === 'turbo' && hasGPU === false}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">語言</label>
              <select value={lang} onChange={e => setLang(e.target.value)} disabled={busy || queueBusy}
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
            title={busy ? '轉緊都可以再加檔案，會排隊逐個轉' : '可以一次揀多個檔案批量轉錄'}
            className="mt-4 w-full py-5 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 flex flex-col items-center gap-1.5 transition-colors"
          >
            {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            <span className="text-sm font-medium">{busy ? liveLabel() : '上傳音頻（可一次揀多個，批量轉錄）'}</span>
            {busy && <span className="text-[11px] text-indigo-400">轉緊都可以撳呢度再加檔案排隊</span>}
            {/* 模型下載進度 */}
            {phase === 'loadingModel' && dlInfo && dlInfo.total > 0 && dlInfo.done < dlInfo.total && (
              <span className="w-52 h-1.5 bg-indigo-100 rounded-full overflow-hidden mt-1">
                <span className="block h-full bg-indigo-500 transition-all" style={{ width: `${Math.round(dlInfo.done / dlInfo.total * 100)}%` }} />
              </span>
            )}
            {phase === 'loadingModel' && !(dlInfo && dlInfo.total > 0 && dlInfo.done < dlInfo.total) && progress > 0 && (
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
          <input ref={fileRef} type="file" multiple accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac" className="hidden" onChange={handleFile} />
          {fileName && !busy && <p className="mt-2 text-xs text-gray-400 flex items-center gap-1.5"><FileAudio className="w-3.5 h-3.5" /> {fileName}</p>}
          <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
            🔒 完全喺你瀏覽器本機處理，唔會上傳。首次要下載模型（之後有快取）；長音頻需要啲時間，過程中唔好閂頁。
          </p>
        </div>

        {/* 📋 批量轉錄隊列 */}
        {queue.length > 0 && (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">
                批量轉錄 · 完成 {queue.filter(x => x.status === 'done').length} / {queue.length}
              </span>
              <div className="flex items-center gap-2">
                {queue.some(x => x.status === 'done' || x.status === 'error') && (
                  <button onClick={clearFinished} className="text-xs text-gray-400 hover:text-gray-700">清除已完成</button>
                )}
                <button onClick={() => router.push('/?folder=audio')} className="text-xs font-medium px-2.5 py-1 rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100">📂 打開錄音文件夾</button>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {queue.map(x => (
                <div key={x.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="w-5 text-center flex-shrink-0">
                    {x.status === 'waiting' ? '⏳' : x.status === 'working' ? <Loader2 className="w-4 h-4 animate-spin text-indigo-500 inline" /> : x.status === 'done' ? '✅' : '⚠️'}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-gray-700" title={x.file.name}>{x.file.name}</span>
                  <span className={`text-xs flex-shrink-0 ${x.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
                    {x.status === 'waiting' ? '排緊隊' : x.status === 'working' ? '轉緊' : x.info || ''}
                  </span>
                  {x.status === 'done' && x.bookId && (
                    <button onClick={() => router.push(`/?open=${encodeURIComponent(x.bookId!)}`)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex-shrink-0">去閱讀</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
