import { NextRequest, NextResponse } from 'next/server'

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY_PREFIX = 'msw:'
const TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

async function redis(command: unknown[]) {
  const res = await fetch(REDIS_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  })
  return res.json()
}

export async function POST(request: NextRequest) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return NextResponse.json({ error: '伺服器尚未設定同步功能' }, { status: 503 })
  }
  try {
    const body = await request.json()
    const value = JSON.stringify(body)

    // Find a free 4-digit PIN
    let pin = ''
    for (let i = 0; i < 20; i++) {
      const candidate = String(Math.floor(1000 + Math.random() * 9000))
      const existing = await redis(['GET', KEY_PREFIX + candidate])
      if (!existing.result) { pin = candidate; break }
    }
    if (!pin) return NextResponse.json({ error: '暫時無法生成同步碼，請稍後再試' }, { status: 503 })

    await redis(['SET', KEY_PREFIX + pin, value, 'EX', TTL_SECONDS])
    return NextResponse.json({ code: pin })
  } catch (error) {
    console.error('Sync upload error:', error)
    return NextResponse.json({ error: '上傳失敗' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return NextResponse.json({ error: '伺服器尚未設定同步功能' }, { status: 503 })
  }
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: '缺少同步碼' }, { status: 400 })
  try {
    const result = await redis(['GET', KEY_PREFIX + code])
    if (!result.result) return NextResponse.json({ error: '找不到數據，請確認同步碼是否正確' }, { status: 404 })
    return NextResponse.json(JSON.parse(result.result))
  } catch {
    return NextResponse.json({ error: '下載失敗' }, { status: 500 })
  }
}
