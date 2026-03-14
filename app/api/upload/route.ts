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

async function parseEpub(buffer: Buffer): Promise<string> {
  const tmpPath = join('/tmp', `epub-${randomUUID()}.epub`)
  writeFileSync(tmpPath, buffer)
  return new Promise<string>((resolve, reject) => {
    const epub = new EPub(tmpPath)
    
    epub.on('error', (err: Error) => {
      reject(err)
    })

    epub.on('end', () => {
      const chapters: string[] = []
      const flow = epub.flow

      let processed = 0
      const total = flow.length

      if (total === 0) {
        resolve('')
        return
      }

      flow.forEach((chapter: any) => {
        epub.getChapter(chapter.id, (err: Error, text?: string) => {
          if (err) {
            reject(err)
            return
          }

          const cleanText = (text ?? '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim()

          chapters.push(cleanText)
          processed++

          if (processed === total) {
            resolve(chapters.join(' '))
          }
        })
      })
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
      return NextResponse.json(
        { error: '沒有上傳文件' },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = file.name.toLowerCase()
    let text = ''

    if (fileName.endsWith('.txt')) {
      text = buffer.toString('utf-8')
    } else if (fileName.endsWith('.epub')) {
      text = await parseEpub(buffer)
    } else {
      return NextResponse.json(
        { error: '不支持的文件格式' },
        { status: 400 }
      )
    }

    const sentences = splitIntoSentences(text)

    if (sentences.length === 0) {
      return NextResponse.json(
        { error: '無法從文件中提取句子' },
        { status: 400 }
      )
    }

    return NextResponse.json({ sentences })
  } catch (error) {
    console.error('Error processing file:', error)
    return NextResponse.json(
      { error: '處理文件時出錯' },
      { status: 500 }
    )
  }
}
