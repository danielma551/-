// 【右側常駐搜索側欄】
// 閱讀介面右側永遠可見的搜索面板，預設展開
// 支援跨書搜索，點擊結果彈出 ContextModal
// Portal 渲染，閱讀主區域自動讓出右側空間

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, BookOpen, ChevronRight, Loader2, PanelRightClose, PanelRightOpen, Palette } from 'lucide-react'
import { getAllBooksFromIDB } from '../utils/bookDB'
import { BookData } from '../utils/storage'
import ContextModal from './ContextModal'

const SIDEBAR_WIDTH = 300  // px，也在 Reader 端用於設定 margin
const COLOR_KEY = 'search-sidebar-color'
const DEFAULT_COLOR = '#4f46e5'  // 預設紫色

// 根據主色生成漸層（加深版本作起點）
function makeGradient(hex: string) {
  return `linear-gradient(160deg, ${darken(hex, 30)}, ${hex})`
}

// 把十六進位色碼加深 N 個亮度單位
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, (n >> 16) - amount)
  const g = Math.max(0, ((n >> 8) & 0xff) - amount)
  const b = Math.max(0, (n & 0xff) - amount)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

interface SearchMatch { sentence: string; index: number }
interface SearchResult { book: BookData; matches: SearchMatch[]; isCurrent: boolean }
interface ContextPreview { book: BookData; matchIndex: number; keyword: string }

interface SearchSidebarProps {
  isOpen: boolean
  onToggle: () => void
  currentBookId: string
  onOpenBook: (book: BookData, sentenceIndex: number) => void
}

