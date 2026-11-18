#!/usr/bin/env node
// 【得到 → 閱讀網站 本機自動匯入器】（個人自用）
// 用你自己已登入得到嘅瀏覽器 session，抓取免費專欄文章，
// 寫入閱讀網站嘅 IndexedDB，再觸發雲端同步上傳。
//
// 用法：
//   node scripts/dedao-import.mjs dump <文章或專欄網址>
//   node scripts/dedao-import.mjs import <專欄網址> [專欄網址...]
//
// 環境變數（可選）：
//   MSW_SITE          網站網址（預設 https://myspiritworld.vercel.app）
//   MSW_DEDAO_PROFILE 瀏覽器設定檔目錄

import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const SITE_URL = process.env.MSW_SITE || 'https://myspiritworld.vercel.app'
const PORT = 9339
const PROFILE = process.env.MSW_DEDAO_PROFILE || path.join(os.homedir(), 'Library', 'Application Support', 'msw-dedao-profile')
const SEEN_FILE = path.join(process.cwd(), 'scripts', 'dedao-seen.json')
const DB_NAME = 'reading_website_books_db'
const STORE_NAME = 'books'
const PARA_SEP = '\u2029'

const CHROME_CANDIDATES = [
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1208/chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

const args = process.argv.slice(2)
const mode = args[0]
const urls = args.slice(1).filter(a => /^https?:\/\//.test(a))
const sleep = ms => new Promise(r => setTimeout(r, ms))

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c
  return null
}

async function launchChrome() {
  const bin = findChrome()
  if (!bin) { console.error('搵唔到 Chrome'); process.exit(1) }
  mkdirSync(PROFILE, { recursive: true })
  spawn(bin, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check'], { stdio: 'ignore' })
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) return } catch {}
    await sleep(500)
  }
  throw new Error('Chrome 啟動失敗')
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.onopen = () => resolve(ws)
    ws.onerror = e => reject(e)
  })
}

// 一個 page = 一個 client；send/evaluate 共用同一組 pending
function makeClient(ws) {
  let id = 0
  const pending = new Map()
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  }
  const send = (method, params = {}) => new Promise(res => {
    const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }))
  })
  return {
    send,
    eval: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      return r.result?.result?.value
    },
    navigate: async (url) => {
      await send('Page.navigate', { url })
    },
  }
}

async function getPageClient() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const t = list.find(x => x.type === 'page')
  const ws = await connectWs(t.webSocketDebuggerUrl)
  return makeClient(ws)
}

async function promptLogin() {
  const rl = createInterface({ input, output })
  await rl.question('👉 請喺彈出嘅 Chrome 視窗登入得到（掃碼／驗證碼），登入後返嚟撳 Enter 繼續…')
  rl.close()
}

function splitIntoSentences(text) {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  const re = /[^.!?。！？;；,，:：]+[.!?。！？;；,，:：]+/g
  const s = cleaned.match(re) || []
  if (!s.length && cleaned.length) return [cleaned]
  return s.map(x => x.trim()).filter(x => x.length > 0)
}

function blocksToSentences(text, imgs) {
  const out = [...imgs.map(u => 'img:' + u)]
  const paras = text.replace(/\r\n/g, '\n').split(/\n+/).map(p => p.trim()).filter(Boolean)
  for (const p of paras) {
    const ss = splitIntoSentences(p)
    if (!ss.length) continue
    if (out.length) out.push(PARA_SEP)
    out.push(...ss)
  }
  return out
}

