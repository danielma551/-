// 【設定儲存】
// 這個文件負責：把各種小設定存到瀏覽器的「小型儲存空間」，讓下次打開還記得你的偏好。
// 存了哪些東西：
//   - 鍵盤快捷鍵（比如哪個鍵是「下一句」）
//   - 顯示設定（字體大小、背景顏色、文字顏色、震動強度等）
//   - 目前使用的字體名稱
//   - 書籍的格式定義（BookData）與 ID 產生方法
//   - 每日閱讀記錄（用於 30 天趨勢圖）

export interface BookData {
  id: string
  title: string
  sentences: string[]
  currentIndex: number
  uploadDate: number
  lastReadDate: number
  coverColor?: string
  coverImage?: string
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
  progressColor: string
  vibrationIntensity: number
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fontSize: 32,
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  progressColor: '#6366f1',
  vibrationIntensity: 100
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
      return data ? { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(data) } : DEFAULT_DISPLAY_SETTINGS
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
  saveFont(fontFamily: string): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ fontFamily }))
    } catch (error) {
      console.error('Error saving font name:', error)
    }
  },

  getFont(): { fontFamily: string } | null {
    if (typeof window === 'undefined') return null
    try {
      const data = localStorage.getItem(FONT_STORAGE_KEY)
      if (!data) return null
      const parsed = JSON.parse(data)
      if (!parsed.fontFamily) return null
      // Migrate: remove any old large font data that was stored here
      if (parsed.fontData) {
        try {
          localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify({ fontFamily: parsed.fontFamily }))
        } catch {
          // Ignore
        }
      }
      return { fontFamily: parsed.fontFamily }
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

// 每日閱讀記錄的 localStorage 鍵名
const HISTORY_STORAGE_KEY = 'reading-history'

// 每日閱讀記錄的格式：日期字串 → 當天讀了幾句
// 例如 { "2026-03-28": 45, "2026-03-29": 23 }
export type ReadingHistory = Record<string, number>

export const historyStorage = {
  // 取得全部閱讀記錄
  getHistory(): ReadingHistory {
    if (typeof window === 'undefined') return {}
    try {
      const data = localStorage.getItem(HISTORY_STORAGE_KEY)
      return data ? JSON.parse(data) : {}
    } catch {
      return {}
    }
  },

  // 記錄今天又讀了幾句（累計加上去）
  recordRead(count: number): void {
    if (typeof window === 'undefined') return
    try {
      const history = historyStorage.getHistory()
      // 用當地時間的日期字串作為 key，例如 "2026-03-28"
      const today = new Date().toLocaleDateString('en-CA')
      history[today] = (history[today] ?? 0) + count
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history))
    } catch (e) {
      console.error('[historyStorage] recordRead failed:', e)
    }
  },

  // 取得最近 N 天的資料（含沒有閱讀的日子，補 0）
  getLast30Days(): { date: string; count: number }[] {
    const history = historyStorage.getHistory()
    const result: { date: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-CA')
      result.push({ date: key, count: history[key] ?? 0 })
    }
    return result
  }
}
