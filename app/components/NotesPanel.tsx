'use client'

// 【筆記】— 喺自己網站加筆記 + 瀏覽／搜尋／刪除（取代舊「每日温習」彈窗）
// 加入嘅筆記即刻進入温習循環（「開始温習」揭書時會抽到）。

import { useState } from 'react'
import { X, Wand2, Trash2, Search, Plus, BookText } from 'lucide-react'
import { reviewStorage, ReviewNote } from '../utils/storage'

interface Props {
  onClose: () => void
}

function fmtCreated(ts?: number): string {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('zh-TW', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export default function NotesPanel({ onClose }: Props) {
  const [notes, setNotes] = useState<ReviewNote[]>(() => reviewStorage.getAll())
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = () => setNotes(reviewStorage.getAll())
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2000) }

  const addNote = () => {
    const text = input.trim()
    if (!text) return
    const added = reviewStorage.addMany([text], '手動筆記')
    setInput('')
    refresh()
    flash(added > 0 ? '已加入筆記 📝' : '呢條筆記已存在')
  }
  const deleteNote = (id: string) => {
    reviewStorage.remove(id); reviewStorage.sessionRemove(id)
    refresh()
  }
  const cleanup = () => {
    const removed = reviewStorage.cleanupJunk()
    reviewStorage.resumeOrStartDaily()
    refresh()
    flash(removed > 0 ? `已清理 ${removed} 張雜項卡 🧹` : '冇雜項卡需要清理 ✨')
  }

  const q = query.trim().toLowerCase()
  const shown = q
    ? notes.filter(n => `${n.text} ${n.source || ''} ${n.meta || ''}`.toLowerCase().includes(q))
    : notes

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-8"
        style={{ animation: 'panel-in 200ms cubic-bezier(0.23,1,0.32,1) both' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 標題列 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-[42px] h-[42px] rounded-[13px] flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(150deg,#34d399,#059669)', boxShadow: '0 6px 16px rgba(5,150,105,.32)' }}>
              <BookText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800 leading-none">筆記</h2>
              <p className="text-xs text-gray-400 mt-1.5">共 {notes.length} 張 · 加入即入温習循環</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={cleanup}
              title="一鍵清理：移除純時間戳／metadata 等雜項卡"
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-[10px] transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">清理</span>
            </button>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-[10px] transition-colors">
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {msg && (
          <div className="px-6 pt-3 -mb-1">
            <div className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{msg}</div>
          </div>
        )}

        <div className="px-6 py-4">
          {/* ✍️ 加新筆記 */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 mb-4">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addNote() } }}
              placeholder="寫低你嘅諗法／筆記…（⌘/Ctrl + Enter 快速加入）"
              rows={3}
              className="w-full bg-transparent text-sm outline-none resize-none leading-relaxed placeholder:text-gray-400"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-gray-400">加入後即刻進入温習循環</span>
              <button
                onClick={addNote}
                disabled={!input.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" /> 加入筆記
              </button>
            </div>
          </div>

          {/* 🔍 瀏覽／搜尋 */}
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜尋筆記（內容 / 來源 / 標籤）"
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-2">共 {notes.length} 張{q ? `，符合 ${shown.length} 張` : ''}</p>
          <div className="max-h-[46vh] overflow-y-auto divide-y divide-gray-100 border-y border-gray-100">
            {shown.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">{q ? '冇符合嘅筆記' : '仲未有筆記，喺上面寫低第一條啦 ✍️'}</p>}
            {shown.map(n => (
              <div key={n.id} className="group flex items-start gap-3 py-3 px-1">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.text}</span>
                  <span className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                    {n.source && <span className="truncate">📖 {n.source}</span>}
                    <span className="flex-shrink-0">{fmtCreated(n.createdAt)}</span>
                  </span>
                </span>
                <button
                  onClick={() => deleteNote(n.id)}
                  title="刪除呢張筆記"
                  className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
