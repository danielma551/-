#!/usr/bin/env node
// 【得到 → 閱讀網站 本機自動匯入器】（個人自用）
// 用你自己已登入得到嘅瀏覽器 session，經得到官方文章列表 API 搵新文章，
// 抓取正文寫入閱讀網站嘅 IndexedDB，再觸發雲端同步上傳。
//
// 用法：
//   node scripts/dedao-import.mjs dump <文章網址>                # 分析單篇文章結構
//   node scripts/dedao-import.mjs import <專欄網址> [專欄網址…]   # 匯入專欄新文章
//
// 專欄網址即係得到「專欄詳情頁」，例如：
//   https://www.dedao.cn/course/detail?id=nb9L2q1e3OxKBPNsdoJrgN8P0Rwo6B

import { spawn } from 'node:child_process'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const SITE_URL = process.env.MSW_SITE || 'https://myspiritworld.vercel.app'
const PORT = 9339
const PROFILE = process.env.MSW_DEDAO_PROFILE || path.join(process.cwd(), '.dedao-profile')
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
const MAX = Math.max(0, parseInt(process.env.MSW_DEDAO_MAX || '0', 10) || 0) // 測試用：最多匯入幾篇，0 = 唔限
const sleep = ms => new Promise(r => setTimeout(r, ms))

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c
  return null
}

async function launchChrome() {
  const bin = findChrome()
  if (!bin) { console.error('搵唔到 Chrome'); process.exit(1) }
  mkdirSync(PROFILE, { recursive: true })
  spawn(bin, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-crash-reporter'], { stdio: 'ignore' })
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

function makeClient(ws) {
  let id = 0
  const pending = new Map()
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { const { res } = pending.get(m.id); pending.delete(m.id); res(m) }
  }
  ws.onerror = () => { for (const [, { rej }] of pending) rej(new Error('WS error')); pending.clear() }
  ws.onclose = () => { for (const [, { rej }] of pending) rej(new Error('WS closed')); pending.clear() }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id
    const timer = setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('CDP timeout: ' + method)) } }, 90000)
    pending.set(i, { res: m => { clearTimeout(timer); res(m) }, rej })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
  return {
    send,
    eval: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      return r.result?.result?.value
    },
    navigate: async (url) => { await send('Page.navigate', { url }) },
  }
}

async function newPageClient() {
  // 開一個全新分頁並推到最前，確保用戶登入／睇到嘅就係程式控制嘅嗰個分頁
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
  const bws = await connectWs(ver.webSocketDebuggerUrl)
  const bc = makeClient(bws)
  const r = await bc.send('Target.createTarget', { url: 'about:blank' })
  const tid = r.result.targetId
  await bc.send('Target.activateTarget', { targetId: tid })
  let t = null
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    t = list.find(x => x.id === tid)
    if (t) break
    await sleep(300)
  }
  if (!t) throw new Error('開唔到新分頁')
  const ws = await connectWs(t.webSocketDebuggerUrl)
  return makeClient(ws)
}

async function waitLogin(c) {
  console.log('⏳ 請喺彈出嘅 Chrome 視窗掃碼／驗證碼登入得到，我一路喺度等…')
  for (let i = 1; ; i++) {
    await sleep(3000)
    if (!(await c.eval(IS_LOGIN))) { console.log('✅ 已登入'); return }
    if (i % 10 === 0) console.log('  ⏳ 仲未見到登入成功，繼續等（撳 Chrome 視窗，掃碼登入）…')
  }
}

function splitIntoSentences(text) {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  const re = /[^.!?。！？;；,，:：]+[.!?。！？;；,，:：]+/g
  const s = cleaned.match(re) || []
  if (!s.length && cleaned.length) return [cleaned]
  return s.map(x => x.trim()).filter(x => x.length > 0)
}

