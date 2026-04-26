// 【上下文預覽彈窗】（共用組件）
// 被 SearchPanel 和 Reader 兩處搜索功能共同使用
// 顯示命中句前後各 N 句，連成段落，命中句高亮
// 底部有「返回」和「跳到此處閱讀」兩個按鈕

'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, BookOpen, ArrowLeft, ExternalLink } from 'lucide-react'

interface ContextModalProps {
  sentences: string[]       // 書的所有句子
  bookTitle: string         // 書名（顯示在標頭）
  bookGradient?: string     // 書封漸層色（可選，預設深灰）
  matchIndex: number        // 命中句在 sentences 中的索引
  keyword: string           // 搜索關鍵字（用於高亮）
  contextSize?: number      // 前後各幾句，預設 5
  onClose: () => void       // 關閉彈窗
  onJump: (index: number) => void  // 跳到指定句子
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

export default function ContextModal({
  sentences,
  bookTitle,
  bookGradient = 'linear-gradient(160deg,#1f2937,#374151)',
  matchIndex,
  keyword,
  contextSize = 5,
  onClose,
  onJump,
}: ContextModalProps) {
  const start = Math.max(0, matchIndex - contextSize)
  const end = Math.min(sentences.length - 1, matchIndex + contextSize)
  const contextSentences = sentences.slice(start, end + 1)

  // ESC 關閉
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Portal 渲染到 document.body，跳出任何 transform 的 containing block 影響
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      {/* 卡片本體 */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 標頭 */}
        <div
          className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{ background: bookGradient }}
        >
          <div className="flex items-center space-x-2 min-w-0">
            <BookOpen className="w-4 h-4 text-white/80 flex-shrink-0" />
            <span className="text-white text-sm font-semibold truncate">{bookTitle}</span>
          </div>
          <button onClick={onClose} className="p-1 text-white/70 hover:text-white transition-colors flex-shrink-0 ml-3">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 標籤行 */}
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-500">
            第 {start + 1}–{end + 1} 句　·　命中：第 {matchIndex + 1} 句
          </p>
        </div>

        {/* 段落呈現 */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <p className="text-sm text-gray-500 leading-8 text-justify">
            {contextSentences.map((sentence, i) => {
              const absIndex = start + i
              const isMatch = absIndex === matchIndex
              if (isMatch) {
                return (
                  <span
                    key={absIndex}
                    className="bg-indigo-50 border border-indigo-200 text-gray-900 font-medium rounded-md px-1 mx-0.5"
                  >
                    <HighlightedText text={sentence} keyword={keyword} />
                  </span>
                )
              }
              return <span key={absIndex}>{sentence}</span>
            })}
          </p>
        </div>

        {/* 底部操作列 */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回</span>
          </button>
          <button
            onClick={() => onJump(matchIndex)}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>跳到此處閱讀</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
