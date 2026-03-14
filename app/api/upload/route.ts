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
    } else {
      return NextResponse.json({ error: '不支持的文件格式' }, { status: 400 })
    }

    if (sentences.length === 0) {
      return NextResponse.json({ error: '無法從文件中提取句子' }, { status: 400 })
    }

    return NextResponse.json({ sentences })
  } catch (error) {
    console.error('Error processing file:', error)
    return NextResponse.json({ error: '處理文件時出錯' }, { status: 500 })
  }
}
