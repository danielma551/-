// 【🖼️ 閱讀壁紙】原創 SVG 場景（唔使下載圖片）＋ 自己上傳嘅相（IndexedDB，只存本機）
// 設定：普通模式同紙本模式各自一套 { id, blur, wash, backing }

export type WallpaperId = 'none' | 'rain' | 'lake' | 'stars' | 'study' | 'bamboo' | 'custom'
export interface WallpaperSettings { id: WallpaperId; blur: number; wash: number; backing: boolean }
export const DEFAULT_WP: WallpaperSettings = { id: 'none', blur: 0, wash: 45, backing: true }

// 固定隨機（每次畫出嚟一樣）
function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 } }
const svgUrl = (svg: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
const W = 1600, H = 1000
const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">`

// 🌧️ 雨夜窗邊
function rainSvg() {
  const r = rng(7)
  let drops = ''
  for (let i = 0; i < 140; i++) {
    const x = 260 + r() * 1080, y = 90 + r() * 640, l = 12 + r() * 26
    drops += `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x - 3).toFixed(0)}" y2="${(y + l).toFixed(0)}" stroke="#9fb7d6" stroke-opacity="${(0.25 + r() * 0.4).toFixed(2)}" stroke-width="${(1 + r() * 1.5).toFixed(1)}" stroke-linecap="round"/>`
  }
  let beads = ''
  for (let i = 0; i < 40; i++) beads += `<circle cx="${(260 + r() * 1080).toFixed(0)}" cy="${(90 + r() * 640).toFixed(0)}" r="${(2 + r() * 4).toFixed(1)}" fill="#cfe0f5" fill-opacity="${(0.25 + r() * 0.35).toFixed(2)}"/>`
  let lights = ''
  for (let i = 0; i < 26; i++) lights += `<circle cx="${(280 + r() * 1040).toFixed(0)}" cy="${(420 + r() * 300).toFixed(0)}" r="${(10 + r() * 26).toFixed(0)}" fill="${['#f6c177', '#e6a26a', '#9ccfd8', '#f0e1a8'][i % 4]}" fill-opacity="${(0.12 + r() * 0.18).toFixed(2)}"/>`
  return open + `
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2740"/><stop offset="1" stop-color="#2d3c5a"/></linearGradient>
  <radialGradient id="lamp" cx="0.12" cy="0.88" r="0.6"><stop offset="0" stop-color="#ffcf8a" stop-opacity=".55"/><stop offset="1" stop-color="#ffcf8a" stop-opacity="0"/></radialGradient>
  <filter id="b"><feGaussianBlur stdDeviation="6"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#2a2420"/>
<rect x="240" y="70" width="1120" height="680" rx="8" fill="url(#sky)"/>
<g filter="url(#b)">${lights}</g>
${drops}${beads}
<rect x="240" y="70" width="1120" height="680" rx="8" fill="none" stroke="#3b2f27" stroke-width="28"/>
<rect x="786" y="70" width="28" height="680" fill="#3b2f27"/><rect x="240" y="396" width="1120" height="24" fill="#3b2f27"/>
<rect x="180" y="750" width="1240" height="40" rx="6" fill="#4a3a2e"/>
<rect x="0" y="790" width="${W}" height="${H - 790}" fill="#241d19"/>
<g transform="translate(1180 640)"><rect x="-38" y="70" width="76" height="80" rx="10" fill="#7a5b45"/>
  <path d="M0 70 C -60 20 -70 -40 -20 -70 C -30 -20 -10 20 0 70 Z" fill="#4f7a55"/><path d="M0 70 C 50 10 70 -50 25 -80 C 30 -20 10 20 0 70 Z" fill="#5f8c63"/><path d="M0 70 C -10 0 0 -60 10 -100 C 15 -40 10 20 0 70 Z" fill="#6b9a6d"/></g>
<g transform="translate(330 610)"><path d="M-40 140 L40 140 L20 60 L-20 60 Z" fill="#8a6a4a"/><rect x="-4" y="-20" width="8" height="80" fill="#5d4634"/><path d="M-70 -20 L70 -20 L40 -90 L-40 -90 Z" fill="#e8c38a"/></g>
<rect width="${W}" height="${H}" fill="url(#lamp)"/>
</svg>`
}

// 🌄 清晨湖面
function lakeSvg() {
  const r = rng(3)
  let mist = ''
  for (let i = 0; i < 7; i++) mist += `<rect x="${(-100 + r() * 400).toFixed(0)}" y="${(590 + i * 22).toFixed(0)}" width="${(900 + r() * 900).toFixed(0)}" height="10" rx="5" fill="#fff" fill-opacity="${(0.12 + r() * 0.15).toFixed(2)}"/>`
  let birds = ''
  for (let i = 0; i < 5; i++) { const x = 1000 + i * 46 + r() * 20, y = 230 + r() * 60; birds += `<path d="M${x} ${y} q8 -8 16 0 q8 -8 16 0" stroke="#6b6f86" stroke-width="2.4" fill="none" stroke-linecap="round"/>` }
  return open + `
<defs>
  <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bcd3ea"/><stop offset=".55" stop-color="#f6d7c3"/><stop offset="1" stop-color="#fbe9d7"/></linearGradient>
  <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9d6cf"/><stop offset="1" stop-color="#a9c0d6"/></linearGradient>
  <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7b4cf"/><stop offset="1" stop-color="#c9cfdf"/></linearGradient>
  <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f8fb0"/><stop offset="1" stop-color="#a3adc6"/></linearGradient>
  <linearGradient id="m3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6c8c"/><stop offset="1" stop-color="#7d88a3"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#s)"/>
<circle cx="560" cy="430" r="70" fill="#fff4e0" fill-opacity=".95"/>
${birds}
<path d="M0 520 L180 380 L330 470 L520 330 L700 450 L880 360 L1080 470 L1260 350 L1450 450 L1600 400 L1600 580 L0 580 Z" fill="url(#m1)"/>
<path d="M0 560 L220 440 L420 530 L640 420 L860 540 L1120 430 L1360 530 L1600 470 L1600 590 L0 590 Z" fill="url(#m2)"/>
<path d="M0 590 L260 520 L520 580 L800 510 L1080 585 L1340 520 L1600 575 L1600 600 L0 600 Z" fill="url(#m3)"/>
<rect y="600" width="${W}" height="${H - 600}" fill="url(#w)"/>
<g opacity=".28" transform="translate(0 1200) scale(1 -1)"><path d="M0 590 L260 520 L520 580 L800 510 L1080 585 L1340 520 L1600 575 L1600 600 L0 600 Z" fill="#5d6c8c"/></g>
<ellipse cx="560" cy="700" rx="40" ry="140" fill="#fff4e0" fill-opacity=".35"/>
${mist}
<path d="M1180 760 q30 -10 60 0 l-8 14 h-44 Z" fill="#5d4a3e"/><line x1="1210" y1="750" x2="1210" y2="700" stroke="#5d4a3e" stroke-width="3"/>
</svg>`
}

// 🌌 星空草原
function starsSvg() {
  const r = rng(11)
  let stars = ''
  for (let i = 0; i < 260; i++) stars += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * 640).toFixed(0)}" r="${(0.6 + r() * 1.8).toFixed(1)}" fill="#fff" fill-opacity="${(0.35 + r() * 0.65).toFixed(2)}"/>`
  let flies = ''
  for (let i = 0; i < 30; i++) flies += `<circle cx="${(r() * W).toFixed(0)}" cy="${(700 + r() * 260).toFixed(0)}" r="${(2 + r() * 2.5).toFixed(1)}" fill="#f4f1a1" fill-opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`
  let grass = ''
  for (let i = 0; i < 120; i++) { const x = r() * W, h = 20 + r() * 40; grass += `<path d="M${x.toFixed(0)} ${H} q${(r() * 10 - 5).toFixed(0)} -${h.toFixed(0)} ${(r() * 16 - 8).toFixed(0)} -${(h + 10).toFixed(0)}" stroke="#0f2a24" stroke-width="2" fill="none"/>` }
  return open + `
<defs>
  <linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1030"/><stop offset=".6" stop-color="#1d2a5c"/><stop offset="1" stop-color="#3b3f73"/></linearGradient>
  <radialGradient id="mw" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#c9c3ff" stop-opacity=".35"/><stop offset="1" stop-color="#c9c3ff" stop-opacity="0"/></radialGradient>
  <filter id="g"><feGaussianBlur stdDeviation="2"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#n)"/>
<ellipse cx="800" cy="300" rx="900" ry="120" fill="url(#mw)" transform="rotate(-18 800 300)"/>
${stars}
<circle cx="1280" cy="170" r="46" fill="#fdf6dc"/><circle cx="1300" cy="160" r="44" fill="#1a2552"/>
<path d="M0 760 C 300 680 520 700 800 740 C 1080 780 1300 690 1600 720 L1600 ${H} L0 ${H} Z" fill="#183d35"/>
<path d="M0 830 C 360 780 700 820 1000 800 C 1250 785 1420 820 1600 800 L1600 ${H} L0 ${H} Z" fill="#12302a"/>
<g transform="translate(340 690)"><rect x="-6" y="0" width="12" height="70" fill="#0d221d"/><circle cx="0" cy="-20" r="46" fill="#0f2a24"/><circle cx="-30" cy="5" r="30" fill="#0f2a24"/><circle cx="30" cy="5" r="32" fill="#0f2a24"/></g>
${grass}
<g filter="url(#g)">${flies}</g>
</svg>`
}

