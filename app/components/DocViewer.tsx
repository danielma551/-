'use client'

// 【文件檢視器（PDF＋Word）＋搜尋高光】類似 GoodNotes：
// - PDF：pdf.js 畫成圖，用文字座標喺上面疊黃色高光
// - Word（.docx）：mammoth 轉網頁格式，用 <mark> 標出
// 當前結果橙色，Enter／↑↓ 跳轉。兩種佈局：全屏（講稿庫）、側邊面板（閱讀時參考）。

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronUp, ChevronDown, ZoomIn, ZoomOut, Search, X, FileText } from 'lucide-react'
import { loadPdfjs, findHits } from '../utils/pdfLib'

export interface DocViewerProps {
  blob: Blob
  name: string
  kind: 'pdf' | 'docx'
  texts?: string[]                 // PDF 每頁文字（已知就唔使再抽）
  isEink?: boolean
  layout: 'full' | 'panel'
  panelWidth?: number | string
  scrollKey: string                // 記住捲動位置用
  initialQuery?: string
  initialHitIndex?: number
  initialPage?: number
  onClose: () => void
  closeLabel?: string              // 全屏模式左上角返回字
  extraActions?: ReactNode         // 面板模式額外掣（換檔、移除…）
  onPageChange?: (page: number) => void
}

type Rect = { x: number; y: number; w: number; h: number }
const compactLower = (s: string) => s.replace(/\s+/g, '').toLowerCase()

