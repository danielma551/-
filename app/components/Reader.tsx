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
import { ChevronLeft, ChevronRight, Home, BookOpen, Target, CheckCircle, Search, X, CloudRain, List, Music, VolumeX, Volume2, Network } from 'lucide-react'
import { fontStorage, shortcutsStorage, displayStorage, historyStorage, completionStorage, flomoStorage, speedStorage, reviewStorage, KeyboardShortcuts, DEFAULT_SHORTCUTS, DisplaySettings, DEFAULT_DISPLAY_SETTINGS, BookData, ChapterMark } from '../utils/storage'
import { updateBookProgressInIDB } from '../utils/bookDB'
import { getMusicObjectURL } from '../utils/musicDB'
import { saveFontToIDB, getFontFromIDB, clearFontFromIDB } from '../utils/fontDB'
import FontSelector from './FontSelector'
import KeyboardSettings from './KeyboardSettings'
import DisplaySettingsPanel from './DisplaySettings'
import DictionaryPanel from './DictionaryPanel'
import ContextModal from './ContextModal'
import SearchPanel from './SearchPanel'
import SearchSidebar, { SIDEBAR_WIDTH } from './SearchSidebar'
import ImagePopup from './ImagePopup'
import CharacterGraph from './CharacterGraph'
import BreathingOverlay from './BreathingOverlay'
import { monsterForGoal, xpForGoal, gamifyStorage, fireConfetti, getStreak, levelForXP, getStreakMultiplier, getDailyChallenge, updateDailyChallenge, DailyChallenge } from '../utils/gamify'

// 「空白句」判定：空字串、純空白（含全形/不換行/零寬空格）都當作要跳過的空句；
// 圖片句（data:image/）屬有效內容，不算空白。涵蓋 PARA_SEP 段落標記與舊書殘留的空句。
const isBlankSentence = (s: string | undefined): boolean => {
  if (!s) return true
  if (s.startsWith('data:image/')) return false
  return s.replace(/[\s　 ​‌‍﻿]/g, '') === ''
}

interface ReaderProps {
  sentences: string[]
  bookTitle: string
  bookId: string
  initialIndex: number
  readingGoal: number
  chapters?: ChapterMark[]
  onReset: () => void
  onArticleFinished?: () => void
  onOpenBook?: (book: BookData, sentenceIndex: number) => void
}

// 💎 幸運加成：星火位置 + 獎勵類型
const LUCKY_SPARKS = [
  { dx: '-55px', dy: '-45px', color: '#fcd34d' },
  { dx: '50px',  dy: '-55px', color: '#fb923c' },
  { dx: '62px',  dy: '20px',  color: '#fbbf24' },
  { dx: '40px',  dy: '56px',  color: '#f87171' },
  { dx: '-50px', dy: '50px',  color: '#a78bfa' },
  { dx: '-65px', dy: '10px',  color: '#60a5fa' },
  { dx: '-20px', dy: '-62px', color: '#4ade80' },
  { dx: '22px',  dy: '-62px', color: '#fcd34d' },
]
const LUCKY_TYPES = [
  { emoji: '💎', label: '幸運降臨！', color: '#f59e0b', shadow: 'rgba(245,158,11,0.35)' },
  { emoji: '⚡', label: '閃電暴擊！', color: '#6366f1', shadow: 'rgba(99,102,241,0.35)' },
  { emoji: '🍀', label: '幸運草！',   color: '#22c55e', shadow: 'rgba(34,197,94,0.35)'  },
  { emoji: '⭐', label: '流星！',     color: '#f472b6', shadow: 'rgba(244,114,182,0.35)' },
]

