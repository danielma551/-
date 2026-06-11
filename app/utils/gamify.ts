// 【遊戲化系統】
// 這個文件負責：怪物配置、XP / 等級計算、連續打卡天數、擊殺記錄、勝利彩帶。
// 設計原則：
//   - 數據（XP / 擊殺）任何模式都記錄
//   - 視覺效果（彩帶 / HUD / 慶祝）只在非墨水屏模式顯示，墨水屏體驗 100% 不變
//   - 連續打卡直接從現有 reading-history 推算，不另存一份

import { historyStorage } from './storage'

// ── 怪物配置：目標越大，怪物越強，獎勵越多 ──
export interface Monster {
  id: string
  name: string
  emoji: string
  hp: number    // 目標句數
  xp: number    // 擊敗獎勵
}

export const MONSTERS: Monster[] = [
  { id: 'slime',  name: '史萊姆', emoji: '🟢', hp: 5,  xp: 10 },
  { id: 'goblin', name: '哥布林', emoji: '👺', hp: 10, xp: 25 },
  { id: 'dragon', name: '惡龍',   emoji: '🐉', hp: 20, xp: 60 },
  { id: 'demon',  name: '魔王',   emoji: '👹', hp: 50, xp: 180 },
]

// 自訂目標句數 → 對應等級的怪物（取不超過目標的最強一隻）
export function monsterForGoal(goal: number): Monster {
  if (goal >= 50) return MONSTERS[3]
  if (goal >= 20) return MONSTERS[2]
  if (goal >= 10) return MONSTERS[1]
  return MONSTERS[0]
}

// ── XP / 擊殺記錄（localStorage） ──
const GAMIFY_STORAGE_KEY = 'reading-gamify'

export interface GamifyData {
  xp: number
  kills: Record<string, number>   // monsterId → 擊殺次數
}

const EMPTY: GamifyData = { xp: 0, kills: {} }

export const gamifyStorage = {
  get(): GamifyData {
    if (typeof window === 'undefined') return EMPTY
    try {
      const raw = localStorage.getItem(GAMIFY_STORAGE_KEY)
      return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY
    } catch { return EMPTY }
  },

  save(data: GamifyData): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(GAMIFY_STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('[gamifyStorage] save failed:', e)
    }
  },

  addXP(amount: number): number {
    const data = gamifyStorage.get()
    data.xp += amount
    gamifyStorage.save(data)
    return data.xp
  },

  recordKill(monsterId: string): void {
    const data = gamifyStorage.get()
    data.kills[monsterId] = (data.kills[monsterId] ?? 0) + 1
    gamifyStorage.save(data)
  },

  totalKills(): number {
    const data = gamifyStorage.get()
    return Object.values(data.kills).reduce((sum, n) => sum + n, 0)
  },
}

// ── 等級系統：累計 XP 門檻 + 稱號 ──
const LEVELS: { need: number; title: string }[] = [
  { need: 0,    title: '初心讀者' },
  { need: 100,  title: '書頁學徒' },
  { need: 250,  title: '博覽生' },
  { need: 500,  title: '書海舵手' },
  { need: 900,  title: '閱讀宗師' },
  { need: 1500, title: '傳說書蟲' },
]
const BEYOND_STEP = 800   // 滿級後每 800 XP 再升一級

export interface LevelInfo {
  level: number          // 1-based
  title: string
  xpInLevel: number      // 本級已累積
  xpNeeded: number       // 本級升級所需
  progress: number       // 0–1
}

export function levelForXP(xp: number): LevelInfo {
  let idx = 0
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].need) { idx = i; break }
  }
  // 滿級之後：無限延伸
  if (idx === LEVELS.length - 1) {
    const beyond = Math.floor((xp - LEVELS[idx].need) / BEYOND_STEP)
    const base = LEVELS[idx].need + beyond * BEYOND_STEP
    return {
      level: LEVELS.length + beyond,
      title: LEVELS[idx].title,
      xpInLevel: xp - base,
      xpNeeded: BEYOND_STEP,
      progress: (xp - base) / BEYOND_STEP,
    }
  }
  const cur = LEVELS[idx], next = LEVELS[idx + 1]
  return {
    level: idx + 1,
    title: cur.title,
    xpInLevel: xp - cur.need,
    xpNeeded: next.need - cur.need,
    progress: (xp - cur.need) / (next.need - cur.need),
  }
}

// ── 連續打卡：從現有 reading-history 推算 ──
// 今天有讀 → 由今天向前數；今天未讀 → 由昨天向前數（唔會即刻斷火）
export function getStreak(): number {
  if (typeof window === 'undefined') return 0
  const history = historyStorage.getHistory()
  const dayKey = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    return d.toLocaleDateString('en-CA')
  }
  let start = (history[dayKey(0)] ?? 0) > 0 ? 0 : 1
  let streak = 0
  while ((history[dayKey(start + streak)] ?? 0) > 0) streak++
  return streak
}

// ── 勝利彩帶：純 DOM，自動清理，不依賴任何函式庫 ──
// 只應在非墨水屏模式呼叫（呼叫端把關）
const CONFETTI_COLORS = ['#6366f1', '#818cf8', '#22c55e', '#fcd34d', '#fb923c', '#f87171', '#60a5fa']

export function fireConfetti(count = 100): void {
  if (typeof window === 'undefined') return
  // 尊重「減少動畫」偏好
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const layer = document.createElement('div')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80;overflow:hidden'
  document.body.appendChild(layer)

  for (let i = 0; i < count; i++) {
    const c = document.createElement('div')
    const size = 6 + Math.random() * 7
    c.style.cssText = [
      'position:absolute',
      `left:${Math.random() * 100}vw`,
      'top:-12px',
      `width:${size}px`,
      `height:${size}px`,
      `background:${CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]}`,
      `border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`,
      `animation:gamify-confetti-fall ${1.6 + Math.random() * 1.6}s linear ${Math.random() * 0.4}s both`,
    ].join(';')
    layer.appendChild(c)
  }
  setTimeout(() => layer.remove(), 4200)
}
