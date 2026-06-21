// 【背景音樂 IndexedDB 存儲】
// 把用戶上傳的音樂文件存在瀏覽器 IDB，讀取後建立 Object URL 播放。
// 支援任意音頻格式（MP3、AAC、OGG 等）。

const DB_NAME = 'reading-music-db'
const DB_VERSION = 1
const STORE_NAME = 'music'
const MUSIC_KEY = 'background-music'

export interface MusicMeta {
  name: string        // 文件名（顯示用）
  type: string        // MIME type
  size: number        // bytes
  savedAt: number     // timestamp
}

function openMusicDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IDB not available'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// 儲存音樂 Blob + metadata
export async function saveMusicToIDB(file: File): Promise<void> {
  const db = await openMusicDB()
  const blob = new Blob([await file.arrayBuffer()], { type: file.type })
  const meta: MusicMeta = {
    name: file.name,
    type: file.type,
    size: file.size,
    savedAt: Date.now(),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(blob, MUSIC_KEY)
    store.put(meta, MUSIC_KEY + '-meta')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// 取得音樂 Blob，建立 Object URL（呼叫端負責 revokeObjectURL）
export async function getMusicObjectURL(): Promise<string | null> {
  try {
    const db = await openMusicDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(MUSIC_KEY)
      req.onsuccess = () => {
        const blob = req.result as Blob | undefined
        resolve(blob ? URL.createObjectURL(blob) : null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

// 取得 metadata（不需要讀 Blob，速度快）
export async function getMusicMeta(): Promise<MusicMeta | null> {
  try {
    const db = await openMusicDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(MUSIC_KEY + '-meta')
      req.onsuccess = () => resolve((req.result as MusicMeta) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

// 刪除音樂
export async function deleteMusicFromIDB(): Promise<void> {
  const db = await openMusicDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(MUSIC_KEY)
    store.delete(MUSIC_KEY + '-meta')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
