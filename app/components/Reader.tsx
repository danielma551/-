'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Home, BookOpen, Target, CheckCircle, Search, X } from 'lucide-react'
import { fontStorage, shortcutsStorage, displayStorage, KeyboardShortcuts, DEFAULT_SHORTCUTS, DisplaySettings, DEFAULT_DISPLAY_SETTINGS } from '../utils/storage'
import { updateBookProgressInIDB } from '../utils/bookDB'
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
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<number[]>([])
  const [searchResultIdx, setSearchResultIdx] = useState(0)

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
      updateBookProgressInIDB(bookId, currentIndex)
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

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const results = sentences.reduce<number[]>((acc, s, i) => {
      if (!s.startsWith('data:image/') && s.toLowerCase().includes(query.toLowerCase())) acc.push(i)
      return acc
    }, [])
    setSearchResults(results)
    setSearchResultIdx(0)
    if (results.length > 0) {
      setCurrentIndex(results[0])
      setStartIndex(results[0])
      setGoalCompleted(false)
    }
  }

  const goToNextResult = () => {
    if (searchResults.length === 0) return
    const next = (searchResultIdx + 1) % searchResults.length
    setSearchResultIdx(next)
    setCurrentIndex(searchResults[next])
    setStartIndex(searchResults[next])
    setGoalCompleted(false)
  }

  const goToPrevResult = () => {
    if (searchResults.length === 0) return
    const prev = (searchResultIdx - 1 + searchResults.length) % searchResults.length
    setSearchResultIdx(prev)
    setCurrentIndex(searchResults[prev])
    setStartIndex(searchResults[prev])
    setGoalCompleted(false)
  }

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
            {!showSearch && (
              <h1 className="text-xl font-semibold text-gray-800">{bookTitle}</h1>
            )}
            {showSearch ? (
              <div className="relative">
                <div className="flex items-center w-72 px-3 py-1.5 border-2 border-indigo-400 rounded-full bg-white shadow-sm">
                  <Search className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }
                    }}
                    placeholder="搜索句子..."
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setSearchResults([]) }} className="ml-1 p-0.5 hover:bg-gray-100 rounded-full">
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  )}
                </div>

                {searchQuery && (
                  <div className="absolute top-full left-0 mt-1 w-96 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    {searchResults.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">無符合結果</div>
                    ) : (
                      <>
                        <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-50">
                          共 {searchResults.length} 個結果
                        </div>
                        <ul className="max-h-64 overflow-y-auto">
                          {searchResults.slice(0, 10).map((idx, i) => {
                            const sentence = sentences[idx]
                            const lower = sentence.toLowerCase()
                            const qLower = searchQuery.toLowerCase()
                            const matchPos = lower.indexOf(qLower)
                            const preview = sentence.length > 60
                              ? sentence.slice(Math.max(0, matchPos - 15), matchPos + searchQuery.length + 30) + '…'
                              : sentence
                            const previewBefore = preview.slice(0, preview.toLowerCase().indexOf(qLower))
                            const previewMatch = preview.slice(preview.toLowerCase().indexOf(qLower), preview.toLowerCase().indexOf(qLower) + searchQuery.length)
                            const previewAfter = preview.slice(preview.toLowerCase().indexOf(qLower) + searchQuery.length)
                            return (
                              <li key={idx}>
                                <button
                                  onClick={() => {
                                    setCurrentIndex(idx)
                                    setStartIndex(idx)
                                    setGoalCompleted(false)
                                    setSearchResultIdx(i)
                                    setShowSearch(false)
                                  }}
                                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-indigo-50 transition-colors flex items-start space-x-2 ${i === searchResultIdx ? 'bg-indigo-50' : ''}`}
                                >
                                  <Search className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                                  <span className="text-gray-600 leading-snug">
                                    {previewBefore}
                                    <strong className="text-indigo-600 font-semibold">{previewMatch}</strong>
                                    {previewAfter}
                                  </span>
                                  <span className="text-xs text-gray-300 flex-shrink-0 ml-auto pl-2">#{idx + 1}</span>
                                </button>
                              </li>
                            )
                          })}
                          {searchResults.length > 10 && (
                            <li className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">
                              還有 {searchResults.length - 10} 個結果…
                            </li>
                          )}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => setShowSearch(true)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <Search className="w-4 h-4 text-gray-500" />
              </button>
            )}
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
            {sentences[currentIndex]?.startsWith('data:image/') ? (
              <img
                src={sentences[currentIndex]}
                alt="圖片"
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
            ) : (
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
            )}
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

          <div className="mt-6">
            <input
              type="range"
              min={0}
              max={sentences.length - 1}
              value={currentIndex}
              onChange={(e) => {
                const idx = Number(e.target.value)
                setCurrentIndex(idx)
                setStartIndex(idx)
                setGoalCompleted(false)
              }}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${(currentIndex / (sentences.length - 1)) * 100}%, #e5e7eb ${(currentIndex / (sentences.length - 1)) * 100}%, #e5e7eb 100%)`
              }}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1</span>
              <span>{sentences.length}</span>
            </div>
          </div>

          <div className="mt-2 text-center text-sm text-gray-500">
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
