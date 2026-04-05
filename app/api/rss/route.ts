// 【RSS 抓取 API】
// 這個文件負責：伺服器端抓取 RSS Feed 並解析成文章列表。
// 之所以在伺服器端做，是為了繞過瀏覽器的 CORS 限制。
// GET /api/rss?url=<RSS網址>  → 回傳文章列表
// GET /api/rss?url=<文章網址>&type=article → 抓取文章正文並回傳句子陣列

import { NextRequest, NextResponse } from 'next/server'

// 把 HTML 字串去掉所有標籤，只留純文字
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// 把純文字切成句子陣列（與上傳路由的分句邏輯保持一致）
function splitIntoSentences(text: string): string[] {
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const sentenceRegex = /[^.!?。！？;；,，:：]+[.!?。！？;；,，:：]+/g
  const sentences = cleaned.match(sentenceRegex) || []

  if (sentences.length === 0 && cleaned.length > 0) {
    return [cleaned]
  }

  return sentences
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

// 從 RSS XML 字串中取出特定標籤的內容
function getTagContent(xml: string, tag: string): string {
  // 同時支援 <tag>內容</tag> 和 CDATA <tag><![CDATA[內容]]></tag>
  const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
  if (cdataMatch) return cdataMatch[1].trim()
  const plainMatch = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return plainMatch ? plainMatch[1].trim() : ''
}

// 把 RSS pubDate 字串轉成「X 天前」或「今天」的顯示文字
function formatPubDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff < 7) return `${diff} 天前`
  return date.toLocaleDateString('zh-TW')
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  const type = searchParams.get('type') // 'feed' 或 'article'

  if (!url) {
    return NextResponse.json({ error: '缺少 url 參數' }, { status: 400 })
  }

  try {
    // 抓取目標網址，設定合理的 timeout 和 User-Agent
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReadingBot/1.0)' },
      signal: AbortSignal.timeout(120000)
    })

    if (!res.ok) {
      return NextResponse.json({ error: `抓取失敗：HTTP ${res.status}` }, { status: 502 })
    }

    const text = await res.text()

    // 如果是抓取文章正文（type=article）
    if (type === 'article') {
      const plain = stripHtml(text)
      const sentences = splitIntoSentences(plain)
      return NextResponse.json({ sentences })
    }

    // 預設：解析 RSS / Atom Feed
    // 同時支援 RSS 2.0 的 <item> 和 Atom 的 <entry>
    const itemPattern = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi
    const articles: { title: string; link: string; date: string; summary: string; content: string }[] = []

    let match
    while ((match = itemPattern.exec(text)) !== null && articles.length < 50) {
      const block = match[1]

      // 取標題
      const title = stripHtml(getTagContent(block, 'title')) || '（無標題）'

      // 取連結：RSS 2.0 用 <link>，Atom 用 <link href="...">
      let link = getTagContent(block, 'link')
      if (!link) {
        const hrefMatch = block.match(/<link[^>]+href="([^"]+)"/)
        link = hrefMatch ? hrefMatch[1] : ''
      }

      // 取發布日期：RSS 2.0 用 pubDate，Atom 用 published 或 updated
      const date = formatPubDate(
        getTagContent(block, 'pubDate') ||
        getTagContent(block, 'published') ||
        getTagContent(block, 'updated')
      )

      // 取完整正文：優先用 content:encoded / content，其次 description / summary
      const rawContent =
        getTagContent(block, 'content:encoded') ||
        getTagContent(block, 'content') ||
        getTagContent(block, 'description') ||
        getTagContent(block, 'summary')
      const plainContent = stripHtml(rawContent)
      const summary = plainContent.slice(0, 120) + (plainContent.length > 120 ? '…' : '')

      if (title && link) {
        articles.push({ title, link, date, summary, content: plainContent })
      }
    }

    // 取 Feed 標題
    const feedTitle = stripHtml(getTagContent(text, 'title')) || url

    return NextResponse.json({ feedTitle, articles })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知錯誤'
    return NextResponse.json({ error: `抓取失敗：${msg}` }, { status: 502 })
  }
}
