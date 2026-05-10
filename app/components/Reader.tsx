// 【閱讀器畫面】
// 這個文件負責：打開書後看到的主要閱讀頁面。
// 功能一覽：
//   - 一次顯示一句話（或一張圖片）
//   - 上一句 / 下一句按鈕，也支援鍵盤按鍵
//   - 頂部兩條進度條（每 13 句刷新一次）
//   - 全文搜索功能
//   - 到達今日目標後自動回首頁
//   - 按上下一句時手機震動（強度可在「顯示」設定裡調）
//   - 包含「顯示」「快捷鍵」「字體」三個設定入口

'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Home, BookOpen, Target, CheckCircle, Search, X, CloudRain } from 'lucide-react'
import { fontStorage, shortcutsStorage, displayStorage, historyStorage, KeyboardShortcuts, DEFAULT_SHORTCUTS, DisplaySettings, DEFAULT_DISPLAY_SETTINGS, BookData } from '../utils/storage'
import { updateBookProgressInIDB } from '../utils/bookDB'
import { saveFontToIDB, getFontFromIDB, clearFontFromIDB } from '../utils/fontDB'
import FontSelector from './FontSelector'
import KeyboardSettings from './KeyboardSettings'
import DisplaySettingsPanel from './DisplaySettings'
import DictionaryPanel from './DictionaryPanel'
import ContextModal from './ContextModal'
import SearchPanel from './SearchPanel'
import SearchSidebar, { SIDEBAR_WIDTH } from './SearchSidebar'
import ImagePopup from './ImagePopup'

interface ReaderProps {
  sentences: string[]
  bookTitle: string
  bookId: string
  initialIndex: number
  readingGoal: number
  onReset: () => void
  onArticleFinished?: () => void
  onOpenBook?: (book: BookData, sentenceIndex: number) => void
}

