// 【PDF 庫】儲存 PDF（IndexedDB，本機）＋ 每頁文字索引，用嚟全庫搜尋同高光。

export interface PdfDoc {
  id: string
  name: string
  blob: Blob
  size: number
  pages: number
  texts: string[]      // 每頁抽出嚟嘅文字（搜尋用）
  noText: boolean      // 掃描檔（冇文字層）→ 搜唔到
  addedAt: number
  lastPage?: number
}
export type PdfMeta = Omit<PdfDoc, 'blob' | 'texts'>

const DB_NAME = 'reading-pdf-library'
const STORE = 'docs'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('IDB not available')); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function savePdfDoc(d: PdfDoc): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(d)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAllPdfDocs(): Promise<PdfDoc[]> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      req.onsuccess = () => resolve(((req.result as PdfDoc[]) || []).sort((a, b) => b.addedAt - a.addedAt))
      req.onerror = () => reject(req.error)
    })
  } catch { return [] }
}

export async function deletePdfDoc(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function updatePdfLastPage(id: string, page: number): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    const g = st.get(id)
    g.onsuccess = () => { const d = g.result as PdfDoc | undefined; if (d) { d.lastPage = page; st.put(d) } }
  } catch { /* ignore */ }
}

// ── pdf.js 載入（瀏覽器）──
export async function loadPdfjs(): Promise<{ lib: any; opts: Record<string, unknown> }> {
  const lib: any = await import('pdfjs-dist')
  const v = lib.version
  lib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`
  return {
    lib,
    opts: {
      cMapUrl: `https://unpkg.com/pdfjs-dist@${v}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${v}/standard_fonts/`,
    },
  }
}

// 抽取每頁文字（逐頁回報進度）
export async function extractPdfTexts(blob: Blob, onProgress?: (done: number, total: number) => void): Promise<{ pages: number; texts: string[] }> {
  const { lib, opts } = await loadPdfjs()
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), ...opts }).promise
  const texts: string[] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      texts.push(tc.items.map((it: any) => (typeof it.str === 'string' ? it.str : '') + (it.hasEOL ? '\n' : '')).join(''))
      onProgress?.(p, doc.numPages)
    }
    return { pages: doc.numPages, texts }
  } finally { try { doc.destroy() } catch { /* ignore */ } }
}

// ── 搜尋：去空白、唔分大小寫（中文換行都搜到）──
export const compact = (s: string) => s.replace(/\s+/g, '').toLowerCase()

// 搵出一份文件所有命中（頁碼由 1 起；k = 嗰頁第幾個命中）
export function findHits(texts: string[], query: string): { page: number; k: number; snippet: { before: string; hit: string; after: string } }[] {
  const q = compact(query)
  if (!q) return []
  const out: { page: number; k: number; snippet: { before: string; hit: string; after: string } }[] = []
  texts.forEach((text, pi) => {
    // 建立「去空白後位置 → 原文位置」對照
    const map: number[] = []
    let c = ''
    for (let i = 0; i < text.length; i++) {
      if (!/\s/.test(text[i])) { map.push(i); c += text[i].toLowerCase() }
    }
    let from = 0, k = 0
    while (true) {
      const at = c.indexOf(q, from)
      if (at < 0) break
      const s = map[at], e = map[at + q.length - 1] + 1
      const clean = (x: string) => x.replace(/\s+/g, ' ')
      out.push({
        page: pi + 1, k: k++,
        snippet: { before: clean(text.slice(Math.max(0, s - 24), s)), hit: clean(text.slice(s, e)), after: clean(text.slice(e, e + 24)) },
      })
      from = at + q.length
    }
  })
  return out
}