// 🍂 秋日書房
function studySvg() {
  const r = rng(5)
  const colors = ['#b5523b', '#d9a441', '#5b7f6a', '#3f5c7a', '#8c5a7a', '#c97d4e', '#6d6a4f', '#e0c9a6']
  let books = ''
  for (let shelf = 0; shelf < 4; shelf++) {
    let x = 1040
    const y = 160 + shelf * 170
    while (x < 1500) {
      const w = 18 + r() * 22, h = 100 + r() * 40
      books += `<rect x="${x.toFixed(0)}" y="${(y + 140 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="2" fill="${colors[Math.floor(r() * colors.length)]}"/>`
      x += w + 3
    }
  }
  let leaves = ''
  for (let i = 0; i < 18; i++) { const x = 120 + r() * 700, y = 120 + r() * 700; leaves += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="11" ry="6" fill="${['#d9822b', '#c4532d', '#e8b04a'][i % 3]}" transform="rotate(${(r() * 180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill-opacity=".9"/>` }
  return open + `
<defs>
  <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe2cc"/><stop offset="1" stop-color="#e2cfb1"/></linearGradient>
  <linearGradient id="out" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d9a8"/><stop offset="1" stop-color="#f0b77e"/></linearGradient>
  <radialGradient id="sun" cx=".3" cy=".3" r=".8"><stop offset="0" stop-color="#fff3d6" stop-opacity=".6"/><stop offset="1" stop-color="#fff3d6" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#wall)"/>
<rect x="150" y="130" width="620" height="520" rx="6" fill="url(#out)"/>
<circle cx="360" cy="560" r="170" fill="#d8742f"/><circle cx="560" cy="600" r="140" fill="#c9562d"/><circle cx="460" cy="480" r="120" fill="#e39a3f"/><rect x="450" y="560" width="22" height="90" fill="#7a4a2c"/>
<rect x="150" y="130" width="620" height="520" rx="6" fill="none" stroke="#a07a55" stroke-width="22"/><rect x="449" y="130" width="22" height="520" fill="#a07a55"/><rect x="150" y="379" width="620" height="20" fill="#a07a55"/>
${leaves}
<rect x="1010" y="120" width="520" height="720" fill="#8b6243"/>
${[0, 1, 2, 3].map(s => `<rect x="1030" y="${300 + s * 170}" width="480" height="14" fill="#6e4b33"/>`).join('')}
${books}
<rect x="0" y="820" width="${W}" height="${H - 820}" fill="#9c7350"/>
<rect x="80" y="760" width="900" height="34" rx="6" fill="#7b5539"/><rect x="120" y="794" width="26" height="206" fill="#6a4830"/><rect x="910" y="794" width="26" height="206" fill="#6a4830"/>
<g transform="translate(620 700)"><rect x="-90" y="20" width="180" height="40" rx="4" fill="#f5ecda"/><line x1="0" y1="20" x2="0" y2="60" stroke="#d8c8a8" stroke-width="2"/><rect x="140" y="10" width="50" height="50" rx="8" fill="#e8dcc6"/><path d="M190 22 q20 4 0 26" stroke="#e8dcc6" stroke-width="8" fill="none"/></g>
<rect width="${W}" height="${H}" fill="url(#sun)"/>
</svg>`
}

// 🎋 竹林茶室（淡墨）
function bambooSvg() {
  const r = rng(9)
  let bamboo = ''
  const stalks = [1080, 1150, 1240, 1330, 1420, 1500]
  stalks.forEach((x, k) => {
    const op = (0.45 + (k % 3) * 0.18).toFixed(2), w = 14 + (k % 2) * 6
    bamboo += `<rect x="${x}" y="-20" width="${w}" height="1040" fill="#4d5a4f" fill-opacity="${op}"/>`
    for (let y = 60 + r() * 60; y < 1000; y += 120 + r() * 50) bamboo += `<rect x="${x - 2}" y="${y.toFixed(0)}" width="${w + 4}" height="5" fill="#3a443c" fill-opacity="${op}"/>`
    for (let i = 0; i < 7; i++) {
      const ly = 80 + r() * 700, dir = r() > 0.5 ? 1 : -1, ang = dir * (20 + r() * 40)
      bamboo += `<ellipse cx="${(x + w / 2 + dir * 46).toFixed(0)}" cy="${ly.toFixed(0)}" rx="52" ry="9" fill="#3f4c42" fill-opacity="${(Number(op) * 0.9).toFixed(2)}" transform="rotate(${ang.toFixed(0)} ${(x + w / 2).toFixed(0)} ${ly.toFixed(0)})"/>`
    }
  })
  return open + `
<defs>
  <linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f3ea"/><stop offset="1" stop-color="#ede6d6"/></linearGradient>
  <linearGradient id="i1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa39a" stop-opacity=".55"/><stop offset="1" stop-color="#9aa39a" stop-opacity="0"/></linearGradient>
  <linearGradient id="i2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f7a71" stop-opacity=".6"/><stop offset="1" stop-color="#6f7a71" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#p)"/>
<path d="M0 640 C 120 520 220 420 330 470 C 420 380 520 300 620 420 C 700 360 780 400 860 520 L 900 700 L0 700 Z" fill="url(#i1)"/>
<path d="M0 760 C 140 650 260 610 380 680 C 480 600 600 560 720 660 C 800 620 880 650 960 760 L 980 860 L0 860 Z" fill="url(#i2)"/>
<circle cx="760" cy="230" r="60" fill="#d9c9b4" fill-opacity=".5"/>
${bamboo}
<g transform="translate(300 830)"><rect x="-120" y="40" width="240" height="14" rx="3" fill="#5a4a3c" fill-opacity=".7"/><path d="M-40 40 q0 -50 40 -50 q40 0 40 50 Z" fill="#6e6157" fill-opacity=".75"/><path d="M40 10 q26 0 26 16" stroke="#6e6157" stroke-opacity=".75" stroke-width="6" fill="none"/><rect x="70" y="20" width="26" height="20" rx="4" fill="#6e6157" fill-opacity=".6"/></g>
<rect x="160" y="140" width="46" height="46" rx="4" fill="#b33a2e" fill-opacity=".85"/><text x="183" y="172" font-size="22" text-anchor="middle" fill="#f7f3ea" font-family="serif">靜</text>
</svg>`
}

export const PRESETS: { id: Exclude<WallpaperId, 'none' | 'custom'>; name: string; dark: boolean; make: () => string }[] = [
  { id: 'rain', name: '雨夜窗邊', dark: true, make: rainSvg },
  { id: 'lake', name: '清晨湖面', dark: false, make: lakeSvg },
  { id: 'stars', name: '星空草原', dark: true, make: starsSvg },
  { id: 'study', name: '秋日書房', dark: false, make: studySvg },
  { id: 'bamboo', name: '竹林茶室', dark: false, make: bambooSvg },
]
const cache = new Map<string, string>()
export function presetUrl(id: string): string | null {
  const p = PRESETS.find(x => x.id === id)
  if (!p) return null
  if (!cache.has(id)) cache.set(id, svgUrl(p.make()))
  return cache.get(id)!
}

// ── 設定（普通／紙本各一套）──
const key = (mode: string) => `wallpaper:${mode}`
export function loadWp(mode: 'default' | 'paper'): WallpaperSettings {
  try { return { ...DEFAULT_WP, ...JSON.parse(localStorage.getItem(key(mode)) || '{}') } } catch { return DEFAULT_WP }
}
export function saveWp(mode: 'default' | 'paper', s: WallpaperSettings) {
  try { localStorage.setItem(key(mode), JSON.stringify(s)) } catch { /* ignore */ }
}

// ── 自己上傳嘅相（縮細到最闊 2400px JPEG，存 IndexedDB）──
const DB = 'reading-wallpaper-db', STORE = 'img'
function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1)
    q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains(STORE)) q.result.createObjectStore(STORE) }
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error)
  })
}
export async function saveCustomImage(file: File): Promise<void> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const blob: Blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('轉換失敗'))), 'image/jpeg', 0.86))
  const db = await openDB()
  await new Promise<void>((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, 'custom'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
}
export async function getCustomImageUrl(): Promise<string | null> {
  try {
    const db = await openDB()
    const blob = await new Promise<Blob | null>((res, rej) => { const q = db.transaction(STORE, 'readonly').objectStore(STORE).get('custom'); q.onsuccess = () => res((q.result as Blob) ?? null); q.onerror = () => rej(q.error) })
    return blob ? URL.createObjectURL(blob) : null
  } catch { return null }
}
