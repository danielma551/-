// 【查詞面板】
// 支援查中文詞語（現代漢語詞典）和英文單詞（Free Dictionary API）
// 用戶輸入後按 Enter 或點搜索按鈕觸發查詢

'use client'

import { useState, useRef, useEffect } from 'react'
import { BookOpen, X, Search, Loader2 } from 'lucide-react'

export default function DictionaryPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [definition, setDefinition] = useState<string | null>(null)
  const [source, setSource] = useState<'mobi' | 'en-api' | null>(null)
  const [notFound, setNotFound] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const lookup = async (word: string) => {
    const trimmed = word.trim()
    if (!trimmed) return

    setLoading(true)
    setDefinition(null)
    setNotFound(null)
    setError(null)
    setSource(null)

    try {
      const res = await fetch(`/api/dict?word=${encodeURIComponent(trimmed)}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '查詢失敗')
      } else if (data.definition) {
        setDefinition(data.definition)
        setSource(data.source ?? null)
      } else {
        setNotFound(data.message ?? `找不到「${trimmed}」`)
      }
    } catch {
      setError('網絡錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') lookup(query)
  }

  const handleClose = () => {
    setIsOpen(false)
    setQuery('')
    setDefinition(null)
    setNotFound(null)
    setError(null)
    setSource(null)
  }

  // 將純文字定義渲染成帶格式的段落
  const renderDefinition = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim())
    return lines.map((line, i) => {
      // 第一行：詞條標題（加粗）
      if (i === 0) {
        return (
          <p key={i} className="font-bold text-gray-900 text-base mb-1">
            {line}
          </p>
        )
      }
      // 【詞性】標記
      if (/^【.+】$/.test(line.trim())) {
        return (
          <p key={i} className="text-indigo-700 font-semibold text-xs mt-2 mb-0.5">
            {line.trim()}
          </p>
        )
      }
      // 釋義列表項（• 開頭）
      if (line.trim().startsWith('•')) {
        return (
          <p key={i} className="text-gray-800 text-sm leading-relaxed pl-2">
            {line.trim()}
          </p>
        )
      }
      // 例句（e.g. 開頭）
      if (line.trim().startsWith('e.g.')) {
        return (
          <p key={i} className="text-gray-500 text-xs italic pl-4 mb-0.5">
            {line.trim()}
          </p>
        )
      }
      // 普通行
      return (
        <p key={i} className="text-gray-800 text-sm leading-relaxed">
          {line}
        </p>
      )
    })
  }

  return (
    <div className="relative">
      {/* 查詞按鈕 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1 px-2 sm:px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        title="查詞"
      >
        <BookOpen className="w-5 h-5" />
        <span className="hidden sm:inline text-sm">查詞</span>
      </button>

      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div className="fixed inset-0 z-40" onClick={handleClose} />

          {/* 面板本體 */}
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50">
            {/* 標題列 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <h3 className="font-semibold text-gray-800 text-sm">查詞典</h3>
                <span className="text-xs text-gray-400">中文 / English</span>
              </div>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 搜索輸入框 */}
            <div className="p-3">
              <div className="flex items-center space-x-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="輸入中文詞語或英文單詞..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={() => lookup(query)}
                  disabled={loading || !query.trim()}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* 查詢結果區域 */}
            {(definition || notFound || error) && (
              <div className="px-3 pb-3 max-h-72 overflow-y-auto">
                {definition && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-0.5">
                    {renderDefinition(definition)}
                    {/* 來源標籤 */}
                    <p className="text-xs text-gray-400 mt-2 pt-1 border-t border-amber-100">
                      {source === 'mobi' ? '📖 現代漢語詞典' : '🌐 Free Dictionary'}
                    </p>
                  </div>
                )}
                {notFound && (
                  <div className="text-center py-4">
                    <p className="text-gray-500 text-sm">{notFound}</p>
                    <p className="text-gray-400 text-xs mt-1">試試檢查拼寫或查詞根</p>
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* 空狀態提示 */}
            {!definition && !notFound && !error && !loading && (
              <div className="px-3 pb-4 text-center">
                <p className="text-gray-400 text-xs">輸入詞語按 Enter 查詢</p>
                <p className="text-gray-300 text-xs mt-0.5">中文 → 現代漢語詞典 ｜ English → Online</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
