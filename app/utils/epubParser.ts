// 【瀏覽器端 EPUB 解析器】
// EPUB 本質就是 ZIP，用 JSZip 在瀏覽器直接解析，避免 Vercel 4.5MB 上傳限制。
// 邏輯對齊 app/api/upload/route.ts 的 processChapter。

import JSZip from 'jszip'

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
async function getImageBase64FromZip(
  zip: JSZip,
  href: string,
  basePath: string
): Promise<string | null> {
  // 嘗試幾個常見路徑
  const candidates = [
    href,
    `${basePath}/${href}`,
    href.replace(/^\.\.\//, ''),
    href.replace(/^\//, ''),
  ]
  for (const path of candidates) {
    const file = zip.file(path) ?? zip.file(decodeURIComponent(path))
    if (file) {
      const blob = await file.async('blob')
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }
  }
  return null
}

// ── 處理單個章節 HTML ──
async function processChapter(
  chapterHtml: string,
  zip: JSZip,
  basePath: string
): Promise<string[]> {
  const items: string[] = []
  const imgRegex = /<img[^>]*>/gi

  const parts = chapterHtml.split(imgRegex)
  const imgTags: string[] = []
  let m: RegExpExecArray | null
  const re = /<img[^>]*>/gi
  while ((m = re.exec(chapterHtml)) !== null) imgTags.push(m[0])

  for (let i = 0; i < parts.length; i++) {
    let cleanedText = cleanHtmlText(parts[i])

    // 圖片後的孤立開頭標點：合併回前一個文字句
    if (i > 0) {
      const leadMatch = cleanedText.match(/^([.!?。！？;；]+)/)
      if (leadMatch) {
        const ti = lastTextIdx(items)
        if (ti >= 0) items[ti] = items[ti].trimEnd() + leadMatch[1]
        cleanedText = cleanedText.slice(leadMatch[0].length).trimStart()
      }
    }

    const newSentences = splitIntoSentences(cleanedText)

    // 即將插入圖片：若最後一句無標點且足夠短（≤15字），在本批內合併
    if (i < imgTags.length && newSentences.length >= 2) {
      const last = newSentences[newSentences.length - 1]
      const hasPunct = /[.!?。！？;；,，:：]$/.test(last)
      if (!hasPunct && last.length <= 15) {
        newSentences[newSentences.length - 2] = newSentences[newSentences.length - 2].trimEnd() + last
        newSentences.pop()
      }
    }
    items.push(...newSentences)

    if (i < imgTags.length) {
      const srcMatch = imgTags[i].match(/src=["']([^"']+)["']/i)
      const altMatch = imgTags[i].match(/alt=["']([^"']*?)["']/i)
      const altText = altMatch ? altMatch[1].trim() : ''
      const isFootnoteIcon = /qqreader-footnote/i.test(imgTags[i])

      if (isFootnoteIcon && altText.length > 3) {
        items.push(`data:image/annotation;charset=utf-8,${encodeURIComponent(altText)}`)
      } else if (srcMatch) {
        const dataUrl = await getImageBase64FromZip(zip, srcMatch[1], basePath)
        if (dataUrl) items.push(dataUrl)
      }
    }
  }
  return items
}

// ── 主入口：解析整本 EPUB ──
export async function parseEpubClientSide(
  file: File,
  onProgress?: (msg: string) => void
): Promise<{ sentences: string[]; coverImage: string | null }> {
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
  const coverEntry = coverId && manifest[coverId]
    ? manifest[coverId]
    : Object.values(manifest).find(
        (item) =>
          item.mediaType?.startsWith('image/') &&
          (item.href.toLowerCase().includes('cover'))
      )
  if (coverEntry) {
    const coverPath = basePath ? `${basePath}/${coverEntry.href}` : coverEntry.href
    const coverFile = zip.file(coverPath) ?? zip.file(decodeURIComponent(coverPath))
    if (coverFile) {
      const blob = await coverFile.async('blob')
      coverImage = await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }
  }

  // 5. 逐章處理
  const allItems: string[] = []
  const total = spineItems.length
  for (let idx = 0; idx < spineItems.length; idx++) {
    const idref = spineItems[idx]
    const entry = manifest[idref]
    if (!entry) continue
    if (!entry.mediaType.includes('html') && !entry.mediaType.includes('xml') && !entry.href.match(/\.(html|xhtml|htm)$/i)) continue

    onProgress?.(`解析章節 ${idx + 1} / ${total}...`)
    const chapterPath = basePath ? `${basePath}/${entry.href}` : entry.href
    const chapterFile = zip.file(chapterPath) ?? zip.file(decodeURIComponent(chapterPath))
    if (!chapterFile) continue
    const html = await chapterFile.async('string')
    const items = await processChapter(html, zip, basePath)
    allItems.push(...items)
  }

  return { sentences: allItems, coverImage }
}
