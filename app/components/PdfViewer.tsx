'use client'

// 【PDF 檢視器＋搜尋高光】類似 GoodNotes：搜尋字詞喺頁面上用黃色標出，當前結果橙色，↑↓ 跳轉。
// 高光位置由 pdf.js 嘅文字座標計出嚟，疊喺頁面圖上面。

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronUp, ChevronDown, ZoomIn, ZoomOut, Search, X } from 'lucide-react'
import { PdfDoc, loadPdfjs, findHits, updatePdfLastPage } from '../utils/pdfLib'

interface Props {
  doc: PdfDoc
  initialPage?: number
  initialQuery?: string
  initialHitIndex?: number
  onBack: () => void
}

type Rect = { x: number; y: number; w: number; h: number }   // 百分比（相對頁面）

export default function PdfViewer({ doc, initialPage, initialQuery = '', initialHitIndex = 0, onBack }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<any>(null)
  const libRef = useRef<any>(null)
  const renderedRef = useRef<Map<number, number>>(new Map())
  const textCache = useRef<Map<number, { items: any[]; vp: any }>>(new Map())
  const [aspect, setAspect] = useState(1.414)
  const [ready, setReady] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [query, setQuery] = useState(initialQuery)
  const [cur, setCur] = useState(initialHitIndex)
  const [curPage, setCurPage] = useState(initialPage || 1)
  const [err, setErr] = useState('')

  const hits = useMemo(() => findHits(doc.texts, query), [doc.texts, query])

  // 載入 PDF
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { lib, opts } = await loadPdfjs()
        libRef.current = lib
        const pdf = await lib.getDocument({ data: new Uint8Array(await doc.blob.arrayBuffer()), ...opts }).promise
        if (cancelled) { pdf.destroy(); return }
        pdfRef.current = pdf
        const p1 = await pdf.getPage(1)
        const vp = p1.getViewport({ scale: 1 })
        setAspect(vp.height / vp.width)
        setReady(true)
      } catch (e) {
        console.error(e)
        if (!cancelled) setErr('打唔開呢份 PDF')
      }
    })()
    return () => { cancelled = true; try { pdfRef.current?.destroy() } catch { /* ignore */ }; pdfRef.current = null }
  }, [doc.blob])

  // 計某頁所有命中嘅高光框（按出現次序）
  const pageRects = (n: number, q: string): Rect[][] => {
    const tc = textCache.current.get(n)
    const lib = libRef.current
    const cq = q.replace(/\s+/g, '').toLowerCase()
    if (!tc || !lib || !cq) return []
    const chars: { it: number; off: number }[] = []
    let c = ''
    tc.items.forEach((it: any, ii: number) => {
      const s: string = typeof it.str === 'string' ? it.str : ''
      for (let k = 0; k < s.length; k++) {
        if (!/\s/.test(s[k])) { chars.push({ it: ii, off: k }); c += s[k].toLowerCase() }
      }
    })
    const W = tc.vp.width, H = tc.vp.height
    const out: Rect[][] = []
    let from = 0
    while (true) {
      const at = c.indexOf(cq, from)
      if (at < 0) break
      const rects: Rect[] = []
      let i = at
      while (i < at + cq.length) {
        const itemIdx = chars[i].it
        let j = i
        while (j + 1 < at + cq.length && chars[j + 1].it === itemIdx) j++
        const item = tc.items[itemIdx]
        const len = Math.max((item.str as string).length, 1)
        const tx = lib.Util.transform(tc.vp.transform, item.transform)
        const fontH = Math.hypot(tx[2], tx[3]) || 10
        const itemW = (item.width || 0) * tc.vp.scale
        const s = chars[i].off, e = chars[j].off + 1
        rects.push({
          x: ((tx[4] + itemW * (s / len)) / W) * 100,
          y: ((tx[5] - fontH * 0.9) / H) * 100,
          w: ((itemW * ((e - s) / len)) / W) * 100,
          h: ((fontH * 1.15) / H) * 100,
        })
        i = j + 1
      }
      out.push(rects)
      from = at + cq.length
    }
    return out
  }

  // 畫高光（已渲染嘅頁）
  const drawHighlights = (n: number) => {
    const holder = scrollRef.current?.querySelector<HTMLDivElement>(`[data-page="${n}"]`)
    const layer = holder?.querySelector<HTMLDivElement>('.hl-layer')
    if (!layer) return
    layer.replaceChildren()
    const all = pageRects(n, query)
    const curHit = hits[cur]
    all.forEach((rects, k) => {
      const isCur = !!curHit && curHit.page === n && curHit.k === k
      rects.forEach(r => {
        const d = document.createElement('div')
        d.style.cssText = `position:absolute;left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;border-radius:2px;` +
          (isCur ? 'background:rgba(249,115,22,0.45);box-shadow:0 0 0 2px rgba(234,88,12,0.7);' : 'background:rgba(250,204,21,0.45);')
        if (isCur) d.dataset.cur = '1'
        layer.appendChild(d)
      })
    })
  }

  // 渲染一頁＋攞文字座標
  const renderPage = async (n: number, holder: HTMLDivElement, z: number) => {
    const pdf = pdfRef.current
    if (!pdf || renderedRef.current.get(n) === z) return
    renderedRef.current.set(n, z)
    try {
      const page = await pdf.getPage(n)
      const cssW = holder.clientWidth || 300
      const base = page.getViewport({ scale: 1 })
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const vp = page.getViewport({ scale: (cssW / base.width) * dpr })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height)
      canvas.style.cssText = 'width:100%;height:auto;display:block'
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise
      if (renderedRef.current.get(n) !== z) return
      if (!textCache.current.has(n)) {
        const tc = await page.getTextContent()
        textCache.current.set(n, { items: tc.items, vp: base })
      }
      const layer = document.createElement('div')
      layer.className = 'hl-layer'
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none'
      holder.replaceChildren(canvas, layer)
      drawHighlights(n)
    } catch { renderedRef.current.delete(n) }
  }

  // 懶加載
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !ready) return
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { const el = e.target as HTMLDivElement; renderPage(Number(el.dataset.page), el, zoom) }
    }, { root, rootMargin: '1200px 0px' })
    root.querySelectorAll<HTMLDivElement>('[data-page]').forEach(el => io.observe(el))
    return () => io.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zoom])

  // 搜尋字詞／當前結果變咗 → 重畫高光
  useEffect(() => {
    textCache.current.forEach((_, n) => drawHighlights(n))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cur, hits])

  // 跳去某頁（同埋當前命中位置）
  const goToPage = (n: number, hitRectTopPct?: number) => {
    const root = scrollRef.current
    const holder = root?.querySelector<HTMLDivElement>(`[data-page="${n}"]`)
    if (!root || !holder) return
    const extra = typeof hitRectTopPct === 'number' ? holder.offsetHeight * hitRectTopPct / 100 - root.clientHeight / 3 : -8
    root.scrollTo({ top: Math.max(0, holder.offsetTop + extra) })
  }
  const goToHit = (i: number) => {
    const h = hits[i]
    if (!h) return
    setCur(i)
    goToPage(h.page)
    // 渲染完再對準高光位置
    setTimeout(() => {
      const r = pageRects(h.page, query)[h.k]?.[0]
      if (r) goToPage(h.page, r.y)
    }, 450)
  }

  // 開啟時：跳去指定頁／命中
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      if (initialQuery && hits[initialHitIndex]) goToHit(initialHitIndex)
      else if (initialPage && initialPage > 1) goToPage(initialPage)
      else if (doc.lastPage && doc.lastPage > 1) goToPage(doc.lastPage)
    }, 80)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // 捲動：計當前頁＋記低
  const lastSave = useRef(0)
  const onScroll = () => {
    const root = scrollRef.current
    if (!root) return
    const mid = root.scrollTop + root.clientHeight / 3
    let pg = curPage
    for (const h of root.querySelectorAll<HTMLDivElement>('[data-page]')) {
      if (h.offsetTop + h.offsetHeight > mid) { pg = Number(h.dataset.page); break }
    }
    if (pg !== curPage) setCurPage(pg)
    const now = Date.now()
    if (now - lastSave.current > 800) { lastSave.current = now; updatePdfLastPage(doc.id, pg) }
  }

  // Enter：第一次跳去當前結果，之後下一個；Shift+Enter：上一個
  const jumpedRef = useRef(false)
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!hits.length) return
      if (e.shiftKey) goToHit((cur - 1 + hits.length) % hits.length)
      else if (!jumpedRef.current) goToHit(cur)
      else goToHit((cur + 1) % hits.length)
      jumpedRef.current = true
    }
    if (e.key === 'Escape') setQuery('')
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-100">
      {/* 頂欄 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-1.5 py-1 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4" /> PDF 庫
        </button>
        <span className="text-sm font-semibold text-gray-800 truncate min-w-0 flex-1" title={doc.name}>{doc.name}</span>
        <span className="text-xs text-gray-400 tabular-nums">{curPage} / {doc.pages}</span>
        <button onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(1)))} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="縮細"><ZoomOut className="w-4 h-4" /></button>
        <button onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(1)))} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="放大"><ZoomIn className="w-4 h-4" /></button>
        {/* 文件內搜尋 */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 w-full sm:w-auto">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setCur(0); jumpedRef.current = false }}
            onKeyDown={onSearchKey}
            placeholder="喺呢份 PDF 搜尋…"
            className="bg-transparent text-sm outline-none w-full sm:w-44"
          />
          {query && <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{hits.length ? `${Math.min(cur + 1, hits.length)}/${hits.length}` : '0'}</span>}
          <button onClick={() => hits.length && goToHit((cur - 1 + hits.length) % hits.length)} disabled={!hits.length} className="p-0.5 text-gray-500 disabled:opacity-30" title="上一個（Shift+Enter）"><ChevronUp className="w-4 h-4" /></button>
          <button onClick={() => hits.length && goToHit((cur + 1) % hits.length)} disabled={!hits.length} className="p-0.5 text-gray-500 disabled:opacity-30" title="下一個（Enter）"><ChevronDown className="w-4 h-4" /></button>
          {query && <button onClick={() => setQuery('')} className="p-0.5 text-gray-400" title="清除"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
      {doc.noText && <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">⚠️ 呢份係掃描檔（冇文字層），搜尋唔到入面嘅字</div>}

      {/* 頁面 */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto">
        {err && <p className="text-sm text-center py-10 text-red-500">{err}</p>}
        {!ready && !err && <p className="text-sm text-center py-10 text-gray-400">載入 PDF 中…</p>}
        <div className="mx-auto" style={{ width: `min(${zoom * 100}%, ${zoom * 900}px)`, padding: 12, boxSizing: 'border-box' }}>
          {ready && Array.from({ length: doc.pages }, (_, i) => (
            <div key={`${i + 1}-${zoom}`} data-page={i + 1}
              style={{ position: 'relative', width: '100%', aspectRatio: `1 / ${aspect}`, marginBottom: 14, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
