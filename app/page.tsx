'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, BookOpen, Trash2, Clock } from 'lucide-react'
import Reader from './components/Reader'
import GoalModal from './components/GoalModal'
import CloudSync from './components/CloudSync'
import { storage, generateBookId, BookData } from './utils/storage'

export default function Home() {
  const [sentences, setSentences] = useState<string[]>([])
  const [bookTitle, setBookTitle] = useState<string>('')
  const [bookId, setBookId] = useState<string>('')
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const [savedBooks, setSavedBooks] = useState<BookData[]>([])
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [readingGoal, setReadingGoal] = useState<number>(0)
  const [pendingBook, setPendingBook] = useState<{
    sentences: string[]
    title: string
    id: string
    index: number
  } | null>(null)
  const [uploadError, setUploadError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSavedBooks(storage.getAllBooks())
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError('')
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('上傳失敗')
      }

      const data = await response.json()
      const title = file.name.replace(/\.(txt|epub)$/i, '')
      const id = generateBookId(title)
      
      const bookData: BookData = {
        id,
        title,
        sentences: data.sentences,
        currentIndex: 0,
        uploadDate: Date.now(),
        lastReadDate: Date.now()
      }
      
      try {
        storage.saveBook(bookData)
        setSavedBooks(storage.getAllBooks())
      } catch (storageError) {
        console.error('Storage full:', storageError)
        setUploadError('本地存儲空間不足，書本已加載但無法保存。請刪除部分書本後再試。')
      }
      
      setPendingBook({
        sentences: data.sentences,
        title,
        id,
        index: 0
      })
      setShowGoalModal(true)
    } catch (error) {
      console.error('Error uploading file:', error)
      setUploadError('上傳失敗，請確認文件格式（TXT 或 EPUB）並重試')
    } finally {
      setIsUploading(false)
      // Reset file input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleLoadBook = (book: BookData) => {
    setPendingBook({
      sentences: book.sentences,
      title: book.title,
      id: book.id,
      index: book.currentIndex
    })
    setShowGoalModal(true)
  }

  const handleSetGoal = (goal: number) => {
    if (pendingBook) {
      setSentences(pendingBook.sentences)
      setBookTitle(pendingBook.title)
      setBookId(pendingBook.id)
      setCurrentIndex(pendingBook.index)
      setReadingGoal(goal)
      setShowGoalModal(false)
      setPendingBook(null)
    }
  }

  const handleSkipGoal = () => {
    if (pendingBook) {
      setSentences(pendingBook.sentences)
      setBookTitle(pendingBook.title)
      setBookId(pendingBook.id)
      setCurrentIndex(pendingBook.index)
      setReadingGoal(0)
      setShowGoalModal(false)
      setPendingBook(null)
    }
  }

  const handleDeleteBook = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('確定要刪除這本書嗎？')) {
      storage.deleteBook(id)
      setSavedBooks(storage.getAllBooks())
      if (bookId === id) {
        setSentences([])
        setBookTitle('')
        setBookId('')
        setCurrentIndex(0)
      }
    }
  }

  const handleReset = () => {
    setSentences([])
    setBookTitle('')
    setBookId('')
    setCurrentIndex(0)
    setShowGoalModal(false)
    setPendingBook(null)
    setUploadError('')
    setSavedBooks(storage.getAllBooks())
  }

  const handleSyncComplete = () => {
    setSavedBooks(storage.getAllBooks())
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString('zh-TW')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {showGoalModal && pendingBook && (
        <GoalModal
          onSetGoal={handleSetGoal}
          onSkip={handleSkipGoal}
          maxSentences={pendingBook.sentences.length}
        />
      )}
      
      {sentences.length === 0 ? (
        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 max-w-md w-full">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
                <BookOpen className="w-8 h-8 text-indigo-600" />
              </div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">閱讀網站</h1>
              <p className="text-gray-600">上傳電子書，一句一句慢慢讀</p>
            </div>

            <div className="space-y-4">
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-indigo-300 rounded-xl cursor-pointer bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-12 h-12 text-indigo-500 mb-3" />
                  <p className="mb-2 text-sm text-gray-700">
                    <span className="font-semibold">點擊上傳</span> 或拖放文件
                  </p>
                  <p className="text-xs text-gray-500">支持 TXT, EPUB 格式</p>
                </div>
                <input
                  id="file-upload"
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".txt,.epub"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>

              {isUploading && (
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  <p className="mt-2 text-sm text-gray-600">正在處理文件...</p>
                </div>
              )}

              {uploadError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{uploadError}</p>
                </div>
              )}

              <div className="flex justify-center">
                <CloudSync onSyncComplete={handleSyncComplete} />
              </div>

              {savedBooks.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-lg font-semibold text-gray-800 mb-3">我的書架</h2>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {savedBooks.map((book) => (
                      <div
                        key={book.id}
                        onClick={() => handleLoadBook(book)}
                        className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate">{book.title}</p>
                          <div className="flex items-center space-x-3 mt-1">
                            <p className="text-xs text-gray-500 flex items-center">
                              <Clock className="w-3 h-3 mr-1" />
                              {formatDate(book.lastReadDate)}
                            </p>
                            <p className="text-xs text-indigo-600">
                              {book.currentIndex + 1} / {book.sentences.length}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteBook(book.id, e)}
                          className="ml-3 p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <Reader 
          sentences={sentences} 
          bookTitle={bookTitle} 
          bookId={bookId}
          initialIndex={currentIndex}
          readingGoal={readingGoal}
          onReset={handleReset} 
        />
      )}
    </main>
  )
}