// 高亮關鍵字
function Hi({ text, kw }: { text: string; kw: string }) {
  if (!kw.trim()) return <span>{text}</span>
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${esc})`, 'gi'))
  return (
    <span>
      {parts.map((p, i) =>
        p.toLowerCase() === kw.toLowerCase()
          ? <mark key={i} className="bg-amber-200 text-amber-900 rounded-sm px-0.5 not-italic">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </span>
  )
}

function getGradient(title: string) {
  const gs = [
    'linear-gradient(135deg,#1a1a2e,#16213e)',
    'linear-gradient(135deg,#134e4a,#065f46)',
    'linear-gradient(135deg,#4a1d96,#6d28d9)',
    'linear-gradient(135deg,#7f1d1d,#b91c1c)',
    'linear-gradient(135deg,#78350f,#b45309)',
    'linear-gradient(135deg,#1e3a5f,#1d4ed8)',
    'linear-gradient(135deg,#831843,#be185d)',
    'linear-gradient(135deg,#1f2937,#374151)',
    'linear-gradient(135deg,#14532d,#166534)',
    'linear-gradient(135deg,#7c2d12,#c2410c)',
    'linear-gradient(135deg,#312e81,#4338ca)',
    'linear-gradient(135deg,#0c4a6e,#0369a1)',
  ]
  let h = 0
  for (let i = 0; i < title.length; i++) h = title.charCodeAt(i) + ((h << 5) - h)
  return gs[Math.abs(h) % gs.length]
}

// 從漸層取第一個色作為 accent
function accentColor(gradient: string) {
  const m = gradient.match(/#[0-9a-fA-F]{6}/)
  return m ? m[0] : '#4f46e5'
}

export { SIDEBAR_WIDTH }

export default function SearchSidebar({ isOpen, onToggle, currentBookId, onOpenBook }: SearchSidebarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [books, setBooks] = useState<BookData[]>([])
  const [contextPreview, setContextPreview] = useState<ContextPreview | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)

  // 主題色：從 localStorage 讀取，預設紫色
  const [themeColor, setThemeColor] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_COLOR
    return localStorage.getItem(COLOR_KEY) ?? DEFAULT_COLOR
  })
  const headerGradient = makeGradient(themeColor)

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value
    setThemeColor(color)
    localStorage.setItem(COLOR_KEY, color)
  }

  useEffect(() => {
    if (isOpen) {
      if (books.length === 0) getAllBooksFromIDB().then(setBooks)
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen, books.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !contextPreview && isOpen) onToggle()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, contextPreview, onToggle])

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    setLoading(true)
    setSearched(false)
    setContextPreview(null)
    await new Promise(r => setTimeout(r, 30))
    const allBooks = books.length > 0 ? books : await getAllBooksFromIDB()
    if (books.length === 0) setBooks(allBooks)

    const res: SearchResult[] = allBooks
      .map(book => ({
        book,
        isCurrent: book.id === currentBookId,
        matches: book.sentences
          .map((sentence, index) => ({ sentence, index }))
          .filter(({ sentence }) => sentence.toLowerCase().includes(trimmed.toLowerCase()))
          .slice(0, 15),
      }))
      .filter(r => r.matches.length > 0)
      .sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0))

    setResults(res)
    setLoading(false)
    setSearched(true)
  }, [query, books, currentBookId])

  const handleJump = (idx: number) => {
    if (!contextPreview) return
    onOpenBook(contextPreview.book, idx)
    setContextPreview(null)
    if (contextPreview.book.id !== currentBookId) onToggle()
  }

  return createPortal(
    <>
      {/* ── 收合/展開 Tab（永遠可見） ── */}
      <button
        onClick={onToggle}
        className="fixed z-50 flex items-center justify-center w-7 h-14 rounded-l-xl shadow-lg transition-all duration-300"
        style={{
          right: isOpen ? SIDEBAR_WIDTH : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          background: headerGradient,
        }}
        title={isOpen ? '收起搜索' : '展開搜索'}
      >
        {isOpen
          ? <PanelRightClose className="w-4 h-4 text-white" />
          : <PanelRightOpen className="w-4 h-4 text-white" />
        }
      </button>

      {/* ── 側欄本體 ── */}
      <div
        className="fixed top-0 right-0 h-full bg-white flex flex-col z-40 transition-transform duration-300 ease-in-out"
        style={{
          width: SIDEBAR_WIDTH,
          transform: isOpen ? 'translateX(0)' : `translateX(${SIDEBAR_WIDTH}px)`,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
        }}
      >
        {/* 標頭漸層 */}
        <div
          className="px-4 pt-5 pb-4 flex-shrink-0"
          style={{ background: headerGradient }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-white/80" />
              <span className="text-white font-semibold text-sm tracking-wide">跨書搜索</span>
            </div>
            <div className="flex items-center space-x-1">
              {/* 調色按鈕 */}
              <button
                onClick={() => colorInputRef.current?.click()}
                className="p-1 text-white/60 hover:text-white transition-colors relative"
                title="自定義顏色"
              >
                <Palette className="w-4 h-4" />
                {/* 隱藏的原生 color input */}
                <input
                  ref={colorInputRef}
                  type="color"
                  value={themeColor}
                  onChange={handleColorChange}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
              </button>
              <button onClick={onToggle} className="p-1 text-white/60 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 focus-within:bg-white/25 transition-colors">
            <Search className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="搜索所有書籍..."
              className="flex-1 bg-transparent text-sm text-white placeholder-white/50 outline-none"
            />
            {loading
              ? <Loader2 className="w-3.5 h-3.5 text-white/60 animate-spin flex-shrink-0" />
              : query
                ? <button onClick={() => { setQuery(''); setResults([]); setSearched(false) }}>
                    <X className="w-3.5 h-3.5 text-white/60 hover:text-white transition-colors" />
                  </button>
                : null
            }
          </div>

          {/* 搜索按鈕 */}
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="mt-2.5 w-full py-1.5 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-40 text-white text-xs font-medium transition-colors"
          >
            搜索 ↵
          </button>
        </div>

        {/* 結果區域 */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">

          {/* 未搜索 */}
          {!searched && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 select-none px-6 py-12">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3">
                <Search className="w-6 h-6 text-indigo-300" />
              </div>
              <p className="text-sm text-gray-400 text-center leading-relaxed">
                輸入關鍵字<br />搜索所有書籍內容
              </p>
            </div>
          )}

          {/* 無結果 */}
          {searched && results.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 select-none px-6 py-12">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <BookOpen className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm text-gray-400 text-center">
                找不到「{query}」
              </p>
            </div>
          )}

          {/* 結果列表 */}
          {searched && results.length > 0 && (
            <div className="py-2">
              {results.map(({ book, matches, isCurrent }) => {
                const gradient = book.coverColor ?? getGradient(book.title)
                const accent = accentColor(gradient)
                return (
                  <div key={book.id} className="mb-3">
                    {/* 書名標頭 */}
                    <div className="mx-3 mb-1 px-3 py-2 rounded-xl flex items-center justify-between"
                      style={{ background: gradient }}>
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <BookOpen className="w-3 h-3 text-white/70 flex-shrink-0" />
                        <span className="text-white text-xs font-semibold truncate">{book.title}</span>
                        {isCurrent && <span className="text-white/50 text-[9px] flex-shrink-0 bg-white/10 px-1.5 py-0.5 rounded-full">本書</span>}
                      </div>
                      <span className="text-white/60 text-[10px] ml-1 flex-shrink-0 tabular-nums">{matches.length}</span>
                    </div>

                    {/* 命中句子 */}
                    <div className="mx-3 bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                      {matches.map(({ sentence, index }, i) => (
                        <button
                          key={index}
                          onClick={() => setContextPreview({ book, matchIndex: index, keyword: query })}
                          className={`w-full text-left px-3 py-2.5 hover:bg-indigo-50/70 transition-colors group flex items-start space-x-2 ${i < matches.length - 1 ? 'border-b border-gray-50' : ''}`}
                        >
                          {/* 色條 */}
                          <div className="w-0.5 rounded-full flex-shrink-0 mt-1 self-stretch min-h-[1rem]" style={{ background: accent, opacity: 0.5 }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                              <Hi text={sentence} kw={query} />
                            </p>
                            <p className="text-[10px] text-gray-300 mt-0.5 tabular-nums">第 {index + 1} 句</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-200 group-hover:text-indigo-400 flex-shrink-0 mt-1 transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* 摘要 */}
              <p className="text-center text-[10px] text-gray-300 py-2">
                在 {results.length} 本書中找到「{query}」
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ContextModal */}
      {contextPreview && (
        <ContextModal
          sentences={contextPreview.book.sentences}
          bookTitle={contextPreview.book.title}
          bookGradient={contextPreview.book.coverColor ?? getGradient(contextPreview.book.title)}
          matchIndex={contextPreview.matchIndex}
          keyword={contextPreview.keyword}
          onClose={() => setContextPreview(null)}
          onJump={handleJump}
        />
      )}
    </>,
    document.body
  )
}
