'use client'

// 【每日温習】— 視覺升級版（本機筆記閃卡，間隔重溫 SRS）
// 卡片來源：閱讀時㩒「＋ / 寄去 Flomo」時自動存到本機。
// 操作：記得了（升格、拉長間隔）／要再温（歸零、本節稍後再出現）。
// 升級：牌組層次、引號裝飾的文學排版、分段進度、間隔盒徽章、鍵盤快捷鍵。

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { X, Wand2, ListChecks, Trash2, Search, BookText, Plus } from 'lucide-react'
import { reviewStorage, ReviewNote } from '../utils/storage'

interface Props {
  onClose: () => void
}

const DAILY_CAP = 24   // 固定每天温習張數

// 間隔盒徽章（對應 storage 的 BOX_DAYS = [0,1,2,4,7,15]）
const BOX_META = [
  { label: '新卡', color: '#6366f1', bg: '#eef2ff' },
  { label: '盒 1 · 明天', color: '#0ea5e9', bg: '#e0f2fe' },
  { label: '盒 2 · 2 天', color: '#0d9488', bg: '#ccfbf1' },
  { label: '盒 3 · 4 天', color: '#059669', bg: '#d1fae5' },
  { label: '盒 4 · 1 週', color: '#d97706', bg: '#fef3c7' },
  { label: '盒 5 · 半月', color: '#dc2626', bg: '#fee2e2' },
]
const SERIF = "'Songti SC','Noto Serif CJK SC','Source Han Serif SC',Georgia,serif"

