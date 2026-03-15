import { NextRequest, NextResponse } from 'next/server'
import EPub from 'epub2'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

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

function cleanHtmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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
    items.push(...splitIntoSentences(cleanHtmlText(parts[i])))
    if (i < imgTags.length) {
      const srcMatch = imgTags[i].match(/src=["']([^"']+)["']/i)
      if (srcMatch) {
        const dataUrl = await getImageBase64(epub, srcMatch[1])
        if (dataUrl) items.push(dataUrl)
      }
    }
  }
  return items
}

async function parsePdf(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as any
  // Set absolute workerSrc so pdfjs can find the file at runtime (included via vercel.json includeFiles)
  const workerPath = join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`

  const cmapUrl = join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/')
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), cMapUrl: cmapUrl, cMapPacked: true }).promise

  // Fast path: text-based PDF
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

  // OCR path: image-based PDF (e.g. scanned books)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas } = require('@napi-rs/canvas') as { createCanvas: (w: number, h: number) => { getContext: (t: string) => unknown; toBuffer: (fmt: string) => Buffer } }
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

async function parseEpub(buffer: Buffer): Promise<string[]> {
  const tmpPath = join('/tmp', `epub-${randomUUID()}.epub`)
  writeFileSync(tmpPath, buffer)
  return new Promise<string[]>((resolve, reject) => {
    const epub = new EPub(tmpPath)
    epub.on('error', reject)
    epub.on('end', async () => {
      try {
        const allItems: string[] = []
        for (const chapter of epub.flow) {
          const items = await processChapter(epub, chapter.id as string)
          allItems.push(...items)
        }
        resolve(allItems)
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

    if (fileName.endsWith('.txt')) {
      sentences = splitIntoSentences(buffer.toString('utf-8'))
    } else if (fileName.endsWith('.epub')) {
      sentences = await parseEpub(buffer)
    } else if (fileName.endsWith('.pdf')) {
      sentences = await parsePdf(buffer)
    } else {
      return NextResponse.json({ error: '不支持的文件格式' }, { status: 400 })
    }

    if (sentences.length === 0) {
      return NextResponse.json({ error: '無法從文件中提取句子' }, { status: 400 })
    }

    return NextResponse.json({ sentences })
  } catch (error) {
    console.error('Error processing file:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `處理文件時出錯: ${msg}` }, { status: 500 })
  }
}