export default function Reader({ sentences, bookTitle, bookId, initialIndex, readingGoal, onReset, onArticleFinished, onOpenBook }: ReaderProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [startIndex, setStartIndex] = useState(initialIndex)
  const [goalCompleted, setGoalCompleted] = useState(false)
  const [articleCompleted, setArticleCompleted] = useState(false)
  const [fontFamily, setFontFamily] = useState('system-ui, -apple-system, sans-serif')
  const [shortcuts, setShortcuts] = useState<KeyboardShortcuts>(DEFAULT_SHORTCUTS)
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS)
  const [showSearch, setShowSearch] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)  // 預設展開
  const [fadeVisible, setFadeVisible] = useState(true)
  // 閱讀模式：'default'（現有樣式）或 'paper'（紙本質感）
  const [readerMode, setReaderMode] = useState<'default' | 'paper'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('reader-mode') as 'default' | 'paper') || 'default'
    }
    return 'default'
  })
  // 墨水屏模式：關閉所有動畫、高對比黑白
  const [einkMode, setEinkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eink-mode') === 'true'
    }
    return false
  })
  const headerRef = useRef<HTMLElement>(null)
  // 下雨特效的開關狀態
  const [rainEnabled, setRainEnabled] = useState(true)
  // Canvas 元素的引用
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // requestAnimationFrame 的 ID，用於清除動畫
  const rainAnimRef = useRef<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<number[]>([])
  // 上下文預覽：點擊搜索結果後顯示，不直接跳句
  const [contextPreviewIndex, setContextPreviewIndex] = useState<number | null>(null)
  // 墨水屏自適應字體大小
  const [einkAutoFontSize, setEinkAutoFontSize] = useState(80)
  const measureDivRef = useRef<HTMLDivElement>(null)
  // 墨水屏模式：⋯ 設定選單
  const [showEinkMenu, setShowEinkMenu] = useState(false)
  // 循環提示：進入新循環時短暫顯示
  const [cycleToast, setCycleToast] = useState<string | null>(null)
  const cycleToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCycleIdxRef = useRef<number>(-1)

  useEffect(() => {
    setCurrentIndex(initialIndex)
    setStartIndex(initialIndex)
    setGoalCompleted(false)
  }, [initialIndex])

  // 下雨特效動畫（eink 模式下強制關閉）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // 關閉時清除畫布並停止動畫（eink 模式也視為關閉）
    if (!rainEnabled || einkMode) {
      if (rainAnimRef.current) cancelAnimationFrame(rainAnimRef.current)
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    // 設定畫布尺寸為全螢幕
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // 初始化每一條雨滴（斜角線段，有遠近大小差異）
    interface Drop { x: number; y: number; len: number; speed: number; width: number; opacity: number }
    const angle = 0.25 // 斜角弧度（約 14 度）
    const drops: Drop[] = Array.from({ length: Math.floor(canvas.width / 14) }, () => ({
      x: Math.random() * (canvas.width + 200) - 100,
      y: Math.random() * canvas.height - canvas.height,
      len: Math.random() * 30 + 10,   // 長度差異模擬遠近感
      speed: Math.random() * 5 + 3,
      width: Math.random() * 1.2 + 0.4, // 粗細差異
      opacity: Math.random() * 0.5 + 0.2
    }))
    // 每一幀：清除畫布，用漸變（頭亮尾透明）畫出斜向雨滴
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const drop of drops) {
        const dx = Math.sin(angle) * drop.len
        const dy = Math.cos(angle) * drop.len
        // 建立從頭（亮）到尾（透明）的線性漸變
        const grad = ctx.createLinearGradient(drop.x, drop.y, drop.x + dx, drop.y + dy)
        grad.addColorStop(0, `rgba(200, 230, 255, ${drop.opacity})`)
        grad.addColorStop(1, 'rgba(200, 230, 255, 0)')
        ctx.beginPath()
        ctx.moveTo(drop.x, drop.y)
        ctx.lineTo(drop.x + dx, drop.y + dy)
        ctx.lineWidth = drop.width
        ctx.strokeStyle = grad
        ctx.stroke()
        drop.x += Math.sin(angle) * drop.speed
        drop.y += Math.cos(angle) * drop.speed
        // 超出底部或右側後重置到頂部
        if (drop.y > canvas.height || drop.x > canvas.width + 100) {
          drop.y = -drop.len - Math.random() * 100
          drop.x = Math.random() * (canvas.width + 200) - 200
        }
      }
      rainAnimRef.current = requestAnimationFrame(draw)
    }
    draw()
    // 視窗縮放時更新畫布尺寸
    const handleResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    window.addEventListener('resize', handleResize)
    return () => {
      if (rainAnimRef.current) cancelAnimationFrame(rainAnimRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [rainEnabled, einkMode])


  // ── 墨水屏自適應字體大小：binary search ──
  // 每次換句子就重新計算最大能填滿屏幕的字體大小
  useEffect(() => {
    if (!einkMode) return
    const sentence = sentences[currentIndex]
    if (!sentence || sentence.startsWith('data:image/')) return
    const measure = measureDivRef.current
    if (!measure) return

    // textFontFamily 邏輯（與下方 const 保持一致）
    const resolvedFont = fontFamily.includes(',')
      ? fontFamily
      : `"${fontFamily}", system-ui, -apple-system, sans-serif`

    // 可用寬高：扣掉 header + 進度條（約 110px）和左右 padding（48px）
    const availW = window.innerWidth - 48
    const availH = window.innerHeight - 115

    // 設定量尺樣式（與正式顯示一致）
    measure.style.width = `${availW}px`
    measure.style.fontFamily = resolvedFont
    measure.style.whiteSpace = 'pre-wrap'
    measure.style.wordBreak = 'break-word'
    measure.style.lineHeight = '1.5'
    measure.textContent = sentence

    // Binary search：找最大符合的 px
    let lo = 16, hi = 240
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2)
      measure.style.fontSize = `${mid}px`
      // 高度不超過可用高度的 88%（保留一點呼吸空間）
      if (measure.scrollHeight <= availH * 0.88) {
        lo = mid
      } else {
        hi = mid
      }
    }
    setEinkAutoFontSize(lo)
  }, [currentIndex, einkMode, sentences, fontFamily])

  useEffect(() => {
    const loadSavedFont = async () => {
      try {
        const saved = await getFontFromIDB()
        if (saved) {
          // 有上傳過的自定義字體：從 IDB 載入字型檔
          const isFontLoaded = Array.from(document.fonts.values()).some(
            font => font.family === saved.fontFamily
          )
          if (!isFontLoaded) {
            const fontFace = new FontFace(saved.fontFamily, `url(${saved.fontData})`)
            const loadedFace = await fontFace.load()
            document.fonts.add(loadedFace)
            await document.fonts.load(`16px "${saved.fontFamily}"`)
          }
          setFontFamily(saved.fontFamily)
        } else {
          // 無自定義字體：改從 localStorage 讀取系統字體選擇
          const savedFont = fontStorage.getFont()
          if (savedFont) setFontFamily(savedFont.fontFamily)
        }
      } catch (error) {
        console.error('Failed to load saved custom font:', error)
        const savedFont = fontStorage.getFont()
        if (savedFont) setFontFamily(savedFont.fontFamily)
      }
    }

    loadSavedFont()
    
    const savedShortcuts = shortcutsStorage.getShortcuts()
    setShortcuts(savedShortcuts)
    
    const savedDisplaySettings = displayStorage.getSettings()
    setDisplaySettings(savedDisplaySettings)
  }, [])

  useEffect(() => {
    if (readingGoal > 0) {
      const sentencesRead = currentIndex - startIndex + 1
      if (sentencesRead >= readingGoal && !goalCompleted) {
        setGoalCompleted(true)
        setTimeout(() => {
          onReset()
        }, 3000)
      }
    }
  }, [currentIndex, startIndex, readingGoal, goalCompleted, onReset])

  // 文章讀到最後一句：觸發完成畫面
  useEffect(() => {
    if (onArticleFinished && sentences.length > 0 && currentIndex === sentences.length - 1 && !articleCompleted) {
      setArticleCompleted(true)
      onArticleFinished()
    }
  }, [currentIndex, sentences.length, onArticleFinished, articleCompleted])

  useEffect(() => {
    if (bookId) {
      updateBookProgressInIDB(bookId, currentIndex)
    }
  }, [currentIndex, bookId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      
      if (e.key === shortcuts.nextSentence && currentIndex < sentences.length - 1) {
        e.preventDefault()
        historyStorage.recordRead(1)
        triggerFade(() => setCurrentIndex(prev => prev + 1))
      } else if (e.key === shortcuts.previousSentence && currentIndex > 0) {
        e.preventDefault()
        triggerFade(() => setCurrentIndex(prev => prev - 1))
      } else if (e.key === shortcuts.returnHome) {
        e.preventDefault()
        onReset()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, sentences.length, shortcuts, onReset])

  // 手機/平板觸摸區點擊：右半 = 下一句，左半 = 上一句
  // 過濾掉點按鈕、輸入框等互動元素的情況，反饋改用振動（無視覺閃光）
  const handleMainTap = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('button, input, textarea, a, [role="button"], select')) return
    // 用戶正在選字時，不觸發翻頁
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const isRight = e.clientX - rect.left > rect.width / 2
    if (isRight && currentIndex < sentences.length - 1) {
      historyStorage.recordRead(1)
      vibrate(displaySettings.vibrationIntensity)
      triggerFade(() => setCurrentIndex(prev => prev + 1))
    } else if (!isRight && currentIndex > 0) {
      vibrate(displaySettings.vibrationIntensity)
      triggerFade(() => setCurrentIndex(prev => prev - 1))
    }
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const results = sentences.reduce<number[]>((acc, s, i) => {
      if (!s.startsWith('data:image/') && s.toLowerCase().includes(query.toLowerCase())) acc.push(i)
      return acc
    }, [])
    setSearchResults(results)
    setContextPreviewIndex(null)
  }

  // 點擊搜索結果 → 先顯示上下文預覽，不直接跳句
  const handleClickSearchResult = (idx: number) => {
    setContextPreviewIndex(idx)
  }

  // 從上下文預覽確認跳句
  const handleJumpFromContext = (idx: number) => {
    setCurrentIndex(idx)
    setStartIndex(idx)
    setGoalCompleted(false)
    setContextPreviewIndex(null)
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const vibrate = (ms: number) => {
    if (ms > 0 && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(ms)
    }
  }

  const triggerFade = (action: () => void) => {
    // 墨水屏模式：跳過淡入淡出，直接切換（避免殘影）
    if (einkMode) { action(); return }
    setFadeVisible(false)
    setTimeout(() => {
      action()
      setFadeVisible(true)
    }, 160)
  }

  const goToNext = () => {
    if (currentIndex < sentences.length - 1) {
      vibrate(displaySettings.vibrationIntensity)
      historyStorage.recordRead(1)
      triggerFade(() => setCurrentIndex(prev => prev + 1))
    }
  }

  const goToPrevious = () => {
    if (currentIndex > 0) {
      vibrate(displaySettings.vibrationIntensity)
      triggerFade(() => setCurrentIndex(prev => prev - 1))
    }
  }

  const handleFontChange = (newFontFamily: string, fontData?: string) => {
    if (fontData) {
      const fontFace = new FontFace(newFontFamily, `url(${fontData})`)
      fontFace
        .load()
        .then((loadedFace) => {
          document.fonts.add(loadedFace)
          setFontFamily(newFontFamily)
          saveFontToIDB(newFontFamily, fontData).catch(console.error)
        })
        .catch((error) => {
          console.error('Failed to apply custom font:', error)
          setFontFamily(newFontFamily)
        })
    } else {
      setFontFamily(newFontFamily)
      clearFontFromIDB().catch(console.error)
    }
    fontStorage.saveFont(newFontFamily)
  }

  const handleShortcutsChange = (newShortcuts: KeyboardShortcuts) => {
    setShortcuts(newShortcuts)
    shortcutsStorage.saveShortcuts(newShortcuts)
  }

  const handleDisplaySettingsChange = (newSettings: DisplaySettings) => {
    setDisplaySettings(newSettings)
    displayStorage.saveSettings(newSettings)
  }

  const sentencesRead = currentIndex - startIndex + 1
  const totalForProgress = readingGoal > 0 ? readingGoal : sentences.length

  // ── 固定循環生成：每個循環固定 13 句，最後一個循環可能不足 13 句 ──
  const cycleData = useMemo(() => {
    const total = totalForProgress
    if (total <= 0) return { sizes: [1], boundaries: [0, 1], count: 1 }

    const CYCLE_SIZE = 13
    const sizes: number[] = []
    let remaining = total
    while (remaining > 0) {
      const sz = Math.min(CYCLE_SIZE, remaining)
      sizes.push(sz)
      remaining -= sz
    }

    // 計算累積邊界
    const boundaries = [0]
    for (const sz of sizes) boundaries.push(boundaries[boundaries.length - 1] + sz)

    return { sizes, boundaries, count: sizes.length }
  }, [totalForProgress])

  // 找出當前在第幾個循環
  const currentCycleIdx = useMemo(() => {
    const capped = Math.min(sentencesRead, totalForProgress)
    for (let i = 0; i < cycleData.boundaries.length - 1; i++) {
      if (capped > cycleData.boundaries[i] && capped <= cycleData.boundaries[i + 1]) return i
    }
    return cycleData.count - 1
  }, [sentencesRead, totalForProgress, cycleData])

  // 偵測循環切換，顯示提示
  useEffect(() => {
    if (prevCycleIdxRef.current === -1) {
      prevCycleIdxRef.current = currentCycleIdx
      return
    }
    if (currentCycleIdx !== prevCycleIdxRef.current) {
      prevCycleIdxRef.current = currentCycleIdx
      const sz = cycleData.sizes[currentCycleIdx]
      setCycleToast(`第 ${currentCycleIdx + 1} 循環 · ${sz} 句`)
      if (cycleToastTimer.current) clearTimeout(cycleToastTimer.current)
      cycleToastTimer.current = setTimeout(() => setCycleToast(null), 2500)
    }
  }, [currentCycleIdx, cycleData.sizes])

  const cycleStart  = cycleData.boundaries[currentCycleIdx]
  const cycleSize   = cycleData.sizes[currentCycleIdx]
  const posInCycle  = Math.min(sentencesRead - cycleStart, cycleSize)
  const HALF_CYCLE  = Math.ceil(cycleSize / 2)

  // 當前循環的最大填充高度（線性遞增，最後一個循環 = 100%）
  const maxFill = (currentCycleIdx + 1) / cycleData.count

  // 兩條條：前半 / 後半循環，永遠從 0 填到 maxFill
  const bar1Width = Math.min(posInCycle / HALF_CYCLE, 1) * maxFill * 100
  const bar2Width = Math.max((posInCycle - HALF_CYCLE) / (cycleSize - HALF_CYCLE), 0) * maxFill * 100

  // 薄條：目標進度 或 全書進度
  const goalProgressPct = readingGoal > 0
    ? Math.min(sentencesRead / readingGoal * 100, 100)
    : sentences.length > 1 ? currentIndex / (sentences.length - 1) * 100 : 100

  const getProgressColor = () => {
    if (einkMode) return '#000000'
    if (goalCompleted) return '#22c55e'
    return displaySettings.progressColor
  }

  // 根據進度百分比插值計算單一顏色：紅(0%) → 黃(50%) → 瑞幸藍(100%)
  const getBarColor = (pct: number): string => {
    if (einkMode) return '#000000'   // 墨水屏：純黑
    if (goalCompleted) return '#22c55e'
    const stops = [
      { p: 0,   r: 239, g: 68,  b: 68  },  // #EF4444 紅
      { p: 50,  r: 234, g: 179, b: 8   },  // #EAB308 黃
      { p: 100, r: 0,   g: 164, b: 228 },  // #00A4E4 瑞幸藍
    ]
    const capped = Math.min(Math.max(pct, 0), 100)
    let from = stops[0], to = stops[1]
    for (let i = 0; i < stops.length - 1; i++) {
      if (capped >= stops[i].p && capped <= stops[i + 1].p) {
        from = stops[i]; to = stops[i + 1]; break
      }
    }
    const t = (to.p === from.p) ? 0 : (capped - from.p) / (to.p - from.p)
    const r = Math.round(from.r + (to.r - from.r) * t)
    const g = Math.round(from.g + (to.g - from.g) * t)
    const b = Math.round(from.b + (to.b - from.b) * t)
    return `rgb(${r},${g},${b})`
  }
  const textFontFamily = fontFamily.includes(',')
    ? fontFamily
    : `"${fontFamily}", system-ui, -apple-system, sans-serif`

  // ── E-ink 墨水屏模式 ──
  const isEink = einkMode
  const einkTheme = {
    bg: '#ffffff',
    text: '#000000',
    muted: '#555555',
    cardBorder: '#000000',
    barColor: '#000000',
  }
  const toggleEinkMode = () => {
    const next = !einkMode
    setEinkMode(next)
    if (typeof window !== 'undefined') localStorage.setItem('eink-mode', String(next))
  }

  // ── Paper 模式主題 ──
  const isPaper = readerMode === 'paper'
  const paperTheme = {
    bg: '#fdfaf3',
    text: '#3a342b',
    muted: '#a89d8a',
    cardBg: '#fffef8',
    cardShadow: '0 1px 0 #f0e9d8, 0 12px 32px rgba(120,90,40,.08)',
    border: '#ebe2cd',
    accentColor: '#a16207',
    fontFamily: '"Noto Serif TC", STSong, "Songti TC", "宋體", Georgia, serif',
  }

  const toggleReaderMode = () => {
    const next = readerMode === 'paper' ? 'default' : 'paper'
    setReaderMode(next)
    if (typeof window !== 'undefined') localStorage.setItem('reader-mode', next)
  }

  return (
    <div
      className="min-h-screen flex flex-col overflow-x-hidden transition-all duration-300"
      style={{
        backgroundColor: isEink ? einkTheme.bg : isPaper ? paperTheme.bg : displaySettings.backgroundColor,
        paddingRight: (!isEink && showSidebar) ? SIDEBAR_WIDTH : 0,
      }}
    >
      {/* 下雨特效畫布：固定在全螢幕，不攔截點擊事件；eink 模式下隱藏 */}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 1, display: isEink ? 'none' : 'block' }} />
      {/* 隱藏量尺：e-ink 自適應字體大小的 binary search 用 */}
      <div
        ref={measureDivRef}
        aria-hidden="true"
        style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden', pointerEvents: 'none', zIndex: -1 }}
      />

      <header ref={headerRef} className="bg-white" style={isEink ? { borderBottom: '2px solid #000', boxShadow: 'none' } : { boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
        {isEink ? (
          /* ── 墨水屏極簡 Header：只剩書名、句數、⋯設定、🏠 ── */
          <div className="px-3 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-bold text-black truncate max-w-[180px]" title={bookTitle}>{bookTitle}</span>
              <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
                句 {currentIndex + 1}/{sentences.length}
              </span>
            </div>
            <div className="flex items-center gap-1 relative flex-shrink-0">
              {/* ⋯ 設定選單按鈕 */}
              <button
                onClick={() => setShowEinkMenu(v => !v)}
                className="px-2 py-1 text-sm font-bold"
                style={{ border: '1.5px solid #000', borderRadius: 4 }}
                title="設定"
              >⋯</button>
              {/* 返回首頁 */}
              <button
                onClick={onReset}
                className="px-2 py-1 text-sm font-bold"
                style={{ border: '1.5px solid #000', borderRadius: 4 }}
                title="返回首頁"
              >🏠</button>
              {/* ⋯ 展開的設定浮窗 */}
              {showEinkMenu && (
                <div
                  className="absolute top-full right-0 z-50 bg-white flex flex-col"
                  style={{ border: '2px solid #000', minWidth: 160, marginTop: 4 }}
                  onClick={() => setShowEinkMenu(false)}
                >
                  <div className="p-1" onClick={e => e.stopPropagation()}><FontSelector currentFont={fontFamily} onFontChange={handleFontChange} /></div>
                  <div className="p-1" style={{ borderTop: '1px solid #ccc' }} onClick={e => e.stopPropagation()}><KeyboardSettings shortcuts={shortcuts} onSave={handleShortcutsChange} /></div>
                  <div className="p-1" style={{ borderTop: '1px solid #ccc' }} onClick={e => e.stopPropagation()}><DisplaySettingsPanel settings={displaySettings} onSave={handleDisplaySettingsChange} /></div>
                  <button
                    onClick={toggleEinkMode}
                    className="p-2 text-sm text-left font-medium"
                    style={{ borderTop: '1px solid #ccc' }}
                  >🖊️ 關閉墨水屏模式</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── 正常模式 Header ── */
          <div className="max-w-7xl mx-auto px-3 py-2 sm:py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BookOpen className="w-6 h-6 text-indigo-600" />
              {!showSearch && (
                <h1 className="text-base sm:text-xl font-semibold text-gray-800 max-w-[160px] sm:max-w-xs md:max-w-sm truncate" title={bookTitle}>{bookTitle}</h1>
              )}
              {showSearch ? (
                <div className="relative">
                  <div className="flex items-center w-72 px-3 py-1.5 border-2 border-indigo-400 rounded-full bg-white shadow-sm">
                    <Search className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }
                      }}
                      placeholder="搜索句子..."
                      className="flex-1 text-sm outline-none bg-transparent"
                    />
                    {searchQuery && (
                      <button onClick={() => { setSearchQuery(''); setSearchResults([]) }} className="ml-1 p-0.5 hover:bg-gray-100 rounded-full">
                        <X className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    )}
                  </div>

                  {searchQuery && (
                    <div className="absolute top-full left-0 mt-1 w-96 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                      {searchResults.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-400">無符合結果</div>
                      ) : (
                        <>
                          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-50">
                            共 {searchResults.length} 個結果 · 點擊預覽上下文
                          </div>
                          <ul className="max-h-64 overflow-y-auto">
                            {searchResults.slice(0, 10).map((idx) => {
                              const sentence = sentences[idx]
                              const lower = sentence.toLowerCase()
                              const qLower = searchQuery.toLowerCase()
                              const matchPos = lower.indexOf(qLower)
                              const preview = sentence.length > 60
                                ? sentence.slice(Math.max(0, matchPos - 15), matchPos + searchQuery.length + 30) + '…'
                                : sentence
                              const before = preview.slice(0, preview.toLowerCase().indexOf(qLower))
                              const match = preview.slice(preview.toLowerCase().indexOf(qLower), preview.toLowerCase().indexOf(qLower) + searchQuery.length)
                              const after = preview.slice(preview.toLowerCase().indexOf(qLower) + searchQuery.length)
                              return (
                                <li key={idx}>
                                  <button
                                    onClick={() => handleClickSearchResult(idx)}
                                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-indigo-50 transition-colors flex items-start space-x-2"
                                  >
                                    <Search className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                                    <span className="text-gray-600 leading-snug">
                                      {before}
                                      <strong className="text-indigo-600 font-semibold">{match}</strong>
                                      {after}
                                    </span>
                                    <span className="text-xs text-gray-300 flex-shrink-0 ml-auto pl-2">#{idx + 1}</span>
                                  </button>
                                </li>
                              )
                            })}
                            {searchResults.length > 10 && (
                              <li className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">
                                還有 {searchResults.length - 10} 個結果…
                              </li>
                            )}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center space-x-1">
                  {/* 書內搜索 */}
                  <button onClick={() => setShowSearch(true)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="書內搜索">
                    <Search className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-0.5 sm:space-x-2">
              {/* 下雨特效：手機隱藏（省空間） */}
              <button
                onClick={() => setRainEnabled(v => !v)}
                className={`hidden sm:block p-1.5 rounded-lg transition-colors ${rainEnabled ? 'bg-blue-100 text-blue-500' : 'text-gray-400 hover:bg-gray-100'}`}
                title={rainEnabled ? '關閉雨聲' : '開啟下雨效果'}
              >
                <CloudRain className="w-4 h-4" />
              </button>
              {/* 跨書搜索：手機隱藏 */}
              {onOpenBook && <span className="hidden md:block"><SearchPanel onOpenBook={onOpenBook} /></span>}
              <DictionaryPanel />
              <DisplaySettingsPanel settings={displaySettings} onSave={handleDisplaySettingsChange} />
              {/* 快捷鍵設定：手機隱藏，但墨水屏顯示（iReader 有實體翻頁鍵） */}
              <span className="hidden md:block"><KeyboardSettings shortcuts={shortcuts} onSave={handleShortcutsChange} /></span>
              <FontSelector currentFont={fontFamily} onFontChange={handleFontChange} />
              {/* 墨水屏模式切換 */}
              <button
                onClick={toggleEinkMode}
                className="flex items-center space-x-1 px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-lg"
                style={{
                  color: '#6b7280',
                  background: 'transparent',
                  border: '1.5px solid transparent',
                  transition: 'none',
                }}
                title="開啟墨水屏模式"
              >
                <span className="text-sm">🖊️</span>
                <span className="hidden sm:inline text-sm">墨水屏</span>
              </button>
              {/* 閱讀模式切換 */}
              <button
                onClick={toggleReaderMode}
                className="flex items-center space-x-1 px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors"
                style={{
                  color: isPaper ? '#a16207' : '#6b7280',
                  background: isPaper ? '#fef3c7' : 'transparent',
                }}
                title={isPaper ? '切換回預設模式' : '切換到紙本質感'}
              >
                <span className="text-sm">{isPaper ? '📖' : '🖥️'}</span>
                <span className="hidden sm:inline text-sm">{isPaper ? '紙本質感' : '預設模式'}</span>
              </button>
              <button
                onClick={onReset}
                className="flex items-center space-x-1 px-1.5 sm:px-4 py-1.5 sm:py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Home className="w-5 h-5" />
                <span className="hidden sm:inline">返回首頁</span>
              </button>
            </div>
          </div>
        )}
        <div className="w-full">
          {/* ── 進度條共用：A發光尾端 + B里程碑缺口 + C漸層色進 ── */}
          {/* 漸層：冷色(靛藍) → 紫 → 暖色(金)，隨進度條延伸自然色移 */}
          {/* 完成後統一轉綠 */}

          {/* 循環進度條 1（前半循環） */}
          {/* e-ink 永遠顯示標籤；一般模式只在 sm 以上顯示 */}
          <div
            className={isEink ? 'flex justify-between mb-0.5 px-0.5' : 'hidden sm:flex justify-between text-xs mb-0.5 px-0.5'}
            style={{ color: getProgressColor(), fontSize: isEink ? 13 : undefined, fontWeight: isEink ? 600 : undefined }}
          >
            <span>{isEink ? `第 ${currentCycleIdx + 1}/${cycleData.count} 循環 · 上半` : '進度 1'}</span>
            <span className="tabular-nums">{bar1Width.toFixed(0)}%</span>
          </div>
          {/* 相對定位容器：讓發光點和里程碑可以溢出 */}
          <div className="w-full relative" style={{ height: isEink ? 12 : 8 }}>
            {/* 軌道底色 */}
            <div className="absolute inset-0 rounded-full" style={{ background: isEink ? '#e0e0e0' : undefined }} data-role="track">
              {!isEink && <div className="absolute inset-0 rounded-full bg-gray-200" />}
            </div>
            {/* C: 單色填充，顏色隨進度插值變化 */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${bar1Width}%`,
                backgroundColor: getBarColor(bar1Width),
                transition: isEink ? 'none' : 'all 0.3s',
              }}
            />
            {/* A: 發光尾端（eink 模式下不顯示） */}
            {!isEink && bar1Width > 0.5 && (
              <div
                className="absolute top-1/2 rounded-full transition-all duration-300 pointer-events-none"
                style={{
                  left: `${bar1Width}%`,
                  transform: 'translate(-50%,-50%)',
                  width: 14, height: 14,
                  backgroundColor: getBarColor(bar1Width),
                  opacity: 0.5,
                  boxShadow: `0 0 8px 5px ${getBarColor(bar1Width)}88`,
                }}
              />
            )}
            {/* B: 里程碑缺口（eink 時改黑色刻度線） */}
            {[25, 50, 75].map(m => (
              <div
                key={m}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 pointer-events-none"
                style={{ left: `${m}%`, width: isEink ? 1 : 2, height: isEink ? '100%' : 14, background: isEink ? '#888' : 'white', borderRadius: 0 }}
              />
            ))}
          </div>

          {/* 循環進度條 2（後半循環） */}
          <div
            className={isEink ? 'flex justify-between mt-1 mb-0.5 px-0.5' : 'hidden sm:flex justify-between text-xs mt-1 mb-0.5 px-0.5'}
            style={{ color: getProgressColor(), fontSize: isEink ? 13 : undefined, fontWeight: isEink ? 600 : undefined }}
          >
            <span>{isEink ? `第 ${currentCycleIdx + 1}/${cycleData.count} 循環 · 下半` : '進度 2'}</span>
            <span className="tabular-nums">{bar2Width.toFixed(0)}%</span>
          </div>
          <div className="w-full relative" style={{ height: isEink ? 12 : 8 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: isEink ? '#e0e0e0' : '#e5e7eb' }} />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${bar2Width}%`,
                backgroundColor: getBarColor(bar2Width),
                transition: isEink ? 'none' : 'all 0.3s',
              }}
            />
            {!isEink && bar2Width > 0.5 && (
              <div
                className="absolute top-1/2 rounded-full transition-all duration-300 pointer-events-none"
                style={{
                  left: `${bar2Width}%`,
                  transform: 'translate(-50%,-50%)',
                  width: 14, height: 14,
                  backgroundColor: getBarColor(bar2Width),
                  opacity: 0.5,
                  boxShadow: `0 0 8px 5px ${getBarColor(bar2Width)}88`,
                }}
              />
            )}
            {[25, 50, 75].map(m => (
              <div
                key={m}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 pointer-events-none"
                style={{ left: `${m}%`, width: isEink ? 1 : 2, height: isEink ? '100%' : 14, background: isEink ? '#888' : 'white', borderRadius: 0 }}
              />
            ))}
          </div>

          {/* 目標 / 全書總進度薄條 */}
          <div className="w-full rounded-full overflow-hidden mt-1" style={{ height: isEink ? 4 : 4, background: isEink ? '#e0e0e0' : '#f3f4f6' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${goalProgressPct}%`,
                backgroundColor: isEink ? '#000' : '#00A3E0',
                transition: isEink ? 'none' : 'all 0.5s',
              }}
            />
          </div>
        </div>
      </header>

      {/* 循環開始提示 Toast */}
      <div
        className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-500"
        style={{ opacity: cycleToast ? 1 : 0, transform: `translateX(-50%) translateY(${cycleToast ? '0px' : '-8px'})` }}
      >
        <div className="px-4 py-2 bg-gray-800/80 backdrop-blur-sm text-white text-sm font-medium rounded-full shadow-lg whitespace-nowrap">
          🔄 {cycleToast}
        </div>
      </div>

      {/* 主閱讀區：整個 main 都可點，右半下一句，左半上一句 */}
      {/* eink 模式：去除 padding，讓文字佔滿整個可用高度 */}
      <main
        className={`flex-1 flex items-center justify-center relative ${isEink ? '' : 'p-4 md:p-6'}`}
        style={isEink ? { padding: '8px 12px' } : {}}
        onClick={handleMainTap}
      >

        {isPaper ? (
          /* ── Paper 紙本質感模式 ── */
          <div style={{ position: 'relative', maxWidth: 680, width: '100%', margin: '0 auto' }}>

            {/* 章節標題 */}
            <div style={{ textAlign: 'center', marginBottom: 36, opacity: 0.55 }}>
              <div style={{ fontSize: 11, letterSpacing: '.3em', color: paperTheme.muted, textTransform: 'uppercase', marginBottom: 4, fontFamily: paperTheme.fontFamily }}>
                第一章
              </div>
              <div style={{ fontSize: 13, color: paperTheme.muted, fontFamily: paperTheme.fontFamily, fontStyle: 'italic' }}>
                {bookTitle}
              </div>
            </div>

            {/* 紙張卡片 */}
            <div style={{
              background: paperTheme.cardBg,
              borderRadius: 4,
              boxShadow: paperTheme.cardShadow,
              border: `1px solid ${paperTheme.border}`,
              padding: '64px 72px',
              minHeight: 280,
              position: 'relative',
              backgroundImage: 'radial-gradient(rgba(160,120,60,.04) 1px, transparent 1px)',
              backgroundSize: '14px 14px',
            }}>
              {/* 四角裝飾線 */}
              <div style={{ position: 'absolute', top: 0, left: 0, width: 24, height: 24, borderTop: `1px solid ${paperTheme.accentColor}66`, borderLeft: `1px solid ${paperTheme.accentColor}66`, borderTopLeftRadius: 4 }} />
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderBottom: `1px solid ${paperTheme.accentColor}66`, borderRight: `1px solid ${paperTheme.accentColor}66`, borderBottomRightRadius: 4 }} />

              {sentences[currentIndex]?.startsWith('data:image/') ? (
                <img
                  src={sentences[currentIndex]}
                  alt="圖片"
                  style={{
                    maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8,
                    opacity: fadeVisible ? 1 : 0,
                    transition: fadeVisible ? 'opacity 0.22s ease-in' : 'opacity 0.14s ease-out',
                  }}
                />
              ) : (
                <p style={{
                  fontSize: `${displaySettings.fontSize}px`,
                  color: paperTheme.text,
                  textAlign: 'center',
                  lineHeight: 1.85,
                  margin: 0,
                  fontFamily: textFontFamily,
                  whiteSpace: 'pre-wrap',
                  opacity: fadeVisible ? 1 : 0,
                  transition: fadeVisible ? 'opacity 0.22s ease-in' : 'opacity 0.14s ease-out',
                }}>
                  {sentences[currentIndex]}
                </p>
              )}
            </div>

            {/* 頁碼 */}
            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: paperTheme.muted, fontFamily: paperTheme.fontFamily, fontStyle: 'italic' }}>
              — {currentIndex + 1} —
            </div>

            {/* 完成訊息 */}
            {goalCompleted && (
              <div className="mt-6 p-4 rounded-lg text-center" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <p className="font-medium" style={{ color: '#166534' }}>🎉 恭喜！您已完成今天的閱讀目標</p>
                <p className="text-sm mt-1" style={{ color: '#16a34a' }}>3秒後自動返回首頁...</p>
              </div>
            )}
            {articleCompleted && (
              <div className="mt-6 p-6 rounded-2xl text-center" style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #bbf7d0' }}>
                <p className="text-3xl mb-2">🎉</p>
                <p className="font-semibold text-lg" style={{ color: '#166534' }}>恭喜！文章讀完了</p>
                <button onClick={onReset} className="mt-4 px-6 py-2.5 bg-green-500 text-white rounded-full text-sm font-medium hover:bg-green-600 transition-colors shadow">
                  返回書架
                </button>
              </div>
            )}

            {/* 桌面導航按鈕 */}
            <div className="mt-8 hidden md:flex items-center justify-between">
              <button
                onClick={goToNext}
                disabled={currentIndex === sentences.length - 1}
                className="flex items-center space-x-2 px-6 py-3 rounded-lg shadow hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                style={{ background: paperTheme.accentColor, color: '#fff' }}
              >
                <span>下一句</span>
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={goToPrevious}
                disabled={currentIndex === 0}
                className="flex items-center space-x-2 px-6 py-3 rounded-lg shadow hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                style={{ background: paperTheme.cardBg, border: `1px solid ${paperTheme.border}`, color: paperTheme.text }}
              >
                <ChevronLeft className="w-5 h-5" />
                <span>上一句</span>
              </button>
            </div>

            {/* 手機觸摸提示 */}
            <div className="mt-6 md:hidden flex items-center justify-between px-2 select-none pointer-events-none">
              <span className="text-xs flex items-center gap-1" style={{ color: paperTheme.muted }}>
                <ChevronLeft className="w-3 h-3" /> 上一句
              </span>
              <span className="text-xs flex items-center gap-1" style={{ color: paperTheme.muted }}>
                下一句 <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </div>

        ) : (
          /* ── 預設模式（原有樣式）── */
          <div className={isEink ? 'w-full' : 'max-w-4xl w-full'}>
            <div
              className={isEink ? 'flex items-center justify-center' : 'rounded-2xl shadow-2xl p-8 md:p-16 min-h-[320px] flex items-center justify-center transition-all border border-white/40'}
              style={isEink ? {
                borderRadius: 0,
                boxShadow: 'none',
                padding: '24px 20px',
                border: 'none',
                minHeight: 'calc(100vh - 110px)',
                background: '#fff',
                width: '100%',
              } : {}}
            >
              {sentences[currentIndex]?.startsWith('data:image/') ? (
                <img
                  src={sentences[currentIndex]}
                  alt="圖片"
                  className="max-w-full max-h-[60vh] object-contain rounded-lg"
                  style={{
                    opacity: isEink ? 1 : (fadeVisible ? 1 : 0),
                    transition: isEink ? 'none' : (fadeVisible ? 'opacity 0.22s ease-in' : 'opacity 0.14s ease-out'),
                  }}
                />
              ) : (
                <p
                  className="leading-relaxed text-center"
                  style={{
                    fontFamily: textFontFamily,
                    fontSize: isEink ? `${einkAutoFontSize}px` : `${displaySettings.fontSize}px`,
                    color: isEink ? einkTheme.text : displaySettings.textColor,
                    whiteSpace: 'pre-wrap',
                    fontWeight: isEink ? 700 : undefined,
                    letterSpacing: isEink ? '0.02em' : undefined,
                    lineHeight: isEink ? 1.5 : undefined,
                    opacity: isEink ? 1 : (fadeVisible ? 1 : 0),
                    transition: isEink ? 'none' : (fadeVisible ? 'opacity 0.22s ease-in' : 'opacity 0.14s ease-out'),
                  }}
                >
                  {sentences[currentIndex]}
                </p>
              )}
            </div>

            {/* 電腦：顯示按鈕；eink 模式下隱藏（用實體按鍵）；手機/平板：隱藏按鈕，改用觸摸分區 */}
            {!isEink && (
              <div className="mt-8 hidden md:flex items-center justify-between">
                <button
                  onClick={goToNext}
                  disabled={currentIndex === sentences.length - 1}
                  className="flex items-center space-x-2 px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#4f46e5', color: '#fff', borderRadius: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,.1)' }}
                >
                  <span>下一句</span>
                  <ChevronRight className="w-5 h-5" />
                </button>

                <button
                  onClick={goToPrevious}
                  disabled={currentIndex === 0}
                  className="flex items-center space-x-2 px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#fff', borderRadius: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,.1)' }}
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span>上一句</span>
                </button>
              </div>
            )}

            {/* 手機/平板：觸摸提示；eink 模式下更明顯 */}
            <div className="mt-6 md:hidden flex items-center justify-between px-2 select-none pointer-events-none">
              <span
                className="flex items-center gap-1"
                style={{ fontSize: isEink ? 15 : 12, color: isEink ? '#333' : '#d1d5db', fontWeight: isEink ? 600 : 400 }}
              >
                <ChevronLeft className={isEink ? 'w-5 h-5' : 'w-3 h-3'} /> 上一句
              </span>
              <span
                className="flex items-center gap-1"
                style={{ fontSize: isEink ? 15 : 12, color: isEink ? '#333' : '#d1d5db', fontWeight: isEink ? 600 : 400 }}
              >
                下一句 <ChevronRight className={isEink ? 'w-5 h-5' : 'w-3 h-3'} />
              </span>
            </div>

            {goalCompleted && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <p className="text-green-800 font-medium">🎉 恭喜！您已完成今天的閱讀目標</p>
                <p className="text-green-600 text-sm mt-1">3秒後自動返回首頁...</p>
              </div>
            )}
            {articleCompleted && (
              <div className="mt-6 p-6 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl text-center shadow-sm">
                <p className="text-3xl mb-2">🎉</p>
                <p className="text-green-800 font-semibold text-lg">恭喜！文章讀完了</p>
                <p className="text-green-600 text-sm mt-1 mb-4">已記錄為已閱讀</p>
                <button
                  onClick={onReset}
                  className="px-6 py-2.5 bg-green-500 text-white rounded-full text-sm font-medium hover:bg-green-600 transition-colors shadow"
                >
                  返回書架
                </button>
              </div>
            )}
          </div>
        )}
      </main>


      {/* 書內搜索的上下文預覽彈窗 */}
      {contextPreviewIndex !== null && (
        <ContextModal
          sentences={sentences}
          bookTitle={bookTitle}
          matchIndex={contextPreviewIndex}
          keyword={searchQuery}
          onClose={() => setContextPreviewIndex(null)}
          onJump={handleJumpFromContext}
        />
      )}

      {/* 右側跨書搜索側欄（墨水屏模式下隱藏） */}
      {!isEink && (
        <SearchSidebar
          isOpen={showSidebar}
          onToggle={() => setShowSidebar(v => !v)}
          currentBookId={bookId}
          onOpenBook={(book, idx) => {
            if (onOpenBook) onOpenBook(book, idx)
          }}
        />
      )}

      {/* 選字圖片彈窗 */}
      <ImagePopup />
    </div>
  )
}
