'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Home, BookOpen, Target, CheckCircle } from 'lucide-react'
import { storage, fontStorage } from '../utils/storage'
import FontSelector from './FontSelector'

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

  useEffect(() => {
    setCurrentIndex(initialIndex)
    setStartIndex(initialIndex)
    setGoalCompleted(false)
  }, [initialIndex])

  useEffect(() => {
    const savedFont = fontStorage.getFont()
    if (savedFont) {
      if (savedFont.fontData) {
        const fontName = savedFont.fontFamily
        const fontFace = new FontFace(fontName, `url(${savedFont.fontData})`)
        fontFace.load().then((loadedFace) => {
          document.fonts.add(loadedFace)
          setFontFamily(fontName)
        }).catch((error) => {
          console.error('Failed to load saved font:', error)
          setFontFamily(savedFont.fontFamily)
        })
      } else {
        setFontFamily(savedFont.fontFamily)
      }
    }
  }, [])

  useEffect(() => {
    if (readingGoal > 0) {
      const sentencesRead = currentIndex - startIndex + 1
      if (sentencesRead >= readingGoal && !goalCompleted) {
        setGoalCompleted(true)
      }
    }
  }, [currentIndex, startIndex, readingGoal, goalCompleted])

  useEffect(() => {
    if (bookId) {
      storage.updateProgress(bookId, currentIndex)
    }
  }, [currentIndex, bookId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && currentIndex < sentences.length - 1) {
        setCurrentIndex(prev => prev + 1)
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, sentences.length])

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
    setFontFamily(newFontFamily)
    fontStorage.saveFont(newFontFamily, fontData)
  }

  const sentencesRead = currentIndex - startIndex + 1
  const progress = readingGoal > 0 
    ? Math.min((sentencesRead / readingGoal) * 100, 100)
    : ((currentIndex + 1) / sentences.length) * 100

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-semibold text-gray-800">{bookTitle}</h1>
          </div>
          <div className="flex items-center space-x-3">
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
            className={`h-1 transition-all duration-300 ${goalCompleted ? 'bg-green-600' : 'bg-indigo-600'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-16 min-h-[300px] flex items-center justify-center">
            <p 
              className="text-2xl md:text-4xl text-gray-800 leading-relaxed text-center"
              style={{ fontFamily }}
            >
              {sentences[currentIndex]}
            </p>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className="flex items-center space-x-2 px-6 py-3 bg-white rounded-lg shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
              className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg shadow-md hover:shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
              <p className="text-green-600 text-sm mt-1">繼續閱讀或返回首頁</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
