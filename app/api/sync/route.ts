import { NextRequest, NextResponse } from 'next/server'

const JSONBLOB_BASE = 'https://jsonblob.com/api/jsonBlob'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const response = await fetch(JSONBLOB_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) throw new Error('Store failed')
    const location = response.headers.get('X-jsonblob-id') || response.headers.get('location') || ''
    const id = location.split('/').pop() || ''
    return NextResponse.json({ code: id })
  } catch (error) {
    console.error('Sync upload error:', error)
    return NextResponse.json({ error: '上傳失敗' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: '缺少同步碼' }, { status: 400 })
  try {
    const response = await fetch(`${JSONBLOB_BASE}/${code}`)
    if (!response.ok) throw new Error('Not found')
    const data = await response.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: '找不到數據，請確認同步碼' }, { status: 404 })
  }
}