// 格式化建立時間，例如 26/07/01 14:30
function fmtCreated(ts?: number): string {
  if (!ts) return '未知時間'
  try {
    return new Date(ts).toLocaleString('zh-TW', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return '未知時間' }
}

export default function ReviewCards({ onClose }: Props) {
  // 開始／續做今天嘅 session（固定 24 張、退出可續做、隨機順序）
  const initRef = useRef<{ queue: ReviewNote[]; done: number; total: number }>()
  if (!initRef.current) initRef.current = reviewStorage.resumeOrStartDaily(DAILY_CAP)
  const [queue, setQueue] = useState<ReviewNote[]>(initRef.current.queue)
  const [doneCount, setDoneCount] = useState(initRef.current.done)
  const [sessionTotal, setSessionTotal] = useState(initRef.current.total)
  const [totalNotes, setTotalNotes] = useState(() => reviewStorage.stats().total)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  // 由 session 重建佇列（匯入／清理／刪除後用，保留今日進度）
  const refreshFromSession = () => {
    const r = reviewStorage.resumeOrStartDaily(DAILY_CAP)
    setQueue(r.queue); setDoneCount(r.done); setSessionTotal(r.total)
    setTotalNotes(reviewStorage.stats().total)
  }
  // 批量管理／刪除
  const [manageMode, setManageMode] = useState(false)
  const [notesList, setNotesList] = useState<ReviewNote[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manageQuery, setManageQuery] = useState('')

  const openManage = () => { setNotesList(reviewStorage.getAll()); setSelected(new Set()); setManageQuery(''); setManageMode(true) }

  // 📝 筆記模式：自己打字加新筆記 + 瀏覽／搜尋所有筆記
  const [notesMode, setNotesMode] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [browseQuery, setBrowseQuery] = useState('')
  const openNotes = () => { setNotesList(reviewStorage.getAll()); setBrowseQuery(''); setNoteInput(''); setNotesMode(true) }
  const addNote = () => {
    const text = noteInput.trim()
    if (!text) return
    const added = reviewStorage.addMany([text], '手動筆記')
    setNoteInput('')
    setNotesList(reviewStorage.getAll())
    setTotalNotes(reviewStorage.stats().total)
    refreshFromSession()
    setImportMsg(added > 0 ? '已加入筆記 📝' : '呢條筆記已存在')
    setTimeout(() => setImportMsg(null), 2000)
  }
  const deleteNote = (id: string) => {
    reviewStorage.remove(id); reviewStorage.sessionRemove(id)
    setNotesList(reviewStorage.getAll())
    setTotalNotes(reviewStorage.stats().total)
    refreshFromSession()
  }
  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setSelected(prev => prev.size === notesList.length ? new Set() : new Set(notesList.map(n => n.id)))
  const deleteSelected = () => {
    if (selected.size === 0) return
    selected.forEach(id => { reviewStorage.remove(id); reviewStorage.sessionRemove(id) })
    setNotesList(reviewStorage.getAll())
    setSelected(new Set())
    refreshFromSession()
  }

  // 一鍵清理：移除純時間戳／純 metadata 等雜項卡
  const handleCleanup = () => {
    const removed = reviewStorage.cleanupJunk()
    refreshFromSession()
    setImportMsg(removed > 0 ? `已清理 ${removed} 張雜項卡 🧹` : '冇雜項卡需要清理 ✨')
    setTimeout(() => setImportMsg(null), 3000)
  }

  const card = queue[0]
  const finished = !card && sessionTotal > 0
  const empty = sessionTotal === 0

  const known = useCallback(() => {
    const c = queue[0]; if (!c) return
    reviewStorage.markKnown(c.id)
    reviewStorage.sessionMarkKnown(c.id)   // 記錄進度：移出剩餘、完成 +1
    setQueue(q => q.slice(1))
    setDoneCount(d => d + 1)
  }, [queue])

  const again = useCallback(() => {
    const c = queue[0]; if (!c) return
    reviewStorage.markAgain(c.id)
    reviewStorage.sessionMoveBack(c.id)    // 本節稍後再出現（移到隊尾）
    setQueue(q => q.length > 1 ? [...q.slice(1), c] : q)
  }, [queue])

  const del = () => {
    const c = queue[0]; if (!c) return
    reviewStorage.remove(c.id)
    reviewStorage.sessionRemove(c.id)
    setQueue(q => q.slice(1))
    setTotalNotes(reviewStorage.stats().total)
  }

  // 自動縮放字體：令整張卡（正文＋附加資訊）一頁顯示，唔使滾動；太多字就縮細
  const boxRef = useRef<HTMLDivElement>(null)
  const [fitSize, setFitSize] = useState(20)
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box || !card) return
    const p = box.querySelector('[data-fit]') as HTMLElement | null
    if (!p) return
    let size = 20
    p.style.fontSize = size + 'px'
    let guard = 0
    while (box.scrollHeight > box.clientHeight + 1 && size > 11 && guard < 40) {
      size -= 1; p.style.fontSize = size + 'px'; guard++
    }
    setFitSize(size)
  }, [card])

  // 墨水屏模式（與閱讀器共用設定）
  const eink = typeof window !== 'undefined' && localStorage.getItem('eink-mode') === 'true'

  // 鍵盤／實體鍵快捷：
  //  上鍵 / PageUp → 要再温；下鍵 / PageDown → 記得了（配合墨水屏實體上下鍵）
  //  1 = 要再温；Space / Enter / 2 = 記得了；Esc = 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      const c = e.keyCode   // 部分墨水屏只送 keyCode
      const isEsc = k === 'Escape' || c === 27
      const isAgain = k === '1' || k === 'ArrowUp' || k === 'PageUp' || c === 38 || c === 33 || c === 49 || c === 97
      const isKnown = k === ' ' || k === 'Enter' || k === '2' || k === 'ArrowDown' || k === 'PageDown' || c === 32 || c === 13 || c === 40 || c === 34 || c === 50 || c === 98
      if (isEsc) { e.preventDefault(); onClose(); return }
      if (manageMode || !queue[0]) return
      if (isAgain) { e.preventDefault(); again() }
      else if (isKnown) { e.preventDefault(); known() }
    }
    // capture 階段：搶先處理，避免墨水屏實體鍵被瀏覽器當成翻頁／捲動
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions)
  }, [queue, again, known, onClose, manageMode])

  const progress = sessionTotal > 0 ? Math.min(100, Math.round((doneCount / sessionTotal) * 100)) : 0
  const segs = Array.from({ length: Math.max(sessionTotal, 1) }, (_, i) =>
    i < doneCount ? '#10b981' : (i === doneCount ? '#a7f3d0' : '#eef0f3')
  )
  const box = card ? BOX_META[Math.min(card.box, BOX_META.length - 1)] : BOX_META[0]

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${eink ? 'eink-review bg-black/40' : 'bg-black/60 backdrop-blur-sm'}`}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {eink && (
        <style>{`
          .eink-review *{box-shadow:none!important;text-shadow:none!important;transition:none!important;animation:none!important;background-image:none!important;backdrop-filter:none!important;}
          .eink-review .eink-modal{background:#fff!important;border:2px solid #000!important;}
          .eink-review .eink-card{background:#fff!important;border:1.5px solid #000!important;}
          .eink-review h2,.eink-review p,.eink-review label,.eink-review span{color:#000!important;}
          .eink-review .eink-logo{background:#000!important;}
          .eink-review .eink-btn-secondary{background:#fff!important;border:2px solid #000!important;}
          .eink-review .eink-btn-secondary,.eink-review .eink-btn-secondary span{color:#000!important;}
          .eink-review .eink-btn-primary{background:#000!important;border:2px solid #000!important;}
          .eink-review .eink-btn-primary,.eink-review .eink-btn-primary span{color:#fff!important;}
        `}</style>
      )}
      <div
        className="eink-modal relative bg-white rounded-[26px] shadow-2xl w-full max-w-2xl overflow-hidden"
        style={{ animation: 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b border-gray-100"
          style={{ background: 'linear-gradient(180deg,#f6fbf8,#ffffff)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="eink-logo w-[42px] h-[42px] rounded-[13px] flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(150deg,#34d399,#059669)', boxShadow: '0 6px 16px rgba(5,150,105,.32)' }}
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.9 4.6 5 .4-3.8 3.3 1.2 4.9L12 14.1 7.7 16.7l1.2-4.9L5 8.5l5-.4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800 leading-none">每日温習</h2>
              <p className="text-xs text-gray-400 mt-1.5">間隔重溫 · 共 {totalNotes} 張筆記</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => (notesMode ? setNotesMode(false) : (setManageMode(false), openNotes()))}
              title="加筆記／瀏覽所有筆記"
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-[10px] transition-colors ${notesMode ? 'text-white bg-emerald-600 hover:bg-emerald-700' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}
            >
              <BookText className="w-4 h-4" />
              <span className="hidden sm:inline">{notesMode ? '完成' : '筆記'}</span>
            </button>
            <button
              onClick={handleCleanup}
              title="一鍵清理：移除純時間戳／metadata 等雜項卡"
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-[10px] transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">清理</span>
            </button>
            <button
              onClick={() => (manageMode ? setManageMode(false) : (setNotesMode(false), openManage()))}
              title="批量管理／刪除卡片"
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-[10px] transition-colors ${manageMode ? 'text-white bg-gray-700 hover:bg-gray-800' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}
            >
              <ListChecks className="w-4 h-4" />
              <span className="hidden sm:inline">{manageMode ? '完成' : '管理'}</span>
            </button>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-[10px] transition-colors">
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {/* 匯入提示 */}
        {importMsg && (
          <div className="px-6 pt-3 -mb-1">
            <div className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{importMsg}</div>
          </div>
        )}

        {/* 📝 筆記模式：加筆記 + 瀏覽／搜尋所有筆記 */}
        {notesMode && (() => {
          const q = browseQuery.trim().toLowerCase()
          const shown = q
            ? notesList.filter(n => `${n.text} ${n.source || ''} ${n.meta || ''}`.toLowerCase().includes(q))
            : notesList
          return (
          <div className="px-6 py-4">
            {/* ✍️ 加新筆記 */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 mb-4">
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addNote() } }}
                placeholder="寫低你嘅諗法／筆記…（⌘/Ctrl + Enter 快速加入）"
                rows={3}
                className="w-full bg-transparent text-sm outline-none resize-none leading-relaxed placeholder:text-gray-400"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-gray-400">加入後即刻進入温習循環</span>
                <button
                  onClick={addNote}
                  disabled={!noteInput.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" /> 加入筆記
                </button>
              </div>
            </div>

            {/* 🔍 瀏覽／搜尋 */}
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                value={browseQuery}
                onChange={e => setBrowseQuery(e.target.value)}
                placeholder="搜尋筆記（內容 / 來源 / 標籤）"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {browseQuery && (
                <button onClick={() => setBrowseQuery('')} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-2">共 {notesList.length} 張{q ? `，符合 ${shown.length} 張` : ''}</p>
            <div className="max-h-[42vh] overflow-y-auto divide-y divide-gray-100 border-y border-gray-100">
              {shown.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">{q ? '冇符合嘅筆記' : '仲未有筆記，喺上面寫低第一條啦 ✍️'}</p>}
              {shown.map(n => (
                <div key={n.id} className="group flex items-start gap-3 py-3 px-1">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.text}</span>
                    <span className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                      {n.source && <span className="truncate">📖 {n.source}</span>}
                      <span className="flex-shrink-0">{fmtCreated(n.createdAt)}</span>
                    </span>
                  </span>
                  <button
                    onClick={() => deleteNote(n.id)}
                    title="刪除呢張筆記"
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          )
        })()}

        {/* 分段進度 */}
        {!empty && !manageMode && !notesMode && (
          <div className="px-6 pt-4 pb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">今日進度 <span className="text-emerald-600">{doneCount}</span> / {sessionTotal}</span>
              <span className="text-xs text-gray-400">剩 {queue.length} 張</span>
            </div>
            <div className="flex gap-[5px]">
              {segs.map((c, i) => (
                <div key={i} className="flex-1 h-1.5 rounded-full transition-colors" style={{ background: c }} />
              ))}
            </div>
          </div>
        )}

        {/* 批量管理／搜尋／刪除 */}
        {manageMode && (() => {
          const q = manageQuery.trim().toLowerCase()
          const shown = q
            ? notesList.filter(n => `${n.text} ${n.source || ''} ${n.meta || ''}`.toLowerCase().includes(q))
            : notesList
          return (
          <div className="px-6 py-4">
            {/* 🔍 搜尋卡片 */}
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                value={manageQuery}
                onChange={e => setManageQuery(e.target.value)}
                placeholder="搜尋卡片（內容 / 來源 / 標籤）"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {manageQuery && (
                <button onClick={() => setManageQuery('')} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
            <div className="flex items-center justify-between mb-3">
              <button onClick={toggleAll} className="text-sm font-medium text-gray-600 hover:text-gray-800">
                {selected.size === notesList.length && notesList.length > 0 ? '取消全選' : '全選'}
                <span className="text-gray-400 ml-1">({selected.size}/{q ? shown.length : notesList.length})</span>
              </button>
              <button
                onClick={deleteSelected}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" /> 刪除選中 ({selected.size})
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100 border-y border-gray-100">
              {shown.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">{q ? '冇符合嘅卡片' : '冇筆記'}</p>}
              {shown.map(n => (
                <label key={n.id} className="flex items-start gap-3 py-2.5 px-1 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.has(n.id)}
                    onChange={() => toggleOne(n.id)}
                    className="mt-1 w-4 h-4 accent-red-500 flex-shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-700 leading-snug line-clamp-2">{n.text}</span>
                    {n.source && <span className="block text-[11px] text-gray-400 mt-0.5 truncate">📖 {n.source}</span>}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">搜尋卡片，或勾選後㩒「刪除選中」。刪除唔可復原。</p>
          </div>
          )
        })()}

        {/* 內容 */}
        {!manageMode && !notesMode && (
        <div className="px-[30px] pt-7 pb-3 min-h-[380px] flex flex-col justify-center">
          {empty && (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">🌱</div>
              <p className="text-gray-700 font-semibold mb-1">今日冇卡要温習</p>
              <p className="text-sm text-gray-400">閱讀時㩒「＋ / 📝 儲存筆記」，或者喺「筆記」入面自己加，都會變成温習卡片。</p>
              {totalNotes > 0 && <p className="text-xs text-gray-400 mt-2">（你總共有 {totalNotes} 張卡，已全部温習到期外）</p>}
              <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">關閉</button>
            </div>
          )}

          {finished && (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">🎉</div>
              <p className="text-gray-800 font-semibold text-lg mb-1">今日温習完成！</p>
              <p className="text-sm text-gray-400">温咗 {doneCount} 張，明天再見 👋</p>
              <button
                onClick={onClose}
                className="mt-6 px-7 py-3 text-white rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'linear-gradient(150deg,#10b981,#059669)', boxShadow: '0 8px 20px rgba(5,150,105,.32)' }}
              >
                完成
              </button>
            </div>
          )}

          {card && (
            <div className="relative">
              {/* 牌組層次（後方卡邊） */}
              <div className="absolute left-[20px] right-[20px] -top-3 h-14 rounded-[18px] bg-gray-100" />
              <div className="absolute left-[10px] right-[10px] -top-1.5 h-14 rounded-[18px] bg-gray-50" />

              {/* 前方卡片 */}
              <div className="eink-card relative bg-white border border-gray-100 rounded-[20px] px-7 pt-6 pb-5" style={{ boxShadow: '0 14px 34px rgba(17,24,39,.09)' }}>
                {/* 頂列：來源 + 間隔盒 */}
                <div className="flex items-center justify-between mb-3.5">
                  {card.source ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full max-w-[60%]">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                      <span className="truncate">{card.source}</span>
                    </span>
                  ) : <span />}
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0" style={{ color: box.color, background: box.bg }} title="間隔盒等級">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: box.color }} />{box.label}
                  </span>
                </div>

                {/* 引文 + 附加資訊：自動縮放字體、一頁顯示、免滾動 */}
                <div className="relative">
                  <span className="absolute -left-1.5 -top-5 text-[60px] leading-none text-emerald-100 pointer-events-none select-none" style={{ fontFamily: 'Georgia, serif' }}>&ldquo;</span>
                  <div ref={boxRef} className="relative overflow-hidden pr-1.5 pl-1 py-1" style={{ maxHeight: '48vh' }}>
                    <p data-fit className="text-gray-800" style={{ fontFamily: SERIF, fontSize: fitSize, lineHeight: 1.9, overflowWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{card.text}</p>
                    {card.meta && (
                      <div className="mt-3 pt-2.5 border-t border-dashed border-gray-100">
                        <p className="text-gray-400 whitespace-pre-wrap" style={{ fontSize: Math.max(11, fitSize - 7), lineHeight: 1.6 }}>{card.meta}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 底列：meta（生成時間＋設備）+ 刪除 */}
                <div className="flex items-end justify-between mt-4 pt-3.5 border-t border-gray-100">
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-gray-400">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                      {fmtCreated(card.createdAt)}
                      <span className="text-gray-300">·</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
                      {card.device || '未知裝置'}
                    </span>
                    <span className="text-[11px] text-gray-300">已温習 {card.reviewCount} 次 · 答對自動拉長間隔</span>
                  </div>
                  <button onClick={del} className="inline-flex items-center gap-1 text-[11.5px] text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                    </svg>
                    刪除這張
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* 操作按鈕 */}
        {card && !manageMode && (
          <div className="flex gap-3 px-6 pt-2 pb-6">
            <button
              onClick={again}
              className="eink-btn-secondary flex-1 flex items-center justify-center gap-2 py-[15px] rounded-[15px] font-bold text-[15.5px] transition-colors"
              style={{ border: '1.5px solid #fde2b8', background: '#fffbf3', color: '#c2620a' }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
              </svg>
              要再温
              <span className="text-[10px] font-semibold px-1.5 py-px rounded ml-0.5" style={{ color: '#d6a96a', border: '1px solid #f0dcc0' }}>{eink ? '↑' : '1'}</span>
            </button>
            <button
              onClick={known}
              className="eink-btn-primary flex items-center justify-center gap-2 py-[15px] rounded-[15px] font-bold text-[15.5px] text-white transition-all"
              style={{ flex: 1.5, background: 'linear-gradient(150deg,#10b981,#059669)', boxShadow: '0 8px 20px rgba(5,150,105,.32)' }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              記得了
              <span className="text-[10px] font-semibold px-1.5 py-px rounded ml-0.5 text-white" style={{ background: 'rgba(255,255,255,.22)' }}>{eink ? '↓' : 'Space'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
