'use client'

// 【打電話賺錢】把打電話 confirm payment 呢件枯燥事金錢化：
// 開頭幫你計日薪 → 每通電話值幾多錢；之後每打一通就賺返嗰個金額。
// 全部存喺瀏覽器本機（localStorage），唔上傳。

import { useEffect, useRef, useState } from 'react'
import { Phone, RotateCcw, Settings, ArrowLeft, TrendingUp } from 'lucide-react'

interface Config {
  monthly: number      // 月薪
  workDays: number     // 每月工作日
  targetCalls: number  // 每日目標通數
  perCall: number      // 每通金額
  currency: string     // 貨幣符號
}
interface DayLog { calls: number; earned: number }
type Log = Record<string, DayLog>

const CONFIG_KEY = 'work-earner-config'
const LOG_KEY = 'work-earner-log'
const todayKey = () => new Date().toLocaleDateString('en-CA')

export default function WorkEarnerPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [log, setLog] = useState<Log>({})
  const [showSetup, setShowSetup] = useState(false)
  const [floats, setFloats] = useState<{ id: number; text: string }[]>([])
  const [popKey, setPopKey] = useState(0)
  const floatId = useRef(0)

  // 載入
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null')
      const l = JSON.parse(localStorage.getItem(LOG_KEY) || '{}')
      setConfig(c)
      setLog(l || {})
      if (!c) setShowSetup(true)
    } catch { setShowSetup(true) }
  }, [])

  const saveLog = (next: Log) => { setLog(next); try { localStorage.setItem(LOG_KEY, JSON.stringify(next)) } catch {} }

  const cur = config?.currency || '$'
  const today = todayKey()
  const todayLog = log[today] || { calls: 0, earned: 0 }
  const dailyWage = config ? Math.round(config.monthly / Math.max(config.workDays, 1)) : 0
  const goalPct = dailyWage > 0 ? Math.min((todayLog.earned / dailyWage) * 100, 100) : 0
  const allTime = Object.values(log).reduce((s, d) => s + d.earned, 0)
  const allCalls = Object.values(log).reduce((s, d) => s + d.calls, 0)

  // 打一通
  const addCall = () => {
    if (!config) return
    const next = { ...log, [today]: { calls: todayLog.calls + 1, earned: todayLog.earned + config.perCall } }
    saveLog(next)
    const id = ++floatId.current
    setFloats(f => [...f, { id, text: `+${cur}${config.perCall}` }])
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1000)
    setPopKey(k => k + 1)
  }
  // 撤銷最後一通（今日）
  const undo = () => {
    if (todayLog.calls <= 0 || !config) return
    const next = { ...log, [today]: { calls: todayLog.calls - 1, earned: Math.max(0, todayLog.earned - config.perCall) } }
    saveLog(next)
  }

  const recentDays = Object.entries(log)
    .filter(([, d]) => d.calls > 0)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14)

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white">
      <div className="max-w-md mx-auto px-5 py-6">
        {/* 頂部 */}
        <div className="flex items-center justify-between mb-6">
          <a href="/" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700"><ArrowLeft className="w-4 h-4" /> 書架</a>
          <h1 className="text-lg font-bold text-gray-800">💰 打電話賺錢</h1>
          <button onClick={() => setShowSetup(true)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Settings className="w-4 h-4" /></button>
        </div>

        {config && !showSetup && (
          <>
            {/* 今日賺錢主卡 */}
            <div className="rounded-3xl bg-white shadow-lg border border-emerald-100 p-6 mb-4 text-center relative overflow-hidden">
              <p className="text-xs text-gray-400 mb-1">今日已賺</p>
              <p key={popKey} className="text-5xl font-extrabold text-emerald-600 tabular-nums" style={{ animation: 'earn-pop 300ms ease' }}>
                {cur}{todayLog.earned.toLocaleString()}
              </p>
              <p className="text-sm text-gray-400 mt-1">今日 {todayLog.calls} 通 · 每通 {cur}{config.perCall}</p>

              {/* 日薪進度 */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>距離日薪 {cur}{dailyWage.toLocaleString()}</span>
                  <span className="font-semibold text-emerald-600">{Math.round(goalPct)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500" style={{ width: `${goalPct}%` }} />
                </div>
                {goalPct >= 100 && <p className="text-xs text-emerald-600 font-semibold mt-2">🎉 今日日薪達成！</p>}
              </div>
            </div>

            {/* 打卡大掣 */}
            <div className="relative">
              <button
                onClick={addCall}
                className="w-full py-6 rounded-3xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white font-bold text-xl shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-3"
              >
                <Phone className="w-6 h-6" /> 打咗一通 +{cur}{config.perCall}
              </button>
              {/* 飄升金幣 */}
              {floats.map(f => (
                <span key={f.id} className="absolute left-1/2 -translate-x-1/2 top-2 text-2xl font-extrabold text-amber-500 pointer-events-none"
                  style={{ animation: 'earn-float 1s ease-out forwards' }}>
                  {f.text}
                </span>
              ))}
            </div>

            {/* 撤銷 */}
            <button onClick={undo} disabled={todayLog.calls <= 0}
              className="mt-3 w-full py-2.5 rounded-xl text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center gap-1.5">
              <RotateCcw className="w-4 h-4" /> 撤銷最後一通
            </button>

            {/* 累計 */}
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">累計賺到</p>
                <p className="text-2xl font-bold text-gray-800 tabular-nums">{cur}{allTime.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">總共打咗</p>
                <p className="text-2xl font-bold text-gray-800 tabular-nums">{allCalls} 通</p>
              </div>
            </div>

            {/* 每日記錄 */}
            {recentDays.length > 0 && (
              <div className="mt-6">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 mb-2"><TrendingUp className="w-4 h-4" /> 最近記錄</p>
                <div className="rounded-2xl bg-white border border-gray-100 divide-y divide-gray-50">
                  {recentDays.map(([date, d]) => (
                    <div key={date} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-500">{date}{date === today && <span className="ml-1.5 text-[10px] text-emerald-600">今日</span>}</span>
                      <span className="text-gray-400">{d.calls} 通</span>
                      <span className="font-semibold text-emerald-600 tabular-nums">{cur}{d.earned.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {showSetup && <SetupWizard config={config} onSave={(c) => { setConfig(c); try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)) } catch {}; setShowSetup(false) }} onCancel={config ? () => setShowSetup(false) : undefined} />}
      </div>
    </main>
  )
}

// ── 設定精靈：計日薪 → 每通金額 ──
function SetupWizard({ config, onSave, onCancel }: { config: Config | null; onSave: (c: Config) => void; onCancel?: () => void }) {
  const [monthly, setMonthly] = useState(config?.monthly ? String(config.monthly) : '')
  const [workDays, setWorkDays] = useState(config?.workDays ? String(config.workDays) : '22')
  const [targetCalls, setTargetCalls] = useState(config?.targetCalls ? String(config.targetCalls) : '20')
  const [customPer, setCustomPer] = useState(config?.perCall ? String(config.perCall) : '')
  const [currency, setCurrency] = useState(config?.currency || '$')

  const m = parseFloat(monthly) || 0
  const wd = parseFloat(workDays) || 22
  const tc = parseFloat(targetCalls) || 1
  const dailyWage = Math.round(m / Math.max(wd, 1))
  const autoPer = Math.round(dailyWage / Math.max(tc, 1))
  const perCall = customPer.trim() ? Math.round(parseFloat(customPer) || 0) : autoPer

  return (
    <div className="rounded-3xl bg-white shadow-lg border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-1">開頭設定 ⚙️</h2>
      <p className="text-sm text-gray-400 mb-5">先計出你嘅日薪，再算每打一通電話值幾多錢。</p>

      <div className="space-y-4">
        <div className="flex gap-3">
          <Field label="月薪" value={monthly} onChange={setMonthly} placeholder="例如 18000" prefix={currency} />
          <div className="w-24">
            <label className="block text-xs font-medium text-gray-500 mb-1">貨幣</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full h-[42px] px-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-emerald-400">
              {['$', '¥', 'HK$', 'NT$', '£', '€'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <Field label="每月工作日" value={workDays} onChange={setWorkDays} placeholder="22" />

        {/* 日薪計算結果 */}
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-center">
          <p className="text-xs text-gray-500">你嘅日薪</p>
          <p className="text-3xl font-extrabold text-emerald-600 tabular-nums">{currency}{dailyWage.toLocaleString()}</p>
        </div>

        <Field label="每日目標通數" value={targetCalls} onChange={setTargetCalls} placeholder="20" hint={`日薪 ÷ 目標通數 = 每通約 ${currency}${autoPer.toLocaleString()}`} />
        <Field label="每通金額（想自訂就填，唔填就用上面計出嘅）" value={customPer} onChange={setCustomPer} placeholder={String(autoPer)} prefix={currency} />

        {/* 最終每通 */}
        <div className="rounded-2xl bg-gray-900 text-white p-4 text-center">
          <p className="text-xs text-gray-300">每打一通電話賺</p>
          <p className="text-3xl font-extrabold text-emerald-400 tabular-nums">{currency}{perCall.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-6">
        {onCancel && <button onClick={onCancel} className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">取消</button>}
        <button
          onClick={() => onSave({ monthly: m, workDays: wd, targetCalls: tc, perCall: perCall || 1, currency })}
          disabled={m <= 0 || perCall <= 0}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40"
        >
          開始賺錢 💪
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, prefix, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string; hint?: string }) {
  return (
    <div className="flex-1">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 focus-within:border-emerald-400 px-3">
        {prefix && <span className="text-sm text-gray-400 mr-1">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 h-[42px] bg-transparent text-sm outline-none"
        />
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