function cleanArticleText(text, title) {
  const noise = /^(展开目录|设置文本|得到头条|今天|李南南亲述|得到用户，你好|\d+分\d+秒|.*\.mp3)$/
  return text.replace(/\r\n/g, '\n').split('\n')
    .map(s => s.replace(/[\u200b-\u200d\ufeff]/g, '').trim())
    .filter(s => s && s !== title && !noise.test(s))
    .join('\n')
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
  const title = (txt(document.querySelector('.article-title')) || (document.querySelector('meta[property="og:title"]')?.content || '').trim() || document.title || '').replace(/\\s*-\\s*得到APP\\s*$/,'')
  const column = txt(document.querySelector('.course-title')) || ''
  const bodyEl = document.querySelector('.article-body') || document.querySelector('.iget_rich-text-panel--container')
  const text = bodyEl ? bodyEl.innerText : (document.body?.innerText || '')
  const imgs = [...new Set([...document.querySelectorAll('.article-cover img, .article-body img')].map(i => i.currentSrc || i.src).filter(u => /^https?:/i.test(u)))]
  return { title: title.slice(0,200), column: column.slice(0,60), text: text.slice(0,300000), imgs: imgs.slice(0,30), url: location.href }
})()`

const IS_LOGIN = `(() => { const t=(document.body?.innerText||''); return t.length<2000 && /登录|登錄|扫码|掃碼|注册|验证码|驗證碼/.test(t) })()`

// 專欄詳情頁：登入後會出現文章列表（.article-list-title）；未登入得返「登录／開始學習」
const HAS_COURSE_LIST = `(() => !!document.querySelector('.article-list-title'))()`
// 未登入時，用呢條已知文章 URL 觸發登入牆（登入係帳戶級，任何文章都一樣）
const LOGIN_TRIGGER = 'https://www.dedao.cn/course/article?id=qavDm012GolV7OYQz0VxPjEy8zdk73'

// 由專欄詳情 URL 抽出 detail_id（enid）
function detailIdOf(u) {
  try { return new URL(u).searchParams.get('id') || '' } catch { return '' }
}

async function fetchArticleList(c, detailId) {
  const body = JSON.stringify({
    chapter_id: '', count: 50, detail_id: detailId, include_edge: false,
    is_unlearn: false, max_id: 0, max_order_num: 0, reverse: true,
    since_id: 0, since_order_num: 0, unlearn_switch: false,
  })
  const js = `(async()=>{ const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),20000); try { const r=await fetch('/api/pc/bauhinia/pc/class/purchase/article_list',{method:'POST',headers:{'Content-Type':'application/json'},body:${JSON.stringify(body)},signal:ctl.signal}); const t=await r.text(); clearTimeout(tm); return { status:r.status, text:t } } catch(e){ clearTimeout(tm); return { status:0, text:String(e.name||e.message) } } })()`
  const res = await c.eval(js)
  let data = null
  try { data = res?.text ? JSON.parse(res.text) : null } catch { data = null }
  if (!data || res?.status !== 200) {
    console.log(`  ⚠️ article_list 回應 status=${res?.status}（可能未登入）`)
    return []
  }
  const seenEnid = new Set()
  const arts = (data?.c?.article_list || []).map(a => ({
    enid: a.enid || a.id_str || String(a.id),
    title: (a.title || '').trim(),
    publish: a.publish_time || 0,
    column: ((a.share_title || '').split(/[|｜]/)[0] || '').trim(),
  })).filter(a => {
    if (!a.enid || seenEnid.has(a.enid)) return false
    seenEnid.add(a.enid)
    return true
  })
  return arts
}

async function main() {
  if (!mode || urls.length === 0) {
    console.log('用法：')
    console.log('  node scripts/dedao-import.mjs dump <文章網址>')
    console.log('  node scripts/dedao-import.mjs import <專欄網址> [專欄網址...]')
    console.log('  node scripts/dedao-import.mjs dates <專欄網址>    # 只補章節發布日期')
    process.exit(0)
  }

  await launchChrome()
  console.log('✅ Chrome 已開啟（請留返個視窗用嚟登入）')
  const c = await newPageClient()
  console.log('🔌 已連線瀏覽器')
  await c.send('Page.enable')

  if (mode === 'dump') {
    await c.navigate(urls[0]); await sleep(7000)
    await waitLogin(c)
    await sleep(4000)
    const d = await c.eval(EXTRACT_ARTICLE)
    const file = path.join(process.cwd(), 'scripts', `dedao-dump-${Date.now()}.json`)
    writeFileSync(file, JSON.stringify(d, null, 2))
    console.log('📄 已寫入：', file)
    console.log(JSON.stringify({ title: d.title, column: d.column, textLen: d.text?.length, imgs: d.imgs?.length }, null, 2))
    process.exit(0)
  }

  // dates：只補章節發布日期（唔重新抓文章）
  if (mode === 'dates') {
    const detailId = detailIdOf(urls[0])
    await c.navigate(`https://www.dedao.cn/course/detail?id=${detailId}`); await sleep(6000)
    if (!(await c.eval(HAS_COURSE_LIST))) {
      console.log('🔐 未登入，去觸發登入牆…')
      await c.navigate(LOGIN_TRIGGER); await sleep(5000)
      await waitLogin(c)
      await c.navigate(`https://www.dedao.cn/course/detail?id=${detailId}`); await sleep(6000)
    }
    const arts = await fetchArticleList(c, detailId)
    console.log(`📋 攞到 ${arts.length} 篇`)
    if (!arts.length) { console.log('❌ 攞唔到文章列表（未登入？）'); process.exit(1) }
    const map = {}
    for (const a of arts) if (a.title) map[a.title.trim()] = a.publish ? a.publish * 1000 : 0
    await c.navigate(SITE_URL); await sleep(6000)
    const upd = await c.eval(`(async()=>{ const db=await new Promise((res,rej)=>{const r=indexedDB.open('${DB_NAME}',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}); const books=await new Promise((res,rej)=>{const q=db.transaction('${STORE_NAME}','readonly').objectStore('${STORE_NAME}').getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error)}); const b=books.find(x=>x.title.includes('得到头条')); if(!b) return 'no-book'; const m=${JSON.stringify(map)}; let n=0; b.chapters=(b.chapters||[]).map(c=>{ const d=m[c.title]; if(d){n++; return {...c, date:d}} return c }); await new Promise((res,rej)=>{const tx=db.transaction('${STORE_NAME}','readwrite');tx.objectStore('${STORE_NAME}').put(b);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)}); return 'updated '+n+'/'+(b.chapters||[]).length })()`)
    console.log('📅', upd)
    await c.eval(`(window.dispatchEvent(new Event('msw-local-change')), true)`)
    await c.navigate(SITE_URL); await sleep(20000)
    console.log('☁️ 已同步')
    process.exit(0)
  }

  // import
  await c.navigate(SITE_URL); await sleep(5000)
  console.log('🌐 網站已載入')
  const seen = existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, 'utf8')) : {}
  const toFetch = [] // { enid, title, publish, column }

  for (const colUrl of urls) {
    const detailId = detailIdOf(colUrl)
    if (!detailId) { console.log(`⚠️ 唔識由 ${colUrl} 拆 detail id，跳過`); continue }
    await c.navigate(colUrl); await sleep(6000)
    console.log('📄 專欄頁已載入，檢查登入…')
    if (!(await c.eval(HAS_COURSE_LIST))) {
      console.log('🔐 未登入，去觸發登入牆…')
      await c.navigate(LOGIN_TRIGGER); await sleep(5000)
      await waitLogin(c)
      await c.navigate(colUrl); await sleep(6000)
    }
    await sleep(3000)
    // 專欄名優先攞 DOM，再 fallback 用 share_title
    const domColumn = await c.eval(`(document.querySelector('.course-title')?.innerText || '').trim()`)
    console.log('🔎 攞文章列表…')
    const arts = await fetchArticleList(c, detailId)
    console.log(`📋 ${colUrl} → 攞到 ${arts.length} 篇（最新喺前）`)
    for (const a of arts) {
      if (seen[a.enid]) continue
      toFetch.push({ ...a, column: domColumn || a.column || '得到文章' })
    }
  }

  console.log(`🆕 新文章 ${toFetch.length} 篇`)
  if (!toFetch.length) { console.log('冇新文章，收工'); process.exit(0) }
  if (MAX && toFetch.length > MAX) { toFetch.length = MAX; console.log(`（測試：只匯入前 ${MAX} 篇）`) }

  const groups = {}
  for (const a of toFetch) {
    try {
      await c.navigate(`https://www.dedao.cn/course/article?id=${a.enid}`)
    } catch (e) {
      console.log(`  ⚠️ 開啟 ${a.title.slice(0, 20)} 失敗（${e.message}），重試一次…`)
      await sleep(3000)
      await c.navigate(`https://www.dedao.cn/course/article?id=${a.enid}`)
    }
    await sleep(6000)
    const d = await c.eval(EXTRACT_ARTICLE)
    const col = (d.column || a.column || '得到文章').trim() || '得到文章'
    ;(groups[col] = groups[col] || []).push({ title: d.title || a.title, text: d.text, imgs: d.imgs, publish: a.publish })
    seen[a.enid] = 1
    try { writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2)) } catch { /* ignore */ }
    console.log(`  ✔ ${(d.title || a.title).slice(0, 40)} → ${col}`)
    await sleep(1500)   // 放慢，避免被得到限流
  }

  // 返去網站 origin 先讀現有書（IndexedDB 係跟 origin，去錯頁會讀/寫落錯地方）
  await c.navigate(SITE_URL); await sleep(6000)
  const existing = await c.eval(`(async()=>{ const db=await new Promise((res,rej)=>{const r=indexedDB.open('${DB_NAME}',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);r.onupgradeneeded=(e)=>{const d=e.target.result;if(!d.objectStoreNames.contains('${STORE_NAME}'))d.createObjectStore('${STORE_NAME}',{keyPath:'id'})}}); return await new Promise((res,rej)=>{const q=db.transaction('${STORE_NAME}','readonly').objectStore('${STORE_NAME}').getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error)}) })()`)

  const now = Date.now()
  const books = []
  for (const [col, arts] of Object.entries(groups)) {
    const eb = existing.find(b => b.title === col)
    const ns = []
    const nc = []
    for (const a of arts) {
      const text = cleanArticleText(a.text, a.title)
      const ss = blocksToSentences(text, a.imgs || [])
      if (!ss.length) continue
      const start = (eb?.sentences.length || 0) + ns.length + (ns.length ? 1 : 0)
      ns.push(...ss)
      nc.push({ title: a.title || '未命名', startIndex: start, date: a.publish ? a.publish * 1000 : undefined })
    }
    if (!ns.length) continue
    if (eb) {
      books.push({ ...eb, sentences: eb.sentences.length ? [...eb.sentences, PARA_SEP, ...ns] : ns, chapters: [...(eb.chapters || [{ title: eb.title, startIndex: 0 }]), ...nc], lastReadDate: now })
    } else {
      books.push({ id: generateBookId(col), title: col, sentences: ns, currentIndex: 0, uploadDate: now, lastReadDate: now, chapters: [{ title: arts[0].title || col, startIndex: 0, date: arts[0].publish ? arts[0].publish * 1000 : undefined }, ...nc.slice(1)] })
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
