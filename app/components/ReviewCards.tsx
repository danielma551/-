'use client'

// 【每日温習】— 視覺升級版（本機筆記閃卡，間隔重溫 SRS）
// 卡片來源：閱讀時㩒「＋ / 寄去 Flomo」時自動存到本機。
// 操作：記得了（升格、拉長間隔）／要再温（歸零、本節稍後再出現）。
// 升級：牌組層次、引號裝飾的文學排版、分段進度、間隔盒徽章、鍵盤快捷鍵。

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { reviewStorage, ReviewNote } from '../utils/storage'

interface Props {
  onClose: () => void
}

const DAILY_CAP = 50   // 每節最多温習張數，避免一次過太多

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
  const allDue = reviewStorage.dueToday()
  const [queue, setQueue] = useState<ReviewNote[]>(() => allDue.slice(0, DAILY_CAP))
  const [pos, setPos] = useState(0)
  const [doneCount, setDoneCount] = useState(0)
  const sessionTotal = Math.min(allDue.length, DAILY_CAP)
  const totalNotes = reviewStorage.stats().total

  const card = queue[pos]
  const finished = !card && queue.length > 0
  const empty = queue.length === 0

  const known = useCallback(() => {
    if (!card) return
    reviewStorage.markKnown(card.id)
    setDoneCount(c => c + 1)
    setPos(p => p + 1)
  }, [card])

  const again = useCallback(() => {
    if (!card) return
    reviewStorage.markAgain(card.id)
    setQueue(q => [...q, card])   // 本節稍後再出現
    setPos(p => p + 1)
  }, [card])

  const del = () => {
    if (!card) return
    reviewStorage.remove(card.id)
    setQueue(q => { const nq = [...q]; nq.splice(pos, 1); return nq })
    // pos 不變：下一張會頂上來
  }

  // 鍵盤快捷鍵：1 = 要再温，Space / Enter = 記得了，Esc = 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (!card) return
      if (e.key === '1') { e.preventDefault(); again() }
      else if (e.key === ' ' || e.key === 'Enter' || e.key === '2') { e.preventDefault(); known() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, again, known, onClose])

  const progress = sessionTotal > 0 ? Math.min(100, Math.round((doneCount / sessionTotal) * 100)) : 0
  const segs = Array.from({ length: Math.max(sessionTotal, 1) }, (_, i) =>
    i < doneCount ? '#10b981' : (i === doneCount ? '#a7f3d0' : '#eef0f3')
  )
  const box = card ? BOX_META[Math.min(card.box, BOX_META.length - 1)] : BOX_META[0]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative bg-white rounded-[26px] shadow-2xl w-full max-w-2xl overflow-hidden"
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
              className="w-[42px] h-[42px] rounded-[13px] flex items-center justify-center flex-shrink-0"
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
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-[10px] transition-colors">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* 分段進度 */}
        {!empty && (
          <div className="px-6 pt-4 pb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500">今日進度 <span className="text-emerald-600">{doneCount}</span> / {sessionTotal}</span>
              <span className="text-xs text-gray-400">剩 {Math.max(0, queue.length - pos)} 張</span>
            </div>
            <div className="flex gap-[5px]">
              {segs.map((c, i) => (
                <div key={i} className="flex-1 h-1.5 rounded-full transition-colors" style={{ background: c }} />
              ))}
            </div>
          </div>
        )}

        {/* 內容 */}
        <div className="px-[30px] pt-7 pb-3 min-h-[380px] flex flex-col justify-center">
          {empty && (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">🌱</div>
              <p className="text-gray-700 font-semibold mb-1">今日冇卡要温習</p>
              <p className="text-sm text-gray-400">閱讀時㩒「＋ / 寄去 Flomo」就會自動儲存做温習卡片。</p>
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
              <div className="relative bg-white border border-gray-100 rounded-[20px] px-7 pt-6 pb-5" style={{ boxShadow: '0 14px 34px rgba(17,24,39,.09)' }}>
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

                {/* 引文 */}
                <div className="relative">
                  <span className="absolute -left-1.5 -top-5 text-[60px] leading-none text-emerald-100 pointer-events-none select-none" style={{ fontFamily: 'Georgia, serif' }}>&ldquo;</span>
                  <div className="relative max-h-[300px] overflow-y-auto overflow-x-hidden pr-1.5 pl-1 py-1">
                    <p className="text-gray-800" style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 2, overflowWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{card.text}</p>
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

        {/* 操作按鈕 */}
        {card && (
          <div className="flex gap-3 px-6 pt-2 pb-6">
            <button
              onClick={again}
              className="flex-1 flex items-center justify-center gap-2 py-[15px] rounded-[15px] font-bold text-[15.5px] transition-colors"
              style={{ border: '1.5px solid #fde2b8', background: '#fffbf3', color: '#c2620a' }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
              </svg>
              要再温
              <span className="text-[10px] font-semibold px-1.5 py-px rounded ml-0.5" style={{ color: '#d6a96a', border: '1px solid #f0dcc0' }}>1</span>
            </button>
            <button
              onClick={known}
              className="flex items-center justify-center gap-2 py-[15px] rounded-[15px] font-bold text-[15.5px] text-white transition-all"
              style={{ flex: 1.5, background: 'linear-gradient(150deg,#10b981,#059669)', boxShadow: '0 8px 20px rgba(5,150,105,.32)' }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              記得了
              <span className="text-[10px] font-semibold px-1.5 py-px rounded ml-0.5 text-white" style={{ background: 'rgba(255,255,255,.22)' }}>Space</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
