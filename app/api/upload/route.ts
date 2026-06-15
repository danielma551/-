// 【書籍上傳處理】
// 這個文件負責：當用戶上傳一本書時，讀取檔案內容並切分成一句一句回傳。
// 支援三種格式：
//   - TXT：最簡單，直接按標點切句。
//   - EPUB：電子書格式，拆解章節內容與圖片。
//   - PDF：先嘗試直接讀取文字；如果是掃描圖片型的 PDF，則用 OCR 技術迺識圖中文字。

import { NextRequest, NextResponse } from 'next/server'
import EPub from 'epub2'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

export const maxDuration = 300 // 5 分鐘，大檔案解析需要時間

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
  // 捕捉尾部沒有標點的碎片（e.g. 注圖前的「每周工钱一美元」）
  const trail = cleaned.slice(lastEnd).trim()
  if (trail) results.push(trail)

  if (results.length === 0) return [cleaned]
  return results.map(s => s.trim()).filter(s => s.length > 0)
}

function cleanHtmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // 清除零寬空格等不可見字符（epub 常見殘留，會被 regex 誤判為「字」）
    .replace(/[​-‍﻿­]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getChapterHTML(epub: EPub, id: string): Promise<string> {
  return new Promise((resolve, reject) => {
    epub.getChapter(id, (err: Error, text?: string) => {
      if (err) reject(err)
      else resolve(text ?? '')
    })
  })
}

function getImageBase64(epub: EPub, src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const normalizedSrc = src.replace(/^\.\.\//, '').replace(/^\//, '')
    const manifest = epub.manifest as Record<string, { id: string; href: string; mediaType: string }>
    const entry = Object.values(manifest).find((item) =>
      item.href.endsWith(normalizedSrc) ||
      normalizedSrc.endsWith(item.href) ||
      item.href.includes(normalizedSrc)
    )
    if (!entry) { resolve(null); return }
    epub.getImage(entry.id, (err: Error, data?: Buffer, mimeType?: string) => {
      if (err || !data || !mimeType) { resolve(null); return }
      resolve(`data:${mimeType};base64,${Buffer.from(data).toString('base64')}`)
    })
  })
}

// 找最後一個非圖片 item 的 index
function lastTextIdx(items: string[]): number {
  for (let j = items.length - 1; j >= 0; j--) {
    if (!items[j].startsWith('data:image/')) return j
  }
  return -1
}

async function processChapter(epub: EPub, chapterId: string): Promise<string[]> {
  const html = await getChapterHTML(epub, chapterId)
  const items: string[] = []
  const imgRegex = /<img[^>]*>/gi
  const parts = html.split(imgRegex)
  const imgTags: string[] = []
  let m: RegExpExecArray | null
  const re = /<img[^>]*>/gi
  while ((m = re.exec(html)) !== null) imgTags.push(m[0])

  for (let i = 0; i < parts.length; i++) {
    let cleanedText = cleanHtmlText(parts[i])

    // ── 圖片後的孤立開頭標點（如「。」）：合併回前一個文字句 ──
    // e.g. <img/>​<wbr/>。他有... → 「。」應屬於圖前的「每周工钱一美元」
    if (i > 0) {
      const leadMatch = cleanedText.match(/^([.!?。！？;；]+)/)
      if (leadMatch) {
        const ti = lastTextIdx(items)
        if (ti >= 0) items[ti] = items[ti].trimEnd() + leadMatch[1]
        cleanedText = cleanedText.slice(leadMatch[0].length).trimStart()
      }
    }

    const newSentences = splitIntoSentences(cleanedText)

    // ── 即將插入圖片：若最後一個新句無結尾標點且足夠短（≤15字），
    //    視為前句的尾巴，「只在本批內」合併（不跨越圖片邊界）──
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
      // 只有 epub 腳注圖示（class="qqreader-footnote"）才改存注釋文字
      // 普通章節插圖照常加載 base64，不受影響
      const isFootnoteIcon = /qqreader-footnote/i.test(imgTags[i])
      if (isFootnoteIcon && altText.length > 3) {
        items.push(`data:image/annotation;charset=utf-8,${encodeURIComponent(altText)}`)
      } else if (srcMatch) {
        const dataUrl = await getImageBase64(epub, srcMatch[1])
        if (dataUrl) items.push(dataUrl)
      }
    }
  }
  return items
}

