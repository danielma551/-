// 【☁️ 自動雙向同步】
// 兩部機用同一個固定同步碼；每次同步：先「拉」雲端 → 同本機合併 → 再「推」返上去。
// 合併規則：
// - 書本內容：三方比較（雲端／本機／上次同步嘅版本），邊邊有改就用邊邊；兩邊都改咗 → 用本機
// - 閱讀進度：每本書比較「最後閱讀時間」，新嘅贏（唔會再倒退）
// - 刪書：記「墓碑」，另一部機都會刪；之後再加返同名書唔受影響
// - 筆記／熱圖／閱讀記錄：合併（取較大值／去重）
// 觸發：開網站、離開閱讀、切走 App、每 2 分鐘（有改動先推）

import { upload } from '@vercel/blob/client'
import { BookData, fontStorage, historyStorage, ReadingHistory, reviewStorage, bookReadingStorage } from './storage'
import { getAllBooksFromIDB, saveBookToIDB, deleteBookFromIDB } from './bookDB'
import { REVIEW_BOOK_ID } from './reviewBook'

const SKIP = new Set<string>([REVIEW_BOOK_ID])
const ID_KEY = 'msw_sync_id'
const REV_KEY = 'msw_sync_rev'
const MAP_KEY = 'msw_sync_book_map'          // 同手動同步共用：{ bookId: { hash, chash, url } }
const TOMB_KEY = 'msw_sync_tombstones'       // { bookId: 刪除時間 }
const PUSH_FP_KEY = 'msw_sync_push_fp'
const LAST_OK_KEY = 'msw_sync_last_ok'
const MANIFEST_KEY = 'msw_sync_manifest_url'

export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'error'
export interface SyncStatus { state: SyncState; at?: number; error?: string; changed?: boolean }

type MapEntry = { hash?: string; chash?: string; url: string }
type Ref = { id: string; url: string; gz: boolean; chash: string }
interface Manifest {
  v: 3
  bookRefs: Ref[]
  progress: Record<string, { currentIndex: number; lastReadDate: number }>
  tombstones: Record<string, number>
  font?: { fontFamily: string } | null
  readingHistory?: ReadingHistory
  reviewNotes?: unknown[]
  reviewSession?: unknown
  reviewHeat?: Record<string, number>
  bookReadDays?: unknown
  bookReadDaysByDevice?: Record<string, unknown>
}

// ── 小工具 ──
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 配額滿 */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* ignore */ } },
  json<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) || '') ?? d } catch { return d } },
}
function fastHash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}
const canGzip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
async function gzip(str: string): Promise<Blob> {
  return await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
}
async function gunzip(buf: ArrayBuffer): Promise<string> {
  return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
}
async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`讀取雲端檔案失敗（${r.status}）`)
  return url.includes('.json.gz') ? JSON.parse(await gunzip(await r.arrayBuffer())) : await r.json()
}
const contentHash = (b: BookData) => { const s = JSON.stringify({ ...b, currentIndex: 0, lastReadDate: 0 }); return fastHash(s) + '_' + s.length }
// 內容 hash 快取：大書每次 stringify 好慢 → 用「快速指紋」判斷有冇改，有先重算（每次開網站第一次一定全算）
const chCache = new Map<string, { sig: string; ch: string }>()
function quickSig(b: BookData): string {
  const n = b.sentences?.length || 0
  let chars = 0, sample = ''
  const step = Math.max(1, Math.floor(n / 200))
  for (let i = 0; i < n; i++) { const t = b.sentences[i] || ''; chars += t.length; if (i % step === 0) sample += t.slice(0, 8) }
  return [n, chars, fastHash(sample), b.title, b.chapters?.length || 0, b.coverImage?.length || 0, b.coverColor || '', b.kind || '', b.uploadDate].join('|')
}
function chashOf(b: BookData): string {
  const sig = quickSig(b)
  const c = chCache.get(b.id)
  if (c && c.sig === sig) return c.ch
  const ch = contentHash(b)
  chCache.set(b.id, { sig, ch })
  return ch
}

// ── 同步碼 ──
export const getSyncId = () => ls.get(ID_KEY) || ''
export const formatId = (id: string) => id.replace(/(.{4})(.{3})(.{3})/, '$1-$2-$3')
export async function createSyncId(): Promise<string> {
  const r = await fetch('/api/sync2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create' }) })
  const j = await r.json()
  if (!r.ok || !j.id) throw new Error(j.error || '建立失敗')
  ls.set(ID_KEY, j.id); ls.set(REV_KEY, '0'); ls.del(PUSH_FP_KEY)
  return j.id
}
export async function connectSyncId(raw: string): Promise<void> {
  const id = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const r = await fetch('/api/sync2?id=' + id, { cache: 'no-store' })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || '連接失敗')
  ls.set(ID_KEY, id); ls.set(REV_KEY, '0'); ls.del(PUSH_FP_KEY)   // rev 0 → 下次一定會拉同合併
}
export function disconnectSync() { [ID_KEY, REV_KEY, PUSH_FP_KEY, LAST_OK_KEY, MANIFEST_KEY].forEach(ls.del) }

