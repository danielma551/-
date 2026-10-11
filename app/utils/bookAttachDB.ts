// 【書本參考 PDF】每本書可以附一份 PDF 做參考（IndexedDB，只存本機，唔上雲端）。

const DB_NAME = 'reading-book-attach-db'
const STORE = 'pdf'

export interface BookPdf {
  bookId: string
  blob: Blob
  name: string
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

export async function saveBookPdf(p: BookPdf): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(p)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getBookPdf(bookId: string): Promise<BookPdf | null> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(bookId)
      req.onsuccess = () => resolve((req.result as BookPdf) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch { return null }
}

export async function deleteBookPdf(bookId: string): Promise<void> {
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
