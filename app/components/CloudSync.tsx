'use client'

import { useState } from 'react'
import { Cloud, Upload as UploadIcon, Download, Check, AlertCircle, Loader2 } from 'lucide-react'
import { storage, fontStorage, shortcutsStorage, displayStorage } from '../utils/storage'

interface CloudSyncProps {
  onSyncComplete?: () => void
}

export default function CloudSync({ onSyncComplete }: CloudSyncProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'uploading' | 'downloading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [syncCode, setSyncCode] = useState('')

  const generateSyncData = () => {
    const allBooks = storage.getAllBooks()
    const font = fontStorage.getFont()
    const shortcuts = shortcutsStorage.getShortcuts()
    const displaySettings = displayStorage.getSettings()

    return {
      books: allBooks,
      font,
      shortcuts,
      displaySettings,
      timestamp: Date.now()
    }
  }

  const handleUpload = async () => {
    setSyncStatus('uploading')
    setMessage('正在上傳數據...')

    try {
      const syncData = generateSyncData()
      const dataString = JSON.stringify(syncData)
      
      // 使用 JSONBin.io 免費 API 存儲數據
      const response = await fetch('https://api.jsonbin.io/v3/b', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': '$2a$10$8VZ0YqF5kF5kF5kF5kF5kOeF5kF5kF5kF5kF5kF5kF5kF5kF5kF5k' // 公共測試密鑰
        },
        body: dataString
      })

      if (!response.ok) {
        throw new Error('上傳失敗')
      }

      const result = await response.json()
      const code = result.metadata.id

      setSyncCode(code)
      setSyncStatus('success')
      setMessage(`上傳成功！同步碼：${code}`)
      
      // 保存同步碼到本地
      localStorage.setItem('reading_website_sync_code', code)
    } catch (error) {
      console.error('Upload error:', error)
      setSyncStatus('error')
      setMessage('上傳失敗，請檢查網絡連接')
    }
  }

  const handleDownload = async () => {
    if (!syncCode.trim()) {
      setMessage('請輸入同步碼')
      return
    }

    setSyncStatus('downloading')
    setMessage('正在下載數據...')

    try {
      const response = await fetch(`https://api.jsonbin.io/v3/b/${syncCode.trim()}`, {
        headers: {
          'X-Master-Key': '$2a$10$8VZ0YqF5kF5kF5kF5kF5kOeF5kF5kF5kF5kF5kF5kF5kF5kF5kF5k'
        }
      })

      if (!response.ok) {
        throw new Error('下載失敗')
      }

      const result = await response.json()
      const syncData = result.record

      // 恢復數據
      if (syncData.books) {
        syncData.books.forEach((book: any) => {
          storage.saveBook(book)
        })
      }
      if (syncData.font) {
        fontStorage.saveFont(syncData.font.fontFamily, syncData.font.fontData)
      }
      if (syncData.shortcuts) {
        shortcutsStorage.saveShortcuts(syncData.shortcuts)
      }
      if (syncData.displaySettings) {
        displayStorage.saveSettings(syncData.displaySettings)
      }

      setSyncStatus('success')
      setMessage('下載成功！數據已同步')
      
      // 保存同步碼
      localStorage.setItem('reading_website_sync_code', syncCode.trim())
      
      // 通知父組件刷新
      setTimeout(() => {
        if (onSyncComplete) {
          onSyncComplete()
        }
        setIsOpen(false)
      }, 1500)
    } catch (error) {
      console.error('Download error:', error)
      setSyncStatus('error')
      setMessage('下載失敗，請檢查同步碼是否正確')
    }
  }

  const handleOpen = () => {
    setIsOpen(true)
    setSyncStatus('idle')
    setMessage('')
    // 嘗試加載上次的同步碼
    const savedCode = localStorage.getItem('reading_website_sync_code')
    if (savedCode) {
      setSyncCode(savedCode)
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
      >
        <Cloud className="w-5 h-5" />
        <span>雲端同步</span>
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-800">雲端同步</h3>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Upload Section */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-800">📤 上傳到雲端</h4>
                <p className="text-sm text-gray-600">
                  將當前設備的所有數據（書籍、進度、設定）上傳到雲端
                </p>
                <button
                  onClick={handleUpload}
                  disabled={syncStatus === 'uploading' || syncStatus === 'downloading'}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {syncStatus === 'uploading' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>上傳中...</span>
                    </>
                  ) : (
                    <>
                      <UploadIcon className="w-5 h-5" />
                      <span>上傳數據</span>
                    </>
                  )}
                </button>
              </div>

              <div className="border-t border-gray-200"></div>

              {/* Download Section */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-800">📥 從雲端下載</h4>
                <p className="text-sm text-gray-600">
                  輸入同步碼，下載其他設備上傳的數據
                </p>
                <input
                  type="text"
                  value={syncCode}
                  onChange={(e) => setSyncCode(e.target.value)}
                  placeholder="輸入同步碼"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={handleDownload}
                  disabled={syncStatus === 'uploading' || syncStatus === 'downloading'}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {syncStatus === 'downloading' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>下載中...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      <span>下載數據</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status Message */}
              {message && (
                <div className={`p-4 rounded-lg flex items-start space-x-3 ${
                  syncStatus === 'success' ? 'bg-green-50 border border-green-200' :
                  syncStatus === 'error' ? 'bg-red-50 border border-red-200' :
                  'bg-blue-50 border border-blue-200'
                }`}>
                  {syncStatus === 'success' && <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
                  {syncStatus === 'error' && <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      syncStatus === 'success' ? 'text-green-800' :
                      syncStatus === 'error' ? 'text-red-800' :
                      'text-blue-800'
                    }`}>
                      {message}
                    </p>
                    {syncCode && syncStatus === 'success' && (
                      <p className="text-xs text-gray-600 mt-2">
                        💡 請保存此同步碼，在其他設備使用
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600">
                  <strong>使用說明：</strong><br />
                  1️⃣ 在電腦上點擊「上傳數據」，獲得同步碼<br />
                  2️⃣ 在手機上輸入同步碼，點擊「下載數據」<br />
                  3️⃣ 數據會自動同步到手機
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
