'use client'

// 【每日温習】— 本機筆記閃卡（間隔重溫 SRS）
// 卡片來源：閱讀時㩒「＋ / 寄去 Flomo」時自動存到本機。
// 操作：記得了（升格、拉長間隔）／要再温（歸零、本節稍後再出現）。

import { useState } from 'react'
import { X, Check, RotateCcw, Trash2, BookOpen, Sparkles } from 'lucide-react'
import { reviewStorage, ReviewNote } from '../utils/storage'

interface Props {
  onClose: () => void
}

const DAILY_CAP = 50   // 每節最多温習張數，避免一次過太多

export default function ReviewCards({ onClose }: Props) {
  const allDue = reviewStorage.dueToday()
  const [queue, setQueue] = useState<ReviewNote[]>(() => allDue.slice(0, DAILY_CAP))
  const [pos, setPos] = useState(0)
  const [doneCount, setDoneCount] = useState(0)
  const sessionTotal = Math.min(allDue.length, DAILY_CAP)
  const totalNotes = reviewStorage.stats().total

  const card = queue[pos]
  const finished = !card && queue.length > 0
  const empty = queue.length === 0

  const known = () => {
    if (!card) return
    reviewStorage.markKnown(card.id)
    setDoneCount(c => c + 1)
    setPos(p => p + 1)
  }
  const again = () => {
    if (!card) return
    reviewStorage.markAgain(card.id)
    setQueue(q => [...q, card])   // 本節稍後再出現
    setPos(p => p + 1)
  }
  const del = () => {
    if (!card) return
    reviewStorage.remove(card.id)
    setQueue(q => { const nq = [...q]; nq.splice(pos, 1); return nq })
    // pos 不變：下一張會頂上來
  }

  const progress = sessionTotal > 0 ? Math.min(100, Math.round((doneCount / sessionTotal) * 100)) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500" />
            <div>
              <h2 className="text-base font-semibold text-gray-800">每日温習</h2>
              <p className="text-xs text-gray-400 mt-0.5">間隔重溫 · 共 {totalNotes} 張筆記</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 進度條 */}
        {!empty && (
          <div className="px-6 pt-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
              <span>進度 {doneCount}/{sessionTotal}</span>
              <span>剩 {Math.max(0, queue.length - pos)} 張</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* 內容 */}
        <div className="px-6 py-8 min-h-[280px] flex flex-col items-center justify-center">
          {empty && (
            <div className="text-center">
              <div className="text-5xl mb-4">🌱</div>
              <p className="text-gray-700 font-medium mb-1">今日冇卡要温習</p>
              <p className="text-sm text-gray-400">閱讀時㩒「＋ / 寄去 Flomo」就會自動儲存做温習卡片。</p>
              {totalNotes > 0 && <p className="text-xs text-gray-400 mt-2">（你總共有 {totalNotes} 張卡，已全部温習到期外）</p>}
            </div>
          )}

          {finished && (
            <div className="text-center">
              <div className="text-5xl mb-4">🎉</div>
              <p className="text-gray-700 font-medium mb-1">今日温習完成！</p>
              <p className="text-sm text-gray-400">温咗 {doneCount} 張，明天再見 👋</p>
              <button onClick={onClose} className="mt-5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">完成</button>
            </div>
          )}

          {card && (
            <div className="w-full">
              {card.source && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3 justify-center">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="truncate max-w-xs">{card.source}</span>
                </div>
              )}
              <div className="bg-gradient-to-br from-emerald-50 to-indigo-50 border border-gray-100 rounded-xl px-6 py-8 min-h-[140px] flex items-center justify-center">
                <p className="text-lg leading-relaxed text-gray-800 text-center whitespace-pre-wrap">{card.text}</p>
              </div>
              <div className="flex items-center justify-center mt-3">
                <button onClick={del} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> 刪除呢張
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 操作按鈕 */}
        {card && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={again}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> 要再温
            </button>
            <button
              onClick={known}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 font-medium transition-colors"
            >
              <Check className="w-4 h-4" /> 記得了
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
