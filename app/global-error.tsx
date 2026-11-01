'use client'

// 【全站出錯保護】連 layout 都出錯時顯示（唔再係英文白屏）

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-HK">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fffbeb' }}>
        <div style={{ maxWidth: 520, width: '100%', background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(0,0,0,.08)' }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>🙈 頁面出咗少少問題</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>閱讀進度已經保存咗。</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => reset()} style={{ flex: 1, padding: 10, borderRadius: 12, border: 0, background: '#4f46e5', color: '#fff', fontWeight: 600 }}>繼續閱讀</button>
            <button onClick={() => location.reload()} style={{ padding: 10, borderRadius: 12, border: 0, background: '#f3f4f6' }}>重新載入</button>
          </div>
          <pre style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 11, color: '#dc2626', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {String(error?.message || error)}{'\n'}{String(error?.stack || '').split('\n').slice(0, 8).join('\n')}
          </pre>
        </div>
      </body>
    </html>
  )
}