// ── 刪書墓碑（page.tsx 刪書時叫）──
export function markBookDeleted(id: string) {
  const t = ls.json<Record<string, number>>(TOMB_KEY, {})
  t[id] = Date.now()
  ls.set(TOMB_KEY, JSON.stringify(t))
  scheduleSync(3000)
}

// ── 狀態廣播 ──
let status: SyncStatus = { state: 'off' }
export const getSyncStatus = (): SyncStatus => {
  if (!getSyncId()) return { state: 'off' }
  if (status.state === 'off') return { state: 'idle', at: Number(ls.get(LAST_OK_KEY) || 0) || undefined }
  return status
}
function emit(s: SyncStatus) {
  status = s
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('msw-sync-status', { detail: s }))
}

// ── 主流程 ──
// pullOnly：只睇吓雲端有冇更新（唔上傳）→ 慳 Vercel Blob 上傳次數（每月得 2,000 次）
let running: Promise<SyncStatus> | null = null
let again = false
let againPush = false

export function syncNow(opts: { pullOnly?: boolean } = {}): Promise<SyncStatus> {
  if (running) { again = true; if (!opts.pullOnly) againPush = true; return running }
  if (!opts.pullOnly) { pendingSince = 0; if (idleTimer) { clearTimeout(idleTimer); idleTimer = null } }
  running = (async () => {
    let res: SyncStatus
    try { res = await doSync(!!opts.pullOnly) } catch (e) {
      res = { state: 'error', at: Date.now(), error: e instanceof Error ? e.message : String(e) }
      emit(res)
    }
    running = null
    if (again) { const p = againPush; again = false; againPush = false; setTimeout(() => syncNow({ pullOnly: !p }), 500) }
    return res
  })()
  return running
}

// 開書前等埋進行中嘅同步（最多 ms），避免用咗舊進度開書
export async function waitForSync(ms = 4000): Promise<void> {
  if (!running) return
  await Promise.race([running.catch(() => null), new Promise(r => setTimeout(r, ms))])
}

// ── 閱讀中：揭頁唔會即刻上傳；停低 3 分鐘冇再揭，或者連續讀咗 20 分鐘，先上傳一次 ──
const IDLE_MS = 3 * 60 * 1000
const MAX_WAIT_MS = 20 * 60 * 1000
let idleTimer: ReturnType<typeof setTimeout> | null = null
let pendingSince = 0
export function noteLocalChange() {
  if (!getSyncId()) return
  const now = Date.now()
  if (!pendingSince) pendingSince = now
  if (idleTimer) clearTimeout(idleTimer)
  const wait = Math.max(0, Math.min(IDLE_MS, pendingSince + MAX_WAIT_MS - now))
  idleTimer = setTimeout(() => { idleTimer = null; syncNow() }, wait)
}

let timer: ReturnType<typeof setTimeout> | null = null
export function scheduleSync(ms = 1500) {
  if (!getSyncId()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; syncNow() }, ms)
}

async function getMeta(id: string): Promise<{ blobUrl?: string; rev: number; empty?: boolean }> {
  const r = await fetch('/api/sync2?id=' + id, { cache: 'no-store' })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || '讀取同步狀態失敗')
  return { blobUrl: j.blobUrl, rev: Number(j.rev || 0), empty: !!j.empty }
}

async function doSync(pullOnly = false): Promise<SyncStatus> {
  const id = getSyncId()
  if (!id) { emit({ state: 'off' }); return { state: 'off' } }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { const s: SyncStatus = { state: 'error', error: '離線中' }; emit(s); return s }
  emit({ state: 'syncing' })
  let changed = false
  for (let attempt = 0; attempt < 3; attempt++) {
    const meta = await getMeta(id)
    const localRev = Number(ls.get(REV_KEY) || 0)
    // 1) 拉＋合併（雲端版本有變先拉）
    if (meta.blobUrl && meta.rev !== localRev) {
      const remote = await fetchJson(meta.blobUrl) as Manifest
      if (await mergeRemote(remote)) changed = true
      ls.set(MANIFEST_KEY, meta.blobUrl)
      ls.set(REV_KEY, String(meta.rev))
    }
    // 2) 推（本機有改動先推；只拉模式唔推）
    const pushed = pullOnly ? 'skip' : await push(id, meta.rev, meta.blobUrl)
    if (pushed === 'conflict') continue          // 另一部機啱啱推咗 → 再拉再合併
    const s: SyncStatus = { state: 'ok', at: Date.now(), changed }
    ls.set(LAST_OK_KEY, String(s.at))
    emit(s)
    return s
  }
  throw new Error('同步衝突太多，稍後再試')
}

