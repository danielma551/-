// 【每日練習】
// 功能：每天從詞庫取 13 個固定單詞，隱藏單詞只顯示橫線。
// 用戶點擊「播放拼讀」後逐個念出字母名稱（ay/bee/see...）。
// 用戶直接在橫線上輸入字母，答錯橫線搖動，答對橫線變綠。

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Home, Volume2, ChevronRight, RotateCcw } from 'lucide-react'
import { VOCAB_1000 } from '../data/vocab1000'

interface VocabPracticeProps {
  onExit: () => void
}

// 字母讀法對照表（英文字母名稱）
const LETTER_NAMES: Record<string, string> = {
  a:'ay', b:'bee', c:'see', d:'dee', e:'ee', f:'ef', g:'gee', h:'aitch',
  i:'eye', j:'jay', k:'kay', l:'el', m:'em', n:'en', o:'oh', p:'pee',
  q:'cue', r:'ar', s:'es', t:'tee', u:'you', v:'vee', w:'double you',
  x:'ex', y:'why', z:'zee'
}

// 根據今天的日期，計算出今日的 13 個單詞，並隨機排序
function getTodayWords(): string[] {
  const today = new Date().toISOString().slice(0, 10)
  let hash = 0
  for (let i = 0; i < today.length; i++) {
    hash = (hash * 31 + today.charCodeAt(i)) | 0
  }
  const start = Math.abs(hash) % (VOCAB_1000.length - 13)
  const words = VOCAB_1000.slice(start, start + 13)
  // Fisher-Yates shuffle
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[words[i], words[j]] = [words[j], words[i]]
  }
  return words
}

