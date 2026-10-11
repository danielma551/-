// 【書本音頻】由 mp3 轉錄而成嘅書，連原音頻一齊存（IndexedDB，只存本機，唔上雲端）。
// times[i] = 第 i 句喺音頻入面大約幾多秒開始（由 Whisper 時間戳推算），日後可做跟讀。

const DB_NAME = 'reading-book-audio-db'
const STORE = 'audio'

export interface BookAudio {
  bookId: string
  blob: Blob
  name: string
  times: number[]     // 每句開始秒數（同 sentences 一一對應）
  savedAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('IDB not available')); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'bookId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveBookAudio(a: BookAudio): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(a)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getBookAudio(bookId: string): Promise<BookAudio | null> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(bookId)
      req.onsuccess = () => resolve((req.result as BookAudio) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch { return null }
}

export async function deleteBookAudio(bookId: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(bookId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}
