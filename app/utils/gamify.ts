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

// ── 自訂怪物目標句數：用戶可以喺 GoalModal 自己改每隻怪物嘅句數 ──
const MONSTER_GOALS_KEY = 'reading-monster-goals'

// 取得怪物列表（已套用用戶自訂句數；無自訂就用預設）
export function getMonsters(): Monster[] {
  if (typeof window === 'undefined') return MONSTERS
  try {
    const raw = localStorage.getItem(MONSTER_GOALS_KEY)
    if (!raw) return MONSTERS
    const goals = JSON.parse(raw) as Record<string, number>
    return MONSTERS.map(m => {
      const custom = goals[m.id]
      return {
        ...m,
        hp: Number.isFinite(custom) && custom >= 1 ? Math.floor(custom) : m.hp,
      }
    })
  } catch { return MONSTERS }
}

// 儲存用戶自訂嘅怪物句數
export function saveMonsterGoals(goals: Record<string, number>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MONSTER_GOALS_KEY, JSON.stringify(goals))
  } catch (e) {
    console.error('[gamify] saveMonsterGoals failed:', e)
  }
}

// 自訂目標句數 → 對應等級的怪物（按自訂門檻：取唔超過目標嘅最強一隻）
export function monsterForGoal(goal: number): Monster {
  const monsters = getMonsters().slice().sort((a, b) => a.hp - b.hp)
  let result = monsters[0]
  for (const m of monsters) {
    if (goal >= m.hp) result = m
  }
  return result
}

// 根據實際句子數計算 XP（隨句數線性增長，和怪物 HP 掛鉤）
// 公式：句數 × 3.6（魔王比率），最低按小怪物比率
export function xpForGoal(goal: number): number {
  const monsters = getMonsters().slice().sort((a, b) => a.hp - b.hp)
  // 小目標：直接用最接近怪物的比率
  for (const m of monsters) {
    if (goal <= m.hp) return Math.round(goal * (m.xp / m.hp))
  }
  // 超過最大怪物（魔王）：按魔王比率線性延伸
  const demon = monsters[monsters.length - 1]
  return Math.round(goal * (demon.xp / demon.hp))
}

// ── XP / 擊殺記錄（localStorage） ──
const GAMIFY_STORAGE_KEY = 'reading-gamify'

export interface GamifyData {
  xp: number
  kills: Record<string, number>   // monsterId → 擊殺次數（累計）
  todayKills?: { date: string; count: number }  // 今日擊殺：日期 + 次數
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
    // 同步更新今日擊殺
    const today = new Date().toLocaleDateString('en-CA')
    if (data.todayKills?.date === today) {
      data.todayKills.count += 1
    } else {
      data.todayKills = { date: today, count: 1 }
    }
    gamifyStorage.save(data)
  },

  getTodayKills(): number {
    const data = gamifyStorage.get()
    const today = new Date().toLocaleDateString('en-CA')
    return data.todayKills?.date === today ? data.todayKills.count : 0
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
const BEYOND_BASE = 800   // 6→7 級需要 800 XP
const BEYOND_INC  = 150   // 每級再多 150 XP（7→8 需 950，8→9 需 1100，以此類推）

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
  // 滿級之後：無限延伸，每級所需 XP = BEYOND_BASE + beyond * BEYOND_INC
  if (idx === LEVELS.length - 1) {
    const baseXP = LEVELS[idx].need
    const xpBeyond = xp - baseXP
    let beyond = 0
    let accumulated = 0
    // 逐級累加，找出目前身處哪一個 beyond 級
    while (true) {
      const step = BEYOND_BASE + beyond * BEYOND_INC
      if (accumulated + step > xpBeyond) break
      accumulated += step
      beyond++
    }
    const xpNeeded = BEYOND_BASE + beyond * BEYOND_INC
    return {
      level: LEVELS.length + beyond,
      title: LEVELS[idx].title,
      xpInLevel: xpBeyond - accumulated,
      xpNeeded,
      progress: (xpBeyond - accumulated) / xpNeeded,
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

// ── 連打卡 XP 倍數：連續天數越多，每次勝利 XP 越多 ──
export function getStreakMultiplier(streak: number): number {
  if (streak >= 30) return 2.5
  if (streak >= 14) return 2.0
  if (streak >= 7)  return 1.5
  if (streak >= 3)  return 1.2
  return 1.0
}

// ── 每日挑戰：由日期決定當天任務，進度跨 session 保存 ──
export type ChallengeType = 'kill_monsters' | 'read_sentences'
export interface DailyChallenge {
  date: string
  type: ChallengeType
  target: number
  progress: number
  completed: boolean
  bonusXP: number
}

const DAILY_CHALLENGE_KEY = 'reading-daily-challenge'

// 以日期為種子的確定性隨機數，確保同一天的挑戰一樣
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

function generateChallenge(date: string): DailyChallenge {
  const seed = date.split('-').reduce((a, b) => a + parseInt(b), 0)
  const r1 = seededRand(seed)
  const r2 = seededRand(seed + 3)
  const type: ChallengeType = r1 > 0.5 ? 'kill_monsters' : 'read_sentences'
  let target: number, bonusXP: number
  if (type === 'kill_monsters') {
    target = Math.floor(r2 * 3) + 1          // 1–3 隻
    bonusXP = target * 60
  } else {
    target = (Math.floor(r2 * 4) + 1) * 20  // 20 / 40 / 60 / 80 句
    bonusXP = Math.round(target * 1.5)
  }
  return { date, type, target, progress: 0, completed: false, bonusXP }
}

export function getDailyChallenge(): DailyChallenge {
  if (typeof window === 'undefined') {
    return generateChallenge(new Date().toLocaleDateString('en-CA'))
  }
  try {
    const raw = localStorage.getItem(DAILY_CHALLENGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as DailyChallenge
      const today = new Date().toLocaleDateString('en-CA')
      if (saved.date === today) return saved
    }
  } catch {}
  const today = new Date().toLocaleDateString('en-CA')
  const ch = generateChallenge(today)
  try { localStorage.setItem(DAILY_CHALLENGE_KEY, JSON.stringify(ch)) } catch {}
  return ch
}

// 更新挑戰進度（讀句 / 擊殺）；完成時自動加 bonusXP；回傳最新挑戰
export function updateDailyChallenge(type: ChallengeType, amount: number): DailyChallenge {
  if (typeof window === 'undefined') return getDailyChallenge()
  const ch = getDailyChallenge()
  if (ch.completed || ch.type !== type) return ch
  ch.progress = Math.min(ch.target, ch.progress + amount)
  if (ch.progress >= ch.target && !ch.completed) {
    ch.completed = true
    gamifyStorage.addXP(ch.bonusXP)
  }
  try { localStorage.setItem(DAILY_CHALLENGE_KEY, JSON.stringify(ch)) } catch {}
  return ch
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