export default function VocabPractice({ onExit }: VocabPracticeProps) {
  // 今日 13 個固定單詞
  const [words] = useState<string[]>(getTodayWords)
  // 目前題目索引
  const [index, setIndex] = useState(0)
  // 用戶已輸入的字母陣列（直接顯示在橫線上）
  const [typedLetters, setTypedLetters] = useState<string[]>([])
  // 反饋狀態
  const [feedback, setFeedback] = useState<null | 'correct' | 'wrong' | 'revealed'>(null)
  // 整體 shake key（提交答錯時全部橫線搖動）
  const [shakeKey, setShakeKey] = useState(0)
  // 每個橫線的獨立 shake 版本號（輸入錯字母時，該橫線單獨搖動）
  const [dashShakeVer, setDashShakeVer] = useState<number[]>([])
  // 正確題數
  const [score, setScore] = useState(0)
  // 是否正在播放拼讀
  const [speaking, setSpeaking] = useState(false)
  // 可用的英文聲源列表
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  // 用戶選擇的聲源名稱
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('')
  // 隱藏 input，用來接收鍵盤輸入（在橫線區域直接輸入）
  const inputRef = useRef<HTMLInputElement>(null)

  const currentWord = words[index] ?? ''

  // 切換題目時清空輸入、重置 shake 版本並聚焦隱藏 input
  useEffect(() => {
    setTypedLetters([])
    setFeedback(null)
    setSpeaking(false)
    setDashShakeVer(new Array(currentWord.length).fill(0))
    window.speechSynthesis?.cancel()
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [index])

  // 載入瀏覽器可用的英文聲源，並自動選擇最佳美式聲源
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const load = () => {
      const all = window.speechSynthesis.getVoices()
      const en = all.filter(v => v.lang.startsWith('en'))
      setAvailableVoices(en)
      if (!selectedVoiceName && en.length > 0) {
        // 自動選最佳美式聲源
        const priority = ['Google US English','Samantha','Alex',
          'Microsoft Guy Online (Natural) - English (United States)',
          'Microsoft Zira - English (United States)',
          'Microsoft David - English (United States)']
        const best = priority.map(n => en.find(v => v.name === n)).find(Boolean)
          || en.find(v => v.lang === 'en-US') || en[0]
        if (best) setSelectedVoiceName(best.name)
      }
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  // 取得目前選定的聲源物件
  const getVoice = useCallback((): SpeechSynthesisVoice | null =>
    availableVoices.find(v => v.name === selectedVoiceName) || null
  , [availableVoices, selectedVoiceName])

  // 念一次某個字母名稱（每輸錯觸發一次，不循環）
  const speakOnce = useCallback((letterName: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(letterName)
    utt.lang = 'en-US'
    utt.rate = 0.8
    utt.pitch = 1.1
    const voice = getVoice()
    if (voice) utt.voice = voice
    window.speechSynthesis.speak(utt)
  }, [getVoice])

  // 播放完整拼讀（逐個念字母）
  const handleSpeak = useCallback(() => {
    if (!('speechSynthesis' in window) || speaking) return
    window.speechSynthesis.cancel()
    setSpeaking(true)
    const voice = getVoice()
    const letters = currentWord.toLowerCase().split('')
    letters.forEach((letter, i) => {
      const name = LETTER_NAMES[letter] || letter
      setTimeout(() => {
        const utt = new SpeechSynthesisUtterance(name)
        utt.lang = 'en-US'
        utt.rate = 0.8
        utt.pitch = 1.1
        if (voice) utt.voice = voice
        if (i === letters.length - 1) utt.onend = () => setSpeaking(false)
        window.speechSynthesis.speak(utt)
      }, i * 700)
    })
  }, [currentWord, speaking, getVoice])

  // 提交答案
  const handleSubmit = useCallback(() => {
    if (feedback === 'correct' || feedback === 'wrong' || feedback === 'revealed') {
      setIndex(i => i + 1)
      return
    }
    const typed = typedLetters.join('')
    if (!typed) return
    if (typed === currentWord.toLowerCase()) {
      setScore(s => s + 1)
      setFeedback('correct')
    } else {
      setFeedback('wrong')
      setShakeKey(k => k + 1)
    }
  }, [typedLetters, currentWord, feedback])

  // 隱藏 input 的 onChange
  // 輸入正確字母 → 前進；輸入錯誤 → 鎖住位置 + 搖動 + 念一次正確字母
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (feedback === 'correct' || feedback === 'revealed') return
    const raw = e.target.value.toLowerCase().replace(/[^a-z]/g, '')
    if (raw.length > typedLetters.length) {
      // 新增一個字母
      const pos = typedLetters.length
      const newChar = raw[pos]
      if (newChar === currentWord[pos]) {
        // 正確：接受並前進
        setTypedLetters(prev => [...prev, newChar])
      } else {
        // 錯誤：搖動該橫線 + 念一次正確字母，但不前進（不更新 typedLetters）
        setDashShakeVer(prev => {
          const next = [...prev]
          next[pos] = (next[pos] || 0) + 1
          return next
        })
        speakOnce(LETTER_NAMES[currentWord[pos]] || currentWord[pos])
      }
    } else if (raw.length < typedLetters.length) {
      // 退格：允許刪除
      setTypedLetters(raw.split(''))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit()
  }

  // 完成今日 13 題
  if (index >= words.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="text-center space-y-4">
          <div className="text-6xl">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800">今日練習完成！</h2>
          <p className="text-gray-500">共 {words.length} 個單詞，答對 <span className="text-green-600 font-bold">{score}</span> 個</p>
          <p className="text-xs text-gray-400">明天再來練習新的 13 個單詞</p>
          <button onClick={onExit} className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
            返回書架
          </button>
        </div>
      </div>
    )
  }

  // 橫線顏色
  const lineColor = feedback === 'correct' ? 'bg-green-500'
    : feedback === 'wrong' ? 'bg-red-400'
    : feedback === 'revealed' ? 'bg-orange-400'
    : 'bg-gray-400'

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 頂部導覽列 */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <button onClick={onExit} className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 transition-colors">
          <Home className="w-5 h-5" />
          <span className="text-sm">返回</span>
        </button>
        <div className="text-sm text-gray-500">{index + 1} / {words.length}</div>
        <div className="text-sm font-medium text-green-600">✓ {score}</div>
      </header>

      {/* 進度條 */}
      <div className="h-1 bg-gray-200">
        <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(index / words.length) * 100}%` }} />
      </div>

      {/* 主要內容 */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-10">

        {/* 橫線區域：點擊聚焦隱藏 input，字母直接顯示在橫線上 */}
        <div
          key={shakeKey}
          onClick={() => inputRef.current?.focus()}
          className={`flex items-end space-x-3 cursor-text select-none ${shakeKey > 0 ? 'animate-shake' : ''}`}
        >
          {currentWord.split('').map((correctLetter, i) => {
            const typed = typedLetters[i]
            const showCorrect = feedback === 'correct' || feedback === 'revealed'
            const display = showCorrect ? correctLetter : (typed ?? '')
            const isActive = !showCorrect && i === typedLetters.length
            // 每個橫線用自己的 shake 版本號當 key，版本號改變時重新掛載觸發動畫
            const dashVer = dashShakeVer[i] || 0
            return (
              <div
                key={`${i}-${dashVer}`}
                className={`flex flex-col items-center ${dashVer > 0 ? 'animate-dash-shake' : ''}`}
              >
                {/* 字母顯示區 */}
                <span className={`text-2xl font-bold w-8 h-9 flex items-end justify-center pb-0.5 transition-colors ${
                  feedback === 'correct' ? 'text-green-600'
                  : feedback === 'revealed' ? 'text-orange-500'
                  : typed ? 'text-gray-800'
                  : 'text-transparent'
                }`}>
                  {display || ' '}
                </span>
                {/* 橫線（目前輸入位置略寬作為光標提示） */}
                <div className={`h-0.5 rounded transition-all duration-150 ${lineColor} ${isActive ? 'w-9 opacity-100' : 'w-7 opacity-70'}`} />
              </div>
            )
          })}
        </div>

        {/* 隱藏的 input，接收鍵盤輸入 */}
        <input
          ref={inputRef}
          type="text"
          className="sr-only"
          value={typedLetters.join('')}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          readOnly={feedback === 'correct' || feedback === 'revealed'}
        />

        {/* 字母數提示 */}
        <p className="text-xs text-gray-400 -mt-6">{currentWord.length} 個字母　點擊橫線開始輸入</p>

        {/* 播放拼讀按鈕 */}
        <button
          onClick={handleSpeak}
          disabled={speaking}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-full border transition-all ${
            speaking
              ? 'bg-indigo-50 border-indigo-200 text-indigo-300 cursor-not-allowed'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          <Volume2 className={`w-4 h-4 ${speaking ? 'animate-pulse' : ''}`} />
          <span className="text-sm">{speaking ? '拼讀中...' : '播放拼讀'}</span>
        </button>

        {/* 聲源選擇器 */}
        {availableVoices.length > 0 && (
          <div className="flex items-center space-x-2 w-full max-w-xs">
            <span className="text-xs text-gray-400 flex-shrink-0">聲源</span>
            <select
              value={selectedVoiceName}
              onChange={e => setSelectedVoiceName(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 outline-none focus:border-indigo-300"
            >
              {availableVoices.map(v => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* 操作按鈕區 */}
        <div className="w-full max-w-xs space-y-3">
          {feedback === 'correct' && (
            <p className="text-center text-green-600 font-medium text-sm">✓ 正確！</p>
          )}
          {feedback === 'revealed' && (
            <p className="text-center text-orange-500 font-medium text-sm">答案是：<strong>{currentWord}</strong></p>
          )}
          <div className="flex space-x-2">
            <button
              onClick={handleSubmit}
              className="flex-1 flex items-center justify-center space-x-1 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium"
            >
              {feedback === 'correct' || feedback === 'wrong' || feedback === 'revealed'
                ? <><span>下一個</span><ChevronRight className="w-4 h-4" /></>
                : <span>提交</span>
              }
            </button>
            {feedback === 'wrong' && (
              <button
                onClick={() => setFeedback('revealed')}
                className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                看答案
              </button>
            )}
          </div>
        </div>

        {/* 重新開始 */}
        <button
          onClick={() => { setIndex(0); setScore(0) }}
          className="flex items-center space-x-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>重新開始</span>
        </button>
      </div>

      {/* shake 動畫 CSS */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-8px); }
          30%       { transform: translateX(8px); }
          45%       { transform: translateX(-6px); }
          60%       { transform: translateX(6px); }
          75%       { transform: translateX(-3px); }
          90%       { transform: translateX(3px); }
        }
        .animate-shake { animation: shake 0.45s ease-in-out; }
        @keyframes dash-shake {
          0%, 100% { transform: translateY(0); }
          25%       { transform: translateY(-5px); }
          50%       { transform: translateY(4px); }
          75%       { transform: translateY(-3px); }
        }
        .animate-dash-shake { animation: dash-shake 0.35s ease-in-out; }
      `}</style>
    </div>
  )
}
