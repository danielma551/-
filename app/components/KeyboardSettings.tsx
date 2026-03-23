// 【快捷鍵設定】
// 這個文件負責：閱讀時右上角的「快捷鍵」設定彈出框。
// 可以自訂「下一句」「上一句」「返回首頁」各用哪個鍵：
// 點「設定」按鈕，再按下你想用的鍵，就錄好了。設定會自動記住。

'use client'

import { useState, useEffect } from 'react'
import { Keyboard, X, Check } from 'lucide-react'

export interface KeyboardShortcuts {
  nextSentence: string
  previousSentence: string
  returnHome: string
}

export const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  nextSentence: 'ArrowRight',
  previousSentence: 'ArrowLeft',
  returnHome: 'Escape'
}

interface KeyboardSettingsProps {
  shortcuts: KeyboardShortcuts
  onSave: (shortcuts: KeyboardShortcuts) => void
}

const KEY_DISPLAY_NAMES: Record<string, string> = {
  'ArrowRight': '→ 右箭頭',
  'ArrowLeft': '← 左箭頭',
  'ArrowUp': '↑ 上箭頭',
  'ArrowDown': '↓ 下箭頭',
  'Space': '空格鍵',
  'Enter': 'Enter',
  'Escape': 'Esc',
  'Tab': 'Tab',
  'Backspace': 'Backspace',
}

export default function KeyboardSettings({ shortcuts, onSave }: KeyboardSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingShortcuts, setEditingShortcuts] = useState(shortcuts)
  const [recordingKey, setRecordingKey] = useState<keyof KeyboardShortcuts | null>(null)

  useEffect(() => {
    setEditingShortcuts(shortcuts)
  }, [shortcuts])

  const handleKeyPress = (e: KeyboardEvent) => {
    if (!recordingKey) return
    
    e.preventDefault()
    e.stopPropagation()

    const key = e.key
    setEditingShortcuts(prev => ({
      ...prev,
      [recordingKey]: key
    }))
    setRecordingKey(null)
  }

  useEffect(() => {
    if (recordingKey) {
      window.addEventListener('keydown', handleKeyPress)
      return () => window.removeEventListener('keydown', handleKeyPress)
    }
  }, [recordingKey])

  const handleSave = () => {
    onSave(editingShortcuts)
    setIsOpen(false)
  }

  const handleReset = () => {
    setEditingShortcuts(DEFAULT_SHORTCUTS)
  }

  const getKeyDisplayName = (key: string): string => {
    return KEY_DISPLAY_NAMES[key] || key.toUpperCase()
  }

  const shortcutLabels: Record<keyof KeyboardShortcuts, string> = {
    nextSentence: '下一句',
    previousSentence: '上一句',
    returnHome: '返回首頁'
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Keyboard className="w-5 h-5 text-gray-600" />
        <span className="text-sm text-gray-700">快捷鍵</span>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <Keyboard className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">自定義快捷鍵</h3>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {(Object.keys(editingShortcuts) as Array<keyof KeyboardShortcuts>).map((key) => (
                  <div key={key} className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      {shortcutLabels[key]}
                    </label>
                    <button
                      onClick={() => setRecordingKey(key)}
                      className={`w-full px-4 py-3 border-2 rounded-lg text-left transition-all ${
                        recordingKey === key
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {recordingKey === key ? (
                        <span className="text-indigo-600 font-medium animate-pulse">
                          按下任意鍵...
                        </span>
                      ) : (
                        <span className="text-gray-800 font-medium">
                          {getKeyDisplayName(editingShortcuts[key])}
                        </span>
                      )}
                    </button>
                  </div>
                ))}

                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-4">
                    💡 點擊按鈕後按下您想要的鍵來設定快捷鍵
                  </p>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleReset}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      重置為默認
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2"
                    >
                      <Check className="w-4 h-4" />
                      <span>保存</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
