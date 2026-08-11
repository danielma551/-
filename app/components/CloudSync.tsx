// 【雲端同步畫面】
// 這個文件負責：頁面上的「同步」按鈕和操作。
// 上傳：把手機裡所有書籍对到雲端，程式會產生一個 4 位數密碼給你。
// 下載：在另一台設備上輸入密碼，就能把書籍転移過來。
// 密碼 30 天內有效，每次上傳會產生新密碼。

'use client'

import { useState } from 'react'
import { upload } from '@vercel/blob/client'
import { Cloud, Upload as UploadIcon, Download, Check, AlertCircle, Loader2, Copy } from 'lucide-react'
import { BookData, fontStorage, historyStorage, ReadingHistory, reviewStorage, bookReadingStorage } from '../utils/storage'
import { saveFontToIDB } from '../utils/fontDB'
import { getAllBooksFromIDB, saveBookToIDB } from '../utils/bookDB'

const UPLOAD_FP_KEY = 'msw_last_upload_fp'
const DOWNLOAD_FP_KEY = 'msw_last_download_fp'
const LAST_BLOB_URL_KEY = 'msw_last_blob_url'  // 記住上次的 blob URL，供下次上傳時清理

// 只同步書籍、字體、閱讀記錄
// 快捷鍵、字體大小、顯示設定等「裝置偏好」不參與同步，每台設備各自保存
// gzip 壓縮／解壓（用瀏覽器內建 CompressionStream，大幅減少上傳體積 → 上傳更快）
function canGzip(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}
async function gzipString(str: string): Promise<Blob> {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))
  return await new Response(stream).blob()
}
async function gunzipToString(buf: ArrayBuffer): Promise<string> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

// 快速內容雜湊（FNV-1a）：判斷書本／清單有冇改動
function fastHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

// 逐書上傳記錄：{ bookId: { hash, url } }，用嚟判斷邊本書要重新上傳、邊本重用舊 URL
const BOOK_MAP_KEY = 'msw_sync_book_map'
function getBookMap(): Record<string, { hash: string; url: string }> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(BOOK_MAP_KEY) || '{}') } catch { return {} }
}
function saveBookMap(m: Record<string, { hash: string; url: string }>) {
  try { localStorage.setItem(BOOK_MAP_KEY, JSON.stringify(m)) } catch { /* 配額滿略過 */ }
}

interface CloudSyncProps {
  onSyncComplete?: () => void
}

