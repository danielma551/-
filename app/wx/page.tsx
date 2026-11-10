'use client'

// 【📥 微信文章收入書架】/wx
// 貼上一條 mp.weixin.qq.com 文章連結 → 伺服器抽出標題／公眾號／日期／正文＋圖片 →
// 預覽後加入書架；同一個公眾號會自動加入同一本書，每篇一章。

import { useEffect, useMemo, useState } from 'react'
import { BookData, generateBookId, isAudioBook } from '../utils/storage'
import { getAllBooksFromIDB, saveBookToIDB } from '../utils/bookDB'
import { splitIntoSentences, PARA_SEP } from '../utils/epubParser'

type Block = { type: 'text'; text: string } | { type: 'image'; src: string }
interface WxData {
  title: string
  account: string
  date: string
  url: string
  blocks: Block[]
  imageCount: number
  textChars: number
}

const LAST_KEY = 'import-last-book'

function shortDate(d: string): string {
  const m = d.match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})/)
  return m ? `${Number(m[2])}月${Number(m[3])}日` : ''
}

// 區塊 → 句子：文字分句、圖片用 img: 前綴，段落之間加 PARA_SEP
function blocksToSentences(blocks: Block[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    if (b.type === 'image') { out.push('img:' + b.src); continue }
    const ss = splitIntoSentences(b.text)
    if (!ss.length) continue
    if (out.length) out.push(PARA_SEP)
    out.push(...ss)
  }
  return out
}

