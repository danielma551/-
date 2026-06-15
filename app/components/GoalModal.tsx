// 【目標設定彈出框】
// 這個文件負責：開始讀一本新書時，彈出的小視窗。
// 問你「今天要讀幾句？」，可以輸數字或選快速選項，也可以跳過。
// 達到目標後，進度條會變綠色并自動回到首頁。
// 會記住最近 4 次的目標數量，下次打開自動顯示為快速按鈕

'use client'

import { useState } from 'react'
import { Target, X, History } from 'lucide-react'
import { getMonsters, saveMonsterGoals, monsterForGoal, xpForGoal, Monster } from '../utils/gamify'

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

  // 怪物列表（含用戶自訂句數）+ 自訂編輯模式
  const [monsters, setMonsters] = useState<Monster[]>(() => getMonsters())
  const [editingMonsters, setEditingMonsters] = useState(false)
  const [editVals, setEditVals] = useState<Record<string, string>>({})

  // 進入編輯：帶入現有數值；完成編輯：驗證 + 儲存
  const toggleEditMonsters = () => {
    if (!editingMonsters) {
      const vals: Record<string, string> = {}
      monsters.forEach(m => { vals[m.id] = String(m.hp) })
      setEditVals(vals)
      setEditingMonsters(true)
    } else {
      const goals: Record<string, number> = {}
      monsters.forEach(m => {
        const n = parseInt(editVals[m.id])
        goals[m.id] = Number.isFinite(n) && n >= 1 ? n : m.hp   // 無效輸入就保留原值
      })
      saveMonsterGoals(goals)
      setMonsters(getMonsters())
      setEditingMonsters(false)
    }
  }

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
          今天想要閱讀多少句？目標越大，怪物越強，獎勵越多！
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 召喚今日怪物：點怪物卡直接開戰；✏️ 自訂每隻怪嘅句數 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                召喚今日怪物
              </label>
              <button
                type="button"
                onClick={toggleEditMonsters}
                className={`text-xs font-medium transition-colors ${editingMonsters ? 'text-green-600 hover:text-green-700' : 'text-indigo-500 hover:text-indigo-700'}`}
              >
                {editingMonsters ? '✓ 完成並儲存' : '✏️ 自訂句數'}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {monsters.map((m) => {
                const disabled = !editingMonsters && m.hp > maxSentences
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (editingMonsters) return   // 編輯緊：唔開戰
                      setGoalInput(String(m.hp))
                      handleConfirm(m.hp)
                    }}
                    className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${editingMonsters ? 'border-indigo-200 bg-indigo-50/50 cursor-default' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
                    title={editingMonsters ? '輸入呢隻怪物嘅目標句數' : disabled ? `這本書只有 ${maxSentences} 句` : `目標 ${m.hp} 句 · 擊敗得 ${m.xp} XP`}
                  >
                    <span className="text-2xl leading-none">{m.emoji}</span>
                    <span className="text-xs font-semibold text-gray-700 mt-1">{m.name}</span>
                    {editingMonsters ? (
                      <input
                        type="number"
                        min={1}
                        value={editVals[m.id] ?? ''}
                        onChange={e => setEditVals(v => ({ ...v, [m.id]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        className="w-14 text-center text-xs border border-indigo-300 rounded-md px-1 py-0.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    ) : (
                      <span className="text-[10px] text-gray-400">{m.hp} 句</span>
                    )}
                    <span className="text-[10px] font-semibold text-indigo-500">⚡ +{m.xp}</span>
                  </button>
                )
              })}
            </div>
            {editingMonsters && (
              <p className="text-xs text-gray-400 mt-2">輸入每隻怪物嘅目標句數，撳「✓ 完成並儲存」生效（下次召喚都會記住）</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              自訂句子數量 (最多 {maxSentences} 句)
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
            {/* 即時預覽：自訂數字會召喚邊隻怪物 */}
            {goalInput && parseInt(goalInput) > 0 && (() => {
              const goal = parseInt(goalInput)
              const m = monsterForGoal(goal)
              const xp = xpForGoal(goal)
              return (
                <p className="text-xs text-gray-500 mt-2">
                  本次召喚：{m.emoji} <span className="font-semibold">{m.name}</span> · 擊敗可得 <span className="text-indigo-600 font-semibold">⚡ {xp} XP</span>
                </p>
              )
            })()}
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
