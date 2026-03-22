'use client'

import { useState, useEffect } from 'react'
import { Settings, X, Check } from 'lucide-react'

export interface DisplaySettings {
  fontSize: number
  backgroundColor: string
  textColor: string
  progressColor: string
  vibrationIntensity: number
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fontSize: 32,
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  progressColor: '#6366f1',
  vibrationIntensity: 50
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
                      max="72"
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

                {/* Vibration */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    震動強度（手機）
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="10"
                      value={editingSettings.vibrationIntensity}
                      onChange={(e) => setEditingSettings(prev => ({
                        ...prev,
                        vibrationIntensity: parseInt(e.target.value)
                      }))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="text-sm font-semibold text-gray-800 w-20 text-right">
                      {editingSettings.vibrationIntensity === 0 ? '關閉' : `${editingSettings.vibrationIntensity}ms`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex justify-between text-xs text-gray-500 flex-1 mr-4">
                      <span>關閉</span>
                      <span>強</span>
                    </div>
                    <button
                      onClick={() => {
                        if (typeof navigator === 'undefined' || !('vibrate' in navigator)) {
                          setVibrateResult('unsupported')
                        } else if (editingSettings.vibrationIntensity > 0) {
                          const ok = navigator.vibrate(editingSettings.vibrationIntensity)
                          setVibrateResult(ok ? 'ok' : 'unsupported')
                        }
                        setTimeout(() => setVibrateResult('idle'), 2500)
                      }}
                      className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                        vibrateResult === 'ok' ? 'bg-green-100 text-green-700' :
                        vibrateResult === 'unsupported' ? 'bg-red-100 text-red-700' :
                        'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      }`}
                    >
                      {vibrateResult === 'ok' ? '✓ 已震動' : vibrateResult === 'unsupported' ? '✗ 不支援' : '測試震動'}
                    </button>
                  </div>
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
