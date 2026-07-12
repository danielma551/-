// 【設定儲存】
// 這個文件負責：把各種小設定存到瀏覽器的「小型儲存空間」，讓下次打開還記得你的偏好。
// 存了哪些東西：
//   - 鍵盤快捷鍵（比如哪個鍵是「下一句」）
//   - 顯示設定（字體大小、背景顏色、文字顏色、震動強度等）
//   - 目前使用的字體名稱
//   - 書籍的格式定義（BookData）與 ID 產生方法
//   - 每日閱讀記錄（用於 30 天趨勢圖）

export interface ChapterMark {
  title: string
  startIndex: number
}

export interface BookData {
  id: string
  title: string
  sentences: string[]
  currentIndex: number
  uploadDate: number
  lastReadDate: number
  coverColor?: string
  coverImage?: string
  chapters?: ChapterMark[]   // EPUB 章節目錄（非 EPUB 書本為 undefined）
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

// 振動模式：每個字串代表 navigator.vibrate() 的 pattern，逗號分隔
// 例如 "15,30,15" → vibrate([15,30,15])，"0" → 關閉
export type VibrationPattern = 'off' | 'crisp' | 'gentle' | 'standard' | 'strong' | 'double'

export const VIBRATION_PRESETS: Record<VibrationPattern, { label: string; pattern: number[] | 0; desc: string }> = {
  off:      { label: '關閉',   pattern: 0,              desc: '無震動' },
  crisp:    { label: '清脆',   pattern: [12],           desc: '12ms 短促，類似按鍵感' },
  gentle:   { label: '輕柔',   pattern: [28],           desc: '28ms 輕拍' },
  standard: { label: '標準',   pattern: [60],           desc: '60ms 一般震動' },
  strong:   { label: '強烈',   pattern: [120],          desc: '120ms 重震' },
  double:   { label: '雙擊',   pattern: [12, 30, 12],   desc: '兩下短震，有節奏感' },
}

export interface DisplaySettings {
  fontSize: number
  backgroundColor: string
  textColor: string
  progressColor: string
  vibrationIntensity: number   // 保留舊欄位向後相容
  vibrationPattern: VibrationPattern
  lineHeight: number            // 行距，預設 1.8
  letterSpacing: number         // 字距 (em)，預設 0.05
  animationStyle: 'fade' | 'rise'  // 句子過場：淡入 / 向上浮現
  animationSpeed: 'slow' | 'normal' | 'fast'  // 過場速度
  columnWidth: 'narrow' | 'medium' | 'wide'   // 閱讀欄寬
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fontSize: 32,
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  progressColor: '#6366f1',
  vibrationIntensity: 60,
  vibrationPattern: 'standard',
  lineHeight: 1.8,
  letterSpacing: 0.05,
  animationStyle: 'rise',
  animationSpeed: 'normal',
  columnWidth: 'medium',
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
      if (!data) return DEFAULT_DISPLAY_SETTINGS
      const saved = JSON.parse(data)
      const merged = { ...DEFAULT_DISPLAY_SETTINGS, ...saved }
      // 舊資料沒有 vibrationPattern：根據舊 vibrationIntensity 推斷
      if (!saved.vibrationPattern) {
        if (!saved.vibrationIntensity || saved.vibrationIntensity === 0) merged.vibrationPattern = 'off'
        else if (saved.vibrationIntensity <= 20) merged.vibrationPattern = 'crisp'
        else if (saved.vibrationIntensity <= 40) merged.vibrationPattern = 'gentle'
        else if (saved.vibrationIntensity <= 80) merged.vibrationPattern = 'standard'
        else merged.vibrationPattern = 'strong'
      }
      return merged
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

// Flomo API 網址（只存 localStorage，不寫進代碼，避免 git 洩漏）
const FLOMO_API_KEY = 'flomo-api-url'

export const flomoStorage = {
  getUrl(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(FLOMO_API_KEY)
  },
  saveUrl(url: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(FLOMO_API_KEY, url)
  },
  clearUrl(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(FLOMO_API_KEY)
  }
}

// ── 每日温習筆記（本機儲存 + 間隔重溫 SRS）──
export interface ReviewNote {
  id: string
  text: string          // 筆記內容（通常為句子／段落）
  source?: string       // 來源書名
  createdAt: number
  box: number           // SRS 盒子 0..5，越高間隔越長
  due: number           // 下次該温習的時間戳
  reviewCount: number   // 已温習次數
  device?: string       // 建立這張卡的設備（例如 iPhone / Mac / Windows）
  meta?: string         // 附加資訊（來源／章節／時間／標籤，匯入時保留）
  lastReviewed?: number // 最後一次温習時間（用於「今日已温習不再出現」）
}

// 由 UA 粗略判斷設備類型（建立卡片時記錄，跨裝置同步後可看到來源）
export function detectDevice(): string {
  if (typeof navigator === 'undefined') return '裝置'
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  return '裝置'
}

const REVIEW_KEY = 'review-notes'
const REVIEW_SESSION_KEY = 'review-session'

// 每日温習 session（記錄當天進度，退出可續做）
export interface DailySession {
  date: string      // YYYY-MM-DD（本地）
  ids: string[]     // 尚未完成（記得了）的卡片 id，順序即温習順序
  done: number      // 今天已完成（記得了）張數
  total: number     // 今天總張數（固定，如 24）
}

function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA')
}

// 判斷一張卡是否「雜項」（無正文）：純時間戳／純日期，或每行都係 metadata（emoji／來源章節時間欄／純標籤）
function isJunkNoteText(text: string): boolean {
  const t = (text || '').trim()
  if (t.replace(/\s/g, '').length < 2) return true
  if (/^\d{4}[-/]\d{2}[-/]\d{2}(\s+\d{1,2}:\d{2}(:\d{2})?)?(\s*[|｜].*)?$/.test(t)) return true
  const metaLine = (l: string) =>
    /^[📖📕📗📘📙📚📂📁📍📅🗓🔖🏷📎🔗⏰🕐]/u.test(l) ||
    /^(來源|来源|章節|章节|時間|时间|標籤|标签|出處|出处|標題|标题|作者)\s*[:：]/.test(l) ||
    (/^#\S/.test(l) && l.split(/\s+/).every(w => w.startsWith('#'))) ||
    /^\d{4}[-/]\d{2}[-/]\d{2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/.test(l)
  const lines = t.split(/\n/).map(s => s.trim()).filter(Boolean)
  return lines.length > 0 && lines.every(metaLine)
}
const DAY_MS = 86400000
// 各盒子的間隔天數（index = box）：今天、1、2、4、7、15 天
const BOX_DAYS = [0, 1, 2, 4, 7, 15]

export const reviewStorage = {
  getAll(): ReviewNote[] {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(REVIEW_KEY)
      return raw ? (JSON.parse(raw) as ReviewNote[]) : []
    } catch { return [] }
  },
  saveAll(list: ReviewNote[]): void {
    if (typeof window === 'undefined') return
    try { localStorage.setItem(REVIEW_KEY, JSON.stringify(list)) } catch { /* 配額滿則略過 */ }
  },
  // 批量加入（依文字去重，已存在則略過），回傳實際新增數量
  addMany(texts: string[], source?: string): number {
    const list = this.getAll()
    const seen = new Set(list.map(n => n.text.trim()))
    const now = Date.now()
    let added = 0
    for (const raw of texts) {
      const text = (raw || '').trim()
      if (!text || text.startsWith('data:image/') || seen.has(text)) continue
      seen.add(text)
      list.push({ id: `${now}-${Math.random().toString(36).slice(2, 8)}`, text, source, createdAt: now, box: 0, due: now, reviewCount: 0, device: detectDevice() })
      added++
    }
    if (added > 0) this.saveAll(list)
    return added
  },
  // 匯入（每條各自帶來源書本資訊），依文字去重
  addImported(items: ImportedNote[]): number {
    const list = this.getAll()
    const seen = new Set(list.map(n => n.text.trim()))
    const now = Date.now()
    let added = 0
    for (const it of items) {
      const text = (it?.text || '').trim()
      if (!text || seen.has(text)) continue
      seen.add(text)
      list.push({ id: `${now}-${Math.random().toString(36).slice(2, 8)}`, text, source: it.source || 'Flomo 匯入', createdAt: now, box: 0, due: now, reviewCount: 0, device: detectDevice(), meta: it.meta })
      added++
    }
    if (added > 0) this.saveAll(list)
    return added
  },
  remove(id: string): void {
    this.saveAll(this.getAll().filter(n => n.id !== id))
  },
  // 標記「記得」：升一格，依新盒子排下次温習
  markKnown(id: string): void {
    const list = this.getAll()
    const n = list.find(x => x.id === id)
    if (!n) return
    n.box = Math.min(BOX_DAYS.length - 1, n.box + 1)
    n.due = Date.now() + BOX_DAYS[n.box] * DAY_MS
    n.reviewCount++
    n.lastReviewed = Date.now()
    this.saveAll(list)
  },
  // 標記「要再温」：歸零，今天再出現
  markAgain(id: string): void {
    const list = this.getAll()
    const n = list.find(x => x.id === id)
    if (!n) return
    n.box = 0
    n.due = Date.now()
    n.reviewCount++
    n.lastReviewed = Date.now()
    this.saveAll(list)
  },
  // 今天到期（含逾期）的卡片，依到期時間排序
  dueToday(): ReviewNote[] {
    const end = new Date(); end.setHours(23, 59, 59, 999)
    return this.getAll().filter(n => n.due <= end.getTime()).sort((a, b) => a.due - b.due)
  },
  // ── 每日 session：固定 24 張、退出可續做 ──
  getSession(): DailySession | null {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(localStorage.getItem(REVIEW_SESSION_KEY) || 'null') } catch { return null }
  },
  saveSession(s: DailySession) {
    if (typeof window === 'undefined') return
    try { localStorage.setItem(REVIEW_SESSION_KEY, JSON.stringify(s)) } catch { /* ignore */ }
  },
  // 開始或續做今天嘅 session：回傳剩餘卡片、已完成數、當天總數
  resumeOrStartDaily(limit = 24): { queue: ReviewNote[]; done: number; total: number } {
    const today = todayLocal()
    const all = this.getAll()
    const map = new Map(all.map(n => [n.id, n]))
    let s = this.getSession()
    if (!s || s.date !== today) {
      const picked = this.pickDaily(limit)
      s = { date: today, ids: picked.map(n => n.id), done: 0, total: picked.length }
    } else {
      s.ids = s.ids.filter(id => map.has(id))   // 剔走已刪除嘅卡
    }
    this.saveSession(s)
    const queue = s.ids.map(id => map.get(id)).filter((n): n is ReviewNote => !!n)
    return { queue, done: s.done, total: s.total }
  },
  sessionMarkKnown(id: string) {   // 記得了：移出剩餘、完成 +1
    const s = this.getSession(); if (!s) return
    s.ids = s.ids.filter(x => x !== id); s.done += 1; this.saveSession(s)
  },
  sessionMoveBack(id: string) {    // 要再温：移到隊尾，本節稍後再出現
    const s = this.getSession(); if (!s) return
    s.ids = s.ids.filter(x => x !== id).concat(id); this.saveSession(s)
  },
  sessionRemove(id: string) {      // 刪卡：從剩餘移走
    const s = this.getSession(); if (!s) return
    s.ids = s.ids.filter(x => x !== id); this.saveSession(s)
  },
  resetSession() {
    if (typeof window !== 'undefined') localStorage.removeItem(REVIEW_SESSION_KEY)
  },
  // 每日温習抽卡：先取今天到期，不足則按最近到期補足，最後「隨機打亂」，固定取 limit 張
  pickDaily(limit = 24): ReviewNote[] {
    const today = todayLocal()
    // 排除「今日已温習」的卡（今日暫不再出現）
    const reviewedToday = (n: ReviewNote) => !!n.lastReviewed && new Date(n.lastReviewed).toLocaleDateString('en-CA') === today
    const pool = this.getAll().filter(n => !reviewedToday(n))
    // 循環模式：最久未温習（含從未温習）優先 → 温習過的卡要等所有卡都看過一次先再出現
    pool.sort((a, b) => (a.lastReviewed ?? 0) - (b.lastReviewed ?? 0))
    const sel = pool.slice(0, limit)
    // 選出的一批內部隨機打亂順序（呈現次序隨機，但「選誰」仍照循環）
    for (let i = sel.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[sel[i], sel[j]] = [sel[j], sel[i]]
    }
    return sel
  },
  stats(): { total: number; due: number } {
    return { total: this.getAll().length, due: this.dueToday().length }
  },
  // 一鍵清理：移除雜項卡（純時間戳／純 metadata），回傳移除數量
  cleanupJunk(): number {
    const all = this.getAll()
    const kept = all.filter(n => !isJunkNoteText(n.text))
    const removed = all.length - kept.length
    if (removed > 0) this.saveAll(kept)
    return removed
  },
  // 跨裝置合併：以「文字」為鍵去重；同一句保留複習進度較深（box/次數較高）者
  merge(remote: ReviewNote[]): void {
    if (!Array.isArray(remote)) return
    const byText = new Map<string, ReviewNote>()
    for (const n of this.getAll()) byText.set(n.text.trim(), n)
    for (const r of remote) {
      const key = (r?.text || '').trim()
      if (!key) continue
      const l = byText.get(key)
      if (!l) { byText.set(key, r); continue }
      const rDeeper = (r.box ?? 0) > (l.box ?? 0) || ((r.box ?? 0) === (l.box ?? 0) && (r.reviewCount ?? 0) > (l.reviewCount ?? 0))
      byText.set(key, rDeeper ? r : l)
    }
    this.saveAll([...byText.values()])
  },
}

export interface ImportedNote { text: string; source?: string; meta?: string }

// 解析 Flomo 匯出檔（.txt / .md / .csv / .html）→ 一條條「筆記正文 + 來源」。
// Flomo 每則 memo 結構：時間戳行 → 📖標籤/📅日期等 metadata → 正文 →（📚來源/📂章節/📅時間/#標籤）。
// 做法：以「帶時間的時間戳行」分割每則 memo，剔走 metadata 只保留正文，並抽出「來源」書本資訊。
export function parseFlomoExport(raw: string, isHtml: boolean): ImportedNote[] {
  let text = raw
  if (isHtml) {
    text = raw
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  }
  const lines = text.split(/\r?\n/)

  // 時間戳分界行：YYYY-MM-DD HH:MM(:SS)（可帶「| API」等來源），必須含時間，避免誤切內容中的純日期
  const isTimestamp = (l: string) =>
    /^\s*\d{4}[-/]\d{2}[-/]\d{2}\s+\d{1,2}:\d{2}(:\d{2})?\s*([|｜].*)?$/.test(l)
  // metadata / 雜項行：emoji 開頭、來源／章節／時間欄、純標籤行
  const isMeta = (l: string) => {
    const t = l.trim()
    if (!t) return false
    if (/^[📖📕📗📘📙📚📂📁📍📅🗓🔖🏷📎🔗⏰🕐]/u.test(t)) return true
    if (/^(來源|来源|章節|章节|時間|时间|標籤|标签|出處|出处|標題|标题|作者)\s*[:：]/.test(t)) return true
    if (/^#\S/.test(t) && t.split(/\s+/).every(w => w.startsWith('#'))) return true
    return false
  }

  // 依時間戳切成一組組
  const groups: string[][] = []
  let cur: string[] = []
  let sawTs = false
  for (const l of lines) {
    if (isTimestamp(l)) { if (cur.length) groups.push(cur); cur = []; sawTs = true; continue }
    cur.push(l)
  }
  if (cur.length) groups.push(cur)

  // 冇時間戳格式 → 退回以空行分塊
  const rawGroups = sawTs ? groups : text.split(/\n\s*\n/).map(b => b.split(/\r?\n/))

  const notes: ImportedNote[] = []
  for (const g of rawGroups) {
    const contentLines: string[] = []
    const metaLines: string[] = []
    let source: string | undefined
    for (const l of g) {
      const t = l.trim()
      if (!t) continue
      if (isMeta(l)) {
        metaLines.push(t)   // 完整保留來源／章節／時間／標籤等資訊
        const m = t.match(/(?:來源|来源|出處|出处)\s*[:：]\s*(.+)$/)
        if (m && !source) source = m[1].trim()
        continue
      }
      contentLines.push(t)
    }
    const content = contentLines.join('\n').trim()
    const meta = metaLines.join('\n').trim()
    if (content.replace(/\s/g, '').length >= 2) notes.push({ text: content, source, meta: meta || undefined })
  }
  return notes
}

// RSS 訂閱來源的格式：名稱 + RSS 網址
export interface FeedSource {
  id: string       // 唯一 ID，用 Date.now() 產生
  name: string     // 用戶自訂的顯示名稱
  url: string      // RSS 網址（支援任何 RSS 2.0 / Atom）
}

// RSS 訂閱的 localStorage 鍵名
const FEED_STORAGE_KEY = 'reading-feeds'

export const feedStorage = {
  // 取得所有訂閱來源
  getFeeds(): FeedSource[] {
    if (typeof window === 'undefined') return []
    try {
      const data = localStorage.getItem(FEED_STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  },

  // 新增一個訂閱來源
  addFeed(feed: FeedSource): void {
    if (typeof window === 'undefined') return
    const feeds = feedStorage.getFeeds()
    feeds.push(feed)
    localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(feeds))
  },

  // 刪除一個訂閱來源（by id）
  removeFeed(id: string): void {
    if (typeof window === 'undefined') return
    const feeds = feedStorage.getFeeds().filter(f => f.id !== id)
    localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(feeds))
  },

  // 更新某個訂閱來源的 URL
  updateFeedUrl(id: string, newUrl: string): void {
    if (typeof window === 'undefined') return
    const feeds = feedStorage.getFeeds().map(f => f.id === id ? { ...f, url: newUrl } : f)
    localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(feeds))
  }
}

// 完書記錄：哪天讀完了哪本書
const COMPLETIONS_STORAGE_KEY = 'reading-completions'

export interface BookCompletion {
  date: string   // "2026-06-06"
  bookTitle: string
  bookId: string
}

export const completionStorage = {
  getAll(): BookCompletion[] {
    if (typeof window === 'undefined') return []
    try {
      const data = localStorage.getItem(COMPLETIONS_STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch { return [] }
  },

  record(bookTitle: string, bookId: string): void {
    if (typeof window === 'undefined') return
    try {
      const all = completionStorage.getAll()
      const today = new Date().toLocaleDateString('en-CA')
      // 同一本書同一天只記一次
      const alreadyRecorded = all.some(c => c.date === today && c.bookId === bookId)
      if (alreadyRecorded) return
      all.push({ date: today, bookTitle, bookId })
      localStorage.setItem(COMPLETIONS_STORAGE_KEY, JSON.stringify(all))
    } catch (e) {
      console.error('[completionStorage] record failed:', e)
    }
  },

  // 取得某天有沒有完書（回傳書名清單）
  getCompletionsForDate(date: string): BookCompletion[] {
    return completionStorage.getAll().filter(c => c.date === date)
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
  },

  // 取得最近 364 天（52 週）的資料，從最舊到最新，補齊週數為 52 的整數倍
  getLast364Days(): { date: string; count: number }[] {
    const history = historyStorage.getHistory()
    const result: { date: string; count: number }[] = []
    for (let i = 363; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-CA')
      result.push({ date: key, count: history[key] ?? 0 })
    }
    return result
  }
}

// ── 閱讀速度記錄 ──
export interface SpeedRecord {
  date: string      // 'YYYY-MM-DD'
  speed: number     // sentences per minute（四捨五入至整數）
  sentences: number // 本次 session 讀了幾句
  duration: number  // 本次 session 持續幾分鐘
}

const SPEED_STORAGE_KEY = 'reading-speed-history'

export const speedStorage = {
  getAll(): SpeedRecord[] {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(SPEED_STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  },

  // 記錄一次 session 的速度（sentences ≥ 5 且 duration ≥ 0.5 分鐘才記錄）
  record(sentences: number, durationMs: number): void {
    if (typeof window === 'undefined') return
    const durationMin = durationMs / 60000
    if (sentences < 5 || durationMin < 0.5) return
    try {
      const all = speedStorage.getAll()
      const speed = Math.round(sentences / durationMin)
      const date = new Date().toLocaleDateString('en-CA')
      all.push({ date, speed, sentences, duration: Math.round(durationMin * 10) / 10 })
      // 最多保留 200 筆
      if (all.length > 200) all.splice(0, all.length - 200)
      localStorage.setItem(SPEED_STORAGE_KEY, JSON.stringify(all))
    } catch (e) {
      console.error('[speedStorage] record failed:', e)
    }
  },

  // 取最近 30 筆 session（最舊→最新）
  getLast30(): SpeedRecord[] {
    return speedStorage.getAll().slice(-30)
  }
}
