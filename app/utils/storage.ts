export interface BookData {
  id: string
  title: string
  sentences: string[]
  currentIndex: number
  uploadDate: number
  lastReadDate: number
}

const STORAGE_KEY = 'reading_website_books'

export const storage = {
  getAllBooks(): BookData[] {
    if (typeof window === 'undefined') return []
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch (error) {
      console.error('Error loading books:', error)
      return []
    }
  },

  saveBook(book: BookData): void {
    if (typeof window === 'undefined') return
    try {
      const books = this.getAllBooks()
      const existingIndex = books.findIndex(b => b.id === book.id)
      
      if (existingIndex >= 0) {
        books[existingIndex] = book
      } else {
        books.push(book)
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(books))
    } catch (error) {
      console.error('Error saving book:', error)
    }
  },

  getBook(id: string): BookData | null {
    const books = this.getAllBooks()
    return books.find(b => b.id === id) || null
  },

  updateProgress(id: string, currentIndex: number): void {
    if (typeof window === 'undefined') return
    try {
      const books = this.getAllBooks()
      const book = books.find(b => b.id === id)
      
      if (book) {
        book.currentIndex = currentIndex
        book.lastReadDate = Date.now()
        localStorage.setItem(STORAGE_KEY, JSON.stringify(books))
      }
    } catch (error) {
      console.error('Error updating progress:', error)
    }
  },

  deleteBook(id: string): void {
    if (typeof window === 'undefined') return
    try {
      const books = this.getAllBooks().filter(b => b.id !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(books))
    } catch (error) {
      console.error('Error deleting book:', error)
    }
  },

  clearAll(): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Error clearing storage:', error)
    }
  }
}

export function generateBookId(title: string): string {
  return `${title}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const FONT_STORAGE_KEY = 'reading_website_font'

export const fontStorage = {
  saveFont(fontFamily: string, fontData?: string): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ fontFamily, fontData }))
    } catch (error) {
      console.error('Error saving font:', error)
    }
  },

  getFont(): { fontFamily: string; fontData?: string } | null {
    if (typeof window === 'undefined') return null
    try {
      const data = localStorage.getItem(FONT_STORAGE_KEY)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Error loading font:', error)
      return null
    }
  },

  clearFont(): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(FONT_STORAGE_KEY)
    } catch (error) {
      console.error('Error clearing font:', error)
    }
  }
}
