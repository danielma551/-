'use client'

// 【參考 PDF 面板】喺閱讀介面側邊睇 PDF（用 pdf.js 畫成圖，Android／墨水屏都睇得到）。
// 只渲染捲到附近嘅頁，大 PDF 都唔會卡；記住每本書捲到邊。

import { useEffect, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut, RefreshCw, Trash2, FileText } from 'lucide-react'

interface Props {
  bookId: string
  blob: Blob
  name: string
  isEink: boolean
  width: number | string
  onClose: () => void
  onReplace: () => void
  onRemove: () => void
}

export default function PdfPanel({ bookId, blob, name, isEink, width, onClose, onReplace, onRemove }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<any>(null)
  const renderedRef = useRef<Map<number, number>>(new Map())   // 頁 → 已按邊個縮放渲染
  const [numPages, setNumPages] = useState(0)
  const [aspect, setAspect] = useState(1.414)
  const [zoom, setZoom] = useState(1)
  const [curPage, setCurPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const scrollKey = 'pdf-scroll:' + bookId

  // 載入 PDF
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true); setErr(''); setNumPages(0)
        const pdfjsLib: any = await import('pdfjs-dist')
        const v = pdfjsLib.version
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`
        const data = new Uint8Array(await blob.arrayBuffer())
        const doc = await pdfjsLib.getDocument({
          data,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${v}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${v}/standard_fonts/`,
        }).promise
        if (cancelled) { doc.destroy(); return }
        docRef.current = doc
        const p1 = await doc.getPage(1)
        const vp = p1.getViewport({ scale: 1 })
        setAspect(vp.height / vp.width)
        renderedRef.current.clear()
        setNumPages(doc.numPages)
        setLoading(false)
      } catch (e) {
        console.error(e)
        if (!cancelled) { setErr('打唔開呢份 PDF'); setLoading(false) }
      }
    })()
    return () => {
      cancelled = true
      try { docRef.current?.destroy() } catch { /* ignore */ }
      docRef.current = null
    }
  }, [blob])

  // 渲染一頁（按容器闊度 × 螢幕密度）
  const renderPage = async (n: number, holder: HTMLDivElement, z: number) => {
    const doc = docRef.current
    if (!doc || renderedRef.current.get(n) === z) return
    renderedRef.current.set(n, z)
    try {
      const page = await doc.getPage(n)
      const cssW = holder.clientWidth || 300
      const base = page.getViewport({ scale: 1 })
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const vp = page.getViewport({ scale: (cssW / base.width) * dpr })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      canvas.style.display = 'block'
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise
      if (renderedRef.current.get(n) !== z) return   // 期間改咗縮放 → 放棄舊結果
      holder.replaceChildren(canvas)
    } catch {
      renderedRef.current.delete(n)
    }
  }

  // 只渲染捲到附近嘅頁
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !numPages) return
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const el = e.target as HTMLDivElement
          renderPage(Number(el.dataset.page), el, zoom)
        }
      }
    }, { root, rootMargin: '900px 0px' })
    root.querySelectorAll<HTMLDivElement>('[data-page]').forEach(el => io.observe(el))
    return () => io.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, zoom])

  // 還原上次捲動位置
  useEffect(() => {
    if (!numPages) return
    const saved = parseFloat(localStorage.getItem(scrollKey) || '')
    if (isFinite(saved) && saved > 0) {
      requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = saved })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages])

  // 捲動：記位置 + 計當前頁
  const lastSave = useRef(0)
  const onScroll = () => {
    const root = scrollRef.current
    if (!root) return
    const now = Date.now()
    if (now - lastSave.current > 500) {
      lastSave.current = now
      try { localStorage.setItem(scrollKey, String(root.scrollTop)) } catch { /* ignore */ }
    }
    const mid = root.scrollTop + root.clientHeight / 3
    const holders = root.querySelectorAll<HTMLDivElement>('[data-page]')
    for (const h of holders) {
      if (h.offsetTop + h.offsetHeight > mid) { setCurPage(Number(h.dataset.page)); break }
    }
  }

  const btn = isEink
    ? 'p-1.5 text-black border border-black'
    : 'p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100'

  return (
    <div
      className="fixed top-0 left-0 bottom-0 flex flex-col"
      style={{
        width, zIndex: 46,
        background: isEink ? '#fff' : '#f3f4f6',
        borderRight: isEink ? '2px solid #000' : '1px solid #e5e7eb',
        boxShadow: isEink ? 'none' : '4px 0 20px rgba(0,0,0,0.06)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* 頂欄 */}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0" style={{ background: '#fff', borderBottom: isEink ? '2px solid #000' : '1px solid #e5e7eb' }}>
        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: isEink ? '#000' : '#6366f1' }} />
        <span className="text-sm font-medium truncate flex-1 min-w-0" style={{ color: isEink ? '#000' : '#374151' }} title={name}>{name}</span>
        {numPages > 0 && <span className="text-xs tabular-nums flex-shrink-0 mr-1" style={{ color: isEink ? '#000' : '#9ca3af' }}>{curPage} / {numPages}</span>}
        <button className={btn} onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(1)))} title="縮細"><ZoomOut className="w-4 h-4" /></button>
        <button className={btn} onClick={() => setZoom(z => Math.min(3, +(z + 0.2).toFixed(1)))} title="放大"><ZoomIn className="w-4 h-4" /></button>
        <button className={btn} onClick={onReplace} title="換另一份 PDF"><RefreshCw className="w-4 h-4" /></button>
        <button className={btn} onClick={onRemove} title="移除呢份 PDF"><Trash2 className="w-4 h-4" /></button>
        <button className={btn} onClick={onClose} title="收起"><X className="w-4 h-4" /></button>
      </div>

      {/* 內容 */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto">
        {loading && <p className="text-sm text-center py-10" style={{ color: isEink ? '#000' : '#9ca3af' }}>載入 PDF 中…</p>}
        {err && <p className="text-sm text-center py-10 text-red-500">{err}</p>}
        <div style={{ width: `${zoom * 100}%`, padding: 12, boxSizing: 'border-box' }}>
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={`${i + 1}-${zoom}`}
              data-page={i + 1}
              style={{
                width: '100%', aspectRatio: `1 / ${aspect}`, marginBottom: 12,
                background: '#fff', boxShadow: isEink ? 'none' : '0 1px 4px rgba(0,0,0,0.1)',
                border: isEink ? '1px solid #000' : 'none',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
