// 【自動封面】冇封面圖嘅書，按書名／內容關鍵字推斷題材，生成一張 SVG 封面（離線、免網絡）。
// 每本書用自己嘅 hash 揀配色、圖案、構圖、角度同裝飾，同題材都唔會一模一樣。

type Motif = 'sun' | 'moon' | 'mountains' | 'leaves' | 'grid' | 'waves' | 'stars' | 'arches'

interface Palette { from: string; to: string; ink: string }
interface Theme { palettes: Palette[]; motifs: Motif[] }

const THEMES: Array<{ test: RegExp; theme: Theme }> = [
  {
    test: /得到頭条|得到头条|商業|商业|經濟|经济|公司|市場|市场|投資|投资|財經|财经|職場|职场|創業|创业|科技|AI|人工智能|芯片|產業|产业/,
    theme: {
      palettes: [
        { from: '#FF8A65', to: '#C2410C', ink: '#FFD166' },
        { from: '#F59E0B', to: '#7C2D12', ink: '#FFE7A3' },
        { from: '#2F7D4F', to: '#0F3D2E', ink: '#FFD166' },
      ],
      motifs: ['sun', 'grid', 'waves'],
    },
  },
  {
    test: /夜|罪|懸疑|悬疑|推理|小說|小说|故事|凶手|谋杀|謀殺|暗|迷|局/,
    theme: {
      palettes: [
        { from: '#2E3A6E', to: '#141A33', ink: '#A5B4FC' },
        { from: '#3B2F4F', to: '#161022', ink: '#C4B5FD' },
        { from: '#1F3A3D', to: '#0B1B1D', ink: '#6ED3B6' },
      ],
      motifs: ['moon', 'stars', 'waves'],
    },
  },
  {
    test: /人生|哲學|哲学|心理|意義|意义|自由|思考|幸福|孤獨|孤独|情緒|情绪|療癒|疗愈/,
    theme: {
      palettes: [
        { from: '#6D5A8C', to: '#3B2E4F', ink: '#FFD166' },
        { from: '#8C5A6D', to: '#3E2430', ink: '#FFE7A3' },
        { from: '#2E3A6E', to: '#1A1F3D', ink: '#FFD166' },
      ],
      motifs: ['stars', 'moon'],
    },
  },
  {
    test: /歷史|历史|文明|文化|人文|課|课|中國|中国|世界史|帝國|帝国|王朝/,
    theme: {
      palettes: [
        { from: '#A9714B', to: '#4A2F22', ink: '#E8C9A0' },
        { from: '#8C7A4B', to: '#3E3520', ink: '#F0E2C8' },
        { from: '#8C4B4B', to: '#3E1F1F', ink: '#E8C9A0' },
      ],
      motifs: ['arches', 'grid'],
    },
  },
  {
    test: /山|海|旅行|自然|食|茶|花|園|园|森林|河|湖|島|岛|風景|风景|民宿/,
    theme: {
      palettes: [
        { from: '#4E9B7A', to: '#1F5A45', ink: '#FFE7A3' },
        { from: '#7A9B4E', to: '#2F4A1F', ink: '#FFF3D6' },
        { from: '#4E7A9B', to: '#1F3F5A', ink: '#B6F2E1' },
      ],
      motifs: ['mountains', 'leaves', 'waves'],
    },
  },
  {
    test: /詩|诗|散文|隨筆|随笔|記|记|日記|日记|書信|书信/,
    theme: {
      palettes: [
        { from: '#9BAE8C', to: '#4F6B4A', ink: '#FFF3D6' },
        { from: '#B59B7A', to: '#5A4630', ink: '#FFF3D6' },
        { from: '#B59BC4', to: '#5A3F6B', ink: '#FFF3D6' },
      ],
      motifs: ['leaves', 'waves'],
    },
  },
  {
    test: /數學|数学|物理|科學|科学|技術|技术|程式|编程|編程|數據|数据|算法|設計|设计/,
    theme: {
      palettes: [
        { from: '#3E7C8C', to: '#1E3F4A', ink: '#B6F2E1' },
        { from: '#3E5E8C', to: '#1E2A4A', ink: '#A5B4FC' },
        { from: '#5E3E8C', to: '#2A1E4A', ink: '#D5C8FF' },
      ],
      motifs: ['grid', 'sun', 'stars'],
    },
  },
]

