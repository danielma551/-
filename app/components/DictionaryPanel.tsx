// 【查詞面板】
// 這個文件負責：閱讀時右上角的「查詞」按鈕和彈出面板。
// 用戶輸入想查的詞語，從現代漢語詞典 MOBI 文件中取得解釋並顯示。

'use client'

import { useState, useRef, useEffect } from 'react'
import { BookOpen, X, Search, Loader2 } from 'lucide-react'

export default function DictionaryPanel() {
  // 面板開關狀態
  const [isOpen, setIsOpen] = useState(false)
  // 用戶輸入的查詢詞語
  const [query, setQuery] = useState('')
  // 從 API 取得的解釋文字
  const [definition, setDefinition] = useState<string | null>(null)
  // 找不到詞語時的提示訊息
  const [notFound, setNotFound] = useState<string | null>(null)
  // 載入中狀態
  const [loading, setLoading] = useState(false)
  // 錯誤訊息
  const [error, setError] = useState<string | null>(null)
  // 輸入框的 ref，用於自動聚焦
  const inputRef = useRef<HTMLInputElement>(null)

  // 面板打開時自動聚焦輸入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // 查詞函數：呼叫 /api/dict 取得解釋
  const lookup = async (word: string) => {
    const trimmed = word.trim()
    if (!trimmed) return

    setLoading(true)
    setDefinition(null)
    setNotFound(null)
    setError(null)

    try {
      const res = await fetch(`/api/dict?word=${encodeURIComponent(trimmed)}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '查詢失敗')
      } else if (data.definition) {
        setDefinition(data.definition)
      } else {
        setNotFound(data.message ?? `找不到「${trimmed}」`)
      }
    } catch {
      setError('網絡錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  // 按 Enter 觸發查詢
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') lookup(query)
  }

  // 關閉面板並清空狀態
  const handleClose = () => {
    setIsOpen(false)
    setQuery('')
    setDefinition(null)
    setNotFound(null)
    setError(null)
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

      {/* 查詞面板 */}
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 z-40"
            onClick={handleClose}
          />

          {/* 面板本體 */}
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50">
            {/* 標題列 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-800">現代漢語詞典</h3>
              </div>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 搜索輸入框 */}
            <div className="p-4">
              <div className="flex items-center space-x-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="輸入詞語查詢..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={() => lookup(query)}
                  disabled={loading || !query.trim()}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              <div className="px-4 pb-4 max-h-64 overflow-y-auto">
                {/* 找到解釋 */}
                {definition && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                    <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                      {definition}
                    </p>
                  </div>
                )}
                {/* 找不到詞語 */}
                {notFound && (
                  <p className="text-gray-500 text-sm text-center py-2">{notFound}</p>
                )}
                {/* 錯誤訊息 */}
                {error && (
                  <p className="text-red-500 text-sm text-center py-2">{error}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