function generateBookId(title) {
  return `${title}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

const EXTRACT_ARTICLE = `(() => {
  const txt = e => (e && e.innerText) ? e.innerText.trim() : ''
  const title = txt(document.querySelector('h1'))
    || (document.querySelector('meta[property="og:title"]')?.content || '').trim()
    || document.title || ''
  let column = ''
  const cand = ['.column-name','.course-name','.article-column','[class*="column" i]','[class*="course" i]']
  for (const s of cand) { const el=document.querySelector(s); if (el && txt(el)) { column = txt(el).slice(0,60); break } }
  const bad = /comment|reply|footer|nav|header|sidebar|recommend|related|menu|toolbar|share|评论|留言/i
  let best='', bl=0
  document.querySelectorAll('p, section, div').forEach(el => {
    const cls=(el.className&&el.className.toString?el.className.toString():'')+' '+(el.id||'')
    if (bad.test(cls)) return
    const t=(el.innerText||'').trim()
    if (t.length>bl){bl=t.length;best=t}
  })
  const imgs=[...new Set([...document.querySelectorAll('img')].map(i=>i.currentSrc||i.src).filter(u=>/^https?:/i.test(u)))]
  const links=[...document.querySelectorAll('a')].map(a=>({href:a.href,text:txt(a).slice(0,100)})).filter(x=>/course\\/article/.test(x.href))
  return { title: title.slice(0,120), column: column.slice(0,60), text: best.slice(0,300000), imgs: imgs.slice(0,80), links, url: location.href }
})()`

const LIST_ARTICLES = `(() => {
  const m=new Map()
  document.querySelectorAll('a').forEach(a=>{
    if (/course\\/article/.test(a.href)) { const t=(a.innerText||'').trim().slice(0,120); if(!m.has(a.href)) m.set(a.href,t) }
  })
  return [...m.entries()].map(([href,text])=>({href,text}))
})()`

const IS_LOGIN = `(() => { const t=(document.body?.innerText||''); return t.length<2000 && /登录|登錄|扫码|掃碼|注册|验证码|驗證碼/.test(t) })()`

async function main() {
  if (!mode || urls.length === 0) {
    console.log('用法：node scripts/dedao-import.mjs dump <網址>  或  import <專欄網址> [...]')
    process.exit(0)
  }
  await launchChrome()
  console.log('✅ Chrome 已開啟（請留返個視窗用嚟登入）')
  const c = await getPageClient()
  await c.send('Page.enable')

  if (mode === 'dump') {
    await c.navigate(urls[0]); await sleep(7000)
    if (await c.eval(IS_LOGIN)) await promptLogin()
    await sleep(4000)
    const d = await c.eval(`(() => { const a=${EXTRACT_ARTICLE}; return { ...a, headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>e.innerText.trim()), bodySample:(document.body?.innerText||'').slice(0,2000) } })()`)
    const file = path.join(process.cwd(), 'scripts', `dedao-dump-${Date.now()}.json`)
    writeFileSync(file, JSON.stringify(d, null, 2))
    console.log('📄 已寫入：', file)
    console.log(JSON.stringify({ title: d.title, column: d.column, textLen: d.text?.length, imgs: d.imgs?.length, links: d.links?.length, headings: d.headings }, null, 2))
    process.exit(0)
  }

  // import
  await c.navigate(SITE_URL); await sleep(5000)
  const seen = existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, 'utf8')) : {}
  const found = []
  for (const col of urls) {
    await c.navigate(col); await sleep(6000)
    if (await c.eval(IS_LOGIN)) await promptLogin()
    await sleep(4000)
    const links = await c.eval(LIST_ARTICLES)
    console.log(`📋 ${col} 搵到 ${links.length} 條文章連結`)
    found.push(...links.map(l => ({ ...l })))
  }

  const fresh = found.filter(a => !seen[a.href])
  console.log(`🆕 新文章 ${fresh.length} 篇`)
  if (!fresh.length) { console.log('冇新文章，收工'); process.exit(0) }

  const groups = {}
  for (const a of fresh) {
    await c.navigate(a.href); await sleep(6000)
    const d = await c.eval(EXTRACT_ARTICLE)
    const col = (d.column || '得到文章').trim() || '得到文章'
    ;(groups[col] = groups[col] || []).push({ ...d, column: col })
    seen[a.href] = 1
    console.log(`  ✔ ${d.title.slice(0, 40)} → ${col}`)
  }

  const existing = await c.eval(`(async()=>{ const db=await new Promise((res,rej)=>{const r=indexedDB.open('${DB_NAME}',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);r.onupgradeneeded=(e)=>{const d=e.target.result;if(!d.objectStoreNames.contains('${STORE_NAME}'))d.createObjectStore('${STORE_NAME}',{keyPath:'id'})}}); return await new Promise((res,rej)=>{const q=db.transaction('${STORE_NAME}','readonly').objectStore('${STORE_NAME}').getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error)}) })()`)

  const now = Date.now()
  const books = []
  for (const [col, arts] of Object.entries(groups)) {
    const eb = existing.find(b => b.title === col)
    const ns = []
    const nc = []
    for (const a of arts) {
      const ss = blocksToSentences(a.text, a.imgs)
      if (!ss.length) continue
      const start = (eb?.sentences.length || 0) + ns.length + (ns.length ? 1 : 0)
      ns.push(...ss)
      nc.push({ title: a.title || '未命名', startIndex: start })
    }
    if (!ns.length) continue
    if (eb) {
      books.push({ ...eb, sentences: eb.sentences.length ? [...eb.sentences, PARA_SEP, ...ns] : ns, chapters: [...(eb.chapters || [{ title: eb.title, startIndex: 0 }]), ...nc], lastReadDate: now })
    } else {
      books.push({ id: generateBookId(col), title: col, sentences: ns, currentIndex: 0, uploadDate: now, lastReadDate: now, chapters: [{ title: arts[0].title || col, startIndex: 0 }, ...nc.slice(1)] })
    }
  }

  await c.eval(`(async()=>{ const db=await new Promise((res,rej)=>{const r=indexedDB.open('${DB_NAME}',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);r.onupgradeneeded=(e)=>{const d=e.target.result;if(!d.objectStoreNames.contains('${STORE_NAME}'))d.createObjectStore('${STORE_NAME}',{keyPath:'id'})}}); const books=${JSON.stringify(books)}; return await new Promise((res,rej)=>{const tx=db.transaction('${STORE_NAME}','readwrite');books.forEach(b=>tx.objectStore('${STORE_NAME}').put(b));tx.oncomplete=()=>res(true);tx.onerror=()=>rej(tx.error)}) })()`)
  console.log(`💾 已寫入 ${books.length} 本書`)

  await c.eval(`(window.dispatchEvent(new Event('msw-local-change')), true)`)
  await c.navigate(SITE_URL)
  await sleep(20000)
  console.log('☁️ 已觸發同步（等約 20 秒上傳）')
  writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2))
  process.exit(0)
}

main().catch(e => { console.error('❌', e); process.exit(1) })
