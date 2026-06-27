// 【瀏覽器端 EPUB 解析器】
// EPUB 本質就是 ZIP，用 JSZip 在瀏覽器直接解析，避免 Vercel 4.5MB 上傳限制。
// 邏輯對齊 app/api/upload/route.ts 的 processChapter。

import JSZip from 'jszip'

// ── 路徑解析：將相對路徑 href 根據當前文件路徑 fromPath 解析為絕對 ZIP 路徑 ──
// 例：fromPath="OEBPS/Text/ch1.xhtml", href="../Images/img.jpg"
//    → "OEBPS/Images/img.jpg"
function resolvePath(fromPath: string, href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  if (href.startsWith('/')) return href.slice(1)

  // 取 fromPath 的目錄部分
  const dir = fromPath.includes('/') ? fromPath.split('/').slice(0, -1) : []
  const parts = href.split('/')

  for (const part of parts) {
    if (part === '..') {
      dir.pop()
    } else if (part !== '.') {
      dir.push(part)
    }
  }
  return dir.join('/')
}

// 段落分隔符：插入 sentences[] 以標記原書段落邊界
// 值罕見於正文，導航時跳過，不顯示給用戶
export const PARA_SEP = ' '

// ── 句子切分（與 server 端一致）──
function splitIntoSentences(text: string): string[] {
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []

  const sentenceRegex = /[^.!?。！？;；,，:：]+[.!?。！？;；,，:：]+/g
  const results: string[] = []
  let lastEnd = 0
  let m: RegExpExecArray | null
  while ((m = sentenceRegex.exec(cleaned)) !== null) {
    results.push(m[0])
    lastEnd = m.index + m[0].length
  }
  const trail = cleaned.slice(lastEnd).trim()
  if (trail) results.push(trail)
  if (results.length === 0) return [cleaned]
  return results.map(s => s.trim()).filter(s => s.length > 0)
}

// ── HTML 清理（與 server 端一致）──
function cleanHtmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[​-‍﻿­]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── 最後一個非圖片 item 的 index ──
function lastTextIdx(items: string[]): number {
  for (let j = items.length - 1; j >= 0; j--) {
    if (!items[j].startsWith('data:image/')) return j
  }
  return -1
}

// ── 從 ZIP 中讀圖片並轉 base64 data URL ──
// resolvedPath：已根據章節文件位置解析好的 ZIP 內路徑
const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp',
}

async function getImageBase64FromZip(
  zip: JSZip,
  resolvedPath: string
): Promise<string | null> {
  const file =
    zip.file(resolvedPath) ??
    zip.file(decodeURIComponent(resolvedPath))
  if (!file) return null

  const ext = resolvedPath.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = MIME_MAP[ext] ?? 'image/jpeg'
  const base64 = await file.async('base64')
  return `data:${mimeType};base64,${base64}`
}

// ── 處理單個章節 HTML ──
// chapterPath：該章節在 ZIP 內的完整路徑（用於解析圖片相對路徑）
async function processChapter(
  chapterHtml: string,
  zip: JSZip,
  chapterPath: string
): Promise<string[]> {
  const items: string[] = []

  const parts = chapterHtml.split(/<img[^>]*>/gi)
  const imgTags: string[] = []
  let m: RegExpExecArray | null
  const re = /<img[^>]*>/gi
  while ((m = re.exec(chapterHtml)) !== null) imgTags.push(m[0])

  for (let i = 0; i < parts.length; i++) {
    // 按 </p> 切割取得段落列表，保留原書段落結構
    const pBlocks = parts[i].split(/<\/p>/gi)
    let isFirstBlockInPart = true

    for (let pi = 0; pi < pBlocks.length; pi++) {
      let cleanedText = cleanHtmlText(pBlocks[pi])

      // 圖片後第一個 block 的孤立開頭標點：合併回前一個文字句
      if (i > 0 && isFirstBlockInPart) {
        const leadMatch = cleanedText.match(/^([.!?。！？;；]+)/)
        if (leadMatch) {
          const ti = lastTextIdx(items)
          if (ti >= 0) items[ti] = items[ti].trimEnd() + leadMatch[1]
          cleanedText = cleanedText.slice(leadMatch[0].length).trimStart()
        }
      }

      const newSentences = splitIntoSentences(cleanedText)
      if (newSentences.length === 0) continue

      // 在非首個非空段落前插入段落分隔符
      if (!isFirstBlockInPart && items.length > 0 && items[items.length - 1] !== PARA_SEP) {
        items.push(PARA_SEP)
      }

      // 即將插入圖片：若最後一句無標點且足夠短（≤15字），在本批內合併
      if (pi === pBlocks.length - 1 && i < imgTags.length && newSentences.length >= 2) {
        const last = newSentences[newSentences.length - 1]
        const hasPunct = /[.!?。！？;；,，:：]$/.test(last)
        if (!hasPunct && last.length <= 15) {
          newSentences[newSentences.length - 2] = newSentences[newSentences.length - 2].trimEnd() + last
          newSentences.pop()
        }
      }
      items.push(...newSentences)
      isFirstBlockInPart = false
    }

    if (i < imgTags.length) {
      const srcMatch = imgTags[i].match(/src=["']([^"']+)["']/i)
      const altMatch = imgTags[i].match(/alt=["']([^"']*?)["']/i)
      const altText = altMatch ? altMatch[1].trim() : ''
      const isFootnoteIcon = /qqreader-footnote/i.test(imgTags[i])

      if (isFootnoteIcon && altText.length > 3) {
        items.push(`data:image/annotation;charset=utf-8,${encodeURIComponent(altText)}`)
      } else if (srcMatch) {
        // 相對於章節文件位置解析圖片路徑
        const imgPath = resolvePath(chapterPath, srcMatch[1])
        const dataUrl = await getImageBase64FromZip(zip, imgPath)
        if (dataUrl) items.push(dataUrl)
      }
    }
  }
  return items
}