export default function DocViewer(props: DocViewerProps) {
  const { blob, name, kind, isEink = false, layout, panelWidth, scrollKey, initialQuery = '', initialHitIndex = 0, initialPage, onClose, closeLabel, extraActions, onPageChange } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [cur, setCur] = useState(initialHitIndex)
  const [zoom, setZoom] = useState(1)
  const [err, setErr] = useState('')
  const jumpedRef = useRef(false)

  // ════════ PDF ════════
  const pdfRef = useRef<any>(null)
  const libRef = useRef<any>(null)
  const renderedRef = useRef<Map<number, number>>(new Map())
  const textCache = useRef<Map<number, { items: any[]; vp: any }>>(new Map())
  const [pages, setPages] = useState(0)
  const [aspect, setAspect] = useState(1.414)
  const [pdfTexts, setPdfTexts] = useState<string[]>(props.texts || [])
  const [curPage, setCurPage] = useState(initialPage || 1)

  // ════════ Word ════════
  const docxRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState('')
  const marksRef = useRef<HTMLElement[]>([])
  const [docxCount, setDocxCount] = useState(0)

  const ready = kind === 'pdf' ? pages > 0 : !!html

  // 載入
  useEffect(() => {
    let cancelled = false
    setErr(''); setPages(0); setHtml('')
    renderedRef.current.clear(); textCache.current.clear()
    ;(async () => {
      try {
        if (kind === 'docx') {
          // @ts-ignore mammoth 瀏覽器版冇型別
          const mod: any = await import('mammoth/mammoth.browser')
          const mammoth = mod.default ?? mod
          const r = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
          if (!cancelled) setHtml(r.value || '<p>（呢份 Word 冇文字內容）</p>')
          return
        }
        const { lib, opts } = await loadPdfjs()
        libRef.current = lib
        const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), ...opts }).promise
        if (cancelled) { pdf.destroy(); return }
        pdfRef.current = pdf
        const p1 = await pdf.getPage(1)
        const vp = p1.getViewport({ scale: 1 })
        setAspect(vp.height / vp.width)
        setPages(pdf.numPages)
        // 未有文字索引 → 背景抽（搜尋用）
        if (!props.texts || props.texts.length !== pdf.numPages) {
          const t: string[] = []
          for (let p = 1; p <= pdf.numPages; p++) {
            const tc = await (await pdf.getPage(p)).getTextContent()
            t.push(tc.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : '')).join(''))
            if (cancelled) return
          }
          setPdfTexts(t)
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) setErr(kind === 'docx' ? '打唔開呢份 Word（只支援 .docx）' : '打唔開呢份 PDF')
      }
    })()
    return () => { cancelled = true; try { pdfRef.current?.destroy() } catch { /* ignore */ }; pdfRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob, kind])

  const pdfHits = useMemo(() => (kind === 'pdf' ? findHits(pdfTexts, query) : []), [kind, pdfTexts, query])
  const hitCount = kind === 'pdf' ? pdfHits.length : docxCount

  // ── PDF：計某頁命中框 ──
  const pageRects = (n: number, q: string): Rect[][] => {
    const tc = textCache.current.get(n)
    const lib = libRef.current
    const cq = compactLower(q)
    if (!tc || !lib || !cq) return []
    const chars: { it: number; off: number }[] = []
    let c = ''
    tc.items.forEach((it: any, ii: number) => {
      const s: string = typeof it.str === 'string' ? it.str : ''
      for (let k = 0; k < s.length; k++) if (!/\s/.test(s[k])) { chars.push({ it: ii, off: k }); c += s[k].toLowerCase() }
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
        rects.push({ x: ((tx[4] + itemW * (s / len)) / W) * 100, y: ((tx[5] - fontH * 0.9) / H) * 100, w: ((itemW * ((e - s) / len)) / W) * 100, h: ((fontH * 1.15) / H) * 100 })
        i = j + 1
      }
      out.push(rects)
      from = at + cq.length
    }
    return out
  }
  const drawPdfHighlights = (n: number) => {
    const layer = scrollRef.current?.querySelector<HTMLDivElement>(`[data-page="${n}"] .hl-layer`)
    if (!layer) return
    layer.replaceChildren()
    const curHit = pdfHits[cur]
    pageRects(n, query).forEach((rects, k) => {
      const isCur = !!curHit && curHit.page === n && curHit.k === k
      rects.forEach(r => {
        const d = document.createElement('div')
        d.style.cssText = `position:absolute;left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;border-radius:2px;` +
          (isCur ? 'background:rgba(249,115,22,0.45);box-shadow:0 0 0 2px rgba(234,88,12,0.75);' : 'background:rgba(250,204,21,0.45);')
        layer.appendChild(d)
      })
    })
  }
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
      if (!textCache.current.has(n)) textCache.current.set(n, { items: (await page.getTextContent()).items, vp: base })
      const layer = document.createElement('div')
      layer.className = 'hl-layer'
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none'
      holder.replaceChildren(canvas, layer)
      drawPdfHighlights(n)
    } catch { renderedRef.current.delete(n) }
  }
  useEffect(() => {
    if (kind !== 'pdf' || !pages) return
    const root = scrollRef.current
    if (!root) return
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { const el = e.target as HTMLDivElement; renderPage(Number(el.dataset.page), el, zoom) }
    }, { root, rootMargin: '1200px 0px' })
    root.querySelectorAll<HTMLDivElement>('[data-page]').forEach(el => io.observe(el))
    return () => io.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, pages, zoom])

  // ── Word：包 <mark> ──
  const applyDocxMarks = () => {
    const root = docxRef.current
    if (!root) return
    root.querySelectorAll('mark[data-hl]').forEach(m => m.replaceWith(document.createTextNode(m.textContent || '')))
    root.normalize()
    marksRef.current = []
    const cq = compactLower(query)
    if (!cq) { setDocxCount(0); return }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    const all: HTMLElement[] = []
    for (const node of nodes) {
      const text = node.nodeValue || ''
      const map: number[] = []; let c = ''
      for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { map.push(i); c += text[i].toLowerCase() }
      const ranges: { s: number; e: number }[] = []
      let from = 0
      while (true) { const at = c.indexOf(cq, from); if (at < 0) break; ranges.push({ s: map[at], e: map[at + cq.length - 1] + 1 }); from = at + cq.length }
      const made: HTMLElement[] = []
      for (let r = ranges.length - 1; r >= 0; r--) {
        const range = document.createRange()
        range.setStart(node, ranges[r].s); range.setEnd(node, ranges[r].e)
        const m = document.createElement('mark')
        m.dataset.hl = '1'
        range.surroundContents(m)
        made.unshift(m)
      }
      all.push(...made)
    }
    marksRef.current = all
    setDocxCount(all.length)
  }
  const styleDocxMarks = () => {
    marksRef.current.forEach((m, i) => {
      const isCur = i === cur
      m.style.cssText = isCur
        ? 'background:rgba(249,115,22,0.45);box-shadow:0 0 0 2px rgba(234,88,12,0.75);border-radius:2px;color:inherit'
        : 'background:rgba(250,204,21,0.5);border-radius:2px;color:inherit'
    })
  }
  // 自己寫入 HTML（唔用 dangerouslySetInnerHTML：React 每次重繪會覆蓋掉 <mark>）
  const htmlSetRef = useRef('')
  useEffect(() => {
    if (kind !== 'docx' || !html || !docxRef.current) return
    if (htmlSetRef.current !== html || !docxRef.current.childNodes.length) { docxRef.current.innerHTML = html; htmlSetRef.current = html }
    applyDocxMarks(); styleDocxMarks()
  }, [kind, html, query])   // eslint-disable-line react-hooks/exhaustive-deps

  // 搜尋／當前結果變 → 重畫
  useEffect(() => {
    if (kind === 'pdf') textCache.current.forEach((_, n) => drawPdfHighlights(n))
    else styleDocxMarks()
  }, [cur, pdfHits])   // eslint-disable-line react-hooks/exhaustive-deps

  // 跳轉
  const scrollToY = (y: number) => { const root = scrollRef.current; if (root) root.scrollTo({ top: Math.max(0, y) }) }
  const goToPage = (n: number, topPct?: number) => {
    const root = scrollRef.current
    const holder = root?.querySelector<HTMLDivElement>(`[data-page="${n}"]`)
    if (!root || !holder) return
    scrollToY(holder.offsetTop + (typeof topPct === 'number' ? holder.offsetHeight * topPct / 100 - root.clientHeight / 3 : -8))
  }
  const goToHit = (i: number) => {
    if (!hitCount) return
    const idx = ((i % hitCount) + hitCount) % hitCount
    setCur(idx)
    if (kind === 'pdf') {
      const h = pdfHits[idx]
      goToPage(h.page)
      setTimeout(() => { const r = pageRects(h.page, query)[h.k]?.[0]; if (r) goToPage(h.page, r.y) }, 450)
    } else {
      const m = marksRef.current[idx]
      const root = scrollRef.current
      if (m && root) scrollToY(m.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - root.clientHeight / 3)
    }
  }
  const onSearchKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()   // 唔好觸發閱讀器快捷鍵
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) goToHit(cur - 1)
      else if (!jumpedRef.current) goToHit(cur)
      else goToHit(cur + 1)
      jumpedRef.current = true
    }
    if (e.key === 'Escape') setQuery('')
  }

  // 開啟：跳去指定命中／頁／上次位置
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      if (initialQuery && (kind === 'docx' ? marksRef.current.length : pdfHits.length)) { goToHit(initialHitIndex); jumpedRef.current = true }
      else if (kind === 'pdf' && initialPage && initialPage > 1) goToPage(initialPage)
      else {
        const saved = parseFloat(localStorage.getItem(scrollKey) || '')
        if (isFinite(saved) && saved > 0) scrollToY(saved)
      }
    }, 150)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pdfTexts.length])

  // 捲動：記位置＋當前頁
  const lastSave = useRef(0)
  const onScroll = () => {
    const root = scrollRef.current
    if (!root) return
    const now = Date.now()
    if (now - lastSave.current > 500) {
      lastSave.current = now
      try { localStorage.setItem(scrollKey, String(root.scrollTop)) } catch { /* ignore */ }
    }
    if (kind === 'pdf') {
      const mid = root.scrollTop + root.clientHeight / 3
      for (const h of root.querySelectorAll<HTMLDivElement>('[data-page]')) {
        if (h.offsetTop + h.offsetHeight > mid) { const p = Number(h.dataset.page); if (p !== curPage) { setCurPage(p); onPageChange?.(p) } break }
      }
    }
  }

  const btn = isEink ? 'p-1.5 text-black border border-black' : 'p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100'
  const containerStyle: React.CSSProperties = layout === 'full'
    ? { position: 'fixed', inset: 0, zIndex: 40, background: isEink ? '#fff' : '#f3f4f6' }
    : { position: 'fixed', top: 0, left: 0, bottom: 0, width: panelWidth, zIndex: 46, background: isEink ? '#fff' : '#f3f4f6', borderRight: isEink ? '2px solid #000' : '1px solid #e5e7eb', boxShadow: isEink ? 'none' : '4px 0 20px rgba(0,0,0,0.06)' }

  return (
    <div className="flex flex-col" style={containerStyle} onClick={e => e.stopPropagation()}>
      {/* 頂欄 */}
      <div className="flex items-center gap-1 px-3 py-2 flex-wrap" style={{ background: '#fff', borderBottom: isEink ? '2px solid #000' : '1px solid #e5e7eb' }}>
        {layout === 'full'
          ? <button onClick={onClose} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-1.5 py-1 rounded-lg hover:bg-gray-100"><ArrowLeft className="w-4 h-4" /> {closeLabel || '返回'}</button>
          : <FileText className="w-4 h-4 flex-shrink-0" style={{ color: isEink ? '#000' : '#6366f1' }} />}
        <span className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: isEink ? '#000' : '#374151' }} title={name}>{name}</span>
        {kind === 'pdf' && pages > 0 && <span className="text-xs tabular-nums mr-1" style={{ color: isEink ? '#000' : '#9ca3af' }}>{curPage} / {pages}</span>}
        <button className={btn} onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(1)))} title="縮細"><ZoomOut className="w-4 h-4" /></button>
        <button className={btn} onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(1)))} title="放大"><ZoomIn className="w-4 h-4" /></button>
        {extraActions}
        {layout === 'panel' && <button className={btn} onClick={onClose} title="收起"><X className="w-4 h-4" /></button>}
        {/* 搜尋 */}
        <div className="flex items-center gap-1 px-2 py-1 w-full mt-1"
          style={{ border: isEink ? '1.5px solid #000' : '1px solid #e5e7eb', borderRadius: isEink ? 0 : 8, background: isEink ? '#fff' : '#f9fafb' }}>
          <Search className="w-3.5 h-3.5" style={{ color: isEink ? '#000' : '#9ca3af' }} />
          <input value={query} onChange={e => { setQuery(e.target.value); setCur(0); jumpedRef.current = false }} onKeyDown={onSearchKey}
            placeholder={kind === 'docx' ? '喺呢份 Word 搜尋…（Enter 跳去下一個）' : '喺呢份 PDF 搜尋…（Enter 跳去下一個）'}
            className="bg-transparent text-sm outline-none flex-1 min-w-0" />
          {query && <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: isEink ? '#000' : '#9ca3af' }}>{hitCount ? `${Math.min(cur + 1, hitCount)}/${hitCount}` : '0'}</span>}
          <button onClick={() => goToHit(cur - 1)} disabled={!hitCount} className="p-0.5 disabled:opacity-30" title="上一個（Shift+Enter）"><ChevronUp className="w-4 h-4" /></button>
          <button onClick={() => { goToHit(jumpedRef.current ? cur + 1 : cur); jumpedRef.current = true }} disabled={!hitCount} className="p-0.5 disabled:opacity-30" title="下一個（Enter）"><ChevronDown className="w-4 h-4" /></button>
          {query && <button onClick={() => setQuery('')} className="p-0.5" style={{ color: '#9ca3af' }} title="清除"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </div>

      {/* 內容 */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto">
        {err && <p className="text-sm text-center py-10 text-red-500">{err}</p>}
        {!ready && !err && <p className="text-sm text-center py-10" style={{ color: isEink ? '#000' : '#9ca3af' }}>{kind === 'docx' ? '載入 Word 中…' : '載入 PDF 中…'}</p>}
        {kind === 'pdf' && pages > 0 && (
          <div className="mx-auto" style={{ width: layout === 'full' ? `min(${zoom * 100}%, ${zoom * 900}px)` : `${zoom * 100}%`, padding: 12, boxSizing: 'border-box' }}>
            {Array.from({ length: pages }, (_, i) => (
              <div key={`${i + 1}-${zoom}`} data-page={i + 1}
                style={{ position: 'relative', width: '100%', aspectRatio: `1 / ${aspect}`, marginBottom: 14, background: '#fff', boxShadow: isEink ? 'none' : '0 1px 4px rgba(0,0,0,0.12)', border: isEink ? '1px solid #000' : 'none' }} />
            ))}
          </div>
        )}
        {kind === 'docx' && html && (
          <div style={{ padding: 12, maxWidth: layout === 'full' ? 860 : undefined, margin: '0 auto' }}>
            <style>{`
              .docx-view { line-height: 1.85; word-break: break-word; }
              .docx-view h1 { font-size: 1.5em; font-weight: 700; margin: 0.8em 0 0.5em; }
              .docx-view h2 { font-size: 1.3em; font-weight: 700; margin: 0.8em 0 0.4em; }
              .docx-view h3, .docx-view h4 { font-size: 1.12em; font-weight: 700; margin: 0.7em 0 0.3em; }
              .docx-view p { margin: 0 0 0.75em; }
              .docx-view ul, .docx-view ol { padding-left: 1.4em; margin: 0 0 0.75em; }
              .docx-view ul { list-style: disc; } .docx-view ol { list-style: decimal; }
              .docx-view table { border-collapse: collapse; margin: 0.6em 0 1em; width: 100%; }
              .docx-view td, .docx-view th { border: 1px solid ${isEink ? '#000' : '#d1d5db'}; padding: 4px 8px; vertical-align: top; }
              .docx-view td p, .docx-view th p { margin: 0; }
              .docx-view img { max-width: 100%; height: auto; }
              .docx-view a { color: ${isEink ? '#000' : '#4f46e5'}; text-decoration: underline; }
            `}</style>
            <div ref={docxRef} className="docx-view"
              style={{ background: '#fff', color: isEink ? '#000' : '#1f2937', padding: '20px 22px', fontSize: `${zoom * 15}px`, boxShadow: isEink ? 'none' : '0 1px 4px rgba(0,0,0,0.1)', border: isEink ? '1px solid #000' : 'none' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
