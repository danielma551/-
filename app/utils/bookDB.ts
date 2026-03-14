import { BookData } from './storage'

const DB_NAME = 'reading_website_books_db'
const STORE_NAME = 'books'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function getAllBooksFromIDB(): Promise<BookData[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve((request.result || []).sort((a: BookData, b: BookData) => b.lastReadDate - a.lastReadDate))
      request.onerror = () => reject(request.error)
    })
  } catch {
    return []
  }
}

export async function saveBookToIDB(book: BookData): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(book)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteBookFromIDB(id: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Ignore errors
  }
}

export async function updateBookProgressInIDB(id: string, currentIndex: number): Promise<void> {
  try {
    const db = await openDB()
    const book = await new Promise<BookData | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
    if (book) {
      book.currentIndex = currentIndex
      book.lastReadDate = Date.now()
      await saveBookToIDB(book)
    }
  } catch {
    // Ignore errors
  }
}