export default function WxImportPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<WxData | null>(null)
  const [err, setErr] = useState('')
  const [books, setBooks] = useState<BookData[]>([])
  const [target, setTarget] = useState('new')
  const [newName, setNewName] = useState('')
  const [chapter, setChapter] = useState('')
  const [done, setDone] = useState<{ id: string; n: number; chapter: string; append: boolean } | null>(null)

  const loadBooks = () => getAllBooksFromIDB().then(all => {
    const list = all.filter(b => !isAudioBook(b) && b.id !== 'daily-review').sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0))
    setBooks(list)
  })
  useEffect(() => { loadBooks() }, [])

  const sentences = useMemo(() => data ? blocksToSentences(data.blocks) : [], [data])
  const realCount = sentences.filter(s => s !== PARA_SEP).length
  const targetBook = books.find(b => b.id === target)
  const dupChapter = !!targetBook?.chapters?.some(c => c.title === chapter.trim())

  const fetchArticle = async () => {
    const u = url.trim()
    if (!u) return
    setErr(''); setLoading(true); setDone(null)
    try {
      const res = await fetch(`/api/wx?url=${encodeURIComponent(u)}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || '讀取失敗')
      const d = j as WxData
      if (!d.blocks?.length) throw new Error('文章冇內容')
      setData(d)
      setChapter(`${shortDate(d.date)}${d.date ? ' · ' : ''}${d.title}`.trim())
      setNewName(d.account || d.title)
      const hit = books.find(b => b.title === (d.account || ''))
      setTarget(hit ? hit.id : 'new')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '讀取失敗')
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setErr('')
    const ch = chapter.trim() || '未命名'
    if (!sentences.length) { setErr('冇內容可以加'); return }
    try {
      const now = Date.now()
      if (target === 'new') {
        const name = newName.trim() || ch
        const id = generateBookId(name)
        const book: BookData = { id, title: name, sentences, currentIndex: 0, uploadDate: now, lastReadDate: now, chapters: [{ title: ch, startIndex: 0 }] }
        await saveBookToIDB(book)
        localStorage.setItem(LAST_KEY, id)
        setDone({ id, n: realCount, chapter: ch, append: false })
        loadBooks()
      } else {
        const b = books.find(x => x.id === target)
        if (!b) { setErr('搵唔到嗰本書'); return }
        const start = b.sentences.length + (b.sentences.length ? 1 : 0)
        const chapters = b.chapters?.length ? [...b.chapters] : [{ title: b.title, startIndex: 0 }]
        const updated: BookData = {
          ...b,
          sentences: b.sentences.length ? [...b.sentences, PARA_SEP, ...sentences] : sentences,
          chapters: [...chapters, { title: ch, startIndex: start }],
          lastReadDate: now,
        }
        await saveBookToIDB(updated)
        localStorage.setItem(LAST_KEY, b.id)
        setDone({ id: b.id, n: realCount, chapter: ch, append: true })
        loadBooks()
      }
    } catch (e) {
      console.error(e); setErr('儲存失敗（可能係瀏覽器空間不足）')
    }
  }

  const previewImgs = data?.blocks.filter(b => b.type === 'image').slice(0, 6) as { type: 'image'; src: string }[] | undefined

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-700">← 書架</a>
          <h1 className="text-lg font-bold text-gray-800">📥 微信文章收入書架</h1>
          <span className="w-10" />
        </div>

        {done ? (
          <div className="rounded-2xl bg-white border border-emerald-200 shadow-sm p-6 text-center">
            <div className="text-4xl mb-2">✅</div>
            <p className="font-semibold text-gray-800">{done.append ? '已加入做新章節' : '已變成新書'}</p>
            <p className="text-sm text-gray-500 mt-1">「{done.chapter}」· {done.n} 頁（文字＋圖）</p>
            <div className="flex gap-2 justify-center mt-5">
              <a href={`/?open=${encodeURIComponent(done.id)}`} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">去讀 📖</a>
              <button onClick={() => { setDone(null); setData(null); setUrl('') }} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">再加一篇</button>
            </div>
          </div>
        ) : data ? (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-800 leading-snug">{data.title}</p>
              <p className="text-xs text-gray-400 mt-1">{data.account}{data.date ? ` · ${data.date.replace(/\s+\d{1,2}:\d{2}.*$/, '')}` : ''} · {data.textChars} 字 · {data.imageCount} 張圖</p>
            </div>

            {previewImgs && previewImgs.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {previewImgs.map((b, i) => (
                  <img key={i} src={b.src} referrerPolicy="no-referrer" alt="" className="h-20 rounded-lg border border-gray-100 object-cover flex-shrink-0" />
                ))}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-500">章節／標題</label>
              <input value={chapter} onChange={e => setChapter(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">加入去</label>
              <select value={target} onChange={e => setTarget(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400">
                <option value="new">➕ 新書</option>
                {books.map(b => <option key={b.id} value={b.id}>📘 {b.title}（{b.chapters?.length || 1} 章）</option>)}
              </select>
              {target === 'new' && (
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="新書名（例如公眾號名）"
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400" />
              )}
              {dupChapter && <p className="text-xs text-amber-600 mt-1">⚠️ 呢本書已經有同名章節，可能加過咗</p>}
            </div>

            <p className="text-xs text-gray-500">{realCount} 頁（文字＋圖），閱讀器會逐頁顯示。</p>
            {err && <p className="text-sm text-red-500">{err}</p>}
            <button onClick={save} disabled={!sentences.length} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40">
              {target === 'new' ? '📚 變成新書' : '➕ 加入做新章節'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <p className="font-semibold text-gray-800 mb-1">貼上微信文章連結</p>
              <p className="text-xs text-gray-500 mb-3">支援 mp.weixin.qq.com。文字同圖片會一齊收入，同一個公眾號自動合併成一本書。</p>
              <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') fetchArticle() }}
                placeholder="https://mp.weixin.qq.com/s/…"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400" />
              <button onClick={fetchArticle} disabled={loading || !url.trim()} className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40">
                {loading ? '讀取中…' : '讀取文章 →'}
              </button>
              {err && <p className="text-sm text-red-500 mt-3">{err}</p>}
            </div>
            <p className="text-[11px] text-gray-400 text-center">🔒 只會讀你貼嘅公開文章，內容只存喺呢部機。</p>
          </div>
        )}
      </div>
    </main>
  )
}
