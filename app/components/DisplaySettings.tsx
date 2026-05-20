// 【顯示設定面板】
// 這個文件負責：頁面上的「顯示」設定彈出框。
// 可以調整的東西：
//   - 字體大小（拉桿調大調小）
//   - 背景和文字顏色（8 種預設主題 + 自己選色）
//   - 進度條顏色
//   - 震動強度（拉到 0 就關閉，拉大震動越明顯，拉了即時生效）
// 所有設定都會自動記住，下次打開還是一樣。

'use client'

import { useState, useEffect } from 'react'
import { Settings, X, Check } from 'lucide-react'

export type VibrationPattern = 'off' | 'crisp' | 'gentle' | 'standard' | 'strong' | 'double'

export const VIBRATION_PRESETS: Record<VibrationPattern, { label: string; pattern: number[] | 0; desc: string }> = {
  off:      { label: '關閉',  pattern: 0,             desc: '無震動' },
  crisp:    { label: '清脆',  pattern: [12],          desc: '12ms，類似按鍵感' },
  gentle:   { label: '輕柔',  pattern: [28],          desc: '28ms 輕拍' },
  standard: { label: '標準',  pattern: [60],          desc: '60ms 一般震動' },
  strong:   { label: '強烈',  pattern: [120],         desc: '120ms 重震' },
  double:   { label: '雙擊',  pattern: [12, 30, 12],  desc: '兩下短震，有節奏感' },
}

export interface DisplaySettings {
  fontSize: number
  backgroundColor: string
  textColor: string
  progressColor: string
  vibrationIntensity: number
  vibrationPattern: VibrationPattern
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fontSize: 32,
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  progressColor: '#6366f1',
  vibrationIntensity: 60,
  vibrationPattern: 'standard',
}

interface DisplaySettingsProps {
  settings: DisplaySettings
  onSave: (settings: DisplaySettings) => void
}

const PRESET_BACKGROUNDS = [
  { name: '白色', color: '#ffffff', textColor: '#1f2937' },
  { name: '米黃', color: '#fef3c7', textColor: '#1f2937' },
  { name: '淺綠', color: '#d1fae5', textColor: '#1f2937' },
  { name: '淺藍', color: '#dbeafe', textColor: '#1f2937' },
  { name: '淺灰', color: '#f3f4f6', textColor: '#1f2937' },
  { name: '深灰', color: '#374151', textColor: '#f9fafb' },
  { name: '黑色', color: '#1f2937', textColor: '#f9fafb' },
  { name: '護眼綠', color: '#c7edcc', textColor: '#1f2937' },
]

export default function DisplaySettings({ settings, onSave }: DisplaySettingsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingSettings, setEditingSettings] = useState(settings)
  const [vibrateResult, setVibrateResult] = useState<'idle' | 'ok' | 'unsupported'>('idle')

  useEffect(() => {
    setEditingSettings(settings)
  }, [settings])

  const handleSave = () => {
    onSave(editingSettings)
    setIsOpen(false)
  }

  const handleReset = () => {
    setEditingSettings(DEFAULT_DISPLAY_SETTINGS)
  }

  const handlePresetClick = (preset: typeof PRESET_BACKGROUNDS[0]) => {
    setEditingSettings(prev => ({
      ...prev,
      backgroundColor: preset.color,
      textColor: preset.textColor
    }))
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Settings className="w-5 h-5 text-gray-600" />
        <span className="text-sm text-gray-700">顯示</span>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <Settings className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">顯示設定</h3>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Font Size */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    字體大小
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="range"
                      min="16"
                      max="180"
                      step="2"
                      value={editingSettings.fontSize}
                      onChange={(e) => setEditingSettings(prev => ({
                        ...prev,
                        fontSize: parseInt(e.target.value)
                      }))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="text-lg font-semibold text-gray-800 w-16 text-right">
                      {editingSettings.fontSize}px
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>小</span>
                    <span>大</span>
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    預覽
                  </label>
                  <div 
                    className="p-6 rounded-lg border-2 border-gray-200 min-h-[120px] flex items-center justify-center"
                    style={{ 
                      backgroundColor: editingSettings.backgroundColor,
                      color: editingSettings.textColor
                    }}
                  >
                    <p style={{ fontSize: `${editingSettings.fontSize}px` }}>
                      這是預覽文字
                    </p>
                  </div>
                </div>

                {/* Background Color Presets */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    背景顏色
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {PRESET_BACKGROUNDS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => handlePresetClick(preset)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          editingSettings.backgroundColor === preset.color
                            ? 'border-indigo-500 ring-2 ring-indigo-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        style={{ backgroundColor: preset.color }}
                      >
                        <div className="text-xs font-medium" style={{ color: preset.textColor }}>
                          {preset.name}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Colors */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    自定義顏色
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-2">背景色</label>
                      <input
                        type="color"
                        value={editingSettings.backgroundColor}
                        onChange={(e) => setEditingSettings(prev => ({
                          ...prev,
                          backgroundColor: e.target.value
                        }))}
                        className="w-full h-10 rounded border border-gray-300 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-2">文字色</label>
                      <input
                        type="color"
                        value={editingSettings.textColor}
                        onChange={(e) => setEditingSettings(prev => ({
                          ...prev,
                          textColor: e.target.value
                        }))}
                        className="w-full h-10 rounded border border-gray-300 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Progress Bar Color */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    進度條顏色
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={editingSettings.progressColor}
                      onChange={(e) => setEditingSettings(prev => ({
                        ...prev,
                        progressColor: e.target.value
                      }))}
                      className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <span className="text-sm text-gray-600">{editingSettings.progressColor}</span>
                  </div>
                </div>

                {/* Vibration Pattern */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">震動模式（Android）</label>
                    {typeof navigator !== 'undefined' && !('vibrate' in navigator) && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">iOS 不支援</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(VIBRATION_PRESETS) as [VibrationPattern, typeof VIBRATION_PRESETS[VibrationPattern]][]).map(([key, preset]) => {
                      const isSelected = (editingSettings.vibrationPattern ?? 'standard') === key
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            const newSettings = { ...editingSettings, vibrationPattern: key, vibrationIntensity: preset.pattern === 0 ? 0 : (preset.pattern as number[])[0] }
                            setEditingSettings(newSettings)
                            onSave(newSettings)
                            // 選擇後立刻試震
                            if (typeof navigator !== 'undefined' && 'vibrate' in navigator && preset.pattern !== 0) {
                              const ok = navigator.vibrate(preset.pattern as number[])
                              setVibrateResult(ok ? 'ok' : 'unsupported')
                              setTimeout(() => setVibrateResult('idle'), 1500)
                            }
                          }}
                          className={`flex flex-col items-center py-2 px-1 rounded-xl border-2 transition-all text-center ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          }`}
                          title={preset.desc}
                        >
                          <span className="text-sm font-semibold">{preset.label}</span>
                          <span className="text-xs text-gray-400 mt-0.5">{preset.desc.split('，')[0]}</span>
                        </button>
                      )
                    })}
                  </div>
                  {vibrateResult !== 'idle' && (
                    <p className={`text-xs text-center ${vibrateResult === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                      {vibrateResult === 'ok' ? '✓ 震動中' : '✗ 此裝置不支援震動'}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex space-x-3 pt-4 border-t border-gray-200">
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
        </>
      )}
    </div>
  )
}
