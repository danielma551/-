// 幫現有專欄書補回「得到文章頂部大圖」做封面（chapter.cover）
import { writeFileSync } from 'node:fs'

const PORT = 9339
const SITE = 'https://myspiritworld.vercel.app'
const DB = 'reading_website_books_db'
const STORE = 'books'
const sleep = ms => new Promise(r => setTimeout(r, ms))

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.onopen = () => resolve(ws)
    ws.onerror = e => reject(e)
  })
}
function makeClient(ws) {
  let id = 0
  const pending = new Map()
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { const { res } = pending.get(m.id); pending.delete(m.id); res(m) }
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id
    const t = setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('timeout ' + method)) } }, 60000)
    pending.set(i, { res: m => { clearTimeout(t); res(m) } })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  return {
    send,
    eval: async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value },
    nav: url => send('Page.navigate', { url }),
  }
}
async function newPage() {
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
  const bws = await connectWs(ver.webSocketDebuggerUrl)
  const bc = makeClient(bws)
  const r = await bc.send('Target.createTarget', { url: 'about:blank' })
  const tid = r.result.targetId
  await bc.send('Target.activateTarget', { targetId: tid })
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const t = list.find(x => x.id === tid)
    if (t) return makeClient(await connectWs(t.webSocketDebuggerUrl))
    await sleep(300)
  }
  throw new Error('no tab')
}

const COURSES = [
  { id: 'nb9L2q1e3OxKBPNsdoJrgN8P0Rwo6B', book: '得到头条' },
  { id: '9emjk1LQqzoK25LhBWX2lbY6Pv0BDW', book: '李海鹏阅读季' },
]

const c = await newPage()
await c.send('Page.enable')

for (const course of COURSES) {
  await c.nav(`https://www.dedao.cn/course/detail?id=${course.id}`); await sleep(5000)
  // 取全部文章標題→enid
  const listJson = await c.eval(`(async()=>{
    const call=async(maxId,maxOrder)=>{const body=JSON.stringify({chapter_id:'',count:50,detail_id:'${course.id}',include_edge:false,is_unlearn:false,max_id:maxId||0,max_order_num:maxOrder||0,reverse:true,since_id:0,since_order_num:0,unlearn_switch:false});const r=await fetch('/api/pc/bauhinia/pc/class/purchase/article_list',{method:'POST',headers:{'Content-Type':'application/json'},body});const j=await r.json();return (j.c&&j.c.article_list)||[]};
    let all=[], maxId=0, maxOrder=0;
    for(let p=0;p<12;p++){const a=await call(maxId,maxOrder); all.push(...a); if(a.length<50) break; const l=a[a.length-1]; maxId=l.id; maxOrder=l.order_num;}
    return JSON.stringify(all.map(a=>({enid:a.enid,title:a.title})));
  })()`)
  let articles = []
  try { articles = JSON.parse(listJson || '[]') } catch {}
  console.log(`📋 ${course.book}：${articles.length} 篇`)

  await c.nav(SITE); await sleep(6000)
  const bookJson = await c.eval(`(async()=>{
    const db=await new Promise((res,rej)=>{const r=indexedDB.open('${DB}',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    const books=await new Promise((res,rej)=>{const q=db.transaction('${STORE}','readonly').objectStore('${STORE}').getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error)});
    const b=books.find(x=>x.title.includes('${course.book}'));
    return b?JSON.stringify(b):'null';
  })()`)
  const book = JSON.parse(bookJson || 'null')
  if (!book) { console.log('❌找不到書', course.book); continue }

  const norm = s => (s || '').replace(/\s+/g, '').replace(/[｜|]/g, '｜')
  const byTitle = new Map(articles.map(a => [norm(a.title), a.enid]))
  const chapters = book.chapters || []
  let done = 0, hit = 0
  for (const ch of chapters) {
    let enid = byTitle.get(norm(ch.title))
    if (!enid) {
      const key = norm(ch.title).slice(0, 14)
      const found = articles.find(a => norm(a.title).slice(0, 14) === key)
      enid = found?.enid
    }
    if (!enid) { console.log('  ⚠️ 對唔到文章：', ch.title.slice(0, 30)); continue }
    await c.nav(`https://www.dedao.cn/course/article?id=${enid}`)
    let cover = ''
    for (let k = 0; k < 16; k++) {
      await sleep(500)
      cover = await c.eval(`(document.querySelector('.article-cover img')?.currentSrc || document.querySelector('.article-cover img')?.src || '')`)
      if (cover) break
    }
    if (cover) { ch.cover = cover; hit++ }
    done++
    if (done % 10 === 0) console.log(`  … ${done}/${chapters.length}`)
    await sleep(250)
  }
  console.log(`🖼️ ${course.book}：${hit}/${chapters.length} 篇有封面`)

  await c.nav(SITE); await sleep(6000)
  const saved = await c.eval(`(async()=>{
    const db=await new Promise((res,rej)=>{const r=indexedDB.open('${DB}',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    const books=await new Promise((res,rej)=>{const q=db.transaction('${STORE}','readonly').objectStore('${STORE}').getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error)});
    const b=books.find(x=>x.title.includes('${course.book}'));
    if(!b) return 'no-book';
    b.chapters=${JSON.stringify(chapters)};
    await new Promise((res,rej)=>{const tx=db.transaction('${STORE}','readwrite');tx.objectStore('${STORE}').put(b);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)});
    return 'ok';
  })()`)
  console.log('💾', saved)
  await c.eval(`(window.dispatchEvent(new Event('msw-local-change')), true)`)
  await sleep(1500)
}

await c.nav(SITE); await sleep(20000)
console.log('☁️ 已觸發同步')
process.exit(0)
