'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Home, BookOpen, Target, CheckCircle } from 'lucide-react'
import { storage, fontStorage, shortcutsStorage, displayStorage, KeyboardShortcuts, DEFAULT_SHORTCUTS, DisplaySettings, DEFAULT_DISPLAY_SETTINGS } from '../utils/storage'
import { saveFontToIDB, getFontFromIDB, clearFontFromIDB } from '../utils/fontDB'
import FontSelector from './FontSelector'
import KeyboardSettings from './KeyboardSettings'
import DisplaySettingsPanel from './DisplaySettings'

interface ReaderProps {
  sentences: string[]
  bookTitle: string
  bookId: string
  initialIndex: number
  readingGoal: number
  onReset: () => void
}

export default function Reader({ sentences, bookTitle, bookId, initialIndex, readingGoal, onReset }: ReaderProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [startIndex, setStartIndex] = useState(initialIndex)
  const [goalCompleted, setGoalCompleted] = useState(false)
  const [fontFamily, setFontFamily] = useState('system-ui, -apple-system, sans-serif')
  const [shortcuts, setShortcuts] = useState<KeyboardShortcuts>(DEFAULT_SHORTCUTS)
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS)

  useEffect(() => {
    setCurrentIndex(initialIndex)
    setStartIndex(initialIndex)
    setGoalCompleted(false)
  }, [initialIndex])

  useEffect(() => {
    const loadSavedFont = async () => {
      try {
        const saved = await getFontFromIDB()
        if (!saved) return
        const isFontLoaded = Array.from(document.fonts.values()).some(
          font => font.family === saved.fontFamily
        )
        if (!isFontLoaded) {
          const fontFace = new FontFace(saved.fontFamily, `url(${saved.fontData})`)
          const loadedFace = await fontFace.load()
          document.fonts.add(loadedFace)
          await document.fonts.load(`16px "${saved.fontFamily}"`)
        }
        setFontFamily(saved.fontFamily)
      } catch (error) {
        console.error('Failed to load saved custom font:', error)
        const savedFont = fontStorage.getFont()
        if (savedFont) setFontFamily(savedFont.fontFamily)
      }
    }

    loadSavedFont()
    
    const savedShortcuts = shortcutsStorage.getShortcuts()
    setShortcuts(savedShortcuts)
    
    const savedDisplaySettings = displayStorage.getSettings()
    setDisplaySettings(savedDisplaySettings)
  }, [])

  useEffect(() => {
    if (readingGoal > 0) {
      const sentencesRead = currentIndex - startIndex + 1
      if (sentencesRead >= readingGoal && !goalCompleted) {
        setGoalCompleted(true)
        setTimeout(() => {
          onReset()
        }, 3000)
      }
    }
  }, [currentIndex, startIndex, readingGoal, goalCompleted, onReset])

  useEffect(() => {
    if (bookId) {
      storage.updateProgress(bookId, currentIndex)
    }
  }, [currentIndex, bookId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      
      if (e.key === shortcuts.nextSentence && currentIndex < sentences.length - 1) {
        e.preventDefault()
        setCurrentIndex(prev => prev + 1)
      } else if (e.key === shortcuts.previousSentence && currentIndex > 0) {
        e.preventDefault()
        setCurrentIndex(prev => prev - 1)
      } else if (e.key === shortcuts.returnHome) {
        e.preventDefault()
        onReset()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, sentences.length, shortcuts, onReset])

  const goToNext = () => {
    if (currentIndex < sentences.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
  }

  const handleFontChange = (newFontFamily: string, fontData?: string) => {
    if (fontData) {
      const fontFace = new FontFace(newFontFamily, `url(${fontData})`)
      fontFace
        .load()
        .then((loadedFace) => {
          document.fonts.add(loadedFace)
          setFontFamily(newFontFamily)
          saveFontToIDB(newFontFamily, fontData).catch(console.error)
        })
        .catch((error) => {
          console.error('Failed to apply custom font:', error)
          setFontFamily(newFontFamily)
        })
    } else {
      setFontFamily(newFontFamily)
      clearFontFromIDB().catch(console.error)
    }
    fontStorage.saveFont(newFontFamily)
  }

  const handleShortcutsChange = (newShortcuts: KeyboardShortcuts) => {
    setShortcuts(newShortcuts)
    shortcutsStorage.saveShortcuts(newShortcuts)
  }

  const handleDisplaySettingsChange = (newSettings: DisplaySettings) => {
    setDisplaySettings(newSettings)
    displayStorage.saveSettings(newSettings)
  }

  const sentencesRead = currentIndex - startIndex + 1
  const CYCLE_SIZE = 13

  const completedCycles = Math.floor((sentencesRead - 1) / CYCLE_SIZE)
  const cycleRatio = ((sentencesRead - 1) % CYCLE_SIZE + 1) / CYCLE_SIZE

  // Bar max per cycle = CYCLE_SIZE / remaining sentences at cycle start
  // e.g. goal=100: cycle1→25%, cycle2→33%, cycle3→50%, cycle4→100%
  const barProgress = (() => {
    if (readingGoal > 0) {
      const sentencesAtCycleStart = completedCycles * CYCLE_SIZE
      const remaining = readingGoal - sentencesAtCycleStart
      const maxProgress = remaining > 0 ? Math.min(CYCLE_SIZE / remaining, 1) : 1
      return cycleRatio * maxProgress * 100
    }
    return cycleRatio * 100
  })()

  const getProgressColor = () => {
    if (goalCompleted) return '#22c55e'
    // Red #ef4444 → 瑞幸藍 #00A8E0
    const r = Math.round(239 + (0   - 239) * cycleRatio)
    const g = Math.round(68  + (168 - 68)  * cycleRatio)
    const b = Math.round(68  + (224 - 68)  * cycleRatio)
    return `rgb(${r},${g},${b})`
  }
  const textFontFamily = fontFamily.includes(',')
    ? fontFamily
    : `"${fontFamily}", system-ui, -apple-system, sans-serif`

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: displaySettings.backgroundColor }}>
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-semibold text-gray-800">{bookTitle}</h1>
          </div>
          <div className="flex items-center space-x-3">
            <DisplaySettingsPanel settings={displaySettings} onSave={handleDisplaySettingsChange} />
            <KeyboardSettings shortcuts={shortcuts} onSave={handleShortcutsChange} />
            <FontSelector currentFont={fontFamily} onFontChange={handleFontChange} />
            <button
              onClick={onReset}
              className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Home className="w-5 h-5" />
              <span>返回首頁</span>
            </button>
          </div>
        </div>
        <div className="w-full bg-gray-200 h-1">
          <div
            className="h-1 transition-all duration-300"
            style={{ width: `${barProgress}%`, backgroundColor: getProgressColor() }}
          />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 md:p-6">
        <div className="max-w-4xl w-full">
          <div 
            className="rounded-2xl shadow-2xl p-8 md:p-16 min-h-[320px] flex items-center justify-center transition-all border border-white/40"
          >
            <p 
              className="leading-relaxed text-center"
              style={{ 
                fontFamily: textFontFamily,
                fontSize: `${displaySettings.fontSize}px`,
                color: displaySettings.textColor
              }}
            >
              {sentences[currentIndex]}
            </p>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className="flex items-center space-x-2 px-6 py-3 bg-white rounded-lg shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>上一句</span>
            </button>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                {currentIndex + 1} / {sentences.length}
              </p>
              {readingGoal > 0 && (
                <div className="mt-2 flex items-center justify-center space-x-2">
                  {goalCompleted ? (
                    <div className="flex items-center space-x-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-xs font-medium">目標達成！</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1 text-indigo-600">
                      <Target className="w-4 h-4" />
                      <span className="text-xs font-medium">
                        {Math.min(currentIndex - startIndex + 1, readingGoal)} / {readingGoal}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={goToNext}
              disabled={currentIndex === sentences.length - 1}
              className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg shadow-lg hover:shadow-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span>下一句</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 text-center text-sm text-gray-500">
            <p>使用鍵盤左右箭頭鍵導航</p>
          </div>
          
          {goalCompleted && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="text-green-800 font-medium">🎉 恭喜！您已完成今天的閱讀目標</p>
              <p className="text-green-600 text-sm mt-1">3秒後自動返回首頁...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
