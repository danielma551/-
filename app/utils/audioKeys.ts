// 【錄音快捷鍵】可自訂；每個動作最多兩個組合鍵，存本機。

export type AudioAction =
  | 'playPause' | 'back' | 'fwd' | 'backLong' | 'fwdLong'
  | 'slower' | 'faster' | 'fromSentence' | 'help'

export interface AudioKeyConfig {
  keys: Record<AudioAction, string[]>
  shortJump: number   // 短跳秒數
  longJump: number    // 長跳秒數
}

export const AUDIO_ACTIONS: { id: AudioAction; label: (c: AudioKeyConfig) => string }[] = [
  { id: 'playPause', label: () => '播放 / 暫停' },
  { id: 'back', label: c => `倒退 ${c.shortJump} 秒` },
  { id: 'fwd', label: c => `快進 ${c.shortJump} 秒` },
  { id: 'backLong', label: c => `倒退 ${c.longJump} 秒` },
  { id: 'fwdLong', label: c => `快進 ${c.longJump} 秒` },
  { id: 'slower', label: () => '慢啲' },
  { id: 'faster', label: () => '快啲' },
  { id: 'fromSentence', label: () => '由呢句開始播' },
  { id: 'help', label: () => '顯示 / 收起快捷鍵表' },
]

export const DEFAULT_AUDIO_KEYS: AudioKeyConfig = {
  keys: {
    playPause: ['Space', 'K'],
    back: ['J'],
    fwd: ['L'],
    backLong: ['Shift+J'],
    fwdLong: ['Shift+L'],
    slower: ['['],
    faster: [']'],
    fromSentence: ['R'],
    help: ['Shift+?'],
  },
  shortJump: 5,
  longJump: 30,
}

const KEY = 'reader-audio-keys'

export function loadAudioKeys(): AudioKeyConfig {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_KEYS
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw) return DEFAULT_AUDIO_KEYS
    return {
      keys: { ...DEFAULT_AUDIO_KEYS.keys, ...(raw.keys || {}) },
      shortJump: Number(raw.shortJump) > 0 ? Number(raw.shortJump) : DEFAULT_AUDIO_KEYS.shortJump,
      longJump: Number(raw.longJump) > 0 ? Number(raw.longJump) : DEFAULT_AUDIO_KEYS.longJump,
    }
  } catch { return DEFAULT_AUDIO_KEYS }
}

export function saveAudioKeys(c: AudioKeyConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* ignore */ }
}

// 由鍵盤事件組出組合鍵字串，例如 "Shift+J"、"Space"、"Ctrl+ArrowLeft"
export function comboOf(e: KeyboardEvent): string | null {
  const k = e.key
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Process', 'Dead', 'Unidentified'].includes(k)) return null
  let name = k === ' ' ? 'Space' : k
  if (name.length === 1) name = name.toUpperCase()
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.metaKey) mods.push('Meta')
  if (e.shiftKey) mods.push('Shift')
  return [...mods, name].join('+')
}

// 顯示用：Space → 空白鍵、Meta → ⌘
export function prettyCombo(c: string): string {
  return c
    .replace(/\bSpace\b/, '空白鍵')
    .replace(/\bMeta\b/, '⌘')
    .replace(/\bArrowLeft\b/, '←').replace(/\bArrowRight\b/, '→')
    .replace(/\bArrowUp\b/, '↑').replace(/\bArrowDown\b/, '↓')
}

export function actionForCombo(c: AudioKeyConfig, combo: string): AudioAction | null {
  for (const a of AUDIO_ACTIONS) if (c.keys[a.id]?.includes(combo)) return a.id
  return null
}
