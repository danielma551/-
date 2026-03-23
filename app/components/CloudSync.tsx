// 【雲端同步畫面】
// 這個文件負責：頁面上的「同步」按鈕和操作。
// 上傳：把手機裡所有書籍对到雲端，程式會產生一個 4 位數密碼給你。
// 下載：在另一台設備上輸入密碼，就能把書籍転移過來。
// 密碼 30 天內有效，每次上傳會產生新密碼。

'use client'

import { useState } from 'react'
import { upload } from '@vercel/blob/client'
import { Cloud, Upload as UploadIcon, Download, Check, AlertCircle, Loader2, Copy } from 'lucide-react'
import { BookData, fontStorage, shortcutsStorage, displayStorage } from '../utils/storage'
import { saveFontToIDB } from '../utils/fontDB'
import { getAllBooksFromIDB, saveBookToIDB } from '../utils/bookDB'

const UPLOAD_FP_KEY = 'msw_last_upload_fp'
const DOWNLOAD_FP_KEY = 'msw_last_download_fp'

function makeFingerprint(data: { books: BookData[]; font: unknown; shortcuts: unknown; displaySettings: unknown }): string {
  return JSON.stringify({
    books: data.books.map(b => ({ id: b.id, currentIndex: b.currentIndex, count: b.sentences.length, lastRead: b.lastReadDate })),
    font: data.font,
    shortcuts: data.shortcuts,
    displaySettings: data.displaySettings
  })
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
      const data = {
        books: allBooks.map(({ coverImage: _ci, ...book }) => book),
        font: fontStorage.getFont(),
        shortcuts: shortcutsStorage.getShortcuts(),
        displaySettings: displayStorage.getSettings()
      }

      const fp = makeFingerprint(data)
      if (fp === localStorage.getItem(UPLOAD_FP_KEY)) {
        setStatus('success')
        setMessage('數據與上次上傳完全一致，無需重新上傳')
        return
      }

      // Upload directly to Vercel Blob (bypasses Vercel 4.5MB function body limit)
      const blob = await upload(`sync-${Date.now()}.json`, JSON.stringify(data), {
        access: 'public',
        handleUploadUrl: '/api/blob',
        contentType: 'application/json',
      })

      // Store blob URL in Redis and get 4-digit code
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl: blob.url })
      })
      const json = await res.json()
      if (!res.ok || !json.code) throw new Error(json.error || '上傳失敗')
      setSyncCode(json.code)
      localStorage.setItem(UPLOAD_FP_KEY, fp)
      setStatus('success')
      setMessage('上傳成功！請記下同步碼，在其他設備輸入')
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

      // Fetch actual data directly from Vercel Blob
      const dataRes = await fetch(json.blobUrl)
      if (!dataRes.ok) throw new Error('讀取數據失敗')
      const data = await dataRes.json()

      const fp = makeFingerprint(data)
      if (fp === localStorage.getItem(DOWNLOAD_FP_KEY)) {
        setStatus('success')
        setMessage('數據與上次同步完全一致，無需更新')
        return
      }

      if (data.books) {
        for (const book of data.books) await saveBookToIDB(book)
      }
      if (data.font) {
        fontStorage.saveFont(data.font.fontFamily)
        if (data.font.fontData) saveFontToIDB(data.font.fontFamily, data.font.fontData).catch(console.error)
      }
      if (data.shortcuts) shortcutsStorage.saveShortcuts(data.shortcuts)
      if (data.displaySettings) displayStorage.saveSettings(data.displaySettings)
      localStorage.setItem(DOWNLOAD_FP_KEY, fp)
      setStatus('success')
      setMessage(`同步成功！共 ${data.books?.length ?? 0} 本書`)
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
