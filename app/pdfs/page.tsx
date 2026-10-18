'use client'

// 【📚 講稿庫】PDF＋Word 儲存（本機）＋全庫搜尋，撳結果打開並高光（類似 GoodNotes）。
// 錄音書（🎧）喺閱讀時加嘅參考檔會自動收入嚟；書刪咗，講稿都保留。

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Upload, Search, Trash2, FileText, Loader2, X } from 'lucide-react'
import { PdfDoc, getAllPdfDocs, savePdfDoc, deletePdfDoc, findHits, buildLibDoc, syncAttachmentsToLibrary, docKind, updatePdfLastPage } from '../utils/pdfLib'
import { getAllBooksFromIDB } from '../utils/bookDB'
import DocViewer from '../components/DocViewer'

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function DocLibraryPage() {
  const [docs, setDocs] = useState<PdfDoc[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'audio'>('all')
  const [importing, setImporting] = useState<{ name: string; done: number; total: number; left: number } | null>(null)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState<{ doc: PdfDoc; page?: number; query?: string; hit?: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500) }
  const refresh = async () => { setDocs(await getAllPdfDocs()); setLoaded(true) }
  useEffect(() => {
    (async () => {
      await refresh()
      try { (navigator as any).storage?.persist?.() } catch { /* ignore */ }
      // 收齊錄音書參考檔
      try {
        const books = await getAllBooksFromIDB()
        const titles: Record<string, string> = {}
        books.forEach(b => { titles[b.id] = b.title })
        const n = await syncAttachmentsToLibrary(titles)
        if (n) { flash(`已收入 ${n} 份錄音書參考檔`); refresh() }
      } catch (e) { console.warn(e) }
      const q = new URLSearchParams(location.search).get('q')
      if (q) setQuery(q)
    })()
  }, [])

  // 上傳（可多選 PDF／Word）
  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files || [])
    if (fileRef.current) fileRef.current.value = ''
    const files = all.filter(f => /\.(pdf|docx)$/i.test(f.name))
    const skipped = all.length - files.length
    if (!files.length) { if (skipped) flash('只支援 PDF 同 .docx（舊式 .doc 請另存做 .docx）'); return }
    let added = 0, failed = 0
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      try {
        setImporting({ name: f.name, done: 0, total: 0, left: files.length - i - 1 })
        await savePdfDoc(await buildLibDoc(f, f.name, {}, (done, total) => setImporting({ name: f.name, done, total, left: files.length - i - 1 })))
        added++
      } catch (err) { console.error(err); failed++ }
    }
    setImporting(null)
    flash(`已加入 ${added} 份${failed ? `，${failed} 份打唔開` : ''}${skipped ? `，${skipped} 份唔支援` : ''}`)
    refresh()
  }

  const remove = async (d: PdfDoc) => {
    if (!confirm(`喺講稿庫刪除「${d.name}」？${d.bookId ? '\n（錄音書入面嘅參考檔唔受影響）' : ''}`)) return
    await deletePdfDoc(d.id)
    refresh()
  }

  const shown = useMemo(() => docs.filter(d => filter === 'all' || !!d.bookId), [docs, filter])
  const results = useMemo(() => {
    if (!query.trim()) return []
    return shown.map(d => ({ doc: d, hits: findHits(d.texts, query) })).filter(r => r.hits.length > 0)
  }, [shown, query])
  const totalHits = results.reduce((n, r) => n + r.hits.length, 0)
  const audioCount = docs.filter(d => d.bookId).length

  if (open) {
    const d = open.doc
    return (
      <DocViewer layout="full" blob={d.blob} name={d.name} kind={docKind(d)} texts={docKind(d) === 'pdf' ? d.texts : undefined}
        scrollKey={`lib-scroll:${d.id}`} initialQuery={open.query} initialHitIndex={open.hit} initialPage={open.page ?? d.lastPage}
        closeLabel="講稿庫" onPageChange={p => updatePdfLastPage(d.id, p)}
        onClose={() => { setOpen(null); refresh() }} />
    )
  }

  const Badge = ({ d }: { d: PdfDoc }) => docKind(d) === 'docx'
    ? <div className="w-9 h-11 rounded bg-blue-50 border border-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 flex-shrink-0">DOC</div>
    : <div className="w-9 h-11 rounded bg-red-50 border border-red-100 flex items-center justify-center text-[10px] font-bold text-red-500 flex-shrink-0">PDF</div>

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-3xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between mb-5">
          <a href="/" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> 書架</a>
          <h1 className="text-lg font-bold text-gray-800">📚 講稿庫</h1>
          <button onClick={() => fileRef.current?.click()} disabled={!!importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
            <Upload className="w-4 h-4" /> 加檔案
          </button>
          <input ref={fileRef} type="file" multiple accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={onFiles} />
        </div>

        {/* 全庫搜尋 */}
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white border border-gray-200 shadow-sm mb-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋所有 PDF／Word 嘅內容…"
            className="flex-1 bg-transparent outline-none text-base" />
          {query && <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
        </div>
        {audioCount > 0 && (
          <div className="flex gap-2 mb-4 text-xs">
            {([['all', `全部 ${docs.length}`], ['audio', `🎧 錄音書參考 ${audioCount}`]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-3 py-1 rounded-full border ${filter === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{label}</button>
            ))}
          </div>
        )}

        {importing && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-100 text-sm text-indigo-700 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            抽取文字建索引：{importing.name}{importing.total ? `（${importing.done}/${importing.total} 頁）` : ''}{importing.left ? ` · 仲有 ${importing.left} 份` : ''}
          </div>
        )}
        {msg && <div className="mb-4 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">{msg}</div>}

        {query.trim() ? (
          <div>
            <p className="text-sm text-gray-500 mb-3">「{query}」：{results.length} 份文件 · {totalHits} 個結果</p>
            {results.length === 0 && <p className="text-sm text-gray-400 py-10 text-center">搵唔到</p>}
            <div className="space-y-4">
              {results.map(({ doc, hits }) => (
                <div key={doc.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                  <button onClick={() => setOpen({ doc, query, hit: 0 })} className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-left hover:bg-gray-100">
                    <FileText className={`w-4 h-4 flex-shrink-0 ${docKind(doc) === 'docx' ? 'text-blue-500' : 'text-red-500'}`} />
                    <span className="text-sm font-semibold text-gray-800 truncate flex-1">{doc.name}</span>
                    <span className="text-xs text-gray-400">{hits.length} 個</span>
                  </button>
                  <div className="divide-y divide-gray-50">
                    {hits.slice(0, 30).map((h, i) => (
                      <button key={i} onClick={() => setOpen({ doc, query, hit: i })} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50/50 flex gap-3">
                        {docKind(doc) === 'pdf' && <span className="text-xs text-gray-400 flex-shrink-0 w-12 pt-0.5">第 {h.page} 頁</span>}
                        <span className="text-sm text-gray-600 leading-relaxed">
                          …{h.snippet.before}<mark className="bg-yellow-200 text-gray-900 rounded px-0.5">{h.snippet.hit}</mark>{h.snippet.after}…
                        </span>
                      </button>
                    ))}
                    {hits.length > 30 && <button onClick={() => setOpen({ doc, query, hit: 30 })} className="w-full px-4 py-2 text-xs text-indigo-600 text-left hover:bg-indigo-50/50">仲有 {hits.length - 30} 個結果，打開文件睇 →</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {loaded && shown.length === 0 && !importing && (
              <div className="text-center py-20 text-gray-400">
                <FileText className="w-14 h-14 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">講稿庫仲係空嘅</p>
                <p className="text-sm mt-1">撳「加檔案」（PDF／Word 都得），或者喺 🎧 錄音書閱讀時加 📄 參考檔，會自動收入嚟</p>
              </div>
            )}
            {shown.length > 0 && (
              <div className="divide-y divide-gray-100 rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                {shown.map(d => (
                  <div key={d.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    <button onClick={() => setOpen({ doc: d })} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Badge d={d} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {docKind(d) === 'pdf' ? `${d.pages} 頁 · ` : ''}{fmtSize(d.size)} · {new Date(d.addedAt).toLocaleDateString('zh-HK')}
                          {d.bookId && ` · 🎧 ${d.bookTitle?.replace(/^🎧\s*/, '') || '錄音書'}`}
                          {docKind(d) === 'pdf' && d.lastPage && d.lastPage > 1 ? ` · 睇到第 ${d.lastPage} 頁` : ''}
                          {d.noText && <span className="ml-1 text-amber-600">· 冇文字層，搜唔到</span>}
                        </p>
                      </div>
                    </button>
                    <button onClick={() => remove(d)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100" title="刪除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {docs.length > 0 && <p className="text-[11px] text-gray-400 mt-3">🔒 檔案只存喺呢部機（唔經雲端）。</p>}
          </div>
        )}
      </div>
    </main>
  )
}