// 合併雲端清單入本機；返回本機有冇改動（要唔要刷新書架）
async function mergeRemote(remote: Manifest): Promise<boolean> {
  let changed = false
  const local = await getAllBooksFromIDB()
  const byId = new Map(local.map(b => [b.id, b]))
  const map = ls.json<Record<string, MapEntry>>(MAP_KEY, {})

  // 墓碑合併
  const tombs = ls.json<Record<string, number>>(TOMB_KEY, {})
  for (const [bid, t] of Object.entries(remote.tombstones || {})) if (!tombs[bid] || t > tombs[bid]) tombs[bid] = t
  const cutoff = Date.now() - 120 * 86400000
  for (const [bid, t] of Object.entries(tombs)) if (t < cutoff) delete tombs[bid]
  ls.set(TOMB_KEY, JSON.stringify(tombs))
  for (const [bid, t] of Object.entries(tombs)) {
    const b = byId.get(bid)
    if (b && !SKIP.has(bid) && t > (b.uploadDate || 0) && t >= (b.lastReadDate || 0) - 1000) {
      await deleteBookFromIDB(bid); byId.delete(bid); delete map[bid]; changed = true
    }
  }

  for (const ref of remote.bookRefs || []) {
    if (SKIP.has(ref.id)) continue
    if (tombs[ref.id] && !byId.has(ref.id)) continue
    const lb = byId.get(ref.id)
    const pr = remote.progress?.[ref.id]
    const base = map[ref.id]?.chash
    let book: BookData | undefined = lb
    let inSync = !!lb && ref.chash === base                   // 內容同雲端一致
    if (!lb) {
      book = await fetchJson(ref.url) as BookData          // 新書（另一部機加嘅）
      changed = true; inSync = true
    } else if (ref.chash && ref.chash !== base) {
      const localCh = chashOf(lb)
      if (localCh === ref.chash) inSync = true
      else if (localCh === base || !base) {                 // 只係雲端改咗 → 用雲端內容（保留本機進度，下面再比）
        const rb = await fetchJson(ref.url) as BookData
        book = { ...rb, currentIndex: lb.currentIndex, lastReadDate: lb.lastReadDate }
        changed = true; inSync = true
      }
      // 兩邊都改咗 → 保留本機內容（等陣推上去）
    }
    if (!book) continue
    if (pr && pr.lastReadDate > (book.lastReadDate || 0)) {   // 進度：新嘅贏
      book = { ...book, currentIndex: pr.currentIndex, lastReadDate: pr.lastReadDate }
      changed = true
    } else if (!lb && pr) {
      book = { ...book, currentIndex: pr.currentIndex, lastReadDate: pr.lastReadDate }
    }
    if (book !== lb) await saveBookToIDB(book)
    if (inSync && ref.chash) map[ref.id] = { chash: ref.chash, url: ref.url }
  }
  ls.set(MAP_KEY, JSON.stringify(map))

  // 其他資料
  if (remote.readingHistory) {
    const h = historyStorage.getHistory(); let d = false
    for (const [date, n] of Object.entries(remote.readingHistory)) if ((h[date] ?? 0) < n) { h[date] = n; d = true }
    if (d) { ls.set('reading-history', JSON.stringify(h)); changed = true }
  }
  if (Array.isArray(remote.reviewNotes)) reviewStorage.merge(remote.reviewNotes as never)
  if (remote.reviewSession && typeof remote.reviewSession === 'object') {
    const rs = remote.reviewSession as { date?: string; done?: number }
    const today = new Date().toLocaleDateString('en-CA')
    if (rs.date === today) {
      const l = reviewStorage.getSession()
      if ((rs.done ?? 0) > (l && l.date === today ? (l.done ?? 0) : -1)) reviewStorage.saveSession(remote.reviewSession as never)
    }
  }
  if (remote.reviewHeat) reviewStorage.mergeHeat(remote.reviewHeat)
  // 每本書每日句數：新版按裝置分開（加埋計）；舊版先用「取較大值」
  if (remote.bookReadDaysByDevice) bookReadingStorage.mergeByDevice(remote.bookReadDaysByDevice as never)
  else if (remote.bookReadDays) bookReadingStorage.merge(remote.bookReadDays as never)
  if (remote.font && !fontStorage.getFont()) fontStorage.saveFont(remote.font.fontFamily)
  return changed
}

