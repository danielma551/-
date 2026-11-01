'use client'

// 【出錯保護】頁面出錯時唔再白屏：顯示錯誤詳情（方便截圖排查）＋一撳返回繼續讀
// 閱讀進度本身已經存咗喺本機，重新載入會由原位繼續

import { useEffect } from 'react'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      localStorage.setItem('msw-last-error', JSON.stringify({
        at: new Date().toISOString(), message: String(error?.message || error), stack: String(error?.stack || '').slice(0, 2000), url: location.href, ua: navigator.userAgent,
      }))
    } catch { /* ignore */ }
    console.error(error)
    // 網站啱啱更新咗、舊分頁搵唔到新檔 → 自動重新載入（每次出錯最多一次）
    const msg = String(error?.message || '') + String((error as any)?.name || '')
    if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) {
      try {
        if (sessionStorage.getItem('msw-chunk-reload') !== '1') { sessionStorage.setItem('msw-chunk-reload', '1'); location.reload() }
      } catch { /* ignore */ }
    }
  }, [error])

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-amber-50 to-white">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-amber-100 p-6">
        <p className="text-3xl mb-2">🙈</p>
        <h1 className="text-lg font-bold text-gray-800">頁面出咗少少問題</h1>
        <p className="text-sm text-gray-500 mt-1">你嘅閱讀進度已經保存咗。撳「繼續閱讀」通常就得。</p>
        <div className="flex gap-2 mt-4">
          <button onClick={() => reset()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">繼續閱讀</button>
          <button onClick={() => location.reload()} className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">重新載入</button>
        </div>
        <details className="mt-4" open>
          <summary className="text-xs text-gray-400 cursor-pointer">錯誤詳情（截圖畀 Claude 排查）</summary>
          <pre className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-100 text-[11px] text-red-600 whitespace-pre-wrap break-all max-h-64 overflow-auto">
{String(error?.message || error)}
{'\n'}
{String(error?.stack || '').split('\n').slice(0, 8).join('\n')}
          </pre>
        </details>
      </div>
    </main>
  )
}