async function parsePdf(buffer: Buffer): Promise<string[]> {
  // Node.js 環境缺少 DOMMatrix（瀏覽器 API），pdfjs 需要它，先 polyfill
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).DOMMatrix = class DOMMatrix {
      a=1;b=0;c=0;d=1;e=0;f=0
      m11=1;m12=0;m13=0;m14=0;m21=0;m22=1;m23=0;m24=0
      m31=0;m32=0;m33=1;m34=0;m41=0;m42=0;m43=0;m44=1
      is2D=true;isIdentity=true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(_init?: any) {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translate(_x?: any,_y?: any,_z?: any) { return new (globalThis as any).DOMMatrix() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scale(_x?: any,_y?: any,_z?: any) { return new (globalThis as any).DOMMatrix() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rotate(_a?: any,_b?: any,_c?: any) { return new (globalThis as any).DOMMatrix() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      multiply(_m?: any) { return new (globalThis as any).DOMMatrix() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inverse() { return new (globalThis as any).DOMMatrix() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      static fromMatrix(_m?: any) { return new (globalThis as any).DOMMatrix() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      static fromFloat32Array(_a?: any) { return new (globalThis as any).DOMMatrix() }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      static fromFloat64Array(_a?: any) { return new (globalThis as any).DOMMatrix() }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as any
  const workerPath = join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`

  const cmapUrl = join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/')
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), cMapUrl: cmapUrl, cMapPacked: true }).promise

  // 嘗試直接提取文字（文字型 PDF）
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fullText += content.items.map((item: any) => item.str ?? '').join(' ')
  }
  if (fullText.trim().length > 0) {
    return splitIntoSentences(fullText)
  }

  // 掃描圖片型 PDF：需要 OCR，嘗試用 @napi-rs/canvas + tesseract.js
  // 若 canvas 原生模組不可用，拋出清楚的錯誤提示
  let createCanvas: ((w: number, h: number) => { getContext: (t: string) => unknown; toBuffer: (fmt: string) => Buffer }) | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvasMod = require('@napi-rs/canvas')
    createCanvas = canvasMod.createCanvas
  } catch {
    throw new Error('此 PDF 為掃描圖片格式，無法直接提取文字。請改用 EPUB 或 TXT 格式上傳，或使用 Adobe Acrobat / 其他工具將其轉換為文字型 PDF。')
  }
  if (!createCanvas) {
    throw new Error('此 PDF 為掃描圖片格式，無法直接提取文字。請改用 EPUB 或 TXT 格式上傳。')
  }

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('chi_tra+chi_sim+jpn+eng', undefined, { cachePath: '/tmp' })
  const allText: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viewport = page.getViewport({ scale: 1.5 }) as any
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    const { data: { text: ocrText } } = await worker.recognize(canvas.toBuffer('image/png'))
    if (ocrText.trim()) allText.push(ocrText)
  }

  await worker.terminate()
  return splitIntoSentences(allText.join(' '))
}

// 從 EPUB manifest 裡找封面圖片並回傳 base64 data URL
async function getEpubCover(epub: EPub): Promise<string | null> {
  const manifest = epub.manifest as Record<string, { id: string; href: string; mediaType: string }>
  // 優先用 metadata.cover 欄位指定的 ID
  const coverId = (epub.metadata as Record<string, string>).cover
  if (coverId && manifest[coverId]) {
    return new Promise((resolve) => {
      epub.getImage(coverId, (err: Error, data?: Buffer, mimeType?: string) => {
        if (err || !data || !mimeType) { resolve(null); return }
        resolve(`data:${mimeType};base64,${Buffer.from(data).toString('base64')}`)
      })
    })
  }
  // 備用：找 manifest 中 id 或 href 含 'cover' 且是圖片的項目
  const coverEntry = Object.values(manifest).find(
    (item) => item.mediaType?.startsWith('image/') &&
      (item.id.toLowerCase().includes('cover') || item.href.toLowerCase().includes('cover'))
  )
  if (coverEntry) {
    return new Promise((resolve) => {
      epub.getImage(coverEntry.id, (err: Error, data?: Buffer, mimeType?: string) => {
        if (err || !data || !mimeType) { resolve(null); return }
        resolve(`data:${mimeType};base64,${Buffer.from(data).toString('base64')}`)
      })
    })
  }
  return null
}

async function parseEpub(buffer: Buffer): Promise<{ sentences: string[]; coverImage: string | null }> {
  const tmpPath = join('/tmp', `epub-${randomUUID()}.epub`)
  writeFileSync(tmpPath, buffer)
  return new Promise<{ sentences: string[]; coverImage: string | null }>((resolve, reject) => {
    const epub = new EPub(tmpPath)
    epub.on('error', reject)
    epub.on('end', async () => {
      try {
        const allItems: string[] = []
        for (const chapter of epub.flow) {
          const items = await processChapter(epub, chapter.id as string)
          allItems.push(...items)
        }
        // 提取封面圖片
        const coverImage = await getEpubCover(epub)
        resolve({ sentences: allItems, coverImage })
      } catch (err) {
        reject(err)
      }
    })
    epub.parse()
  }).finally(() => {
    try { unlinkSync(tmpPath) } catch {}
  })
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: '沒有上傳文件' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = file.name.toLowerCase()
    let sentences: string[]
    let coverImage: string | null = null

    if (fileName.endsWith('.txt')) {
      sentences = splitIntoSentences(buffer.toString('utf-8'))
    } else if (fileName.endsWith('.epub')) {
      // EPUB：同時提取句子和封面圖片
      const result = await parseEpub(buffer)
      sentences = result.sentences
      coverImage = result.coverImage
    } else if (fileName.endsWith('.pdf')) {
      sentences = await parsePdf(buffer)
    } else {
      return NextResponse.json({ error: '不支持的文件格式' }, { status: 400 })
    }

    if (sentences.length === 0) {
      return NextResponse.json({ error: '無法從文件中提取句子' }, { status: 400 })
    }

    return NextResponse.json({ sentences, coverImage })
  } catch (error) {
    console.error('Error processing file:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `處理文件時出錯: ${msg}` }, { status: 500 })
  }
}