export default function CloudSync({ onSyncComplete }: CloudSyncProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'downloading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [syncCode, setSyncCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [copied, setCopied] = useState(false)

  const handleUpload = async () => {
    setStatus('uploading')
    setMessage('')
    try {
      const allBooks = await getAllBooksFromIDB()
      const useGzip = canGzip()

      // ── 逐本書：只上傳有改動嘅，冇變重用上次 URL ──
      const prevMap = getBookMap()
      const newMap: Record<string, { hash: string; url: string }> = {}
      const bookRefs: { id: string; url: string; gz: boolean }[] = []
      let uploaded = 0
      for (const book of allBooks) {
        const str = JSON.stringify(book)
        const hash = fastHash(str) + '_' + str.length
        const prev = prevMap[book.id]
        let url: string
        if (prev && prev.hash === hash && prev.url) {
          url = prev.url   // 內容未變 → 重用，跳過上傳
        } else {
          uploaded++
          setMessage(`上傳有改動的書籍中…（第 ${uploaded} 本）`)
          const bBody: Blob | string = useGzip ? await gzipString(str) : str
          const bBlob = await upload(`book-${book.id}-${hash}.json${useGzip ? '.gz' : ''}`, bBody, {
            access: 'public', handleUploadUrl: '/api/blob', contentType: useGzip ? 'application/gzip' : 'application/json',
          })
          url = bBlob.url
        }
        newMap[book.id] = { hash, url }
        bookRefs.push({ id: book.id, url, gz: useGzip })
        saveBookMap(newMap)   // 每本存一次：中途失敗都保住進度，下次唔使重傳
      }

      // ── 清單（指向各書 blob）＋ 字體/閱讀記錄/温習卡（體積細，每次都傳）──
      const manifest = {
        v: 2,
        bookRefs,
        font: fontStorage.getFont(),
        readingHistory: historyStorage.getHistory(),
        reviewNotes: reviewStorage.getAll(),
        reviewSession: reviewStorage.getSession(),   // 今日温習進度（跨裝置：知道今日已温習）
        reviewHeat: reviewStorage.getHeat(),         // 温習熱圖（每日張數）
        bookReadDays: bookReadingStorage.getAll(),   // 每本書閱讀日
      }
      const manifestStr = JSON.stringify(manifest)
      const fp = fastHash(manifestStr)
      if (fp === localStorage.getItem(UPLOAD_FP_KEY)) {
        saveBookMap(newMap)
        setStatus('success')
        setMessage('數據與上次上傳完全一致，無需重新上傳')
        return
      }

      const oldBlobUrl = localStorage.getItem(LAST_BLOB_URL_KEY)
      const mBody: Blob | string = useGzip ? await gzipString(manifestStr) : manifestStr
      const mBlob = await upload(`sync-${Date.now()}.json${useGzip ? '.gz' : ''}`, mBody, {
        access: 'public', handleUploadUrl: '/api/blob', contentType: useGzip ? 'application/gzip' : 'application/json',
      })

      // Store manifest URL in Redis and get 4-digit code
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl: mBlob.url })
      })
      const json = await res.json()
      if (!res.ok || !json.code) throw new Error(json.error || '上傳失敗')
      setSyncCode(json.code)
      saveBookMap(newMap)
      localStorage.setItem(UPLOAD_FP_KEY, fp)
      localStorage.setItem(LAST_BLOB_URL_KEY, mBlob.url)
      setStatus('success')
      setMessage(uploaded > 0 ? `上傳成功！本次只更新 ${uploaded} 本書，請記下同步碼` : '上傳成功！請記下同步碼')

      // 刪除上一次的舊「清單」blob（各書 blob 保留供重用）
      if (oldBlobUrl) {
        fetch('/api/blob', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: oldBlobUrl })
        }).catch(() => {})
      }
    } catch (e: unknown) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : '上傳失敗')
    }
  }

  const handleDownload = async () => {
    if (!inputCode.trim()) { setMessage('請輸入同步碼'); return }
    setStatus('downloading')
    setMessage('')
    try {
      // Get blob URL from Redis
      const res = await fetch(`/api/sync?code=${inputCode.trim()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '下載失敗')

      // Fetch actual data directly from Vercel Blob（.gz → 解壓；舊版未壓縮則直接 parse）
      const dataRes = await fetch(json.blobUrl)
      if (!dataRes.ok) throw new Error('讀取數據失敗')
      const isGz = typeof json.blobUrl === 'string' && json.blobUrl.includes('.json.gz')
      const data = isGz
        ? JSON.parse(await gunzipToString(await dataRes.arrayBuffer()))
        : await dataRes.json()

      const fp = fastHash(JSON.stringify(data))
      if (fp === localStorage.getItem(DOWNLOAD_FP_KEY)) {
        setStatus('success')
        setMessage('數據與上次同步完全一致，無需更新')
        return
      }

      let bookCount = 0
      if (Array.isArray(data.bookRefs)) {
        // 新版（v2）：逐本書 blob 下載（未變的瀏覽器會用快取）
        for (const ref of data.bookRefs) {
          bookCount++
          setMessage(`下載書籍中…（${bookCount}/${data.bookRefs.length}）`)
          const br = await fetch(ref.url)
          if (!br.ok) continue
          const refGz = ref.gz || (typeof ref.url === 'string' && ref.url.includes('.json.gz'))
          const bookStr = refGz ? await gunzipToString(await br.arrayBuffer()) : await br.text()
          await saveBookToIDB(JSON.parse(bookStr))
        }
      } else if (Array.isArray(data.books)) {
        // 舊版快照：向後相容
        for (const book of data.books) await saveBookToIDB(book)
        bookCount = data.books.length
      }
      if (data.font) {
        fontStorage.saveFont(data.font.fontFamily)
        if (data.font.fontData) saveFontToIDB(data.font.fontFamily, data.font.fontData).catch(console.error)
      }
      // 快捷鍵、顯示設定不從雲端覆蓋（保留本機各自設定）
      // 合併閱讀記錄：同一天取兩者中較大的數值，避免覆蓋本地數據
      if (data.readingHistory) {
        const local = historyStorage.getHistory()
        const remote = data.readingHistory as ReadingHistory
        const merged: ReadingHistory = { ...local }
        for (const [date, count] of Object.entries(remote)) {
          merged[date] = Math.max(merged[date] ?? 0, count)
        }
        localStorage.setItem('reading-history', JSON.stringify(merged))
      }
      // 合併每日温習卡片（以文字去重，保留複習進度較深者）
      if (data.reviewNotes) {
        reviewStorage.merge(data.reviewNotes)
      }
      // 合併今日温習 session：若雲端係今日且進度更深（做得更多），採用之 → 電腦會知「今日已温習」
      if (data.reviewSession && typeof data.reviewSession === 'object') {
        const today = new Date().toLocaleDateString('en-CA')
        if (data.reviewSession.date === today) {
          const local = reviewStorage.getSession()
          const remoteDone = data.reviewSession.done ?? 0
          const localDone = local && local.date === today ? (local.done ?? 0) : -1
          if (remoteDone >= localDone) reviewStorage.saveSession(data.reviewSession)
        }
      }
      // 合併温習熱圖（每日取較大值）
      if (data.reviewHeat) {
        reviewStorage.mergeHeat(data.reviewHeat)
      }
      // 合併每本書閱讀日（每日取較大值）
      if (data.bookReadDays) {
        bookReadingStorage.merge(data.bookReadDays)
      }
      localStorage.setItem(DOWNLOAD_FP_KEY, fp)
      setStatus('success')
      setMessage(`同步成功！共 ${bookCount} 本書`)
      setTimeout(() => { onSyncComplete?.(); setIsOpen(false) }, 1500)
    } catch (e: unknown) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : '下載失敗')
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(syncCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpen = () => {
    setIsOpen(true)
    setStatus('idle')
    setMessage('')
    setSyncCode('')
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center space-x-2 px-4 py-2 rounded-full border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Cloud className="w-4 h-4" />
        <span>雲端同步</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">雲端同步</h3>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Upload */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">📤 上傳並獲取同步碼</p>
                <button
                  onClick={handleUpload}
                  disabled={status === 'uploading' || status === 'downloading'}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {status === 'uploading'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /><span>上傳中...</span></>
                    : <><UploadIcon className="w-4 h-4" /><span>上傳數據</span></>}
                </button>
                {syncCode && (
                  <div className="flex items-center space-x-2 p-3 bg-indigo-50 rounded-xl">
                    <p className="flex-1 font-mono text-sm text-indigo-700 break-all">{syncCode}</p>
                    <button onClick={handleCopy} className="text-indigo-500 hover:text-indigo-700 flex-shrink-0">
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100" />

              {/* Download */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">📥 輸入同步碼下載</p>
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  placeholder="輸入同步碼"
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                />
                <button
                  onClick={handleDownload}
                  disabled={status === 'uploading' || status === 'downloading'}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {status === 'downloading'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /><span>下載中...</span></>
                    : <><Download className="w-4 h-4" /><span>下載數據</span></>}
                </button>
              </div>

              {/* Status */}
              {message && (
                <div className={`p-3 rounded-xl flex items-start space-x-2 text-sm ${
                  status === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {status === 'success'
                    ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  <p>{message}</p>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">同步碼有效期約 30 天</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
