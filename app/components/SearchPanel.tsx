// 【全文搜索面板】
// 搜索所有書籍的句子內容，結果以多欄卡片顯示（每本書一張）
// 點擊某句 → 彈出 ContextModal（前後各 5 句段落預覽）→ 再決定是否跳書

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, BookOpen, Loader2, ChevronRight } from 'lucide-react'
import { getAllBooksFromIDB } from '../utils/bookDB'
import { BookData } from '../utils/storage'
import ContextModal from './ContextModal'

interface SearchMatch {
  sentence: string
  index: number
}

interface SearchResult {
  book: BookData
  matches: SearchMatch[]
}

interface ContextPreview {
  book: BookData
  matchIndex: number
  keyword: string
}

interface SearchPanelProps {
  onOpenBook: (book: BookData, sentenceIndex: number) => void
}

// 高亮關鍵字
function HighlightedText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword.trim()) return <span>{text}</span>
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

// 書封漸層（與首頁保持一致）
function getBookGradient(title: string): string {
  const gradients = [
    'linear-gradient(160deg,#1a1a2e,#16213e)',
    'linear-gradient(160deg,#134e4a,#065f46)',
    'linear-gradient(160deg,#4a1d96,#6d28d9)',
    'linear-gradient(160deg,#7f1d1d,#b91c1c)',
    'linear-gradient(160deg,#78350f,#b45309)',
    'linear-gradient(160deg,#1e3a5f,#1d4ed8)',
    'linear-gradient(160deg,#831843,#be185d)',
    'linear-gradient(160deg,#1f2937,#374151)',
    'linear-gradient(160deg,#14532d,#166534)',
    'linear-gradient(160deg,#7c2d12,#c2410c)',
    'linear-gradient(160deg,#312e81,#4338ca)',
    'linear-gradient(160deg,#0c4a6e,#0369a1)',
  ]
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash)
  return gradients[Math.abs(hash) % gradients.length]
}

export default function SearchPanel({ onOpenBook }: SearchPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [books, setBooks] = useState<BookData[]>([])
  const [contextPreview, setContextPreview] = useState<ContextPreview | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && books.length === 0) getAllBooksFromIDB().then(setBooks)
  }, [isOpen, books.length])

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }, [isOpen])

  // ESC 關閉面板（只在沒有上下文預覽時生效；有預覽時由 ContextModal 自己處理 ESC）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !contextPreview) handleClose()
    }
    if (isOpen) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, contextPreview])

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    setLoading(true)
    setSearched(false)
    setContextPreview(null)
    await new Promise(r => setTimeout(r, 50))

    const allBooks = books.length > 0 ? books : await getAllBooksFromIDB()
    if (books.length === 0) setBooks(allBooks)

    const searchResults: SearchResult[] = allBooks
      .map(book => ({
        book,
        matches: book.sentences
          .map((sentence, index) => ({ sentence, index }))
          .filter(({ sentence }) => sentence.toLowerCase().includes(trimmed.toLowerCase()))
          .slice(0, 20),
      }))
      .filter(r => r.matches.length > 0)

    setResults(searchResults)
    setLoading(false)
    setSearched(true)
  }, [query, books])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleClose = () => {
    setIsOpen(false)
    setQuery('')
    setResults([])
    setSearched(false)
    setContextPreview(null)
  }

  // 點擊搜索結果 → 顯示上下文預覽
  const handleClickResult = (book: BookData, index: number) => {
    setContextPreview({ book, matchIndex: index, keyword: query })
  }

  // 從上下文預覽跳書
  const handleJumpFromContext = (index: number) => {
    if (!contextPreview) return
    onOpenBook(contextPreview.book, index)
    handleClose()
  }

  return (
    <>
      {/* 搜索按鈕 */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center space-x-1 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-full border border-gray-300 text-sm font-medium transition-colors"
        title="搜索書籍內容"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">搜索</span>
      </button>

      {/* 全屏搜索面板：Portal 渲染到 body，跳出 Reader header 的 transform containing block */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">

          {/* 頂部搜索欄 */}
          <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-4 flex items-center space-x-3 shadow-sm">
            <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索所有書籍的內容，例如：孔子、愛情、科技..."
              className="flex-1 text-base text-gray-900 placeholder-gray-400 bg-transparent outline-none"
            />
            {loading && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin flex-shrink-0" />}
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-full hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              搜索
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 結果區域 */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">

            {!searched && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
                <Search className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">輸入關鍵字，搜索所有書籍</p>
                <p className="text-sm mt-1 opacity-70">按 Enter 或點「搜索」開始</p>
              </div>
            )}

            {searched && results.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
                <BookOpen className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">找不到「{query}」的相關內容</p>
                <p className="text-sm mt-1 opacity-70">試試其他關鍵字</p>
              </div>
            )}

            {searched && results.length > 0 && (
              <>
                <p className="text-sm text-gray-500 mb-5">
                  在 <span className="font-semibold text-gray-800">{results.length}</span> 本書中找到「
                  <span className="font-semibold text-indigo-600">{query}</span>」
                  <span className="text-gray-400 ml-2">· 點擊句子可預覽上下文</span>
                </p>

                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                  {results.map(({ book, matches }) => {
                    const gradient = book.coverColor ?? getBookGradient(book.title)
                    return (
                      <div key={book.id} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden flex flex-col">
                        <div className="px-4 py-3 flex items-center justify-between" style={{ background: gradient }}>
                          <div className="flex items-center space-x-2 min-w-0">
                            <BookOpen className="w-4 h-4 text-white/80 flex-shrink-0" />
                            <h3 className="text-white text-sm font-semibold truncate">{book.title}</h3>
                          </div>
                          <span className="text-white/70 text-xs ml-2 flex-shrink-0">{matches.length} 處</span>
                        </div>

                        <div className="divide-y divide-gray-50 flex-1 overflow-y-auto max-h-72">
                          {matches.map(({ sentence, index }) => (
                            <button
                              key={index}
                              onClick={() => handleClickResult(book, index)}
                              className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors group flex items-start space-x-2"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">
                                  <HighlightedText text={sentence} keyword={query} />
                                </p>
                                <p className="text-xs text-gray-400 mt-1">第 {index + 1} 句</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 mt-0.5 transition-colors" />
                            </button>
                          ))}
                        </div>

                        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                          <button
                            onClick={() => handleClickResult(book, matches[0].index)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                          >
                            打開此書 →
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* 上下文預覽彈窗 */}
          {contextPreview && (
            <ContextModal
              sentences={contextPreview.book.sentences}
              bookTitle={contextPreview.book.title}
              bookGradient={contextPreview.book.coverColor ?? getBookGradient(contextPreview.book.title)}
              matchIndex={contextPreview.matchIndex}
              keyword={contextPreview.keyword}
              onClose={() => setContextPreview(null)}
              onJump={handleJumpFromContext}
            />
          )}
        </div>,
        document.body
      )}
    </>
  )
}
