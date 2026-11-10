// 【微信文章收入】GET /api/wx?url=https://mp.weixin.qq.com/s/...
// 伺服器抓一篇微信公眾號文章，抽出標題／公眾號／日期／正文段落＋圖片（保留順序）。
// 只接受 mp.weixin.qq.com，避免被當成任意網址代理。

import { NextRequest, NextResponse } from 'next/server'

type Block = { type: 'text'; text: string } | { type: 'image'; src: string }

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, '&')
}

function stripTags(html: string): string {
  const s = decodeEntities(html.replace(/<[^>]+>/g, ' '))
  return s.replace(/\s{2,}/g, ' ').trim()
}

const JUNK = /^(预览时标签不可点|微信扫一扫|继续滑动看下一个|向上滑动看下一个|使用完整服务|知道了|取消|允许|长按识别|关注该公众号|点击上方|阅读原文|分享|收藏|赞|在看)$/

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get('url')?.trim() || ''
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: '網址格式不正確' }, { status: 400 })
  }
  if (target.hostname !== 'mp.weixin.qq.com') {
    return NextResponse.json({ error: '只支援 mp.weixin.qq.com 文章連結' }, { status: 400 })
  }

  try {
    const res = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ error: `抓取失敗：HTTP ${res.status}` }, { status: 502 })
    const html = await res.text()

    const pick = (re: RegExp) => {
      const m = html.match(re)
      return m ? m[1].trim() : ''
    }
    const title = stripTags(pick(/<meta property="og:title" content="([^"]*)"/i)) ||
      stripTags(pick(/id="activity-name"[^>]*>([\s\S]*?)<\/(?:h1|div)>/i)) || '（無標題）'
    const account = stripTags(pick(/id="js_name"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/i))
    const date = decodeEntities(pick(/var createTime = ['"]([^'"]+)['"]/i) || pick(/id="publish_time"[^>]*>([^<]*)</i))

    const start = html.indexOf('id="js_content"')
    if (start < 0) {
      return NextResponse.json({ error: '搵唔到文章正文。可能係圖片分享、已被刪除，或者微信要求驗證。' }, { status: 422 })
    }
    const bodyStart = html.indexOf('>', start) + 1
    const scriptAt = html.indexOf('<script', bodyStart)
    let body = html.slice(bodyStart, scriptAt > 0 ? scriptAt : undefined)
    body = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|section|div|li|h[1-6]|blockquote)>/gi, '\n')

    const blocks: Block[] = []
    const seenImg = new Set<string>()
    for (const part of body.split(/(<img\b[^>]*>)/i)) {
      if (/^<img\b/i.test(part)) {
        const srcM = part.match(/data-src="([^"]+)"/i) || part.match(/\bsrc="([^"]+)"/i)
        if (!srcM) continue
        const src = decodeEntities(srcM[1])
        if (!/^https?:\/\//i.test(src) || seenImg.has(src)) continue
        const w = Number((part.match(/data-w="(\d+)"/i) || [])[1] || 0)
        if (w && w < 100) continue // 表情／細圖
        seenImg.add(src)
        blocks.push({ type: 'image', src })
        continue
      }
      const text = decodeEntities(part.replace(/<[^>]+>/g, ' '))
      for (const line of text.split('\n')) {
        const t = line.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s{2,}/g, ' ').trim()
        if (!t || JUNK.test(t)) continue
        blocks.push({ type: 'text', text: t })
      }
    }

    // 去掉頭尾多餘空段
    while (blocks.length) {
      const b = blocks[0]
      if (b.type !== 'text' || b.text.length >= 2) break
      blocks.shift()
    }
    while (blocks.length) {
      const b = blocks[blocks.length - 1]
      if (b.type !== 'text' || b.text.length >= 2) break
      blocks.pop()
    }

    const textChars = blocks.reduce((n, b) => n + (b.type === 'text' ? b.text.length : 0), 0)
    if (textChars === 0 && !blocks.some(b => b.type === 'image')) {
      return NextResponse.json({ error: '文章冇可讀內容（可能係純影片或需要微信內打開）' }, { status: 422 })
    }

    return NextResponse.json({
      title,
      account,
      date,
      url: target.toString(),
      blocks,
      imageCount: blocks.filter(b => b.type === 'image').length,
      textChars,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知錯誤'
    return NextResponse.json({ error: `抓取失敗：${msg}` }, { status: 502 })
  }
}