const DEFAULT_THEME: Theme = {
  palettes: [
    { from: '#8A6A3B', to: '#3E2C1A', ink: '#FFD166' },
    { from: '#4E7A9B', to: '#1F3F5A', ink: '#B6F2E1' },
  ],
  motifs: ['waves', 'stars'],
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pickTheme(text: string): Theme {
  for (const t of THEMES) if (t.test.test(text)) return t.theme
  return DEFAULT_THEME
}

function motifSvg(motif: Motif, ink: string): string {
  switch (motif) {
    case 'sun':
      return `
        <circle cx="210" cy="130" r="54" fill="${ink}" opacity=".55"/>
        <g stroke="${ink}" stroke-width="6" stroke-linecap="round" opacity=".45">
          <path d="M210 44v22M210 194v22M124 130h22M274 130h22M148 68l15 15M257 177l15 15M272 68l-15 15M163 177l-15 15"/>
        </g>`
    case 'moon':
      return `
        <circle cx="208" cy="132" r="54" fill="${ink}" opacity=".85"/>
        <circle cx="230" cy="116" r="44" fill="#141A33" opacity=".92"/>
        <g fill="${ink}" opacity=".8">
          <circle cx="118" cy="92" r="3"/><circle cx="152" cy="160" r="2.5"/><circle cx="88" cy="190" r="2"/>
          <circle cx="248" cy="210" r="2.5"/><circle cx="170" cy="230" r="2"/>
        </g>`
    case 'mountains':
      return `
        <path d="M0 372 L92 248 L164 342 L236 216 L300 330 V450 H0 Z" fill="${ink}" opacity=".26"/>
        <path d="M0 408 L122 306 L212 396 L300 326 V450 H0 Z" fill="${ink}" opacity=".17"/>`
    case 'leaves':
      return `
        <g stroke="${ink}" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55">
          <path d="M64 386 Q126 282 206 198"/>
          <path d="M126 300 q-42 -42 -10 -74 q42 22 10 74"/>
          <path d="M170 244 q10 -52 57 -57 q5 47 -57 57"/>
          <path d="M98 348 q-46 -12 -57 -52 q47 -6 57 52"/>
        </g>`
    case 'grid':
      return `
        <g stroke="${ink}" stroke-width="3" opacity=".3">
          <path d="M40 70 H260 M40 130 H260 M40 190 H260 M40 250 H260"/>
          <path d="M90 50 V270 M150 50 V270 M210 50 V270"/>
        </g>
        <circle cx="150" cy="160" r="32" fill="${ink}" opacity=".45"/>`
    case 'stars':
      return `
        <g fill="${ink}">
          <circle cx="180" cy="96" r="4"/><circle cx="118" cy="146" r="3"/><circle cx="232" cy="176" r="3.5"/>
          <circle cx="88" cy="226" r="2.5"/><circle cx="200" cy="256" r="2.5"/><circle cx="150" cy="306" r="2"/>
        </g>
        <g stroke="${ink}" stroke-width="2" opacity=".4">
          <path d="M118 146 L180 96 L232 176 L200 256 L88 226 Z"/>
        </g>`
    case 'arches':
      return `
        <g fill="none" stroke="${ink}" stroke-width="6" opacity=".4">
          <path d="M46 408 V232 a50 50 0 0 1 100 0 V408"/>
          <path d="M150 408 V210 a50 50 0 0 1 100 0 V408"/>
        </g>`
    case 'waves':
    default:
      return `
        <g stroke="${ink}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".35">
          <path d="M-20 306 q40 -36 80 0 t80 0 t80 0 t80 0"/>
          <path d="M-20 366 q40 -36 80 0 t80 0 t80 0 t80 0"/>
        </g>`
  }
}

function buildSvg(palette: Palette, motif: Motif, seed: number): string {
  const angles: Array<[string, string, string, string]> = [
    ['0', '0', '1', '1'],
    ['1', '0', '0', '1'],
    ['0', '1', '1', '0'],
    ['0', '0', '0', '1'],
  ]
  const [x1, y1, x2, y2] = angles[seed % angles.length]
  const layout = (seed >> 4) % 4
  const scale = 0.82 + ((seed >> 6) % 5) * 0.06
  const rot = (((seed >> 8) % 5) - 2) * 5
  const transforms = [
    `translate(0,0) scale(${scale}) rotate(${rot} 150 225)`,
    `translate(-22,72) scale(${scale * 0.9}) rotate(${rot} 150 225)`,
    `translate(26,-26) scale(${scale * 0.82}) rotate(${rot} 150 225)`,
    `translate(300,0) scale(-1,1) translate(0,0) scale(${scale}) rotate(${rot} 150 225)`,
  ]
  const motifTransform = transforms[layout]
  // 隨機小裝飾（同書名掛鉤，穩定）
  const rnd = (n: number) => ((seed >> n) % 1000) / 1000
  const deco = `
    <circle cx="${40 + rnd(3) * 220}" cy="${60 + rnd(5) * 320}" r="${18 + rnd(7) * 26}" fill="${palette.ink}" opacity=".10"/>
    <circle cx="${40 + rnd(9) * 220}" cy="${60 + rnd(11) * 320}" r="${10 + rnd(13) * 18}" fill="#ffffff" opacity=".08"/>
    <path d="M0 ${330 + rnd(15) * 60} Q80 ${300 + rnd(17) * 40} 160 ${340 + rnd(19) * 50} T300 ${330 + rnd(21) * 60} V450 H0 Z" fill="${palette.ink}" opacity=".13"/>
  `
  const patternOpacity = 0.06 + rnd(23) * 0.06
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" width="300" height="450">
    <defs>
      <linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
        <stop offset="0" stop-color="${palette.from}"/>
        <stop offset="1" stop-color="${palette.to}"/>
      </linearGradient>
      <pattern id="d" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.4" fill="#ffffff" opacity="${patternOpacity.toFixed(2)}"/>
      </pattern>
    </defs>
    <rect width="300" height="450" fill="url(#g)"/>
    <rect width="300" height="450" fill="url(#d)"/>
    ${deco}
    <g transform="${motifTransform}">${motifSvg(motif, palette.ink)}</g>
    <rect x="6" y="6" width="288" height="438" rx="18" fill="none" stroke="#ffffff" stroke-width="3" opacity=".32"/>
  </svg>`
}

/** 回傳可直接放 backgroundImage 嘅 data URI；用書名＋前幾句推斷題材，並用 hash 做變化。 */
export function getGeneratedCover(book: { title: string; sentences?: string[] }): string {
  const sample = book.sentences?.slice(0, 12).join(' ') ?? ''
  const theme = pickTheme(`${book.title} ${sample}`)
  const seed = hashString(book.title)
  const palette = theme.palettes[seed % theme.palettes.length]
  const motif = theme.motifs[(seed >> 2) % theme.motifs.length]
  const svg = buildSvg(palette, motif, seed)
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
