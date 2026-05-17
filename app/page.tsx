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
import { BookOpen, Trash2, Plus, Loader2, ImagePlus, FilePlus } from 'lucide-react'
import Reader from './components/Reader'
import GoalModal from './components/GoalModal'
import CloudSync from './components/CloudSync'
import ReadingTrend from './components/ReadingTrend'
import FeedPanel from './components/FeedPanel'
import VocabPractice from './components/VocabPractice'
import SearchPanel from './components/SearchPanel'
import { generateBookId, BookData } from './utils/storage'
import { getAllBooksFromIDB, saveBookToIDB, deleteBookFromIDB } from './utils/bookDB'

// ── 客戶端句子切割（與 server splitIntoSentences 保持一致）──
function splitSentencesClient(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  const sentenceRegex = /[^.!?。！？;；,，:：]+[.!?。！？;；,，:：]+/g
  const sentences = cleaned.match(sentenceRegex) || []
  if (sentences.length === 0 && cleaned.length > 0) return [cleaned]
  return sentences.map(s => s.trim()).filter(s => s.length > 0)
}

// ── 瀏覽器端 PDF 處理：先提取文字，失敗則 OCR ──
async function processPdfClientSide(
  file: File,
  onProgress: (msg: string) => void
): Promise<string[]> {
  onProgress('正在載入 PDF...')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await import('pdfjs-dist') as any
  // 使用 unpkg CDN 作為 Worker（避免 Next.js 打包問題）
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const totalPages: number = pdf.numPages

  onProgress(`正在提取文字（共 ${totalPages} 頁）...`)

  // 第一步：嘗試直接提取文字（文字型 PDF，秒完成）
  let fullText = ''
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fullText += content.items.map((item: any) => item.str ?? '').join(' ')
  }
  if (fullText.trim().length > 50) {
    onProgress('')
    return splitSentencesClient(fullText)
  }

  // 第二步：掃描圖片型 PDF → 瀏覽器端 OCR（tesseract.js）
  onProgress('正在載入中文 OCR 模型（首次需下載約 20MB，請稍候）...')
  const { createWorker } = await import('tesseract.js')
  // chi_sim（簡體）+ chi_tra（繁體），自動從 CDN 下載語言包
  const worker = await createWorker(['chi_sim', 'chi_tra'], 1, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: (m: any) => {
      if (m.status === 'loading tesseract core') onProgress('載入 OCR 引擎...')
      if (m.status === 'loading language traineddata') onProgress('載入中文語言模型...')
    }
  })

  const allSentences: string[] = []
  for (let i = 1; i <= totalPages; i++) {
    onProgress(`OCR 識別中... ${i} / ${totalPages} 頁`)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: { text } } = await (worker as any).recognize(canvas)
    if (text.trim()) allSentences.push(...splitSentencesClient(text))
  }

  await worker.terminate()
  onProgress('')
  return allSentences
}

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
  // 追加內容：記錄哪本書正在處理中
  const [appendingBookId, setAppendingBookId] = useState<string | null>(null)
  // OCR 進度提示文字
  const [ocrProgress, setOcrProgress] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getAllBooksFromIDB().then(setSavedBooks)
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError('')
    setIsUploading(true)
    setOcrProgress('')

    // 書名清理（去掉括號內的網站名等）
    let title = file.name.replace(/\.(txt|epub|pdf)$/i, '').trim()
    let prev = ''
    while (prev !== title) {
      prev = title
      title = title.replace(/\s*(?:\([^()]*\)|（[^（）]*）|\[[^\[\]]*\])\s*$/, '').trim()
    }
    title = title || file.name.replace(/\.(txt|epub|pdf)$/i, '')
    const id = generateBookId(title)

    try {
      let sentences: string[] = []
      let coverImage: string | null = null

      if (file.name.toLowerCase().endsWith('.pdf')) {
        // PDF：瀏覽器端處理（支援 OCR），不需要經過 server
        sentences = await processPdfClientSide(file, setOcrProgress)
      } else {
        // TXT / EPUB：送 server 處理（EPUB 需要解析章節+封面）
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || '上傳失敗')
        sentences = data.sentences
        coverImage = data.coverImage ?? null
      }

      if (sentences.length === 0) throw new Error('無法從文件中提取句子，請確認文件格式')

      const bookData: BookData = {
        id,
        title,
        sentences,
        currentIndex: 0,
        uploadDate: Date.now(),
        lastReadDate: Date.now(),
        ...(coverImage ? { coverImage } : {})
      }

      await saveBookToIDB(bookData)
      getAllBooksFromIDB().then(setSavedBooks)
      setPendingBook({ sentences, title, id, index: 0 })
      setShowGoalModal(true)
    } catch (error) {
      console.error('Error uploading file:', error)
      const msg = error instanceof Error ? error.message : '上傳失敗，請確認文件格式（TXT、EPUB 或 PDF）並重試'
      setUploadError(msg)
    } finally {
      setIsUploading(false)
      setOcrProgress('')
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

  // 按 X 純關閉彈窗，不進入閱讀，回到書架
  const handleCancelGoal = () => {
    setShowGoalModal(false)
    setPendingBook(null)
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

  // 追加內容：把新文件的句子接在現有書本尾部
  const handleAppendContent = async (book: BookData, file: File) => {
    setAppendingBookId(book.id)
    setOcrProgress('')
    try {
      let newSentences: string[] = []
      if (file.name.toLowerCase().endsWith('.pdf')) {
        // PDF：瀏覽器端 OCR
        newSentences = await processPdfClientSide(file, setOcrProgress)
      } else {
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || '上傳失敗')
        newSentences = data.sentences
      }
      const updated: BookData = { ...book, sentences: [...book.sentences, ...newSentences] }
      await saveBookToIDB(updated)
      getAllBooksFromIDB().then(setSavedBooks)
      if (bookId === book.id) setSentences(updated.sentences)
    } catch (err) {
      alert(err instanceof Error ? err.message : '加入內容失敗，請確認文件格式（TXT、EPUB 或 PDF）')
    } finally {
      setAppendingBookId(null)
      setOcrProgress('')
    }
  }

  // 從搜索結果直接跳到某本書的某句（不需要顯示目標設定視窗）
  const handleOpenBookAtSentence = (book: BookData, sentenceIndex: number) => {
    setSentences(book.sentences)
    setBookTitle(book.title)
    setBookId(book.id)
    setCurrentIndex(sentenceIndex)
    setReadingGoal(0)
    setShowGoalModal(false)
    setPendingBook(null)
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
          onCancel={handleCancelGoal}
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
              <SearchPanel onOpenBook={handleOpenBookAtSentence} />
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

          {/* OCR / PDF 處理進度 */}
          {ocrProgress && (
            <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-700">{ocrProgress}</p>
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
                      {/* 圓形進度環（右下角徽章） */}
                      {book.currentIndex > 0 && (() => {
                        const r = 14
                        const circ = 2 * Math.PI * r
                        const offset = circ * (1 - progress / 100)
                        return (
                          <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                            <svg width="36" height="36" viewBox="0 0 36 36" style={{ position: 'absolute', inset: 0 }}>
                              {/* 軌道 */}
                              <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                              {/* 進度 */}
                              <circle
                                cx="18" cy="18" r={r}
                                fill="none"
                                stroke="rgba(255,255,255,0.85)"
                                strokeWidth="3"
                                strokeDasharray={circ}
                                strokeDashoffset={offset}
                                strokeLinecap="round"
                                transform="rotate(-90 18 18)"
                              />
                            </svg>
                            {/* 中間百分比文字 */}
                            <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1, position: 'relative', zIndex: 1 }}>
                              {progress}%
                            </span>
                          </div>
                        )
                      })()}
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
                      {/* 追加內容（下冊合併） */}
                      <button
                        onClick={(e) => { e.stopPropagation(); document.getElementById(`append-${book.id}`)?.click() }}
                        className="absolute bottom-2 left-2 p-1.5 bg-black/40 hover:bg-green-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
                        title="追加內容（合併下冊）"
                      >
                        {appendingBookId === book.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <FilePlus className="w-3 h-3" />
                        }
                      </button>
                      <input
                        type="file"
                        id={`append-${book.id}`}
                        accept=".txt,.epub,.pdf"
                        className="hidden"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation()
                          const file = e.currentTarget.files?.[0]
                          if (file) handleAppendContent(book, file)
                          // 重置 input，下次還能選同一個檔案
                          e.currentTarget.value = ''
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
                    {/* 書名 */}
                    <p className="mt-2 text-xs text-gray-700 font-medium line-clamp-2 leading-snug">
                      {book.title}
                    </p>
                    {/* 進度文字 + 最後閱讀日期 */}
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-400">
                        {formatDate(book.lastReadDate)}
                      </p>
                      {book.currentIndex > 0 && (
                        <p className="text-[10px] text-gray-400 tabular-nums">
                          {book.currentIndex + 1} / {book.sentences.length}
                        </p>
                      )}
                    </div>
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
          onOpenBook={handleOpenBookAtSentence}
        />
      )}
    </main>
  )
}
