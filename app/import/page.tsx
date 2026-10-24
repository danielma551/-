'use client'

// 【📥 網頁收入書架】/import
// 喺你睇緊嘅網頁（例如得到網頁版某一課文稿）撳書籤「📥 收入書架」→
// 抽出呢一頁嘅正文（有揀選文字就用揀選）→ 彈到呢頁預覽 → 變新書，或者加入同一門課做新章節。
// 只會抄你打開緊嗰一頁（等同自己全選複製），唔會登入或者掃描任何帳號。

import { useEffect, useMemo, useRef, useState } from 'react'
import { BookData, generateBookId, isAudioBook } from '../utils/storage'
import { getAllBooksFromIDB, saveBookToIDB } from '../utils/bookDB'
import { splitIntoSentences, PARA_SEP } from '../utils/epubParser'

interface Payload { title: string; text: string; url?: string; site?: string; pageTitle?: string }

const LAST_KEY = 'import-last-book'
const SITE = typeof window !== 'undefined' ? location.origin : 'https://myspiritworld.vercel.app'

// 書籤代碼（喺其他網站執行）
function bookmarkletCode(origin: string) {
  const src = `(function(){
var sel=String(window.getSelection()||'').trim();
function txt(e){return (e.innerText||'').replace(/\\n{3,}/g,'\\n\\n').trim()}
function pick(){
 var bad=/comment|reply|footer|nav|header|sidebar|recommend|related|menu|toolbar|share|评论|留言/i;
 var sc=new Map();
 document.querySelectorAll('p,section>div,li').forEach(function(p){
  var t=(p.innerText||'').trim(); if(t.length<12) return;
  var a=p.parentElement, w=1;
  for(var i=0;i<3&&a&&a!==document.body;i++){
   var cls=(a.className&&a.className.toString?a.className.toString():'')+' '+(a.id||'');
   if(!bad.test(cls)) sc.set(a,(sc.get(a)||0)+t.length*w);
   a=a.parentElement; w=w/2;
  }
 });
 var best=null,b=0; sc.forEach(function(v,k){if(v>b){b=v;best=k}});
 return best&&txt(best).length>80?txt(best):txt(document.body);
}
var text=sel.length>30?sel:pick();
var h=document.querySelector('h1')||document.querySelector('h2');
var d={title:((h&&h.innerText)||document.title||'').trim().slice(0,120),text:text,url:location.href,site:location.hostname,pageTitle:document.title};
var u='${origin}/import';
var w=window.open(u+'#d='+encodeURIComponent(JSON.stringify(d)),'msw_import');
var n=0,t=setInterval(function(){try{w&&w.postMessage({type:'msw-import',data:d},'${origin}')}catch(e){} if(++n>40)clearInterval(t)},300);
window.addEventListener('message',function(e){if(e.origin==='${origin}'&&e.data==='msw-import-ok')clearInterval(t)});
})();`
  return 'javascript:' + encodeURIComponent(src.replace(/\n/g, ''))
}

// 文字 → 句子（保留段落界線）
function toSentences(text: string): string[] {
  const out: string[] = []
  text.replace(/\r\n/g, '\n').split(/\n+/).map(p => p.trim()).filter(Boolean).forEach(p => {
    const s = splitIntoSentences(p)
    if (!s.length) return
    if (out.length) out.push(PARA_SEP)
    out.push(...s)
  })
  return out
}

