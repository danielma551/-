// 【選字圖片彈窗】
// 用戶在閱讀時 highlight 文字後，顯示一個懸浮按鈕
// 點擊後去 Wikipedia 搜尋對應圖片 + 簡介，以卡片形式呈現
// 使用 Portal 渲染到 body，避免 transform 容器影響定位

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Image as ImageIcon, X, ExternalLink, Loader2 } from 'lucide-react'

interface ImageResult {
  title: string
  extract: string | null
  imageUrl: string | null
  lang?: string
}

interface FloatingBtn {
  x: number   // viewport 中心 X
  y: number   // viewport 頂端 Y（選取文字上方）
  query: string
}

export default function ImagePopup() {
  const [floatingBtn, setFloatingBtn] = useState<FloatingBtn | null>(null)
  const [result, setResult] = useState<ImageResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [cardPos, setCardPos] = useState<{ x: number; y: number } | null>(null)
  const fetchRef = useRef<AbortController | null>(null)

  // 監聽文字選取：mouseup / touchend
  useEffect(() => {
    const onSelect = () => {
      // 稍微延遲，讓瀏覽器完成選取
      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) return
        const text = sel.toString().trim()
        // 2–30 字才觸發（太短無意義，太長通常是整句）
        if (text.length < 2 || text.length > 30) return

        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        setFloatingBtn({
          x: rect.left + rect.width / 2,
          y: rect.top + window.scrollY,
          query: text,
        })
        setResult(null)
      }, 80)
    }

    // 點其他地方關閉
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-image-popup]')) {
        setFloatingBtn(null)
        setResult(null)
      }
    }

    document.addEventListener('mouseup', onSelect)
    document.addEventListener('touchend', onSelect)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('mouseup', onSelect)
      document.removeEventListener('touchend', onSelect)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [])

  // Escape 鍵關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setFloatingBtn(null); setResult(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 點擊懸浮按鈕：搜尋圖片
  const handleSearch = useCallback(async (btn: FloatingBtn) => {
    if (fetchRef.current) fetchRef.current.abort()
    const ctrl = new AbortController()
    fetchRef.current = ctrl

    setCardPos({ x: btn.x, y: btn.y })
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch(`/api/images?q=${encodeURIComponent(btn.query)}`, { signal: ctrl.signal })
      const data: ImageResult = await res.json()
      setResult(data)
    } catch {
      // 忽略 abort
    } finally {
      setLoading(false)
    }
  }, [])

  if (!floatingBtn) return null

  // 懸浮按鈕（選字後立刻顯示）
  const showCard = loading || result
  const btnX = Math.min(Math.max(floatingBtn.x, 60), window.innerWidth - 60)
  const btnY = floatingBtn.y - window.scrollY - 44

  return createPortal(
    <>
      {/* 懸浮「看圖」按鈕 */}
      {!showCard && (
        <button
          data-image-popup
          onClick={() => handleSearch(floatingBtn)}
          className="fixed z-[70] flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-white shadow-lg transition-all"
          style={{
            left: btnX,
            top: Math.max(btnY, 10),
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
          }}
        >
          <ImageIcon className="w-3 h-3" />
          看圖
        </button>
      )}

      {/* 結果卡片 */}
      {showCard && cardPos && (() => {
        const cx = Math.min(Math.max(cardPos.x, 200), window.innerWidth - 200)
        const cy = cardPos.y - window.scrollY - 8
        const cardH = result?.imageUrl ? 340 : 180
        const top = cy - cardH < 10 ? cy + 20 : cy - cardH

        return (
          <div
            data-image-popup
            className="fixed z-[70] w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{ left: cx, top, transform: 'translateX(-50%)' }}
          >
            {/* 標頭 */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <span className="text-sm font-semibold text-gray-600 truncate max-w-[280px]">
                {loading ? '搜尋中…' : result?.title ?? floatingBtn.query}
              </span>
              <button
                data-image-popup
                onClick={() => { setFloatingBtn(null); setResult(null) }}
                className="ml-2 flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 載入中 */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              </div>
            )}

            {/* 結果 */}
            {result && !loading && (
              <>
                {result.imageUrl ? (
                  <img
                    src={result.imageUrl}
                    alt={result.title}
                    className="w-full object-cover"
                    style={{ maxHeight: 220 }}
                  />
                ) : (
                  <div className="mx-5 mb-2 h-16 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300 text-xs">
                    找不到相關圖片
                  </div>
                )}

                {result.extract && (
                  <p className="px-5 py-3 text-sm text-gray-500 leading-relaxed line-clamp-4">
                    {result.extract}
                  </p>
                )}

                {/* Wikipedia 連結 */}
                <div className="px-5 pb-4">
                  <a
                    href={`https://${result.lang ?? 'zh'}.wikipedia.org/wiki/${encodeURIComponent(result.title ?? floatingBtn.query)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-image-popup
                    className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-600 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Wikipedia
                  </a>
                </div>
              </>
            )}
          </div>
        )
      })()}
    </>,
    document.body
  )
}
