// 【自動同步後端（固定同步碼）】
// 每個人一個固定嘅私人同步碼（10 位，難估），兩部機用同一個碼。
// Redis：msw2:<碼> → { blobUrl, rev, updatedAt }（清單網址＋版本號）
// 寫入用「版本號比對」（compare-and-set）：如果另一部機啱啱更新咗，會返 409，客戶端先合併再重試，唔會互相蓋走。

import { NextRequest, NextResponse } from 'next/server'

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const PREFIX = 'msw2:'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // 冇 0/O/1/I，易睇易打

async function redis(command: unknown[]) {
  const res = await fetch(REDIS_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  })
  return res.json()
}

const normId = (s: unknown) => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '') : '')
const validId = (id: string) => id.length === 10 && [...id].every(c => ALPHABET.includes(c))

function newId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('')
}

const CAS = `
local cur = redis.call('GET', KEYS[1])
local rev = 0
if cur then
  local ok, obj = pcall(cjson.decode, cur)
  if ok and obj and obj.rev then rev = tonumber(obj.rev) or 0 end
end
if rev ~= tonumber(ARGV[1]) then return cur or '' end
redis.call('SET', KEYS[1], ARGV[2])
return 'OK'
`

export async function GET(request: NextRequest) {
  if (!REDIS_URL || !REDIS_TOKEN) return NextResponse.json({ error: '伺服器尚未設定同步功能' }, { status: 503 })
  const id = normId(request.nextUrl.searchParams.get('id'))
  if (!validId(id)) return NextResponse.json({ error: '同步碼格式唔啱' }, { status: 400 })
  const r = await redis(['GET', PREFIX + id])
  if (!r.result) return NextResponse.json({ empty: true, rev: 0 })
  try { return NextResponse.json(JSON.parse(r.result)) } catch { return NextResponse.json({ empty: true, rev: 0 }) }
}

export async function POST(request: NextRequest) {
  if (!REDIS_URL || !REDIS_TOKEN) return NextResponse.json({ error: '伺服器尚未設定同步功能' }, { status: 503 })
  try {
    const body = await request.json()
    if (body?.action === 'create') {
      for (let i = 0; i < 5; i++) {
        const id = newId()
        const r = await redis(['SET', PREFIX + id, JSON.stringify({ rev: 0, empty: true }), 'NX'])
        if (r.result === 'OK') return NextResponse.json({ id })
      }
      return NextResponse.json({ error: '暫時建立唔到，請再試' }, { status: 503 })
    }
    const id = normId(body?.id)
    const blobUrl = body?.blobUrl
    const baseRev = Number(body?.baseRev ?? 0)
    if (!validId(id)) return NextResponse.json({ error: '同步碼格式唔啱' }, { status: 400 })
    if (typeof blobUrl !== 'string' || !blobUrl.startsWith('https://')) return NextResponse.json({ error: '缺少 blobUrl' }, { status: 400 })
    const next = { blobUrl, rev: baseRev + 1, updatedAt: Date.now(), device: String(body?.device || '').slice(0, 40) }
    const r = await redis(['EVAL', CAS, '1', PREFIX + id, String(baseRev), JSON.stringify(next)])
    if (r.error) return NextResponse.json({ error: String(r.error) }, { status: 500 })
    if (r.result === 'OK') return NextResponse.json({ ok: true, rev: next.rev })
    let current: unknown = null
    try { current = r.result ? JSON.parse(r.result) : null } catch { /* ignore */ }
    return NextResponse.json({ conflict: true, current }, { status: 409 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