export default function ImportPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [books, setBooks] = useState<BookData[]>([])
  const [target, setTarget] = useState<string>('new')     // 'new' 或 bookId
  const [newName, setNewName] = useState('')
  const [done, setDone] = useState<{ id: string; n: number; chapter: string; append: boolean } | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [paste, setPaste] = useState('')
  const bmRef = useRef<HTMLAnchorElement>(null)
  const got = useRef(false)

  const accept = (d: Payload) => {
    if (got.current || !d || typeof d.text !== 'string' || !d.text.trim()) return
    got.current = true
    setData(d)
    setTitle((d.title || d.pageTitle || '未命名').trim())
    setText(d.text.trim())
  }

  useEffect(() => {
    // 書籤經網址 # 帶資料（唔會傳去伺服器）
    const m = location.hash.match(/^#d=(.+)$/)
    if (m) {
      try { accept(JSON.parse(decodeURIComponent(m[1]))) } catch { /* 太長被截 → 等 postMessage */ }
      history.replaceState(null, '', location.pathname)
    }
    // 後備：postMessage
    const on = (e: MessageEvent) => {
      if (e.data?.type !== 'msw-import') return
      accept(e.data.data)
      try { (e.source as Window | null)?.postMessage('msw-import-ok', e.origin) } catch { /* ignore */ }
    }
    window.addEventListener('message', on)
    getAllBooksFromIDB().then(all => {
      const list = all.filter(b => !isAudioBook(b) && b.id !== 'daily-review').sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0))
      setBooks(list)
      const last = localStorage.getItem(LAST_KEY)
      if (last && list.some(b => b.id === last)) setTarget(last)
    })
    return () => window.removeEventListener('message', on)
  }, [])

  // React 唔准 href 直接寫 javascript:，自己設
  useEffect(() => { bmRef.current?.setAttribute('href', bookmarkletCode(SITE)) }, [])

  useEffect(() => { if (data && !newName) setNewName((data.pageTitle || title).split(/[-_|｜—]/)[0].trim() || title) }, [data])   // eslint-disable-line react-hooks/exhaustive-deps

  const sentences = useMemo(() => toSentences(text), [text])
  const targetBook = books.find(b => b.id === target)
  const dupChapter = !!targetBook?.chapters?.some(c => c.title === title.trim())

  const save = async () => {
    setErr('')
    const chapter = title.trim() || '未命名'
    if (!sentences.length) { setErr('冇內容可以加'); return }
    try {
      const now = Date.now()
      if (target === 'new') {
        const name = newName.trim() || chapter
        const id = generateBookId(name)
        const book: BookData = { id, title: name, sentences, currentIndex: 0, uploadDate: now, lastReadDate: now, chapters: [{ title: chapter, startIndex: 0 }] }
        await saveBookToIDB(book)
        localStorage.setItem(LAST_KEY, id)
        setDone({ id, n: sentences.length, chapter, append: false })
      } else {
        const b = books.find(x => x.id === target)
        if (!b) { setErr('搵唔到嗰本書'); return }
        const start = b.sentences.length + (b.sentences.length ? 1 : 0)
        const chapters = b.chapters?.length ? [...b.chapters] : [{ title: b.title, startIndex: 0 }]
        const updated: BookData = {
          ...b,
          sentences: b.sentences.length ? [...b.sentences, PARA_SEP, ...sentences] : sentences,
          chapters: [...chapters, { title: chapter, startIndex: start }],
          lastReadDate: now,
        }
        await saveBookToIDB(updated)
        localStorage.setItem(LAST_KEY, b.id)
        setDone({ id: b.id, n: sentences.length, chapter, append: true })
      }
    } catch (e) {
      console.error(e); setErr('儲存失敗（可能係瀏覽器空間不足）')
    }
  }

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(bookmarkletCode(SITE)); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-700">← 書架</a>
          <h1 className="text-lg font-bold text-gray-800">📥 網頁收入書架</h1>
          <span className="w-10" />
        </div>

        {done ? (
          <div className="rounded-2xl bg-white border border-emerald-200 shadow-sm p-6 text-center">
            <div className="text-4xl mb-2">✅</div>
            <p className="font-semibold text-gray-800">{done.append ? '已加入做新章節' : '已變成新書'}</p>
            <p className="text-sm text-gray-500 mt-1">「{done.chapter}」· {done.n} 句</p>
            <div className="flex gap-2 justify-center mt-5">
              <a href={`/?open=${encodeURIComponent(done.id)}`} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">去讀 📖</a>
              <button onClick={() => window.close()} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">關閉視窗</button>
            </div>
            <p className="text-[11px] text-gray-400 mt-4">返去原本網頁，揭下一課再撳書籤就得 👉</p>
          </div>
        ) : data ? (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-4">
            {data?.site && <p className="text-xs text-gray-400 truncate">來源：{data.site}</p>}
            <div>
              <label className="text-xs font-medium text-gray-500">章節／標題</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">加入去</label>
              <select value={target} onChange={e => setTarget(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400">
                <option value="new">➕ 新書</option>
                {books.map(b => <option key={b.id} value={b.id}>📘 {b.title}（{b.chapters?.length || 1} 章）</option>)}
              </select>
              {target === 'new' && (
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="新書名（例如課程名）"
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-indigo-400" />
              )}
              {dupChapter && <p className="text-xs text-amber-600 mt-1">⚠️ 呢本書已經有同名章節，可能加過咗</p>}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-500">內容（可以刪走唔要嘅部分）</label>
                <span className="text-xs text-gray-400">{sentences.filter(s => s !== PARA_SEP).length} 句 · {text.replace(/\s/g, '').length} 字</span>
              </div>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={12}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm leading-relaxed outline-none focus:border-indigo-400 resize-y" />
            </div>
            {err && <p className="text-sm text-red-500">{err}</p>}
            <button onClick={save} disabled={!sentences.length} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40">
              {target === 'new' ? '📚 變成新書' : '➕ 加入做新章節'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <p className="font-semibold text-gray-800 mb-2">💻 電腦：拖呢粒掣去書籤列</p>
              <a ref={bmRef} onClick={e => { e.preventDefault(); alert('唔好喺度撳 🙂 將佢拖去瀏覽器嘅書籤列，之後喺課程網頁撳') }}
                className="inline-block px-4 py-2 rounded-full text-sm font-semibold text-white bg-sky-600 cursor-grab select-none">📥 收入書架</a>
              <ol className="text-sm text-gray-600 mt-3 space-y-1 list-decimal pl-5">
                <li>睇唔到書籤列：Chrome 撳 ⌘/Ctrl + Shift + B</li>
                <li>喺課程網頁（例如得到網頁版某一課文稿）撳書籤</li>
                <li>會自動彈出呢頁預覽，揀「新書」或者加入同一門課</li>
                <li>抽錯內容？先用滑鼠揀選正文，再撳書籤，就只會收你揀咗嘅文字</li>
              </ol>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <p className="font-semibold text-gray-800 mb-2">📱 手機</p>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal pl-5">
                <li>隨便將一頁加入書籤，改名做「收入書架」</li>
                <li>編輯書籤網址，貼上：<button onClick={copyCode} className="ml-1 px-2 py-0.5 rounded-md text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200">{copied ? '已複製 ✓' : '複製書籤代碼'}</button></li>
                <li>喺課程網頁，網址列打「收入書架」，撳嗰個書籤建議</li>
              </ol>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
              <p className="font-semibold text-gray-800 mb-2">✍️ 或者直接貼上</p>
              <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5} placeholder="喺 App 複製一課文稿，貼喺度…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm leading-relaxed outline-none focus:border-indigo-400" />
              <button onClick={() => { const t = paste.trim(); if (!t) return; accept({ title: t.split('\n')[0].slice(0, 60), text: t }) }} disabled={!paste.trim()}
                className="mt-2 w-full py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40">下一步 →</button>
            </div>
            <p className="text-[11px] text-gray-400 text-center">🔒 只會抄你打開緊嗰一頁，內容只存喺呢部機。</p>
          </div>
        )}
      </div>
    </main>
  )
}
