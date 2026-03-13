'use client'

import { useState } from 'react'
import { Target, X } from 'lucide-react'

interface GoalModalProps {
  onSetGoal: (goal: number) => void
  onSkip: () => void
  maxSentences: number
}

export default function GoalModal({ onSetGoal, onSkip, maxSentences }: GoalModalProps) {
  const [goalInput, setGoalInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const goal = parseInt(goalInput)
    if (goal > 0 && goal <= maxSentences) {
      onSetGoal(goal)
    }
  }

  const quickGoals = [10, 20, 50, 100].filter(n => n <= maxSentences)

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
            onClick={onSkip}
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

          <div className="grid grid-cols-4 gap-2">
            {quickGoals.map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => onSetGoal(goal)}
                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium"
              >
                {goal}
              </button>
            ))}
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
