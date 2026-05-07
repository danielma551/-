// 【目標設定彈出框】
// 這個文件負責：開始讀一本新書時，彈出的小視窗。
// 問你「今天要讀幾句？」，可以輸數字或選快速選項，也可以跳過。
// 達到目標後，進度條會變綠色并自動回到首頁。
// 會記住最近 4 次的目標數量，下次打開自動顯示為快速按鈕

'use client'

import { useState } from 'react'
import { Target, X, History } from 'lucide-react'

const HISTORY_KEY = 'reading-goal-history'
const MAX_HISTORY = 4

// 從 localStorage 讀取最近的目標歷史，最新的在前
function loadHistory(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// 把新目標存入歷史，去重後只保留最新 MAX_HISTORY 筆
function saveToHistory(goal: number) {
  const prev = loadHistory().filter(n => n !== goal)
  const next = [goal, ...prev].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
}

interface GoalModalProps {
  onSetGoal: (goal: number) => void
  onSkip: () => void
  onCancel: () => void   // 純關閉，不進入閱讀
  maxSentences: number
}

export default function GoalModal({ onSetGoal, onSkip, onCancel, maxSentences }: GoalModalProps) {
  // 歷史記錄，首次渲染時從 localStorage 讀取
  const [history] = useState<number[]>(() => loadHistory())

  // 預填最近一次的目標；若無歷史則留空
  const [goalInput, setGoalInput] = useState<string>(
    () => {
      const last = loadHistory()[0]
      return last ? String(last) : ''
    }
  )

  // 攔截 onSetGoal，先存歷史再通知父層
  const handleConfirm = (goal: number) => {
    saveToHistory(goal)
    onSetGoal(goal)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const goal = parseInt(goalInput)
    if (goal > 0 && goal <= maxSentences) {
      handleConfirm(goal)
    }
  }

  // 快速按鈕：有歷史優先顯示歷史，否則顯示預設值
  const fallback = [10, 20, 50, 100].filter(n => n <= maxSentences)
  const quickGoals = history.length > 0
    ? history.filter(n => n <= maxSentences)
    : fallback

  const hasHistory = history.length > 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
              <Target className="w-6 h-6 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">設定閱讀目標</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <p className="text-gray-600 mb-6">
          今天想要閱讀多少句？設定目標讓閱讀更有動力！
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              句子數量 (最多 {maxSentences} 句)
            </label>
            <input
              type="number"
              min="1"
              max={maxSentences}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="輸入數字..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              autoFocus
            />
          </div>

          {/* 快速選項：有歷史時顯示「最近」標籤 */}
          <div>
            {hasHistory && (
              <div className="flex items-center gap-1 mb-2">
                <History className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400">最近使用</span>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              {quickGoals.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => {
                    setGoalInput(String(goal))
                    handleConfirm(goal)
                  }}
                  className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium"
                >
                  {goal}
                </button>
              ))}
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={!goalInput || parseInt(goalInput) <= 0}
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              開始閱讀
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              跳過
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
