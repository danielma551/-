'use client'

// 【生成藝術題圖】演算法哲學：Drifting Currents（流動的暗湧）
// 以「書名＋循環」為種子，程序化生成一組流動曲線 + 節點，
// 同一種子永遠得出同一圖案；換循環即換紋樣。零外部依賴、純 SVG、瀏覽器內即算。

interface Props {
  seed: string
  width?: number
  height?: number
  palette?: string[]
}

// 字串 → 32-bit 雜湊（FNV-1a）
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
// 種子亂數（mulberry32）：可重現
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DEFAULT_PALETTE = ['#0f766e', '#14b8a6', '#a16207', '#c2620a', '#8d867a']

export default function GenerativeArt({ seed, width = 168, height = 56, palette = DEFAULT_PALETTE }: Props) {
  const rnd = mulberry32(hashStr(seed))
  const pick = () => palette[Math.floor(rnd() * palette.length)]

  // 流動曲線：橫向貝茲，控制點以種子擾動 → 似暗湧
  const lines = 5 + Math.floor(rnd() * 3)
  const paths: { d: string; c: string; w: number; o: number }[] = []
  for (let i = 0; i < lines; i++) {
    const y = height * (0.18 + 0.64 * rnd())
    const amp = height * (0.12 + 0.28 * rnd())
    const yAt = () => (y - amp + amp * 2 * rnd())
    const d = `M0 ${y.toFixed(1)} C ${(width * 0.3).toFixed(1)} ${yAt().toFixed(1)}, ${(width * 0.7).toFixed(1)} ${yAt().toFixed(1)}, ${width} ${yAt().toFixed(1)}`
    paths.push({ d, c: pick(), w: 0.8 + 1.3 * rnd(), o: 0.22 + 0.4 * rnd() })
  }

  // 幾個漂浮節點
  const dots: { cx: number; cy: number; r: number; c: string }[] = []
  const dn = 2 + Math.floor(rnd() * 3)
  for (let i = 0; i < dn; i++) dots.push({ cx: width * rnd(), cy: height * (0.2 + 0.6 * rnd()), r: 1 + 2.2 * rnd(), c: pick() })

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }} aria-hidden="true">
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={p.c} strokeWidth={p.w} strokeOpacity={p.o} strokeLinecap="round" />
      ))}
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.c} fillOpacity={0.5} />
      ))}
    </svg>
  )
}
