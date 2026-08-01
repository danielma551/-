'use client'

// 【快速加筆記收集頁】/add?text=...&source=...
// 用途：喺任何網站（例如 Claude 對話）揀選文字後，經書籤小工具（bookmarklet）
// 開呢一頁，自動把文字加入你嘅筆記（同一網域 localStorage，即刻入温習循環）。
// 手機：直接開 /add，貼上文字再撳加入。

import { useEffect, useRef, useState } from 'react'
import { reviewStorage } from '../utils/storage'

export default function AddNotePage() {
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [status, setStatus] = useState<'idle' | 'added' | 'dup'>('idle')
  const [isPopup, setIsPopup] = useState(false)
  const autoAdded = useRef(false)

  // 讀 URL 參數，若帶 text 就自動加入
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = (p.get('text') || '').trim()
    const s = (p.get('source') || 'Claude 對話').trim()
    setSource(s)
    setIsPopup(!!window.opener)
    if (t && !autoAdded.current) {
      autoAdded.current = true
      setText(t)
      const added = reviewStorage.addMany([t], s)
      setStatus(added > 0 ? 'added' : 'dup')
      // 彈窗模式：加完短暫顯示再自動關閉
      if (window.opener) setTimeout(() => window.close(), 1400)
    }
  }, [])

  const addManual = () => {
    const t = text.trim()
    if (!t) return
    const added = reviewStorage.addMany([t], source || '手動筆記')
    setStatus(added > 0 ? 'added' : 'dup')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-emerald-50 to-white">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-emerald-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">📝</span>
          <h1 className="text-lg font-bold text-gray-800">加入筆記</h1>
          {source && <span className="ml-auto text-xs text-gray-400">來源：{source}</span>}
        </div>

        {status === 'added' && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
            ✓ 已加入筆記，即刻進入温習循環！{isPopup && ' 視窗即將自動關閉…'}
          </div>
        )}
        {status === 'dup' && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
            呢條筆記已經存在。
          </div>
        )}

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addManual() } }}
          placeholder="貼上或輸入筆記…（⌘/Ctrl + Enter 加入）"
          rows={6}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none focus:border-emerald-400 resize-none leading-relaxed"
        />

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={addManual}
            disabled={!text.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40"
          >
            加入筆記
          </button>
          <a
            href="/"
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200"
          >
            返書架
          </a>
        </div>

        <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
          小提示：喺 Claude 對話揀選文字後撳「加到筆記」書籤，就會自動彈到呢一頁並加入。
        </p>
      </div>
    </main>
  )
}
