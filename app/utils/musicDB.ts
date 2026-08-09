// 【背景音樂 IndexedDB 存儲 — 多首歌播放清單】
// 支援上傳多首歌，逐首存 Blob；閱讀時可循環播放整個清單、切上一首/下一首。
// 舊版單首（background-music）會自動遷移入清單。

const DB_NAME = 'reading-music-db'
const DB_VERSION = 1
const STORE_NAME = 'music'
const OLD_MUSIC_KEY = 'background-music'      // 舊版單首鍵（遷移用）
const LIST_KEY = 'track-list'                 // 清單 meta 陣列
const BLOB_PREFIX = 'track-blob-'             // 每首歌 Blob 鍵前綴

export interface MusicMeta {
  name: string
  type: string
  size: number
  savedAt: number
}

export interface MusicTrack extends MusicMeta {
  id: string
}

function openMusicDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('IDB not available')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function get<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// 讀清單（首次會把舊版單首遷移入清單）
export async function listTracks(): Promise<MusicTrack[]> {
  try {
    const db = await openMusicDB()
    let list = (await get<MusicTrack[]>(db, LIST_KEY)) || []
    // 遷移舊版單首
    if (list.length === 0) {
      const oldBlob = await get<Blob>(db, OLD_MUSIC_KEY)
      const oldMeta = await get<MusicMeta>(db, OLD_MUSIC_KEY + '-meta')
      if (oldBlob) {
        const id = newId()
        const meta: MusicTrack = {
          id,
          name: oldMeta?.name || '背景音樂',
          type: oldMeta?.type || oldBlob.type || 'audio/mpeg',
          size: oldMeta?.size || oldBlob.size,
          savedAt: oldMeta?.savedAt || Date.now(),
        }
        list = [meta]
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite')
          const store = tx.objectStore(STORE_NAME)
          store.put(oldBlob, BLOB_PREFIX + id)
          store.put(list, LIST_KEY)
          store.delete(OLD_MUSIC_KEY)
          store.delete(OLD_MUSIC_KEY + '-meta')
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      }
    }
    return list
  } catch { return [] }
}

// 新增一首歌，回傳新 track
export async function addTrack(file: File): Promise<MusicTrack> {
  const db = await openMusicDB()
  const blob = new Blob([await file.arrayBuffer()], { type: file.type })
  const list = (await get<MusicTrack[]>(db, LIST_KEY)) || []
  const track: MusicTrack = {
    id: newId(),
    name: file.name,
    type: file.type,
    size: file.size,
    savedAt: Date.now(),
  }
  const next = [...list, track]
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(blob, BLOB_PREFIX + track.id)
    store.put(next, LIST_KEY)
    tx.oncomplete = () => resolve(track)
    tx.onerror = () => reject(tx.error)
  })
}

// 取某首歌的 Object URL（呼叫端負責 revokeObjectURL）
export async function getTrackObjectURL(id: string): Promise<string | null> {
  try {
    const db = await openMusicDB()
    const blob = await get<Blob>(db, BLOB_PREFIX + id)
    return blob ? URL.createObjectURL(blob) : null
  } catch { return null }
}

// 刪除某首歌
export async function deleteTrack(id: string): Promise<void> {
  const db = await openMusicDB()
  const list = (await get<MusicTrack[]>(db, LIST_KEY)) || []
  const next = list.filter(t => t.id !== id)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(BLOB_PREFIX + id)
    store.put(next, LIST_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
