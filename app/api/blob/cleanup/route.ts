// 【雲端孤兒檔清理】
// 同步每次有改動都會上傳新版本嘅書；舊版本冇被任何「仍然存在嘅清單」引用，就係垃圾。
// 安全做法：只保留「Redis 仲有效嘅同步碼 → 清單 → 清單入面引用嘅書」，其餘 book-* / sync-* 刪走。
// - 只刪同步檔（book-* / sync-*），唔掂其他檔案
// - 只刪 1 小時前上傳嘅（避免刪咗正喺上傳緊、未登記清單嘅新檔）
// - 任何一份有效清單讀取失敗（非 404）→ 中止，唔會誤刪

import { NextResponse } from 'next/server'
import { list, del } from '@vercel/blob'
import { gunzipSync } from 'zlib'

export const runtime = 'nodejs'
export const maxDuration = 60

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY_PREFIX = 'msw:'

async function redis(command: unknown[]) {
  const res = await fetch(REDIS_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  })
  return res.json()
}

const isSyncPath = (p: string) => p.startsWith('book-') || p.startsWith('sync-')

export async function POST() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return NextResponse.json({ error: '伺服器尚未設定同步功能' }, { status: 503 })
  }
  try {
    // 1. 所有仍有效嘅同步碼 → 清單 URL
    const manifestUrls = new Set<string>()
    let cursor = '0'
    do {
      // msw:（舊式 4 位數碼，值係網址）＋ msw2:（固定同步碼，值係 JSON { blobUrl }）
      const r = await redis(['SCAN', cursor, 'MATCH', 'msw*', 'COUNT', '500'])
      const [next, keys0] = (r.result || ['0', []]) as [string, string[]]
      cursor = String(next)
      const keys = keys0.filter(k => k.startsWith(KEY_PREFIX) || k.startsWith('msw2:'))
      if (keys.length > 0) {
        const g = await redis(['MGET', ...keys])
        for (const v of (g.result || []) as (string | null)[]) {
          if (!v) continue
          if (v.startsWith('{')) {
            try { const o = JSON.parse(v); if (typeof o.blobUrl === 'string') manifestUrls.add(o.blobUrl) } catch { /* ignore */ }
          } else manifestUrls.add(v)
        }
      }
    } while (cursor !== '0')

    // 2. 保留集合：存在嘅清單 + 佢哋引用嘅書
    const keep = new Set<string>()
    for (const mu of manifestUrls) {
      const res = await fetch(mu, { cache: 'no-store' })
      if (res.status === 404 || res.status === 403) continue   // 清單已刪 → 呢個同步碼已失效
      if (!res.ok) {
        return NextResponse.json({ error: `讀取清單失敗（${res.status}），為安全起見已中止` }, { status: 502 })
      }
      keep.add(mu)
      const buf = Buffer.from(await res.arrayBuffer())
      const txt = mu.includes('.json.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8')
      const data = JSON.parse(txt)
      for (const ref of data.bookRefs || []) if (ref?.url) keep.add(ref.url)
    }

    // 3. 列出雲端檔案，刪走冇被引用嘅同步檔
    const cutoff = Date.now() - 60 * 60 * 1000
    const toDel: string[] = []
    let freedBytes = 0, scanned = 0
    let lc: string | undefined
    do {
      const page = await list({ cursor: lc, limit: 1000 })
      for (const b of page.blobs) {
        scanned++
        if (!isSyncPath(b.pathname)) continue
        if (keep.has(b.url)) continue
        if (new Date(b.uploadedAt).getTime() > cutoff) continue
        toDel.push(b.url)
        freedBytes += b.size
      }
      lc = page.hasMore ? page.cursor : undefined
    } while (lc)

    for (let i = 0; i < toDel.length; i += 100) await del(toDel.slice(i, i + 100))

    return NextResponse.json({ deleted: toDel.length, freedBytes, kept: keep.size, scanned })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
