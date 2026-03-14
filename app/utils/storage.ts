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
    const books = this.getAllBooks()
    const existingIndex = books.findIndex(b => b.id === book.id)
    if (existingIndex >= 0) {
      books[existingIndex] = book
    } else {
      books.push(book)
    }
    // Let quota errors propagate so callers can handle them
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books))
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
const SHORTCUTS_STORAGE_KEY = 'reading_website_shortcuts'
const DISPLAY_STORAGE_KEY = 'reading_website_display'

export interface KeyboardShortcuts {
  nextSentence: string
  previousSentence: string
  returnHome: string
}

export const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  nextSentence: 'ArrowRight',
  previousSentence: 'ArrowLeft',
  returnHome: 'Escape'
}

export const shortcutsStorage = {
  saveShortcuts(shortcuts: KeyboardShortcuts): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts))
    } catch (error) {
      console.error('Error saving shortcuts:', error)
    }
  },

  getShortcuts(): KeyboardShortcuts {
    if (typeof window === 'undefined') return DEFAULT_SHORTCUTS
    try {
      const data = localStorage.getItem(SHORTCUTS_STORAGE_KEY)
      return data ? JSON.parse(data) : DEFAULT_SHORTCUTS
    } catch (error) {
      console.error('Error loading shortcuts:', error)
      return DEFAULT_SHORTCUTS
    }
  },

  clearShortcuts(): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(SHORTCUTS_STORAGE_KEY)
    } catch (error) {
      console.error('Error clearing shortcuts:', error)
    }
  }
}

export interface DisplaySettings {
  fontSize: number
  backgroundColor: string
  textColor: string
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fontSize: 32,
  backgroundColor: '#ffffff',
  textColor: '#1f2937'
}

export const displayStorage = {
  saveSettings(settings: DisplaySettings): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(settings))
    } catch (error) {
      console.error('Error saving display settings:', error)
    }
  },

  getSettings(): DisplaySettings {
    if (typeof window === 'undefined') return DEFAULT_DISPLAY_SETTINGS
    try {
      const data = localStorage.getItem(DISPLAY_STORAGE_KEY)
      return data ? JSON.parse(data) : DEFAULT_DISPLAY_SETTINGS
    } catch (error) {
      console.error('Error loading display settings:', error)
      return DEFAULT_DISPLAY_SETTINGS
    }
  },

  clearSettings(): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(DISPLAY_STORAGE_KEY)
    } catch (error) {
      console.error('Error clearing display settings:', error)
    }
  }
}

export const fontStorage = {
  saveFont(fontFamily: string, fontData?: string): void {
    if (typeof window === 'undefined') return
    try {
      // Warn if font data is too large (>3MB base64)
      if (fontData && fontData.length > 3 * 1024 * 1024) {
        console.warn('Font file is large, storing name only to avoid storage quota issues')
        localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ fontFamily, fontData: undefined }))
        return
      }
      localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ fontFamily, fontData }))
    } catch (error) {
      console.error('Error saving font:', error)
      // Try saving just the name without data
      try {
        localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ fontFamily, fontData: undefined }))
      } catch {
        // Storage completely full, ignore
      }
    }
  },

  getFont(): { fontFamily: string; fontData?: string } | null {
    if (typeof window === 'undefined') return null
    try {
      const data = localStorage.getItem(FONT_STORAGE_KEY)
      if (!data) return null
      const parsed = JSON.parse(data)
      // If stored font data is too large, strip the data and keep only the name
      if (parsed.fontData && parsed.fontData.length > 3 * 1024 * 1024) {
        console.warn('Stored font data too large, clearing font data from storage')
        const trimmed = { fontFamily: parsed.fontFamily, fontData: undefined }
        try {
          localStorage.removeItem(FONT_STORAGE_KEY)
          localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(trimmed))
        } catch {
          // Ignore cleanup errors
        }
        return trimmed
      }
      return parsed
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