async function push(id: string, baseRev: number, oldManifest?: string): Promise<'ok' | 'skip' | 'conflict'> {
  const books = await getAllBooksFromIDB()
  const tombs = ls.json<Record<string, number>>(TOMB_KEY, {})
  const map = ls.json<Record<string, MapEntry>>(MAP_KEY, {})
  const gz = canGzip()
  const refs: Ref[] = []
  const progress: Manifest['progress'] = {}
  const toDelete: string[] = []
  for (const b of books) {
    if (SKIP.has(b.id)) continue
    progress[b.id] = { currentIndex: b.currentIndex, lastReadDate: b.lastReadDate }
    const ch = chashOf(b)
    let entry = map[b.id]
    if (!entry || entry.chash !== ch) {
      const str = JSON.stringify({ ...b, currentIndex: 0, lastReadDate: 0 })
      const blob = await upload(`book-${b.id}-${ch}.json${gz ? '.gz' : ''}`, gz ? await gzip(str) : str, {
        access: 'public', handleUploadUrl: '/api/blob', contentType: gz ? 'application/gzip' : 'application/json',
      })
      if (entry?.url && entry.url !== blob.url) toDelete.push(entry.url)
      entry = { chash: ch, url: blob.url }
      map[b.id] = entry
    }
    refs.push({ id: b.id, url: entry.url, gz: entry.url.includes('.json.gz'), chash: ch })
    if (tombs[b.id] && tombs[b.id] < (b.uploadDate || 0)) delete tombs[b.id]   // 刪咗又加返
  }
  ls.set(MAP_KEY, JSON.stringify(map))
  ls.set(TOMB_KEY, JSON.stringify(tombs))
  const manifest: Manifest = {
    v: 3, bookRefs: refs, progress, tombstones: tombs,
    font: fontStorage.getFont(),
    readingHistory: historyStorage.getHistory(),
    reviewNotes: reviewStorage.getAll(),
    reviewSession: reviewStorage.getSession(),
    reviewHeat: reviewStorage.getHeat(),
    bookReadDays: bookReadingStorage.getAll(),
    bookReadDaysByDevice: bookReadingStorage.getByDevice(),
  }
  const str = JSON.stringify(manifest)
  const fp = fastHash(str) + '_' + str.length
  if (fp === ls.get(PUSH_FP_KEY) && Number(ls.get(REV_KEY) || 0) === baseRev) return 'skip'
  const mBlob = await upload(`sync-${id.slice(0, 4)}-${Date.now()}.json${gz ? '.gz' : ''}`, gz ? await gzip(str) : str, {
    access: 'public', handleUploadUrl: '/api/blob', contentType: gz ? 'application/gzip' : 'application/json',
  })
  const r = await fetch('/api/sync2', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, blobUrl: mBlob.url, baseRev, device: navigator.userAgent.includes('Mobile') ? 'phone' : 'desktop' }),
  })
  if (r.status === 409) {
    fetch('/api/blob', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls: [mBlob.url] }) }).catch(() => {})
    return 'conflict'
  }
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || '上傳失敗')
  ls.set(REV_KEY, String(j.rev))
  ls.set(PUSH_FP_KEY, fp)
  ls.set(MANIFEST_KEY, mBlob.url)
  // 舊清單＋被取代嘅舊書檔（新清單已登記先刪）
  const urls = [...toDelete, ...(oldManifest ? [oldManifest] : [])]
  if (urls.length) fetch('/api/blob', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) }).catch(() => {})
  return 'ok'
}

// ── 自動觸發（page.tsx 叫一次）──
let installed = false
export function installAutoSync(onChanged: () => void) {
  if (installed || typeof window === 'undefined') return () => {}
  installed = true
  const run = () => { syncNow() }
  // 切走／熄 mon → 有改動就上傳；返嚟 → 只拉
  // （上傳前會比較指紋：冇改動就唔會用到上傳次數）
  const onVis = () => { if (document.visibilityState === 'hidden') syncNow(); else syncNow({ pullOnly: true }) }
  const onHide = () => { syncNow() }
  const onLocal = () => noteLocalChange()
  const onStatus = (e: Event) => { const d = (e as CustomEvent<SyncStatus>).detail; if (d?.state === 'ok' && d.changed) onChanged() }
  if (getSyncId()) run()
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pagehide', onHide)
  window.addEventListener('msw-local-change', onLocal)
  window.addEventListener('online', run)
  window.addEventListener('msw-sync-status', onStatus)
  // 每 2 分鐘只「睇吓」雲端有冇新嘢（唔上傳，唔使 Blob 上傳次數）
  const iv = setInterval(() => { if (document.visibilityState === 'visible' && getSyncId()) syncNow({ pullOnly: true }) }, 2 * 60 * 1000)
  return () => {
    installed = false
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pagehide', onHide)
    window.removeEventListener('msw-local-change', onLocal)
    window.removeEventListener('online', run)
    window.removeEventListener('msw-sync-status', onStatus)
    clearInterval(iv)
  }
}
