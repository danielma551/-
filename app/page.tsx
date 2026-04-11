// 【首頁】
// 這個文件負責：你進入網站後看到的書架頁面。
// 你可以在這裡：
//   - 看到所有已上傳的書（封面、書名、進度、日期）
//   - 上傳新書（TXT / EPUB / PDF），書名會自動清理掉括號裡的網站名等雜訊
//   - 點書 → 設定今日目標 → 開始閱讀
//   - 更換書籍封面圖片或顏色、刪除書籍
//   - 雲端同步：把書備份到雲端或從雲端下載到其他裝置

'use client'

import { useState, useEffect, useRef } from 'react'
import { BookOpen, Trash2, Plus, Loader2, ImagePlus } from 'lucide-react'
import Reader from './components/Reader'
import GoalModal from './components/GoalModal'
import CloudSync from './components/CloudSync'
import ReadingTrend from './components/ReadingTrend'
import FeedPanel from './components/FeedPanel'
import VocabPractice from './components/VocabPractice'
import { generateBookId, BookData } from './utils/storage'
import { getAllBooksFromIDB, saveBookToIDB, deleteBookFromIDB } from './utils/bookDB'

function getBookStyle(title: string): string {
  const gradients = [
    'linear-gradient(160deg,#1a1a2e,#16213e)',
    'linear-gradient(160deg,#134e4a,#065f46)',
    'linear-gradient(160deg,#4a1d96,#6d28d9)',
    'linear-gradient(160deg,#7f1d1d,#b91c1c)',
    'linear-gradient(160deg,#78350f,#b45309)',
    'linear-gradient(160deg,#1e3a5f,#1d4ed8)',
    'linear-gradient(160deg,#831843,#be185d)',
    'linear-gradient(160deg,#1f2937,#374151)',
    'linear-gradient(160deg,#14532d,#166534)',
    'linear-gradient(160deg,#7c2d12,#c2410c)',
    'linear-gradient(160deg,#312e81,#4338ca)',
    'linear-gradient(160deg,#0c4a6e,#0369a1)',
  ]
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash)
  }
  return gradients[Math.abs(hash) % gradients.length]
}

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
  const [readingArticleLink, setReadingArticleLink] = useState<string>('')
  // 控制是否顯示每日練習畫面
  const [showVocab, setShowVocab] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getAllBooksFromIDB().then(setSavedBooks)
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
      let title = file.name.replace(/\.(txt|epub|pdf)$/i, '').trim()
      let prev = ''
      while (prev !== title) {
        prev = title
        title = title.replace(/\s*(?:\([^()]*\)|（[^（）]*）|\[[^\[\]]*\])\s*$/, '').trim()
      }
      title = title || file.name.replace(/\.(txt|epub|pdf)$/i, '')
      const id = generateBookId(title)
      
      const bookData: BookData = {
        id,
        title,
        sentences: data.sentences,
        currentIndex: 0,
        uploadDate: Date.now(),
        lastReadDate: Date.now(),
        // EPUB 自動提取的封面圖片（TXT/PDF 為 null，不覆蓋）
        ...(data.coverImage ? { coverImage: data.coverImage } : {})
      }
      
      await saveBookToIDB(bookData)
      getAllBooksFromIDB().then(setSavedBooks)
      
      setPendingBook({
        sentences: data.sentences,
        title,
        id,
        index: 0
      })
      setShowGoalModal(true)
    } catch (error) {
      console.error('Error uploading file:', error)
      setUploadError('上傳失敗，請確認文件格式（TXT、EPUB 或 PDF）並重試')
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
      deleteBookFromIDB(id).then(() => getAllBooksFromIDB().then(setSavedBooks))
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
    getAllBooksFromIDB().then(setSavedBooks)
  }

  const handleSyncComplete = () => {
    getAllBooksFromIDB().then(setSavedBooks)
  }

  // 用戶從 RSS 訂閱點了一篇文章，直接開啟閱讀器（不需要目標設定）
  const handleReadArticle = (articleSentences: string[], title: string, link: string) => {
    setReadingArticleLink(link)
    setSentences(articleSentences)
    setBookTitle(title)
    setBookId('article-' + Date.now())
    setCurrentIndex(0)
    setReadingGoal(0)
  }

  // 用戶讀完文章最後一句：將文章連結寫入 localStorage，FeedPanel 再次挂載時讀取
  const handleArticleFinished = () => {
    if (!readingArticleLink) return
    try {
      const raw = localStorage.getItem('reading-feed-read')
      const links: string[] = raw ? JSON.parse(raw) : []
      if (!links.includes(readingArticleLink)) links.push(readingArticleLink)
      localStorage.setItem('reading-feed-read', JSON.stringify(links))
    } catch {}
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

  // 顯示每日練習畫面時，整頁渲染 VocabPractice
  if (showVocab) {
    return <VocabPractice onExit={() => setShowVocab(false)} />
  }

  return (
    <main className="min-h-screen bg-white">
      {showGoalModal && pendingBook && (
        <GoalModal
          onSetGoal={handleSetGoal}
          onSkip={handleSkipGoal}
          maxSentences={pendingBook.sentences.length}
        />
      )}

      {sentences.length === 0 ? (
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Header */}
          <header className="flex items-center justify-between mb-10">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-6 h-6 text-gray-800" />
              <h1 className="text-xl font-bold text-gray-900">我的書架</h1>
            </div>
            <div className="flex items-center space-x-3">
              <CloudSync onSyncComplete={handleSyncComplete} />
              <label
                htmlFor="file-upload"
                className={`flex items-center space-x-2 px-4 py-2 rounded-full border border-gray-300 text-sm font-medium text-gray-700 cursor-pointer transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-50'}`}
              >
                {isUploading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Plus className="w-4 h-4" />
                }
                <span>{isUploading ? '處理中...' : '添加書籍'}</span>
                <input
                  id="file-upload"
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".txt,.epub,.pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            </div>
          </header>

          {uploadError && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{uploadError}</p>
            </div>
          )}

          {/* RSS 訂閱文章面板 */}
          <FeedPanel onReadArticle={handleReadArticle} />

          {/* 30天閱讀趨勢圖（有資料時才顯示） */}
          <ReadingTrend />

          {/* 每日練習入口卡片 */}
          <div className="mb-6">
            <button
              onClick={() => setShowVocab(true)}
              className="group flex items-center space-x-4 w-full px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl hover:from-indigo-100 hover:to-purple-100 transition-all"
            >
              <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white text-lg flex-shrink-0">
                📝
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-indigo-800">每日練習</p>
                <p className="text-xs text-indigo-500">1000 個常用英文單詞拼寫練習</p>
              </div>
            </button>
          </div>

          {/* Book Grid */}
          {savedBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-40 text-gray-300">
              <BookOpen className="w-20 h-20 mb-4" />
              <p className="text-lg font-medium">書架空空如也</p>
              <p className="text-sm mt-1">點擊「添加書籍」上傳您的第一本書</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-8">
              {savedBooks.map((book) => {
                const progress = book.sentences.length > 0
                  ? Math.round(((book.currentIndex + 1) / book.sentences.length) * 100)
                  : 0
                return (
                  <div
                    key={book.id}
                    className="group cursor-pointer"
                    onClick={() => handleLoadBook(book)}
                  >
                    {/* Cover */}
                    <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-md group-hover:shadow-xl transition-shadow duration-200">
                      <div
                        className="w-full h-full flex flex-col items-center justify-center p-4 relative"
                        style={book.coverImage
                          ? { backgroundImage: `url(${book.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                          : { background: book.coverColor ?? getBookStyle(book.title) }
                        }
                      >
                        {book.coverImage && <div className="absolute inset-0 bg-black/30" />}
                        <p className="relative text-white text-sm font-medium text-center leading-snug line-clamp-5 drop-shadow">
                          {book.title}
                        </p>
                      </div>
                      {/* Reading progress */}
                      {book.currentIndex > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                          <div className="h-full bg-white/70" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                      {/* Cover image picker */}
                      <button
                        onClick={(e) => { e.stopPropagation(); document.getElementById(`cover-img-${book.id}`)?.click() }}
                        className="absolute top-2 left-2 p-1.5 bg-black/40 hover:bg-blue-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <ImagePlus className="w-3 h-3" />
                      </button>
                      <input
                        type="file"
                        id={`cover-img-${book.id}`}
                        accept="image/*"
                        className="hidden"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation()
                          const file = e.currentTarget.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = (ev) => {
                            const updated = { ...book, coverImage: ev.target?.result as string }
                            saveBookToIDB(updated).then(() => getAllBooksFromIDB().then(setSavedBooks))
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                      {/* Delete */}
                      <button
                        onClick={(e) => handleDeleteBook(book.id, e)}
                        className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Title & date */}
                    <p className="mt-2 text-xs text-gray-700 font-medium line-clamp-2 leading-snug">
                      {book.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(book.lastReadDate)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <Reader
          sentences={sentences}
          bookTitle={bookTitle}
          bookId={bookId}
          initialIndex={currentIndex}
          readingGoal={readingGoal}
          onReset={handleReset}
          onArticleFinished={readingArticleLink ? handleArticleFinished : undefined}
        />
      )}
    </main>
  )
}