export default function Reader({ sentences, bookTitle, bookId, initialIndex, readingGoal, chapters, onReset, onArticleFinished, onOpenBook }: ReaderProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [startIndex, setStartIndex] = useState(initialIndex)
  const [goalCompleted, setGoalCompleted] = useState(false)
  // 遊戲化勝利資訊：只在非墨水屏模式設定（墨水屏保持原有完成畫面）
  const [victory, setVictory] = useState<{ emoji: string; name: string; xp: number; earnedXP: number; multiplier: number; streak: number; todayKills: number; totalXP: number } | null>(null)
  // 💎 幸運加成：隨機觸發，顯示炫目卡片
  const [luckyReward, setLuckyReward] = useState<{ xp: number; emoji: string; label: string; color: string; shadow: string } | null>(null)
  const [luckyFading, setLuckyFading] = useState(false)
  const luckyBonusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 📅 每日挑戰：初次從 localStorage 載入
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge | null>(null)
  const [challengeDone, setChallengeDone] = useState(false)  // 本 session 剛完成 → 顯示慶祝
  const challengeDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [articleCompleted, setArticleCompleted] = useState(false)
  const [fontFamily, setFontFamily] = useState('system-ui, -apple-system, sans-serif')
  // 等級 XP 顯示：初始讀 localStorage，XP 有變化時更新
  const [displayXP, setDisplayXP] = useState(() => gamifyStorage.get().xp)
  const [shortcuts, setShortcuts] = useState<KeyboardShortcuts>(DEFAULT_SHORTCUTS)
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS)
  const [showSearch, setShowSearch] = useState(false)
  const [showGraph, setShowGraph] = useState(false)   // 閱讀時開啟人物關係圖
  const [showBreathing, setShowBreathing] = useState(false)   // 每 4 個循環出呼吸休息動畫
  const [showSidebar, setShowSidebar] = useState(true)  // 預設展開
  const [fadeVisible, setFadeVisible] = useState(true)
  const [animKey, setAnimKey] = useState(0)  // rise 模式：key 變化觸發 CSS 動畫
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
  // 注釋彈窗
  const [showAnnotation, setShowAnnotation] = useState(false)
  const measureDivRef = useRef<HTMLDivElement>(null)
  // 墨水屏模式：⋯ 設定選單
  const [showEinkMenu, setShowEinkMenu] = useState(false)
  // 循環提示：進入新循環時短暫顯示
  const [cycleToast, setCycleToast] = useState<string | null>(null)
  const cycleToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCycleIdxRef = useRef<number>(-1)
  // Flomo 同步：狀態 'idle' | 'sending' | 'ok' | 'error' | 'setup'
  const [flomoStatus, setFlomoStatus] = useState<'idle' | 'sending' | 'ok' | 'error' | 'setup'>('idle')
  const [flomoSetupInput, setFlomoSetupInput] = useState('')
  // 🌿 Flomo 暫存區：逐句加入，最後一起發
  const [flomoBuffer, setFlomoBuffer] = useState<string[]>([])
  const [flomoAddFlash, setFlomoAddFlash] = useState(false)
  const [showFlomoNPicker, setShowFlomoNPicker] = useState(false)
  // 預覽模態框：null = 關閉，有內容 = 顯示預覽
  const [flomoPreview, setFlomoPreview] = useState<string[] | null>(null)
  // 章節目錄側邊欄
  const [showToc, setShowToc] = useState(false)
  // 閱讀速度追蹤：session 開始時間 + 開始句子 index
  const sessionStartRef = useRef<{ time: number; index: number }>({ time: Date.now(), index: initialIndex })
  // 最新 currentIndex 的 ref（讓 unmount 清理函數能讀到最新值）
  const currentIndexRef = useRef(initialIndex)
  // 速度計時：只計算 Tab 可見期間的時間，排除鎖屏/切Tab
  const activeTimeRef = useRef(0)          // 累計有效毫秒
  const lastVisibleRef = useRef(Date.now()) // 最後一次進入前台的時間
  // 背景音樂
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const musicUrlRef = useRef<string | null>(null)
  const [musicEnabled, setMusicEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('reader-music-enabled')
    return saved === null ? true : saved === 'true'   // 預設開啟
  })
  const [musicVolume, setMusicVolume] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.4
    return parseFloat(localStorage.getItem('reader-music-volume') ?? '0.4')
  })
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [hasMusicFile, setHasMusicFile] = useState(false)
  const [musicCurrentTime, setMusicCurrentTime] = useState(0)
  const [musicDuration, setMusicDuration] = useState(0)

  useEffect(() => {
    setCurrentIndex(initialIndex)
    setStartIndex(initialIndex)
    setGoalCompleted(false)
    setVictory(null)
    passedCheckpoints.current = new Set()   // 重置檢查點旗仔
  }, [initialIndex])

  // 安全網：若 currentIndex 落在空白句（PARA_SEP 段落標記或分句殘留的空句）上，自動跳到最近有效句
  useEffect(() => {
    if (isBlankSentence(sentences[currentIndex])) {
      let next = currentIndex + 1
      while (next < sentences.length && isBlankSentence(sentences[next])) next++
      if (next < sentences.length) { setCurrentIndex(next); return }
      let prev = currentIndex - 1
      while (prev >= 0 && isBlankSentence(sentences[prev])) prev--
      if (prev >= 0) setCurrentIndex(prev)
    }
  }, [currentIndex, sentences])

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
  // 使用 effectiveSentence（已合併注尾碎片），確保量尺字數與顯示字數一致
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

    // 可用寬高：動態量取 header 真實高度，再加 padding buffer
    // main area: padding 8px top+bottom = 16px
    // inner container: padding 24px top+bottom = 48px
    // 額外 buffer: 20px 防止邊緣截字
    const headerH = headerRef.current?.offsetHeight ?? 100
    const availW = window.innerWidth - 64   // 左右 padding：main(12) + container(20) = 32px × 2
    const availH = window.innerHeight - headerH - 84  // header + 16 + 48 + 20 buffer

    // 計算有效顯示文字（含注尾碎片）：與 effectiveSentence 邏輯保持一致
    let displayText = sentence
    const nextIdx = currentIndex + 1
    if (nextIdx < sentences.length && sentences[nextIdx]?.startsWith('data:image/')) {
      let tail = ''; let i = nextIdx + 1
      while (i < sentences.length) {
        const s = sentences[i]
        if (s.startsWith('data:image/')) break
        if (s.length > 8) break
        tail += s; i++
      }
      displayText = sentence + tail
    }

    // 設定量尺樣式（與正式顯示一致）
    measure.style.width = `${availW}px`
    measure.style.fontFamily = resolvedFont
    measure.style.whiteSpace = 'pre-wrap'
    measure.style.wordBreak = 'break-word'
    measure.style.lineHeight = '1.5'
    measure.textContent = displayText

    // Binary search：找最大符合的 px
    let lo = 16, hi = 240
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2)
      measure.style.fontSize = `${mid}px`
      // 高度不超過可用高度的 82%（保留呼吸空間，防止截字）
      if (measure.scrollHeight <= availH * 0.82) {
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

    // 載入每日挑戰
    setDailyChallenge(getDailyChallenge())
  }, [])

  useEffect(() => {
    if (readingGoal > 0) {
      const sentencesRead = currentIndex - startIndex + 1
      if (sentencesRead >= readingGoal && !goalCompleted) {
        setGoalCompleted(true)
        // 遊戲化：擊敗怪物 → 記錄 XP（加連打卡倍數）+ 擊殺
        const monster = monsterForGoal(readingGoal)
        const streak = getStreak()
        const multiplier = getStreakMultiplier(streak)
        const baseXP = xpForGoal(readingGoal)   // 按實際句數計算，不再用固定 monster.xp
        const earnedXP = Math.round(baseXP * multiplier)
        gamifyStorage.addXP(earnedXP)
        gamifyStorage.recordKill(monster.id)
        // 每日挑戰：更新「擊殺怪獸」進度
        const updatedCh = updateDailyChallenge('kill_monsters', 1)
        setDailyChallenge({ ...updatedCh })
        if (updatedCh.completed && !dailyChallenge?.completed) {
          setChallengeDone(true)
          if (challengeDoneTimer.current) clearTimeout(challengeDoneTimer.current)
          challengeDoneTimer.current = setTimeout(() => setChallengeDone(false), 4000)
        }
        // 戰果任何模式都顯示（墨水屏用靜態無動畫版本）；彩帶只在非墨水屏模式
        const totalXP = gamifyStorage.get().xp
        setDisplayXP(totalXP)
        setVictory({ emoji: monster.emoji, name: monster.name, xp: baseXP, earnedXP, multiplier, streak, todayKills: gamifyStorage.getTodayKills(), totalXP })
        if (!einkMode) fireConfetti(120)
      }
    }
  }, [currentIndex, startIndex, readingGoal, goalCompleted, onReset, einkMode])

  // 文章讀到最後一句：觸發完成畫面 + 記錄完書日期
  useEffect(() => {
    if (sentences.length > 0 && currentIndex === sentences.length - 1 && !articleCompleted) {
      setArticleCompleted(true)
      // 記錄完書日期（書名 + 日期）
      completionStorage.record(bookTitle, bookId)
      if (onArticleFinished) onArticleFinished()
    }
  }, [currentIndex, sentences.length, onArticleFinished, articleCompleted, bookTitle, bookId])

  useEffect(() => {
    if (bookId) {
      updateBookProgressInIDB(bookId, currentIndex)
    }
  }, [currentIndex, bookId])

  // 背景音樂：載入 IDB，自動播放，unmount 時停止並釋放 URL
  useEffect(() => {
    let cancelled = false
    getMusicObjectURL().then(url => {
      if (cancelled || !url) return
      setHasMusicFile(true)
      musicUrlRef.current = url
      const audio = new Audio(url)
      audio.loop = true
      audio.volume = parseFloat(localStorage.getItem('reader-music-volume') ?? '0.4')
      audioRef.current = audio
      audio.addEventListener('timeupdate', () => setMusicCurrentTime(audio.currentTime))
      audio.addEventListener('durationchange', () => setMusicDuration(audio.duration || 0))
      audio.addEventListener('loadedmetadata', () => setMusicDuration(audio.duration || 0))
      const enabled = localStorage.getItem('reader-music-enabled')
      if (enabled === null || enabled === 'true') {
        audio.play().catch(() => {
          // 瀏覽器自動播放政策：需要用戶互動才能播放
          // 靜默失敗，等用戶點擊音樂按鈕手動觸發
        })
      }
    })
    return () => {
      cancelled = true
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      if (musicUrlRef.current) {
        URL.revokeObjectURL(musicUrlRef.current)
        musicUrlRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 音樂開關與音量同步到 Audio 元素
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (musicEnabled) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
    localStorage.setItem('reader-music-enabled', String(musicEnabled))
  }, [musicEnabled])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVolume
    localStorage.setItem('reader-music-volume', String(musicVolume))
  }, [musicVolume])

  // 速度追蹤：每次 currentIndex 變化時同步到 ref
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])

  // 速度追蹤：只計 Tab 可見時間，排除鎖屏/切Tab
  useEffect(() => {
    sessionStartRef.current = { time: Date.now(), index: initialIndex }
    activeTimeRef.current = 0
    lastVisibleRef.current = Date.now()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // 進入後台：把這段可見時間加到累計
        activeTimeRef.current += Date.now() - lastVisibleRef.current
      } else {
        // 回到前台：重設計時起點
        lastVisibleRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // 結束時加上最後一段可見時間
      if (document.visibilityState !== 'hidden') {
        activeTimeRef.current += Date.now() - lastVisibleRef.current
      }
      const { index } = sessionStartRef.current
      const sentences_read = currentIndexRef.current - index
      speedStorage.record(sentences_read, activeTimeRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      
      if (e.key === shortcuts.nextSentence) {
        e.preventDefault()
        goToNext()
      } else if (e.key === shortcuts.previousSentence) {
        e.preventDefault()
        goToPrevious()
      } else if (e.key === shortcuts.returnHome) {
        e.preventDefault()
        onReset()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, sentences, shortcuts, onReset])

  // 手機/平板觸摸區點擊：右半 = 下一句，左半 = 上一句
  // 過濾掉點按鈕、輸入框等互動元素的情況，反饋改用振動（無視覺閃光）
  const handleMainTap = (e: React.MouseEvent<HTMLElement>) => {
    // 墨水屏長按查詞啱啱觸發咗：呢下 click 係長按嘅尾巴，唔好翻頁
    if (longPressFired.current) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, textarea, a, [role="button"], select')) return
    // 用戶正在選字時，不觸發翻頁
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const isRight = e.clientX - rect.left > rect.width / 2
    if (isRight) {
      goToNext()
    } else {
      goToPrevious()
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

  const vibrate = (_ms: number) => {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    const { VIBRATION_PRESETS } = require('../utils/storage')
    const preset = VIBRATION_PRESETS[displaySettings.vibrationPattern ?? 'standard']
    if (!preset || preset.pattern === 0) return
    navigator.vibrate(preset.pattern)
  }

  const triggerFade = (action: () => void) => {
    // 墨水屏模式：跳過動畫，直接切換（避免殘影）
    if (einkMode) { action(); return }
    const style = displaySettings.animationStyle ?? 'rise'
    if (style === 'rise') {
      // rise 模式：直接更新內容，key 變化觸發 CSS entrance 動畫
      action()
      setAnimKey(k => k + 1)
      return
    }
    // fade 模式（原有行為）
    setFadeVisible(false)
    setTimeout(() => {
      action()
      setFadeVisible(true)
    }, 160)
  }

  // ── 🔍 墨水屏長按查詞 ──
  // 長按句子中嘅字 → 定位按住嘅字符 → 自動組詞查字典（中文試 4/3/2/1 字，英文擴展成整個單詞）
  const [einkDict, setEinkDict] = useState<{
    word: string
    status: 'loading' | 'ok' | 'notfound' | 'error'
    definition?: string
  } | null>(null)
  // AI 上下文釋義（DeepSeek）：與字典彈窗共用，context 為該詞所在句子
  const dictContext = useRef('')
  const dictOriginalWord = useRef('')   // 使用者實際選中的完整詞（字典可能縮短，AI 用呢個）
  const [aiDef, setAiDef] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; text?: string }>({ status: 'idle' })
  // 👥 人物關係（DeepSeek + 人物關係圖快取）
  const [charRel, setCharRel] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; text?: string }>({ status: 'idle' })
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)        // 長按已觸發：抑制隨後嘅 click 翻頁
  const longPressStart = useRef<{ x: number; y: number } | null>(null)
  const dictOpenedAt = useRef(0)              // 開啟時間：吸收 touchend 後嘅合成 click

  // 清理計時器（unmount 時）
  useEffect(() => () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }, [])

  // 由螢幕座標定位文字節點 + 字符 offset（Safari/Chrome 用 caretRangeFromPoint，Firefox 用 caretPositionFromPoint）
  const charFromPoint = (x: number, y: number): { text: string; offset: number } | null => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const doc = document as any
    let node: Node | null = null
    let offset = 0
    if (doc.caretRangeFromPoint) {
      const r = doc.caretRangeFromPoint(x, y)
      if (!r) return null
      node = r.startContainer
      offset = r.startOffset
    } else if (doc.caretPositionFromPoint) {
      const p = doc.caretPositionFromPoint(x, y)
      if (!p) return null
      node = p.offsetNode
      offset = p.offset
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (!node || node.nodeType !== Node.TEXT_NODE) return null
    return { text: node.textContent ?? '', offset }
  }

  // 由按住嘅字符組出候選詞（由長到短逐個查，命中即停）
  const wordCandidates = (text: string, offset: number): string[] => {
    const isCJK = (ch: string) => /[一-鿿]/.test(ch)
    const isLatin = (ch: string) => /[A-Za-z]/.test(ch)
    let i = Math.min(Math.max(offset, 0), text.length - 1)
    if (i < 0 || text.length === 0) return []
    // 按到標點 / 空白：往前移一格
    if (!isCJK(text[i]) && !isLatin(text[i]) && i > 0) i--
    const ch = text[i]

    if (isLatin(ch)) {
      // 英文：向兩邊擴展成整個單詞
      let s = i, e = i
      while (s > 0 && /[A-Za-z'-]/.test(text[s - 1])) s--
      while (e < text.length - 1 && /[A-Za-z'-]/.test(text[e + 1])) e++
      return [text.slice(s, e + 1)]
    }

    if (isCJK(ch)) {
      // 中文：以按住字為首，向後取 n 個連續漢字
      const grab = (n: number) => {
        let w = ''
        for (let k = i; k < text.length && w.length < n; k++) {
          if (!isCJK(text[k])) break
          w += text[k]
        }
        return w
      }
      const cands: string[] = []
      const w4 = grab(4), w3 = grab(3), w2 = grab(2)
      if (w4.length === 4) cands.push(w4)
      if (w3.length === 3) cands.push(w3)
      if (w2.length === 2) cands.push(w2)
      // 按住字可能係詞尾：前一字 + 按住字
      if (i > 0 && isCJK(text[i - 1])) cands.push(text[i - 1] + ch)
      cands.push(ch)
      return Array.from(new Set(cands))
    }
    return []
  }

  // 執行查詢：逐個候選詞試，第一個命中嘅就顯示
  const einkDictLookup = async (x: number, y: number) => {
    const pos = charFromPoint(x, y)
    if (!pos) return
    const cands = wordCandidates(pos.text, pos.offset)
    if (cands.length === 0) return

    longPressFired.current = true
    setTimeout(() => { longPressFired.current = false }, 700)   // 自動復位，避免食咗下一次翻頁
    vibrate(30)
    dictOpenedAt.current = Date.now()
    dictContext.current = pos.text && !pos.text.startsWith('data:') ? pos.text : ''
    dictOriginalWord.current = cands[0]
    setEinkDict({ word: cands[0], status: 'loading' })
    aiDefine(cands[0])
    if (findCachedCharacter(cands[0]).matched) explainCharacter(cands[0])
    else setCharRel({ status: 'idle' })

    for (const w of cands) {
      try {
        const res = await fetch(`/api/dict?word=${encodeURIComponent(w)}`)
        const data = await res.json()
        if (res.ok && data.definition) {
          setEinkDict({ word: w, status: 'ok', definition: data.definition })
          return
        }
      } catch {
        setEinkDict({ word: cands[0], status: 'error' })
        return
      }
    }
    setEinkDict({ word: cands[0], status: 'notfound' })
  }

  // ── 🔍 普通模式：選字查詞（mouseUp / touchEnd 後讀取 selection）──
  const selectionDictLookup = async () => {
    if (isEink) return   // 墨水屏用長按，不用 selection
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!text || text.length > 8) return   // 超過 8 字通常是意外選中，忽略
    dictOpenedAt.current = Date.now()
    const cur = sentences[currentIndex]
    dictContext.current = cur && !cur.startsWith('data:') ? cur : ''
    dictOriginalWord.current = text
    setEinkDict({ word: text, status: 'loading' })
    // 自動先跑 AI 釋義（有 key 才跑），AI 結果會置頂顯示
    aiDefine(text)
    // 若關係圖快取認得呢個名 → 自動顯示人物關係；否則留一個按鈕俾用戶手動查
    if (findCachedCharacter(text).matched) explainCharacter(text)
    else setCharRel({ status: 'idle' })
    // 對中文也試逐步縮短（先試整段，再試前4/3/2/1字）
    const cands: string[] = [text]
    if (/[一-鿿]/.test(text) && text.length > 1) {
      for (let n = Math.min(text.length - 1, 4); n >= 1; n--) cands.push(text.slice(0, n))
    }
    for (const w of cands) {
      try {
        const res = await fetch(`/api/dict?word=${encodeURIComponent(w)}`)
        const data = await res.json()
        if (res.ok && data.definition) {
          setEinkDict({ word: w, status: 'ok', definition: data.definition })
          return
        }
      } catch {
        setEinkDict({ word: text, status: 'error' })
        return
      }
    }
    setEinkDict({ word: text, status: 'notfound' })
  }

  // ── ✨ AI 上下文釋義（DeepSeek）：用該詞所在句子解釋詞義 ──
  const aiDefine = async (word: string) => {
    const key = typeof window !== 'undefined' ? (localStorage.getItem('deepseek-api-key') || '') : ''
    if (!key) {
      setAiDef({ status: 'error', text: '未設定 DeepSeek key，請到書架頁右上角「Vision OCR / 設定」貼上 DeepSeek key。' })
      return
    }
    setAiDef({ status: 'loading' })
    const ctx = dictContext.current
    const prompt = ctx
      ? `下面是一本書中的句子：\n「${ctx}」\n\n請用淺白中文解釋句中「${word}」一詞在此語境下的意思（如有古義、引申義或雙關，亦請點出）。控制在 80 字內，直接給解釋，不要重複句子、不要客套。`
      : `請用淺白中文解釋「${word}」的意思，控制在 80 字內，直接給解釋。`
    try {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 300,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data?.error?.message ?? data?.message ?? res.status
        setAiDef({ status: 'error', text: `DeepSeek 錯誤：${msg}` })
        return
      }
      const txt: string = data.choices?.[0]?.message?.content?.trim() ?? ''
      setAiDef(txt ? { status: 'ok', text: txt } : { status: 'error', text: 'AI 沒有回傳內容' })
    } catch {
      setAiDef({ status: 'error', text: '網絡錯誤，請稍後再試' })
    }
  }

  // 由人物關係圖快取中尋找該人物，回傳是否命中與已知關係字串（作為 AI 的依據）
  const findCachedCharacter = (name: string): { matched: boolean; canonical: string; grounding: string } => {
    if (typeof window === 'undefined' || !bookId) return { matched: false, canonical: name, grounding: '' }
    try {
      const raw = localStorage.getItem('char-graph:v1:' + bookId)
      if (!raw) return { matched: false, canonical: name, grounding: '' }
      const data = JSON.parse(raw)
      const chars: { name: string }[] = data?.characters ?? []
      const hit = chars.find(c => c.name === name || name.includes(c.name) || c.name.includes(name))
      if (!hit) return { matched: false, canonical: name, grounding: '' }
      const rels: { source: string; target: string; label?: string }[] = data?.relations ?? []
      const grounding = rels
        .filter(r => r.source === hit.name || r.target === hit.name)
        .map(r => `${r.source}—${r.label || '相關'}—${r.target}`)
        .join('；')
      return { matched: true, canonical: hit.name, grounding }
    } catch {
      return { matched: false, canonical: name, grounding: '' }
    }
  }

  // 👥 用 DeepSeek 介紹人物 + 列出關係（以快取關係圖與上下文作依據）
  const explainCharacter = async (name: string) => {
    const key = typeof window !== 'undefined' ? (localStorage.getItem('deepseek-api-key') || '') : ''
    if (!key) {
      setCharRel({ status: 'error', text: '未設定 DeepSeek key，請到書架頁設定。' })
      return
    }
    setCharRel({ status: 'loading' })
    const { canonical, grounding } = findCachedCharacter(name)
    const ctx = dictContext.current
    const prompt =
      `在小說《${bookTitle}》中，「${canonical || name}」是誰？\n` +
      `請：1) 用一句話介紹呢個角色；2) 列出佢同其他主要人物嘅關係，每行一條，格式「對象 — 關係（例如 夫妻／兄妹／朋友）」。\n` +
      (grounding ? `已知人物關係資料（請參考，可補充）：${grounding}\n` : '') +
      (ctx ? `出現語境：「${ctx}」\n` : '') +
      `只輸出介紹同關係，唔好客套，控制在 120 字內。`
    try {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 400,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data?.error?.message ?? data?.message ?? res.status
        setCharRel({ status: 'error', text: `DeepSeek 錯誤：${msg}` })
        return
      }
      const txt: string = data.choices?.[0]?.message?.content?.trim() ?? ''
      setCharRel(txt ? { status: 'ok', text: txt } : { status: 'error', text: 'AI 沒有回傳內容' })
    } catch {
      setCharRel({ status: 'error', text: '網絡錯誤，請稍後再試' })
    }
  }

  const LONG_PRESS_MS = 550
  const startLongPress = (x: number, y: number) => {
    if (!einkMode) return
    longPressStart.current = { x, y }
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => einkDictLookup(x, y), LONG_PRESS_MS)
  }
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  const moveLongPress = (x: number, y: number) => {
    // 手指移動超過 10px = 想滑動/選字，取消長按
    const s = longPressStart.current
    if (s && (Math.abs(x - s.x) > 10 || Math.abs(y - s.y) > 10)) cancelLongPress()
  }

  // 掛喺句子 <p> 上嘅事件（只在墨水屏模式生效）
  const einkPressHandlers = einkMode ? {
    onTouchStart: (e: React.TouchEvent) => startLongPress(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove: (e: React.TouchEvent) => moveLongPress(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd: cancelLongPress,
    onTouchCancel: cancelLongPress,
    onMouseDown: (e: React.MouseEvent) => startLongPress(e.clientX, e.clientY),
    onMouseMove: (e: React.MouseEvent) => { if (e.buttons === 1) moveLongPress(e.clientX, e.clientY) },
    onMouseUp: cancelLongPress,
    onMouseLeave: cancelLongPress,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),   // 阻止長按彈出系統選單
  } : {}

  // 純文字注釋（epub footnote）才是「注」；真正的圖片是獨立頁面
  const PARA_SEP = ' '  // 段落分隔符（與 epubParser.ts 一致）
  const isParaSep = (s: string) => s === PARA_SEP
  const isAnnotationItem = (s: string) => s?.startsWith('data:image/annotation;')

  // 短碎片判斷：注文後緊接的短文字（≤8字）視為前句的尾巴，合併顯示
  const isAnnotationTail = (idx: number) =>
    idx >= 0 &&
    idx < sentences.length &&
    !sentences[idx]?.startsWith('data:image/') &&
    sentences[idx].length <= 8 &&
    isAnnotationItem(sentences[idx - 1])

  // 找下一個可停留的 index：跳過注文碎片 + 注尾碎片，但真實圖片是合法停留點
  const nextTextIndex = (from: number) => {
    let i = from + 1
    while (i < sentences.length) {
      if (isBlankSentence(sentences[i])) { i++; continue }    // 跳過段落分隔符與空白句
      if (isAnnotationItem(sentences[i])) { i++; continue }   // 跳過注文（附屬於前句）
      if (isAnnotationTail(i)) { i++; continue }              // 跳過已合併的尾巴
      break
    }
    return i < sentences.length ? i : -1
  }
  // 找上一個可停留的 index
  const prevTextIndex = (from: number) => {
    let i = from - 1
    while (i >= 0) {
      if (isBlankSentence(sentences[i])) { i--; continue }    // 跳過段落分隔符與空白句
      if (isAnnotationItem(sentences[i])) { i--; continue }
      if (isAnnotationTail(i)) { i--; continue }
      break
    }
    return i >= 0 ? i : -1
  }

  const goToNext = () => {
    const next = nextTextIndex(currentIndex)
    if (next !== -1) {
      vibrate(displaySettings.vibrationIntensity)
      historyStorage.recordRead(1)
      // 📅 每日挑戰：讀句進度
      if (!einkMode) {
        const ch = updateDailyChallenge('read_sentences', 1)
        if (ch.type === 'read_sentences') {
          setDailyChallenge({ ...ch })
          if (ch.completed && !dailyChallenge?.completed) {
            setChallengeDone(true)
            if (challengeDoneTimer.current) clearTimeout(challengeDoneTimer.current)
            challengeDoneTimer.current = setTimeout(() => setChallengeDone(false), 4000)
          }
        }
      }
      // 💎 幸運加成：~6% 機率，非已完成目標（墨水屏有靜態版）
      if (!goalCompleted && Math.random() < 0.06) {
        const bonusAmounts = [10, 20, 30, 50]
        const bonus = bonusAmounts[Math.floor(Math.random() * bonusAmounts.length)]
        const type = LUCKY_TYPES[Math.floor(Math.random() * LUCKY_TYPES.length)]
        gamifyStorage.addXP(bonus)
        setDisplayXP(gamifyStorage.get().xp)
        setLuckyFading(false)
        setLuckyReward({ xp: bonus, ...type })
        if (luckyBonusTimer.current) clearTimeout(luckyBonusTimer.current)
        luckyBonusTimer.current = setTimeout(() => {
          setLuckyFading(true)
          setTimeout(() => { setLuckyReward(null); setLuckyFading(false) }, 420)
        }, 2100)
      }
      triggerFade(() => setCurrentIndex(next))
    }
  }

  const goToPrevious = () => {
    const prev = prevTextIndex(currentIndex)
    if (prev !== -1) {
      vibrate(displaySettings.vibrationIntensity)
      triggerFade(() => setCurrentIndex(prev))
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

  // ── ⚔️ 怪物戰鬥條（代替循環進度條；只在非墨水屏 + 有目標時使用） ──
  const battleMonster = readingGoal > 0 ? monsterForGoal(readingGoal) : null
  const battleHp = Math.max(readingGoal - sentencesRead, 0)
  const battleHpPct = readingGoal > 0 ? (battleHp / readingGoal) * 100 : 0
  const battleBarColor = goalCompleted
    ? '#22c55e'
    : battleHpPct > 60 ? '#eab308' : battleHpPct > 25 ? '#fb923c' : '#ef4444'
  // 扣血震動：偵測「又讀咗一句」
  const [hudShake, setHudShake] = useState(false)
  const prevReadRef = useRef(sentencesRead)
  useEffect(() => {
    if (!einkMode && readingGoal > 0 && sentencesRead > prevReadRef.current) {
      setHudShake(true)
      const t = setTimeout(() => setHudShake(false), 380)
      prevReadRef.current = sentencesRead
      return () => clearTimeout(t)
    }
    prevReadRef.current = sentencesRead
  }, [sentencesRead, einkMode, readingGoal])

  // ── ② 檢查點：25/50/75% 旗仔（非墨水屏；閃光 + micro-toast） ──
  const passedCheckpoints = useRef<Set<number>>(new Set())
  const [cpFlash, setCpFlash] = useState<number | null>(null)
  const [cpToast, setCpToast] = useState<string | null>(null)
  const cpToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (einkMode || readingGoal <= 0) return
    const pct = (sentencesRead / readingGoal) * 100
    const MSGS: Record<number, string> = { 25: '🚩 25%！旗開得勝', 50: '⚡ 過半啦！', 75: '🔥 75%！最後衝刺' }
    for (const m of [25, 50, 75]) {
      if (pct >= m && !passedCheckpoints.current.has(m)) {
        passedCheckpoints.current.add(m)
        if (pct >= 100) continue   // 直接衝線：終點有勝利卡，唔使再彈 checkpoint toast
        setCpFlash(m)
        setTimeout(() => setCpFlash(null), 750)
        setCpToast(MSGS[m])
        if (cpToastTimer.current) clearTimeout(cpToastTimer.current)
        cpToastTimer.current = setTimeout(() => setCpToast(null), 2200)
      }
    }
  }, [sentencesRead, readingGoal, einkMode])

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

  // ── 注釋偵測：當前是文字句，且下一句是圖片（注釋圖）時 ──
  // 把注前文字 + 注後緊接的文字碎片拼合為完整句，供彈窗顯示
  // 只有 data:image/annotation; 才是「注」；真實圖片不觸發此邏輯
  const annotationBlock = useMemo(() => {
    const cur = sentences[currentIndex]
    if (!cur || cur.startsWith('data:image/')) return null
    const nextIdx = currentIndex + 1
    if (nextIdx >= sentences.length) return null
    if (!isAnnotationItem(sentences[nextIdx])) return null   // 只對注文生效

    // 收集注文後面的文字碎片
    const afterFragments: string[] = []
    let i = nextIdx + 1
    while (i < sentences.length && afterFragments.length < 6) {
      const s = sentences[i]
      if (s.startsWith('data:image/')) break
      if (afterFragments.length > 0 && s.length > 30) break
      afterFragments.push(s)
      i++
    }

    const fullSentence = cur + afterFragments.join('')
    return {
      fullSentence,
      afterFragments,
      annotationImage: sentences[nextIdx],
    }
  }, [currentIndex, sentences])

  // ── 有效顯示句：當前句 + 注文後的短尾巴碎片 ──
  const effectiveSentence = useMemo(() => {
    const cur = sentences[currentIndex]
    if (!cur || cur.startsWith('data:image/')) return cur ?? ''
    const nextIdx = currentIndex + 1
    if (nextIdx >= sentences.length || !isAnnotationItem(sentences[nextIdx])) return cur
    let tail = ''
    let i = nextIdx + 1
    while (i < sentences.length) {
      const s = sentences[i]
      if (s.startsWith('data:image/')) break
      if (s.length > 8) break
      tail += s
      i++
    }
    return cur + tail
  }, [currentIndex, sentences])

  // ＋ 加入暫存：把當前句子加入 buffer，閃爍提示
  const addToFlomoBuffer = () => {
    const sentence = effectiveSentence
    if (!sentence || sentence.startsWith('data:image/')) return
    setFlomoBuffer(prev => [...prev, sentence])
    setFlomoAddFlash(true)
    setTimeout(() => setFlomoAddFlash(false), 600)
  }

  // 抓最近 N 句（過濾圖片句 + PARA_SEP）→ 顯示預覽
  const sendLastN = (n: number) => {
    setShowFlomoNPicker(false)
    const collected: string[] = []
    for (let i = currentIndex; i >= 0 && collected.length < n; i--) {
      const s = sentences[i]
      if (s && !s.startsWith('data:image/') && s !== ' ') collected.unshift(s)
    }
    if (collected.length === 0) return
    setFlomoPreview(collected)
  }

  // 以當前句為中心，按書本段落邊界取前後 N 段
  // 有 PARA_SEP 標記時（重新上傳的書）按真實段落；否則退化為句子偏移
  const sendContext = (paragraphsBefore: number, paragraphsAfter: number) => {
    setShowFlomoNPicker(false)
    const hasPara = sentences.some(s => s === PARA_SEP)

    if (!hasPara) {
      // 舊書沒有段落標記：退化為 ±N 句（仍 join 顯示）
      const fallbackN = paragraphsBefore === 0 ? 0 : paragraphsBefore === 1 ? 2 : 5
      const collected: string[] = []
      for (let i = currentIndex - fallbackN; i <= currentIndex + fallbackN; i++) {
        if (i < 0 || i >= sentences.length) continue
        const s = sentences[i]
        if (s && !s.startsWith('data:image/')) collected.push(s)
      }
      if (collected.length === 0) return
      setFlomoPreview(collected)
      return
    }

    // 找當前段落的起止 index
    let paraStart = currentIndex
    while (paraStart > 0 && sentences[paraStart - 1] !== PARA_SEP) paraStart--

    let paraEnd = currentIndex
    while (paraEnd < sentences.length - 1 && sentences[paraEnd + 1] !== PARA_SEP) paraEnd++

    // 向前擴展 N 個段落
    let start = paraStart
    for (let p = 0; p < paragraphsBefore; p++) {
      // 跳過 PARA_SEP
      if (start <= 0) break
      start-- // 進入上一個 PARA_SEP
      // 再往前找那個段落的起點
      while (start > 0 && sentences[start - 1] !== PARA_SEP) start--
    }

    // 向後擴展 N 個段落
    let end = paraEnd
    for (let p = 0; p < paragraphsAfter; p++) {
      if (end >= sentences.length - 1) break
      end++ // 跳過 PARA_SEP
      while (end < sentences.length - 1 && sentences[end + 1] !== PARA_SEP) end++
    }

    // 保留 PARA_SEP 作段落分隔，過濾圖片句
    const collected = sentences
      .slice(start, end + 1)
      .filter(s => !s.startsWith('data:image/'))
    // 去掉首尾多餘的 PARA_SEP
    while (collected.length > 0 && collected[0] === PARA_SEP) collected.shift()
    while (collected.length > 0 && collected[collected.length - 1] === PARA_SEP) collected.pop()
    if (collected.length === 0) return
    setFlomoPreview(collected)
  }

  // 🌿 核心發送函數（接受要發送的句子陣列）
  const sendToFlomoWithContent = async (toSend: string[]) => {
    const url = flomoStorage.getUrl()
    if (!url) { setFlomoStatus('setup'); return }
    if (!toSend[0] || toSend[0].startsWith('data:image/')) return
    const today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
    // 按 PARA_SEP 分段，段內句子 join 成一行，段間用 \n\n
    const paragraphs: string[] = []
    let cur: string[] = []
    for (const s of toSend) {
      if (s === PARA_SEP) {
        if (cur.length > 0) { paragraphs.push(cur.join('')); cur = [] }
      } else {
        cur.push(s)
      }
    }
    if (cur.length > 0) paragraphs.push(cur.join(''))
    const content = `📖 ${bookTitle}\n📅 ${today}\n\n${paragraphs.join('\n\n')}`
    setFlomoStatus('sending')
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      setFlomoStatus('ok')
      // 同時存一份到本機「每日温習」（每段為一張卡，依文字去重）
      reviewStorage.addMany(paragraphs, bookTitle)
      setFlomoBuffer([])
      setTimeout(() => setFlomoStatus('idle'), 2000)
    } catch {
      setFlomoStatus('error')
      setTimeout(() => {
        const savedUrl = flomoStorage.getUrl() ?? ''
        setFlomoSetupInput(savedUrl)
        setFlomoStatus('setup')
      }, 1500)
    }
  }

  // 🌿 點 Flomo 按鈕：有暫存就發，沒暫存就彈出 N 句選擇器
  const sendToFlomo = () => {
    if (flomoBuffer.length > 0) {
      sendToFlomoWithContent(flomoBuffer)
    } else {
      setShowFlomoNPicker(v => !v)
    }
  }

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
      const prevIdx = prevCycleIdxRef.current
      prevCycleIdxRef.current = currentCycleIdx
      const sz = cycleData.sizes[currentCycleIdx]
      setCycleToast(`第 ${currentCycleIdx + 1} 循環 · ${sz} 句`)
      if (cycleToastTimer.current) clearTimeout(cycleToastTimer.current)
      cycleToastTimer.current = setTimeout(() => setCycleToast(null), 2500)
      // 每看完 4 個循環（進入第 4、8、12… 個循環）→ 呼吸休息動畫
      if (currentCycleIdx > prevIdx && currentCycleIdx % 4 === 0) {
        setShowBreathing(true)
      }
    }
  }, [currentCycleIdx, cycleData.sizes])

  const cycleStart  = cycleData.boundaries[currentCycleIdx]
  const cycleSize   = cycleData.sizes[currentCycleIdx]
  const posInCycle  = Math.min(sentencesRead - cycleStart, cycleSize)

  // 當前循環的最大填充高度（線性遞增，最後一個循環 = 100%）
  const maxFill = (currentCycleIdx + 1) / cycleData.count

  // 再戰一場：由當前句開始新一場戰鬥（同一目標、同一隻怪）
  // 書剩低句數唔夠一場先唔顯示「再戰」掣
  const canRematch = readingGoal > 0 && (sentences.length - 1 - currentIndex) >= readingGoal
  const continueBattle = () => {
    setStartIndex(currentIndex)
    setGoalCompleted(false)
    setVictory(null)
    passedCheckpoints.current = new Set()
  }

  // ── ④ 合併單條：一條 bar 顯示成個循環（普通 + 墨水屏共用數值） ──
  const mergedBarWidth = (cycleSize > 0 ? posInCycle / cycleSize : 0) * maxFill * 100
  // ① 戰鬥征途：勇者位置 = 目標進度
  const questPct = readingGoal > 0 ? Math.min((Math.max(sentencesRead, 0) / readingGoal) * 100, 100) : 0
  // ⑤ 全書薄條：今日疆土分段
  const bookBeforePct = sentences.length > 1 ? (startIndex / (sentences.length - 1)) * 100 : 0
  const bookTodayPct = sentences.length > 1 ? (Math.max(currentIndex - startIndex, 0) / (sentences.length - 1)) * 100 : 0

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
      {/* 章節目錄抽屜（非墨水屏模式，有 chapters 才顯示）*/}
      {!isEink && showToc && chapters && chapters.length > 0 && (
        <>
          {/* 半透明遮罩 */}
          <div
            className="fixed inset-0 bg-black bg-opacity-20 z-40"
            onClick={() => setShowToc(false)}
          />
          {/* 側邊抽屜 */}
          <div
            className="fixed left-0 top-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col"
            style={{ width: 280, maxWidth: '80vw' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-semibold text-gray-800">章節目錄</span>
              </div>
              <button
                onClick={() => setShowToc(false)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto py-2">
              {chapters.map((ch, i) => {
                const isActive = i === chapters.length - 1
                  ? currentIndex >= ch.startIndex
                  : currentIndex >= ch.startIndex && currentIndex < chapters[i + 1].startIndex
                return (
                  <li key={i}>
                    <button
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-indigo-50 ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                      onClick={() => {
                        setCurrentIndex(ch.startIndex)
                        setShowToc(false)
                      }}
                    >
                      <span className="text-gray-300 mr-2 text-xs">#{i + 1}</span>
                      {ch.title}
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
              共 {chapters.length} 章
            </div>
          </div>
        </>
      )}

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
          <div className="max-w-7xl mx-auto px-3 py-2 sm:py-4 flex items-center gap-2">
            {/* 返回首頁：永遠顯示在最左邊，手機上只顯示圖示 */}
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-1.5 sm:px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              title="返回首頁"
            >
              <Home className="w-5 h-5" />
              <span className="hidden sm:inline text-sm">首頁</span>
            </button>

            <div className="flex items-center space-x-2 flex-shrink-0">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              {!showSearch && (
                <h1 className="text-sm sm:text-xl font-semibold text-gray-800 max-w-[100px] sm:max-w-xs md:max-w-sm truncate" title={bookTitle}>{bookTitle}</h1>
              )}
            </div>

            {/* 書內搜索框（展開時） */}
            {showSearch && (
              <div className="relative flex-1">
                <div className="flex items-center w-full px-3 py-1.5 border-2 border-indigo-400 rounded-full bg-white shadow-sm">
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
            )}

            {/* 右側工具列：橫向可滾動，手機可左滑看到更多 */}
            <div className="flex items-center gap-0.5 ml-auto overflow-x-auto scrollbar-hide flex-shrink-0 max-w-[60vw] sm:max-w-none">
              {/* 書內搜索按鈕 */}
              {!showSearch && (
                <button onClick={() => setShowSearch(true)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" title="書內搜索">
                  <Search className="w-4 h-4 text-gray-500" />
                </button>
              )}
              {/* 人物關係圖按鈕 */}
              <button onClick={() => setShowGraph(true)} className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0" title="人物關係圖">
                <Network className="w-4 h-4 text-indigo-500" />
              </button>
              {/* 章節目錄（只有 EPUB 有 chapters 才顯示）*/}
              {chapters && chapters.length > 0 && (
                <button
                  onClick={() => setShowToc(v => !v)}
                  className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${showToc ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
                  title="章節目錄"
                >
                  <List className="w-4 h-4" />
                </button>
              )}
              {onOpenBook && <span className="hidden md:block flex-shrink-0"><SearchPanel onOpenBook={onOpenBook} /></span>}
              <span className="flex-shrink-0"><DictionaryPanel /></span>
              <span className="flex-shrink-0"><DisplaySettingsPanel settings={displaySettings} onSave={handleDisplaySettingsChange} /></span>
              <span className="hidden md:block flex-shrink-0"><KeyboardSettings shortcuts={shortcuts} onSave={handleShortcutsChange} /></span>
              <span className="flex-shrink-0"><FontSelector currentFont={fontFamily} onFontChange={handleFontChange} /></span>

              {/* 🌿 Flomo 按鈕組 */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {/* ＋ 加入暫存 */}
                <button
                  onClick={addToFlomoBuffer}
                  className="px-1.5 py-1.5 rounded-lg text-sm font-bold transition-all"
                  style={{
                    background: flomoAddFlash ? '#bbf7d0' : '#f0fdf4',
                    color: flomoAddFlash ? '#15803d' : '#86efac',
                    transform: flomoAddFlash ? 'scale(1.2)' : 'scale(1)',
                    transition: 'transform 200ms cubic-bezier(0.23,1,0.32,1), background 200ms',
                  }}
                  title="加入 Flomo 暫存"
                >
                  ＋
                </button>

                {/* 🌿 發送暫存到 Flomo */}
                <button
                  onClick={sendToFlomo}
                  disabled={flomoStatus === 'sending'}
                  className="px-2 py-1.5 rounded-lg text-sm flex items-center gap-1 disabled:opacity-50 relative"
                  style={{
                    background: flomoStatus === 'ok' ? '#dcfce7' : flomoStatus === 'error' ? '#fee2e2' : '#f0fdf4',
                    color: flomoStatus === 'ok' ? '#16a34a' : flomoStatus === 'error' ? '#dc2626' : '#15803d',
                  }}
                  title={flomoBuffer.length > 0 ? `發送 ${flomoBuffer.length} 句到 Flomo` : '儲存到 Flomo'}
                >
                  <span>{flomoStatus === 'sending' ? '⏳' : flomoStatus === 'ok' ? '✅' : flomoStatus === 'error' ? '❌' : '🌿'}</span>
                  <span className="hidden sm:inline text-xs">
                    {flomoStatus === 'ok' ? '已發送' : flomoStatus === 'error' ? '失敗' : 'Flomo'}
                  </span>
                  {/* 暫存計數徽章 */}
                  {flomoBuffer.length > 0 && flomoStatus === 'idle' && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center leading-none">
                      {flomoBuffer.length}
                    </span>
                  )}
                </button>

                {/* 清空暫存按鈕（有暫存時才顯示） */}
                {flomoBuffer.length > 0 && (
                  <button
                    onClick={() => setFlomoBuffer([])}
                    className="px-1 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-red-50 transition-colors"
                    title="清空暫存"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={() => setRainEnabled(v => !v)}
                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${rainEnabled ? 'bg-blue-100 text-blue-500' : 'text-gray-400 hover:bg-gray-100'}`}
                title={rainEnabled ? '關閉雨聲' : '開啟下雨效果'}
              >
                <CloudRain className="w-4 h-4" />
              </button>

              {/* 🎵 背景音樂播放器（有音樂文件才顯示）*/}
              {hasMusicFile && (() => {
                const fmt = (s: number) => {
                  if (!isFinite(s)) return '--:--'
                  const m = Math.floor(s / 60)
                  const sec = Math.floor(s % 60)
                  return `${m}:${sec.toString().padStart(2, '0')}`
                }
                return (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-purple-50 border border-purple-100 flex-shrink-0">
                    {/* 靜音/播放切換 */}
                    <button
                      onClick={() => {
                        if (!musicEnabled) {
                          setMusicEnabled(true)
                          audioRef.current?.play().catch(() => {})
                        } else {
                          setMusicEnabled(false)
                        }
                      }}
                      className="text-purple-500 hover:text-purple-700 transition-colors flex-shrink-0"
                      title={musicEnabled ? '靜音' : '播放'}
                    >
                      {musicEnabled
                        ? <Music className="w-3.5 h-3.5" />
                        : <VolumeX className="w-3.5 h-3.5" />}
                    </button>

                    {/* 時間顯示 */}
                    <span className="text-[10px] text-purple-400 font-mono tabular-nums whitespace-nowrap">
                      {fmt(musicCurrentTime)}<span className="opacity-50"> / {fmt(musicDuration)}</span>
                    </span>

                    {/* 音量滑桿（永遠可見）*/}
                    <div className="flex items-center gap-1 ml-1">
                      <VolumeX className="w-3 h-3 text-purple-300 flex-shrink-0" />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={musicVolume}
                        onChange={e => setMusicVolume(parseFloat(e.target.value))}
                        className="w-16 h-1 accent-purple-500 cursor-pointer"
                        title={`音量 ${Math.round(musicVolume * 100)}%`}
                      />
                      <Volume2 className="w-3 h-3 text-purple-400 flex-shrink-0" />
                    </div>
                  </div>
                )
              })()}
              <button
                onClick={toggleEinkMode}
                className="flex items-center gap-0.5 px-1.5 py-1.5 rounded-lg flex-shrink-0"
                style={{ color: '#6b7280' }}
                title="墨水屏模式"
              >
                <span className="text-sm">🖊️</span>
                <span className="hidden sm:inline text-sm">墨水屏</span>
              </button>
              <button
                onClick={toggleReaderMode}
                className="flex items-center gap-0.5 px-1.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
                style={{ color: isPaper ? '#a16207' : '#6b7280', background: isPaper ? '#fef3c7' : 'transparent' }}
                title={isPaper ? '切換回預設模式' : '紙本質感'}
              >
                <span className="text-sm">{isPaper ? '📖' : '🖥️'}</span>
                <span className="hidden sm:inline text-sm">{isPaper ? '紙本' : '預設'}</span>
              </button>
            </div>
          </div>
        )}
        <div className="w-full">
          {/* ── ⚔️ 戰況列：怪物 + HP，融合喺原進度條上方 ── */}
          {/* 普通模式：扣血震動 + HP 變色；墨水屏：純黑靜態文字，無動畫無轉場（避免殘影） */}
          {battleMonster && (
            <div className="flex items-center justify-between px-0.5" style={{ marginBottom: isEink ? 4 : 6 }}>
              <div className="flex items-center gap-1.5">
                <span
                  className="text-base leading-none"
                  style={isEink ? { fontSize: 15 } : {
                    display: 'inline-block',
                    animation: hudShake ? 'gamify-hud-shake 380ms var(--ease-out)' : undefined,
                    filter: goalCompleted ? 'grayscale(1)' : undefined,
                    opacity: goalCompleted ? 0.55 : 1,
                    transition: 'filter 400ms ease, opacity 400ms ease',
                  }}
                >
                  {battleMonster.emoji}
                </span>
                <span
                  className={isEink ? undefined : 'text-xs font-semibold text-gray-700'}
                  style={isEink ? { fontSize: 13, fontWeight: 700, color: '#000' } : undefined}
                >
                  {battleMonster.name}
                </span>
                {goalCompleted && (
                  <span
                    className={isEink ? undefined : 'text-xs font-semibold text-green-600'}
                    style={isEink ? { fontSize: 13, fontWeight: 700, color: '#000' } : undefined}
                  >
                    已擊敗！
                  </span>
                )}
              </div>
              <span
                className="text-xs tabular-nums font-medium"
                style={isEink
                  ? { fontSize: 13, fontWeight: 700, color: '#000' }
                  : { color: goalCompleted ? '#16a34a' : battleBarColor }}
              >
                {goalCompleted ? `⚡ +${xpForGoal(readingGoal)} XP` : `HP ${battleHp}/${readingGoal}`}
              </span>
            </div>
          )}

          {!isEink ? (
          /* ── 非墨水屏：④合併循環條 + ①②戰鬥征途 + ⑤今日疆土 ── */
          <>
          {/* ④ 合併循環條：一條 bar 顯示成個循環，50% 加粗中點刻度 = 上半/下半交界 */}
          <div
            className="hidden sm:flex justify-between text-xs mb-0.5 px-0.5"
            style={{ color: getProgressColor() }}
          >
            <span>循環進度 · 第 {currentCycleIdx + 1}/{cycleData.count} 循環（{Math.max(posInCycle, 0)}/{cycleSize} 句）</span>
            <span className="tabular-nums">{mergedBarWidth.toFixed(0)}%</span>
          </div>
          <div className="w-full relative" style={{ height: 8 }}>
            <div className="absolute inset-0 rounded-full bg-gray-200" />
            {/* 漸層色填充（紅→黃→瑞幸藍，沿用原插值邏輯） */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${mergedBarWidth}%`, backgroundColor: getBarColor(mergedBarWidth), transition: 'all 0.3s' }}
            />
            {/* 發光尾端 */}
            {mergedBarWidth > 0.5 && (
              <div
                className="absolute top-1/2 rounded-full transition-all duration-300 pointer-events-none"
                style={{
                  left: `${mergedBarWidth}%`,
                  transform: 'translate(-50%,-50%)',
                  width: 14, height: 14,
                  backgroundColor: getBarColor(mergedBarWidth),
                  opacity: 0.5,
                  boxShadow: `0 0 8px 5px ${getBarColor(mergedBarWidth)}88`,
                }}
              />
            )}
            {/* 25/75 缺口 */}
            {[25, 75].map(m => (
              <div
                key={m}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 pointer-events-none"
                style={{ left: `${m}%`, width: 2, height: 14, background: 'white', borderRadius: 0 }}
              />
            ))}
            {/* 50% 加粗中點刻度 */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 pointer-events-none"
              style={{ left: '50%', width: 4, height: 18, background: '#a5b4fc', borderRadius: 2 }}
            />
          </div>

          {/* ①② 戰鬥征途：小勇者行向怪物 + 檢查點旗仔（有目標先顯示） */}
          {battleMonster && (
            <div className="w-full relative" style={{ height: 10, marginTop: 16 }}>
              <div className="absolute inset-0 rounded-full" style={{ background: '#eef2ff', border: '1px solid #e0e7ff' }} />
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${questPct}%`, background: 'linear-gradient(90deg,#a5b4fc,#6366f1)', transition: 'width 350ms var(--ease-out)' }}
              />
              {/* ② 檢查點旗仔：25/50/75，通過時著燈 + 閃光 */}
              {[25, 50, 75].map(m => (
                <div
                  key={m}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
                  style={{
                    left: `${m}%`, width: 2, height: 16,
                    background: questPct >= m ? '#6366f1' : '#c7d2fe',
                    transition: 'background .3s',
                    animation: cpFlash === m ? 'gamify-cp-flash 700ms var(--ease-out)' : undefined,
                  }}
                >
                  <span style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', fontSize: 10, opacity: questPct >= m ? 1 : 0.35, transition: 'opacity .3s' }}>🚩</span>
                </div>
              ))}
              {/* ① 小勇者：企喺進度尖端，每讀一句踏前一步 */}
              <span
                className="pointer-events-none"
                style={{
                  position: 'absolute', left: `${Math.min(questPct, 96)}%`, top: '50%',
                  transform: 'translate(-50%,-58%)', fontSize: 16, zIndex: 12, display: 'inline-block',
                  transition: 'left 350ms var(--ease-out)',
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.25))',
                  animation: hudShake ? 'gamify-hero-step 350ms var(--ease-out)' : undefined,
                }}
              >⚔️</span>
              {/* 怪物：右端等緊；HP 清零反白倒地 */}
              <span
                className="pointer-events-none"
                style={{
                  position: 'absolute', right: -2, top: '50%', transform: 'translate(0,-58%)',
                  fontSize: 17, zIndex: 11, display: 'inline-block',
                  animation: goalCompleted
                    ? 'gamify-monster-fall 900ms var(--ease-out) both'
                    : hudShake ? 'gamify-lane-hit 380ms var(--ease-out)' : undefined,
                }}
              >{battleMonster.emoji}</span>
            </div>
          )}

          {/* ⑤ 全書薄條 + 今日疆土：淺藍=之前讀咗，深藍=今日疆土，灰=未讀 */}
          <div
            className="w-full relative rounded-full overflow-hidden"
            style={{ height: 4, background: '#f3f4f6', marginTop: battleMonster ? 8 : 4 }}
            title={`全書 ${currentIndex + 1}/${sentences.length} 句 · 今日讀咗 ${Math.max(currentIndex - startIndex, 0) + 1} 句`}
          >
            <div className="absolute inset-y-0 left-0" style={{ width: `${bookBeforePct}%`, background: '#bae6fd' }} />
            <div
              className="absolute inset-y-0"
              style={{ left: `${bookBeforePct}%`, width: `${bookTodayPct}%`, background: '#00A3E0', transition: 'width 350ms var(--ease-out)' }}
            />
          </div>

          {/* 📅 每日挑戰進度條（普通模式，不在墨水屏顯示） */}
          {dailyChallenge && !dailyChallenge.completed && (
            <div className="flex items-center gap-2 mt-2 px-0.5">
              <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', flexShrink: 0 }}>
                🎯 {dailyChallenge.type === 'kill_monsters'
                  ? `今日挑戰：擊敗 ${dailyChallenge.target} 隻怪獸`
                  : `今日挑戰：閱讀 ${dailyChallenge.target} 句`}
              </span>
              <div className="flex-1 relative h-1.5 rounded-full overflow-hidden" style={{ background: '#e5e7eb', minWidth: 40 }}>
                <div
                  style={{ height: '100%', width: `${Math.min((dailyChallenge.progress / dailyChallenge.target) * 100, 100)}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: 99, transition: 'width 350ms var(--ease-out)' }}
                />
              </div>
              <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {dailyChallenge.progress}/{dailyChallenge.target}
              </span>
            </div>
          )}
          {dailyChallenge?.completed && (
            <div className="flex items-center gap-1 mt-2 px-0.5">
              <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>✅ 今日挑戰已完成！+{dailyChallenge.bonusXP} XP</span>
            </div>
          )}
          </>
          ) : (
          /* ── 墨水屏：④合併循環條 + ①②戰鬥征途 + ⑤今日疆土（靜態高對比版，無動畫無轉場） ── */
          <>
          {/* ④ 合併循環條：純黑填充，50% 加粗中點刻度 */}
          <div
            className="flex justify-between mb-0.5 px-0.5"
            style={{ color: '#000', fontSize: 13, fontWeight: 600 }}
          >
            <span>第 {currentCycleIdx + 1}/{cycleData.count} 循環 · {Math.max(posInCycle, 0)}/{cycleSize} 句</span>
            <span className="tabular-nums">{mergedBarWidth.toFixed(0)}%</span>
          </div>
          <div className="w-full relative" style={{ height: 12 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: '#e0e0e0' }} />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${mergedBarWidth}%`, background: '#000', transition: 'none' }}
            />
            {/* 25/75 細刻度 */}
            {[25, 75].map(m => (
              <div
                key={m}
                className="absolute top-0 bottom-0 z-10 pointer-events-none"
                style={{ left: `${m}%`, width: 1, background: '#888', transform: 'translateX(-50%)' }}
              />
            ))}
            {/* 50% 加粗中點刻度（上半/下半交界） */}
            <div
              className="absolute z-10 pointer-events-none"
              style={{ left: '50%', top: -2, bottom: -2, width: 3, background: '#000', transform: 'translateX(-50%)' }}
            />
          </div>

          {/* ①② 戰鬥征途（墨水屏版）：斜紋填充、靜態勇者+怪物、檢查點旗仔（無閃光無 toast） */}
          {battleMonster && (
            <div className="w-full relative" style={{ height: 12, marginTop: 18 }}>
              <div className="absolute inset-0 rounded-full" style={{ background: '#fff', border: '1.5px solid #000' }} />
              <div
                className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
                style={{ width: `${questPct}%`, background: 'repeating-linear-gradient(45deg, #000 0 4px, #fff 4px 8px)', transition: 'none' }}
              />
              {/* ② 檢查點：通過實心黑加粗，未過幼灰 */}
              {[25, 50, 75].map(m => (
                <div
                  key={m}
                  className="absolute z-10 pointer-events-none"
                  style={{
                    left: `${m}%`, top: -3, bottom: -3,
                    width: questPct >= m ? 3 : 1,
                    background: questPct >= m ? '#000' : '#888',
                    transform: 'translateX(-50%)',
                  }}
                >
                  <span style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', fontSize: 10, opacity: questPct >= m ? 1 : 0.3 }}>🚩</span>
                </div>
              ))}
              {/* ① 勇者：靜態企喺進度尖端（位置跟翻頁更新，無動畫） */}
              <span
                className="pointer-events-none"
                style={{ position: 'absolute', left: `${Math.min(questPct, 96)}%`, top: '50%', transform: 'translate(-50%,-58%)', fontSize: 16, zIndex: 12, display: 'inline-block' }}
              >⚔️</span>
              {/* 怪物：右端等緊；擊敗後轉灰（靜態轉換） */}
              <span
                className="pointer-events-none"
                style={{
                  position: 'absolute', right: -2, top: '50%', transform: 'translate(0,-58%)',
                  fontSize: 17, zIndex: 11, display: 'inline-block',
                  filter: goalCompleted ? 'grayscale(1)' : undefined,
                  opacity: goalCompleted ? 0.4 : 1,
                }}
              >{battleMonster.emoji}</span>
            </div>
          )}

          {/* ⑤ 全書薄條 + 今日疆土：中灰=之前讀咗，黑=今日疆土，淺灰=未讀 */}
          <div
            className="w-full relative rounded-full overflow-hidden"
            style={{ height: 5, background: '#e0e0e0', marginTop: battleMonster ? 10 : 6 }}
            title={`全書 ${currentIndex + 1}/${sentences.length} 句 · 今日讀咗 ${Math.max(currentIndex - startIndex, 0) + 1} 句`}
          >
            <div className="absolute inset-y-0 left-0" style={{ width: `${bookBeforePct}%`, background: '#999' }} />
            <div
              className="absolute inset-y-0"
              style={{ left: `${bookBeforePct}%`, width: `${bookTodayPct}%`, background: '#000', transition: 'none' }}
            />
          </div>
          </>
          )}
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

      {/* ② 檢查點 micro-toast */}
      <div
        className="fixed top-32 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-500"
        style={{ opacity: cpToast ? 1 : 0, transform: `translateX(-50%) translateY(${cpToast ? '0px' : '-8px'})` }}
      >
        <div className="px-4 py-2 bg-indigo-600/85 backdrop-blur-sm text-white text-sm font-medium rounded-full shadow-lg whitespace-nowrap">
          {cpToast}
        </div>
      </div>

      {/* 💎 幸運加成：墨水屏靜態版（黑框、無動畫） */}
      {isEink && luckyReward && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center" style={{ paddingTop: '22vh' }}>
          <div style={{ background: '#fff', border: '3px solid #000', padding: '20px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, lineHeight: 1 }}>{luckyReward.emoji}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#000', marginTop: 8 }}>{luckyReward.label}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#000', marginTop: 4 }}>+{luckyReward.xp} XP</div>
          </div>
        </div>
      )}

      {/* 💎 幸運加成：炫目爆裂卡片（非墨水屏） */}
      {!isEink && luckyReward && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center" style={{ paddingTop: '18vh' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* 星火四濺 */}
            {LUCKY_SPARKS.map((s, i) => (
              <div key={i} style={{
                position: 'absolute', width: 10, height: 10, borderRadius: '50%',
                background: s.color, top: '50%', left: '50%', marginTop: -5, marginLeft: -5,
                animation: 'gamify-lucky-spark 600ms ease 150ms both',
                ['--spark-dx' as string]: s.dx,
                ['--spark-dy' as string]: s.dy,
              }} />
            ))}
            {/* 主卡片 */}
            <div style={{
              background: luckyReward.color,
              borderRadius: 20, padding: '24px 48px', textAlign: 'center',
              boxShadow: `0 0 0 6px ${luckyReward.shadow.replace('0.35','0.2')}, 0 24px 60px ${luckyReward.shadow}`,
              animation: luckyFading
                ? 'gamify-lucky-out 420ms ease forwards'
                : 'gamify-lucky-burst 420ms cubic-bezier(0.34,1.56,0.64,1) both',
            }}>
              <div style={{ fontSize: 52, lineHeight: 1, display: 'inline-block', animation: 'gamify-lucky-gem 500ms cubic-bezier(0.34,1.56,0.64,1) 200ms both' }}>
                {luckyReward.emoji}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.88)', fontWeight: 600, marginTop: 8, letterSpacing: '0.5px' }}>
                {luckyReward.label}
              </div>
              <div style={{ fontSize: 38, fontWeight: 900, color: '#fff', marginTop: 4, textShadow: '0 2px 8px rgba(0,0,0,0.18)', animation: 'gamify-lucky-xp 350ms ease 300ms both' }}>
                +{luckyReward.xp} XP
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📅 每日挑戰完成慶祝 toast（非墨水屏） */}
      {!isEink && challengeDone && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ top: 88, left: '50%', transform: 'translateX(-50%)', animation: 'gamify-victory-pop 300ms both' }}
        >
          <div style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', borderRadius: 99, padding: '8px 22px', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 20px rgba(99,102,241,0.45)', whiteSpace: 'nowrap' }}>
            🎯 每日挑戰完成！+{dailyChallenge?.bonusXP ?? 0} XP 獎勵！
          </div>
        </div>
      )}

      {/* 🌿 Flomo 浮動按鈕組（右下角，拇指易按，e-ink 和普通模式都有） */}
      <div className="fixed bottom-6 right-4 z-40 flex flex-col items-end gap-2">

        {/* 上下文選擇器（點 🌿 且暫存為空時出現） */}
        {showFlomoNPicker && flomoBuffer.length === 0 && (
          <div
            className="flex flex-col items-end gap-1.5 mb-1"
            style={{ animation: 'panel-in 180ms cubic-bezier(0.23,1,0.32,1) both' }}
          >
            {/* 段落模式 */}
            <p className="text-xs font-medium px-2" style={{ color: isEink ? '#333' : '#6b7280' }}>
              按段落
            </p>
            {([
              { label: '這一段',     before: 0, after: 0 },
              { label: '加前後一段', before: 1, after: 1 },
              { label: '加前後兩段', before: 2, after: 2 },
              { label: '加前後三段', before: 3, after: 3 },
              { label: '加前後四段', before: 4, after: 4 },
            ] as { label: string; before: number; after: number }[]).map(opt => (
              <button
                key={opt.label}
                onClick={() => sendContext(opt.before, opt.after)}
                className="rounded-xl font-bold text-sm shadow"
                style={{
                  padding: '8px 18px',
                  background: isEink ? '#fff' : '#f0fdf4',
                  color: isEink ? '#000' : '#15803d',
                  border: isEink ? '2px solid #000' : '1.5px solid #86efac',
                  boxShadow: isEink ? '2px 2px 0 #000' : '0 3px 8px rgba(0,0,0,0.1)',
                  minWidth: 100,
                }}
              >
                {opt.label}
              </button>
            ))}

            {/* 分隔線 */}
            <div style={{ width: '100%', height: 1, background: isEink ? '#000' : '#e5e7eb', margin: '4px 0' }} />

            {/* 最近 N 句模式 */}
            <p className="text-xs font-medium px-2" style={{ color: isEink ? '#333' : '#6b7280' }}>
              最近幾句
            </p>
            {[3, 5, 10, 15, 20].map(n => (
              <button
                key={n}
                onClick={() => sendLastN(n)}
                className="rounded-xl font-bold text-sm shadow"
                style={{
                  padding: '8px 18px',
                  background: isEink ? '#fff' : '#f0faf4',
                  color: isEink ? '#000' : '#166534',
                  border: isEink ? '2px solid #000' : '1.5px solid #bbf7d0',
                  boxShadow: isEink ? '2px 2px 0 #000' : '0 3px 8px rgba(0,0,0,0.08)',
                  minWidth: 100,
                }}
              >
                最近 {n} 句
              </button>
            ))}

            <button
              onClick={() => setShowFlomoNPicker(false)}
              className="text-xs px-3 py-1 rounded-lg"
              style={{ color: isEink ? '#555' : '#9ca3af' }}
            >
              取消
            </button>
          </div>
        )}

        {/* 暫存計數提示 */}
        {flomoBuffer.length > 0 && (
          <div
            className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{
              background: isEink ? '#000' : '#16a34a',
              color: '#fff',
              animation: 'panel-in 150ms cubic-bezier(0.23,1,0.32,1) both',
            }}
          >
            {flomoBuffer.length} 句待發
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* ➖ 移除最後一句（有暫存時才顯示） */}
          {flomoBuffer.length > 0 && (
            <button
              onClick={() => setFlomoBuffer(prev => prev.slice(0, -1))}
              className="flex items-center justify-center rounded-xl font-bold text-base shadow-lg"
              style={{
                width: 44, height: 44,
                background: isEink ? '#fff' : '#fff',
                color: isEink ? '#000' : '#dc2626',
                border: isEink ? '2px solid #000' : '1.5px solid #fca5a5',
                boxShadow: isEink ? '2px 2px 0 #000' : '0 4px 12px rgba(0,0,0,0.12)',
              }}
              title="移除最後加入的句子"
            >
              ➖
            </button>
          )}

          {/* ➕ 加入當前句 */}
          <button
            onClick={addToFlomoBuffer}
            className="flex items-center justify-center rounded-xl font-bold text-base shadow-lg"
            style={{
              width: 44, height: 44,
              background: flomoAddFlash ? (isEink ? '#000' : '#16a34a') : (isEink ? '#fff' : '#f0fdf4'),
              color: flomoAddFlash ? '#fff' : (isEink ? '#000' : '#15803d'),
              border: isEink ? '2px solid #000' : '1.5px solid #86efac',
              boxShadow: isEink ? '2px 2px 0 #000' : '0 4px 12px rgba(0,0,0,0.12)',
              transform: flomoAddFlash ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform 200ms cubic-bezier(0.23,1,0.32,1), background 200ms, color 200ms',
            }}
            title="加入暫存"
          >
            ➕
          </button>

          {/* 🌿 發送到 Flomo */}
          <button
            onClick={sendToFlomo}
            disabled={flomoStatus === 'sending'}
            className="flex items-center justify-center rounded-xl font-bold text-base shadow-lg relative disabled:opacity-50"
            style={{
              width: 52, height: 44,
              background: flomoStatus === 'ok'
                ? (isEink ? '#000' : '#16a34a')
                : flomoStatus === 'error'
                  ? (isEink ? '#000' : '#dc2626')
                  : (isEink ? '#fff' : '#f0fdf4'),
              color: (flomoStatus === 'ok' || flomoStatus === 'error')
                ? '#fff'
                : (isEink ? '#000' : '#15803d'),
              border: isEink ? '2px solid #000' : '1.5px solid #86efac',
              boxShadow: isEink ? '2px 2px 0 #000' : '0 4px 12px rgba(0,0,0,0.12)',
            }}
            title={flomoBuffer.length > 0 ? `發送 ${flomoBuffer.length} 句到 Flomo` : '發送到 Flomo'}
          >
            <span className="text-sm">
              {flomoStatus === 'sending' ? '⏳' : flomoStatus === 'ok' ? '✅' : flomoStatus === 'error' ? '❌' : '🌿'}
            </span>
            {/* 計數徽章 */}
            {flomoBuffer.length > 0 && flomoStatus === 'idle' && (
              <span
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ background: isEink ? '#000' : '#16a34a', color: '#fff' }}
              >
                {flomoBuffer.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 🌿 Flomo 預覽彈窗：確認後才發送 */}
      {flomoPreview && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setFlomoPreview(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{
              background: isEink ? '#fff' : '#fff',
              border: isEink ? '2px solid #000' : 'none',
              animation: 'panel-in 200ms cubic-bezier(0.23,1,0.32,1) both',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 標題 */}
            <div className="px-5 py-4 border-b flex items-center justify-between"
              style={{ borderColor: isEink ? '#000' : '#e5e7eb' }}>
              <div>
                <p className="font-bold text-base" style={{ color: isEink ? '#000' : '#1f2937' }}>
                  🌿 預覽 · 確認後發送
                </p>
                <p className="text-xs mt-0.5" style={{ color: isEink ? '#555' : '#6b7280' }}>
                  📖 {bookTitle}
                </p>
              </div>
              <button onClick={() => setFlomoPreview(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {/* 段落預覽（可滾動）：PARA_SEP 顯示為段落間距 */}
            <div className="px-5 py-4 max-h-64 overflow-y-auto">
              {(() => {
                // 按 PARA_SEP 切出各段，每段 join 成完整文字
                const paragraphs: string[] = []
                let cur: string[] = []
                for (const s of flomoPreview) {
                  if (s === PARA_SEP) {
                    if (cur.length > 0) { paragraphs.push(cur.join('')); cur = [] }
                  } else {
                    cur.push(s)
                  }
                }
                if (cur.length > 0) paragraphs.push(cur.join(''))
                return paragraphs.map((para, i) => (
                  <div key={i} style={{ marginBottom: i < paragraphs.length - 1 ? '1.2em' : 0 }}>
                    {paragraphs.length > 1 && (
                      <p className="text-[10px] font-semibold mb-1"
                        style={{ color: isEink ? '#555' : '#9ca3af', letterSpacing: '0.05em' }}>
                        第{['一','二','三','四','五','六','七','八','九'][i] ?? i + 1}段
                      </p>
                    )}
                    <p
                      className="text-sm leading-loose"
                      style={{ color: isEink ? '#000' : '#374151' }}
                    >
                      {para}
                    </p>
                  </div>
                ))
              })()}
            </div>

            {/* 操作按鈕 */}
            <div className="px-5 py-4 border-t flex gap-3"
              style={{ borderColor: isEink ? '#000' : '#e5e7eb' }}>
              <button
                onClick={() => setFlomoPreview(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  background: isEink ? '#fff' : '#f3f4f6',
                  color: isEink ? '#000' : '#374151',
                  border: isEink ? '2px solid #000' : 'none',
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  const toSend = flomoPreview
                  setFlomoPreview(null)
                  sendToFlomoWithContent(toSend)
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{
                  background: isEink ? '#000' : '#16a34a',
                  color: '#fff',
                  border: isEink ? '2px solid #000' : 'none',
                }}
              >
                確認發送 🌿
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flomo 設定彈窗：第一次用時要求輸入 API 網址 */}
      {flomoStatus === 'setup' && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setFlomoStatus('idle')}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            style={{ animation: 'panel-in 200ms cubic-bezier(0.23, 1, 0.32, 1) both' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-800 mb-1">🌿 設定 Flomo API</h3>
            {flomoSetupInput && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                ❌ 發送失敗，請確認 API 網址是否正確
              </div>
            )}
            <p className="text-sm text-gray-500 mb-4">
              在 Flomo →「設定」→「開放 API」找到你的網址，貼在下方：
            </p>
            <input
              type="url"
              value={flomoSetupInput}
              onChange={e => setFlomoSetupInput(e.target.value)}
              placeholder="https://flomoapp.com/iwh/..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-green-400"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setFlomoStatus('idle')}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (flomoSetupInput.trim()) {
                    flomoStorage.saveUrl(flomoSetupInput.trim())
                    setFlomoStatus('idle')
                    setTimeout(sendToFlomo, 100)
                  }
                }}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium"
              >
                儲存並發送
              </button>
            </div>
          </div>
        </div>
      )}

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
                <div style={{ position: 'relative' }}>
                  <p
                    onMouseUp={selectionDictLookup}
                    onTouchEnd={selectionDictLookup}
                    style={{
                    fontSize: `${displaySettings.fontSize}px`,
                    color: paperTheme.text,
                    textAlign: 'center',
                    lineHeight: displaySettings.lineHeight ?? 1.8,
                    letterSpacing: `${displaySettings.letterSpacing ?? 0.05}em`,
                    margin: 0,
                    fontFamily: textFontFamily,
                    whiteSpace: 'pre-wrap',
                    opacity: fadeVisible ? 1 : 0,
                    transition: fadeVisible ? 'opacity 0.22s ease-in' : 'opacity 0.14s ease-out',
                  }}>
                    {effectiveSentence}
                  </p>
                  {/* 注釋按鈕（紙本模式） */}
                  {annotationBlock && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAnnotation(true) }}
                      style={{
                        position: 'absolute', bottom: 0, right: 0,
                        width: 32, height: 32, borderRadius: '50%',
                        background: '#1a3a2a', color: '#fff',
                        fontSize: 13, fontWeight: 700,
                        border: 'none', cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      title="顯示注釋"
                    >注</button>
                  )}
                </div>
              )}
            </div>

            {/* 頁碼 */}
            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: paperTheme.muted, fontFamily: paperTheme.fontFamily, fontStyle: 'italic' }}>
              — {currentIndex + 1} —
            </div>

            {/* 完成目標嘅勝利彈框改為全局 modal（見 main 之後），紙本模式都用同一個 */}
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
              {(() => {
                const animStyle = displaySettings.animationStyle ?? 'rise'
                const speedMs = { slow: 500, normal: 280, fast: 150 }[displaySettings.animationSpeed ?? 'normal']
                const colMaxWidth = isEink ? undefined : ({
                  narrow: `${displaySettings.fontSize * 15}px`,
                  medium: `${displaySettings.fontSize * 22}px`,
                  wide: '100%',
                }[displaySettings.columnWidth ?? 'medium'])
                return sentences[currentIndex]?.startsWith('data:image/') ? (
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
                <div className="relative w-full flex items-center justify-center">
                  <p
                    key={isEink ? undefined : (animStyle === 'rise' ? animKey : undefined)}
                    className={`leading-relaxed text-center${!isEink && animStyle === 'rise' ? ' sentence-rise' : ''}`}
                    {...einkPressHandlers}
                    onMouseUp={!isEink ? selectionDictLookup : undefined}
                    onTouchEnd={!isEink ? selectionDictLookup : undefined}
                    style={{
                      '--sentence-anim-speed': `${speedMs}ms`,
                      fontFamily: textFontFamily,
                      fontSize: `${displaySettings.fontSize}px`,
                      color: isEink ? einkTheme.text : displaySettings.textColor,
                      whiteSpace: 'pre-wrap',
                      fontWeight: isEink ? 700 : undefined,
                      letterSpacing: isEink ? '0.02em' : `${displaySettings.letterSpacing ?? 0.05}em`,
                      lineHeight: isEink ? 1.5 : (displaySettings.lineHeight ?? 1.8),
                      maxWidth: colMaxWidth,
                      // fade 模式沿用 opacity transition；rise 模式由 CSS animation 接管，opacity 常態 1
                      opacity: isEink ? 1 : (animStyle === 'rise' ? 1 : (fadeVisible ? 1 : 0)),
                      transition: isEink ? 'none' : (animStyle === 'rise' ? 'none' : (fadeVisible ? 'opacity 0.18s cubic-bezier(0.23, 1, 0.32, 1)' : 'opacity 0.12s ease-out')),
                      userSelect: isEink ? 'none' : undefined,
                      WebkitUserSelect: isEink ? 'none' : undefined,
                      WebkitTouchCallout: isEink ? 'none' : undefined,
                    } as React.CSSProperties}
                  >
                    {effectiveSentence}
                  </p>
                  {/* 注釋按鈕：當下一句是注圖時顯示 */}
                  {annotationBlock && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAnnotation(true) }}
                      className="absolute bottom-0 right-0 flex items-center justify-center rounded-full select-none"
                      style={isEink ? {
                        width: 48, height: 48,
                        background: '#000', color: '#fff',
                        fontSize: 18, fontWeight: 700,
                        border: 'none',
                      } : {
                        width: 36, height: 36,
                        background: '#1a3a2a', color: '#fff',
                        fontSize: 14, fontWeight: 700,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                      }}
                      title="顯示注釋"
                    >
                      注
                    </button>
                  )}
                </div>
              )
              })()}
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

            {/* 完成目標嘅勝利彈框改為全局 modal（見 main 之後），呢度唔再 inline 顯示 */}
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


      {/* ── 等級 / XP 徽章：左下角固定，不遮擋主內容 ── */}
      {!isEink && (() => {
        const li = levelForXP(displayXP)
        const pct = Math.round(li.progress * 100)
        return (
          <div
            className="fixed bottom-4 left-4 select-none pointer-events-none z-40"
            style={{
              background: 'rgba(245, 243, 255, 0.92)',
              border: '1.5px solid #e0d9ff',
              borderRadius: 12,
              padding: '8px 12px',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 12px rgba(99,102,241,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#6366f1', lineHeight: 1 }}>Lv.{li.level}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ width: 64, height: 5, borderRadius: 3, background: '#e0d9ff', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#6366f1', borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600, lineHeight: 1 }}>
                  {li.xpInLevel} / {li.xpNeeded} XP
                </span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── 注釋彈窗：全局 fixed，paper / default / eink 三種模式通用 ── */}
      {showAnnotation && annotationBlock && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowAnnotation(false)}
        >
          <div
            className="w-full max-w-2xl"
            style={isEink ? {
              background: '#fff',
              border: '2px solid #000',
              borderBottom: 'none',
              padding: '24px 20px 32px',
              maxHeight: '60vh',
              overflowY: 'auto',
            } : {
              background: '#fff',
              borderRadius: '16px 16px 0 0',
              padding: '20px 20px 32px',
              maxHeight: '55vh',
              overflowY: 'auto',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 標題欄 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center justify-center rounded-full text-white text-sm font-bold"
                  style={{ width: 28, height: 28, background: isEink ? '#000' : '#1a3a2a', flexShrink: 0 }}
                >注</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: isEink ? '#000' : '#374151' }}>注釋</span>
              </div>
              <button
                onClick={() => setShowAnnotation(false)}
                style={isEink ? {
                  border: '1.5px solid #000', borderRadius: 4,
                  padding: '4px 12px', fontSize: 13, fontWeight: 700, background: '#fff',
                } : {
                  border: 'none', background: '#f3f4f6', borderRadius: 8,
                  padding: '4px 12px', fontSize: 13, cursor: 'pointer',
                }}
              >關閉</button>
            </div>
            {/* 注釋內容 */}
            <div className="space-y-3">
              {/* 完整句（前後拼合） */}
              <p style={{
                fontSize: isEink ? 22 : 16,
                color: isEink ? '#000' : '#374151',
                lineHeight: 1.8,
                fontFamily: textFontFamily,
                margin: 0,
              }}>{annotationBlock.fullSentence}</p>
              {/* 腳注文字（epub alt text）或備用注圖 */}
              {annotationBlock.annotationImage?.startsWith('data:image/annotation;') ? (
                <div style={{
                  marginTop: 10,
                  padding: '10px 14px',
                  background: isEink ? '#f0f0f0' : '#f0fdf4',
                  borderRadius: 8,
                  borderLeft: `3px solid ${isEink ? '#000' : '#22c55e'}`,
                  fontSize: isEink ? 18 : 14,
                  color: isEink ? '#000' : '#166534',
                  lineHeight: 1.7,
                  fontFamily: textFontFamily,
                }}>
                  <span style={{ fontSize: isEink ? 14 : 11, opacity: 0.6, display: 'block', marginBottom: 4 }}>📝 譯者注</span>
                  {decodeURIComponent(annotationBlock.annotationImage.replace('data:image/annotation;charset=utf-8,', ''))}
                </div>
              ) : annotationBlock.annotationImage ? (
                <div style={{ marginTop: 10, textAlign: 'center' }}>
                  <img
                    src={annotationBlock.annotationImage}
                    alt="插圖"
                    style={{ maxWidth: '100%', maxHeight: '45vh', objectFit: 'contain', borderRadius: 6 }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 🏆 勝利彈框：擊敗怪物後置中顯示（普通版有動畫 + 彩帶；墨水屏版黑框靜態） */}
      {/* 必須喺框內作出選擇：背景冇 onClick，唔揀唔會關 */}
      {goalCompleted && victory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(17,24,39,0.55)' }}
        >
          <div
            className="w-full max-w-sm text-center"
            style={isEink ? {
              background: '#fff', border: '2px solid #000', padding: '32px 24px',
            } : {
              background: '#fff', borderRadius: 16, padding: '36px 28px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              animation: 'gamify-victory-pop 400ms var(--ease-out) both',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 怪物 emoji + 名稱 */}
            <p style={{ fontSize: isEink ? 40 : 52, lineHeight: 1, margin: 0 }}>{victory.emoji}</p>
            <p style={{ fontSize: isEink ? 20 : 22, fontWeight: 700, color: isEink ? '#000' : '#1f2937', marginTop: 12 }}>
              {victory.name}被擊敗！
            </p>

            {isEink ? (
              /* ── 墨水屏：靜態純文字版 ── */
              <>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#000', marginTop: 8 }}>
                  ⚡ +{victory.earnedXP} XP{victory.multiplier > 1 ? ` ×${victory.multiplier}` : ''}{victory.streak > 1 ? ` ・ 🔥 連續 ${victory.streak} 天` : ''}
                </p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#000', marginTop: 6 }}>
                  🗡️ 今日擊殺 {victory.todayKills} 隻怪獸
                </p>
                <p style={{ fontSize: 12, color: '#333', marginTop: 4 }}>
                  {(() => {
                    const lv = levelForXP(victory.totalXP)
                    return `Lv.${lv.level} ${lv.title} ・ ${lv.xpInLevel}/${lv.xpNeeded} XP`
                  })()}
                </p>
              </>
            ) : (
              /* ── 普通模式：視覺化版 ── */
              <>
                {/* XP + 連打卡 chips */}
                <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-bold rounded-full">
                    ⚡ +{victory.earnedXP} XP
                    {victory.multiplier > 1 && <span className="ml-1 text-xs opacity-70">({victory.xp}×{victory.multiplier})</span>}
                  </span>
                  {victory.streak > 1 && (
                    <span className="px-3 py-1 bg-orange-50 border border-orange-100 text-orange-500 text-sm font-bold rounded-full">🔥 連續 {victory.streak} 天</span>
                  )}
                  <span className="px-3 py-1 bg-rose-50 border border-rose-100 text-rose-500 text-sm font-bold rounded-full">🗡️ 今日 {victory.todayKills} 殺</span>
                </div>

                {/* XP 升級進度條 */}
                {(() => {
                  const lv = levelForXP(victory.totalXP)
                  const pct = Math.round(lv.progress * 100)
                  return (
                    <div style={{ marginTop: 16, padding: '12px 14px', background: '#f5f3ff', borderRadius: 12 }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>Lv.{lv.level} {lv.title}</span>
                        <span style={{ fontSize: 11, color: '#8b5cf6' }}>{lv.xpInLevel} / {lv.xpNeeded} XP</span>
                      </div>
                      <div style={{ height: 8, background: '#ddd6fe', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: 99, transition: 'width 600ms cubic-bezier(0.23,1,0.32,1)' }} />
                      </div>
                      <p style={{ fontSize: 11, color: '#7c3aed', marginTop: 4, textAlign: 'right' }}>還差 {lv.xpNeeded - lv.xpInLevel} XP 升級 →</p>
                    </div>
                  )
                })()}

                {/* 動態鼓勵語句 */}
                <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12, lineHeight: 1.5 }}>
                  {(() => {
                    const k = victory.todayKills, s = victory.streak
                    if (k >= 5) return '🏆 今天戰力全開！你是真正的書海勇者！'
                    if (k >= 3) return '⚔️ 三連殺！今天的你勢不可擋！'
                    if (k === 2) return '💪 再下一城！今日已擊敗兩隻怪獸！'
                    if (s >= 7) return '👑 連續一週！你的堅持令人敬佩！'
                    if (s >= 3) return `🔥 已連續 ${s} 天！繼續保持勢頭！`
                    if (s === 1 && k === 1) return '🌱 旅途開始！每一句都是進步！'
                    return '✨ 今天又打了一場好仗，明天繼續！'
                  })()}
                </p>
              </>
            )}

            <div className="flex items-center justify-center gap-3 flex-wrap" style={{ marginTop: 20 }}>
              {canRematch && (
                <button
                  onClick={continueBattle}
                  className={isEink ? undefined : 'px-5 py-2.5 bg-indigo-600 text-white rounded-full text-sm font-semibold hover:bg-indigo-700 transition-colors shadow'}
                  style={isEink ? { border: '2px solid #000', background: '#000', color: '#fff', padding: '8px 18px', fontSize: 14, fontWeight: 700, borderRadius: 4 } : undefined}
                >⚔️ 再戰一場</button>
              )}
              <button
                onClick={onReset}
                className={isEink ? undefined : 'px-5 py-2.5 bg-white text-gray-600 border border-gray-200 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors'}
                style={isEink ? { border: '2px solid #000', background: '#fff', color: '#000', padding: '8px 18px', fontSize: 14, fontWeight: 700, borderRadius: 4 } : undefined}
              >返回書架</button>
            </div>
          </div>
        </div>
      )}

      {/* 🔍 查詞彈窗：墨水屏長按 / 普通模式選字 */}
      {einkDict && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => {
            // 吸收 touchend 後嘅合成 click，避免彈窗一開即關
            if (Date.now() - dictOpenedAt.current < 600) return
            setEinkDict(null)
          }}
        >
          <div
            className="w-full max-w-2xl"
            style={isEink ? {
              background: '#fff',
              border: '2px solid #000',
              borderBottom: 'none',
              padding: '20px 20px 32px',
              maxHeight: '65vh',
              overflowY: 'auto',
            } : {
              background: '#fff',
              borderRadius: '16px 16px 0 0',
              padding: '20px 20px 32px',
              maxHeight: '65vh',
              overflowY: 'auto',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 標題列 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center justify-center rounded-full text-white text-sm font-bold"
                  style={{ width: 28, height: 28, background: isEink ? '#000' : '#1a3a2a', flexShrink: 0 }}
                >詞</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: isEink ? '#000' : '#1a3a2a' }}>{dictOriginalWord.current || einkDict.word}</span>
              </div>
              <button
                onClick={() => setEinkDict(null)}
                style={isEink ? {
                  border: '1.5px solid #000', borderRadius: 4, padding: '4px 12px', fontSize: 13, fontWeight: 700, background: '#fff',
                } : {
                  border: 'none', background: '#f3f4f6', borderRadius: 8, padding: '4px 12px', fontSize: 13, cursor: 'pointer',
                }}
              >關閉</button>
            </div>

            {/* ── 👥 人物關係（DeepSeek + 關係圖快取，認得人物時自動顯示）── */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: isEink ? '#000' : '#0d9488', margin: '0 0 6px' }}>👥 人物關係</p>
              {charRel.status === 'loading' && (
                <p style={{ fontSize: 14, color: isEink ? '#000' : '#6b7280', margin: 0 }}>AI 分析人物關係中⋯ 🔗</p>
              )}
              {charRel.status === 'ok' && (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: isEink ? 15 : 14, lineHeight: 1.8, color: isEink ? '#000' : '#374151', fontFamily: textFontFamily }}>
                  {charRel.text}
                </div>
              )}
              {(charRel.status === 'idle' || charRel.status === 'error') && (
                <div>
                  {charRel.status === 'error' && (
                    <p style={{ fontSize: 13, color: isEink ? '#000' : '#dc2626', margin: '0 0 8px' }}>⚠️ {charRel.text}</p>
                  )}
                  <button
                    onClick={() => explainCharacter(dictOriginalWord.current || einkDict.word)}
                    style={isEink ? {
                      border: '1.5px solid #000', borderRadius: 4, padding: '6px 12px', fontSize: 13, fontWeight: 700, background: '#fff', cursor: 'pointer',
                    } : {
                      border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      color: '#fff', background: 'linear-gradient(135deg,#14b8a6,#0d9488)',
                    }}
                  >{charRel.status === 'error' ? '重試' : '👥 查呢個係邊個人物 / 關係'}</button>
                </div>
              )}
            </div>

            {/* ── ✨ AI 上下文釋義 ── */}
            <div style={{ marginBottom: 4, paddingTop: 12, borderTop: isEink ? '1.5px dashed #000' : '1px solid #eee' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: isEink ? '#000' : '#6366f1', margin: '0 0 6px' }}>✨ AI 釋義（結合上下文）</p>
              {aiDef.status === 'loading' && (
                <p style={{ fontSize: 14, color: isEink ? '#000' : '#6b7280', margin: 0 }}>AI 思考中⋯ 🤔</p>
              )}
              {aiDef.status === 'ok' && (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: isEink ? 15 : 14, lineHeight: 1.8, color: isEink ? '#000' : '#374151', fontFamily: textFontFamily }}>
                  {aiDef.text}
                </div>
              )}
              {(aiDef.status === 'idle' || aiDef.status === 'error') && (
                <div>
                  {aiDef.status === 'error' && (
                    <p style={{ fontSize: 13, color: isEink ? '#000' : '#dc2626', margin: '0 0 8px' }}>⚠️ {aiDef.text}</p>
                  )}
                  <button
                    onClick={() => aiDefine(dictOriginalWord.current || einkDict.word)}
                    style={isEink ? {
                      border: '1.5px solid #000', borderRadius: 4, padding: '6px 12px', fontSize: 13, fontWeight: 700, background: '#fff', cursor: 'pointer',
                    } : {
                      border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      color: '#fff', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    }}
                  >{aiDef.status === 'error' ? '重試' : '✨ AI 解釋'}</button>
                </div>
              )}
            </div>

            {/* ── 📖 字典（次要，置於 AI 之下）── */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: isEink ? '1.5px dashed #000' : '1px solid #eee' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: isEink ? '#000' : '#1a3a2a', margin: '0 0 6px' }}>
                📖 字典{einkDict.status === 'ok' && einkDict.word !== dictOriginalWord.current ? `（「${einkDict.word}」）` : ''}
              </p>
              {einkDict.status === 'loading' && (
                <p style={{ fontSize: 15, color: isEink ? '#000' : '#374151', margin: 0 }}>查詢中⋯</p>
              )}
              {einkDict.status === 'ok' && einkDict.definition && (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: isEink ? 15 : 14, lineHeight: 1.8, color: isEink ? '#000' : '#374151', fontFamily: textFontFamily }}>
                  {einkDict.definition}
                </div>
              )}
              {einkDict.status === 'notfound' && (
                <p style={{ fontSize: 14, color: isEink ? '#000' : '#9ca3af', margin: 0 }}>字典中找不到「{einkDict.word}」</p>
              )}
              {einkDict.status === 'error' && (
                <p style={{ fontSize: 14, color: isEink ? '#000' : '#9ca3af', margin: 0 }}>網絡錯誤，請稍後再試</p>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* 呼吸休息動畫（每看完 4 個循環）*/}
      {showBreathing && <BreathingOverlay eink={einkMode} onClose={() => setShowBreathing(false)} />}

      {/* 人物關係圖（閱讀時可開啟）*/}
      {showGraph && (
        <CharacterGraph
          sentences={sentences}
          bookTitle={bookTitle}
          bookId={bookId}
          deepseekKey={typeof window !== 'undefined' ? (localStorage.getItem('deepseek-api-key') || undefined) : undefined}
          onClose={() => setShowGraph(false)}
        />
      )}
    </div>
  )
}