// ── 從 HTML 萃取第一個標題文字（h1/h2/h3/title 標籤）──
function extractHeading(html: string): string | null {
  const headingMatch = html.match(/<(?:h[123]|title)[^>]*>([\s\S]*?)<\/(?:h[123]|title)>/i)
  if (!headingMatch) return null
  const text = headingMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > 1 && text.length < 80 ? text : null
}

// ── 主入口：解析整本 EPUB ──
export async function parseEpubClientSide(
  file: File,
  onProgress?: (msg: string) => void
): Promise<{ sentences: string[]; coverImage: string | null; chapters: { title: string; startIndex: number }[] }> {
  onProgress?.('解壓縮 EPUB...')
  const zip = await JSZip.loadAsync(file)

  // 1. 找 container.xml → OPF 路徑
  const containerXml = await zip.file('META-INF/container.xml')?.async('string')
  if (!containerXml) throw new Error('無法讀取 META-INF/container.xml')

  const opfMatch = containerXml.match(/full-path=["']([^"']+)["']/i)
  if (!opfMatch) throw new Error('無法找到 OPF 文件路徑')
  const opfPath = opfMatch[1]
  const basePath = opfPath.includes('/') ? opfPath.split('/').slice(0, -1).join('/') : ''

  onProgress?.('讀取書籍目錄...')
  const opfContent = await zip.file(opfPath)?.async('string')
  if (!opfContent) throw new Error('無法讀取 OPF 文件')

  // 2. 解析 manifest（id → href, media-type）
  const manifest: Record<string, { href: string; mediaType: string }> = {}
  const manifestRegex = /<item\s[^>]*>/gi
  let mItem: RegExpExecArray | null
  while ((mItem = manifestRegex.exec(opfContent)) !== null) {
    const tag = mItem[0]
    const idM = tag.match(/\bid=["']([^"']+)["']/)
    const hrefM = tag.match(/\bhref=["']([^"']+)["']/)
    const typeM = tag.match(/\bmedia-type=["']([^"']+)["']/)
    if (idM && hrefM) {
      manifest[idM[1]] = {
        href: hrefM[1],
        mediaType: typeM?.[1] ?? '',
      }
    }
  }

  // 3. 解析 spine（章節順序）
  const spineItems: string[] = []
  const spineRegex = /<itemref\s[^>]*idref=["']([^"']+)["'][^>]*/gi
  let mSpine: RegExpExecArray | null
  while ((mSpine = spineRegex.exec(opfContent)) !== null) {
    spineItems.push(mSpine[1])
  }

  // 4. 封面圖片
  onProgress?.('提取封面...')
  let coverImage: string | null = null
  const coverIdMatch = opfContent.match(/name=["']cover["'][^>]*content=["']([^"']+)["']/i)
    ?? opfContent.match(/content=["']([^"']+)["'][^>]*name=["']cover["']/i)
  const coverId = coverIdMatch?.[1]
  const coverEntry = (coverId && manifest[coverId])
    ? manifest[coverId]
    : Object.values(manifest).find(
        (item) =>
          item.mediaType?.startsWith('image/') &&
          item.href.toLowerCase().includes('cover')
      )
  if (coverEntry) {
    const coverPath = basePath ? `${basePath}/${coverEntry.href}` : coverEntry.href
    const coverFile = zip.file(coverPath) ?? zip.file(decodeURIComponent(coverPath))
    if (coverFile) {
      const ext = coverPath.split('.').pop()?.toLowerCase() ?? ''
      const mimeType = MIME_MAP[ext] ?? 'image/jpeg'
      const base64 = await coverFile.async('base64')
      coverImage = `data:${mimeType};base64,${base64}`
    }
  }

  // 5. 逐章處理（傳入完整 chapterPath 讓圖片路徑能正確解析）
  const allItems: string[] = []
  const chapterMarks: { title: string; startIndex: number }[] = []
  const total = spineItems.length
  for (let idx = 0; idx < spineItems.length; idx++) {
    const idref = spineItems[idx]
    const entry = manifest[idref]
    if (!entry) continue
    if (
      !entry.mediaType.includes('html') &&
      !entry.mediaType.includes('xml') &&
      !entry.href.match(/\.(html|xhtml|htm)$/i)
    ) continue

    onProgress?.(`解析章節 ${idx + 1} / ${total}...`)
    const chapterPath = basePath ? `${basePath}/${entry.href}` : entry.href
    const chapterFile = zip.file(chapterPath) ?? zip.file(decodeURIComponent(chapterPath))
    if (!chapterFile) continue
    const html = await chapterFile.async('string')

    // 從 HTML 提取章節標題
    const heading = extractHeading(html)
    if (heading) {
      chapterMarks.push({ title: heading, startIndex: allItems.length })
    }

    // 傳入 chapterPath，讓 processChapter 能用 resolvePath 解析圖片
    const items = await processChapter(html, zip, chapterPath)
    allItems.push(...items)
  }

  // 章節數量過多（每個 xhtml 都有標題）時，合併重複、過短的標題
  const chapters = chapterMarks.length > 1 ? chapterMarks : []

  return { sentences: allItems, coverImage, chapters }
}
