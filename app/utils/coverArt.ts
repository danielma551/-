// 【自動封面】冇封面圖嘅書，按書名／內容關鍵字推斷題材，生成一張 SVG 封面（唔使網絡）。
// 生成結果係 data URI，可直接做 backgroundImage。

type Motif = 'sun' | 'moon' | 'mountains' | 'leaves' | 'grid' | 'waves' | 'stars' | 'arches'

interface Theme {
  from: string
  to: string
  ink: string   // 圖案顏色（半透明用 rgba）
  motif: Motif
}

const THEMES: Array<{ test: RegExp; theme: Theme }> = [
  {
    test: /得到頭条|得到头条|商業|商业|經濟|经济|公司|市場|市场|投資|投资|財經|财经|職場|职场|創業|创业|科技|AI|人工智能|芯片|產業|产业/,
    theme: { from: '#FF8A65', to: '#C2410C', ink: '#FFD166', motif: 'sun' },
  },
  {
    test: /夜|罪|懸疑|悬疑|推理|小說|小说|故事|凶手|谋杀|謀殺|暗|迷|局/,
    theme: { from: '#2E3A6E', to: '#141A33', ink: '#A5B4FC', motif: 'moon' },
  },
  {
    test: /人生|哲學|哲学|心理|意義|意义|自由|思考|幸福|孤獨|孤独|情緒|情绪|療癒|疗愈/,
    theme: { from: '#6D5A8C', to: '#3B2E4F', ink: '#FFD166', motif: 'stars' },
  },
  {
    test: /歷史|历史|文明|文化|人文|課|课|中國|中国|世界史|帝國|帝国|王朝/,
    theme: { from: '#A9714B', to: '#4A2F22', ink: '#E8C9A0', motif: 'arches' },
  },
  {
    test: /山|海|旅行|自然|食|茶|花|園|园|森林|河|湖|島|岛|風景|风景|民宿/,
    theme: { from: '#4E9B7A', to: '#1F5A45', ink: '#FFE7A3', motif: 'mountains' },
  },
  {
    test: /詩|诗|散文|隨筆|随笔|記|记|日記|日记|書信|书信/,
    theme: { from: '#9BAE8C', to: '#4F6B4A', ink: '#FFF3D6', motif: 'leaves' },
  },
  {
    test: /數學|数学|物理|科學|科学|技術|技术|程式|编程|編程|數據|数据|算法|設計|设计/,
    theme: { from: '#3E7C8C', to: '#1E3F4A', ink: '#B6F2E1', motif: 'grid' },
  },
]

const DEFAULT_THEME: Theme = { from: '#8A6A3B', to: '#3E2C1A', ink: '#FFD166', motif: 'waves' }

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pickTheme(text: string): Theme {
  for (const t of THEMES) if (t.test.test(text)) return t.theme
  return DEFAULT_THEME
}

function motifSvg(motif: Motif, ink: string, seed: number): string {
  const o = (v: number) => (v * 0.1 + (seed % 7) * 0.04).toFixed(2)
  switch (motif) {
    case 'sun':
      return `
        <circle cx="210" cy="120" r="58" fill="${ink}" opacity=".55"/>
        <g stroke="${ink}" stroke-width="6" stroke-linecap="round" opacity=".5">
          <path d="M210 30v24M210 186v24M120 120h24M276 120h24M146 56l17 17M257 167l17 17M274 56l-17 17M163 167l-17 17"/>
        </g>
        <path d="M0 330 Q75 280 150 320 T300 300 V450 H0 Z" fill="${ink}" opacity=".22"/>`
    case 'moon':
      return `
        <circle cx="208" cy="118" r="56" fill="${ink}" opacity=".8"/>
        <circle cx="230" cy="104" r="46" fill="#141A33" opacity=".92"/>
        <g fill="${ink}" opacity=".85">
          <circle cx="120" cy="80" r="3"/><circle cx="155" cy="150" r="2.5"/><circle cx="90" cy="180" r="2"/>
          <circle cx="250" cy="200" r="2.5"/><circle cx="170" cy="220" r="2"/>
        </g>`
    case 'mountains':
      return `
        <path d="M0 360 L90 240 L160 330 L230 210 L300 330 V450 H0 Z" fill="${ink}" opacity=".28"/>
        <path d="M0 400 L120 300 L210 390 L300 320 V450 H0 Z" fill="${ink}" opacity=".18"/>`
    case 'leaves':
      return `
        <g stroke="${ink}" stroke-width="5" stroke-linecap="round" fill="none" opacity=".6">
          <path d="M60 380 Q120 280 200 200"/>
          <path d="M120 300 q-40 -40 -10 -70 q40 20 10 70"/>
          <path d="M165 245 q10 -50 55 -55 q5 45 -55 55"/>
          <path d="M95 345 q-45 -10 -55 -50 q45 -5 55 50"/>
        </g>`
    case 'grid':
      return `
        <g stroke="${ink}" stroke-width="3" opacity=".35">
          <path d="M40 60 H260 M40 120 H260 M40 180 H260 M40 240 H260"/>
          <path d="M90 40 V280 M150 40 V280 M210 40 V280"/>
        </g>
        <circle cx="150" cy="160" r="34" fill="${ink}" opacity=".5"/>`
    case 'stars':
      return `
        <g fill="${ink}">
          <circle cx="180" cy="90" r="4"/><circle cx="120" cy="140" r="3"/><circle cx="230" cy="170" r="3.5"/>
          <circle cx="90" cy="220" r="2.5"/><circle cx="200" cy="250" r="2.5"/><circle cx="150" cy="300" r="2"/>
        </g>
        <g stroke="${ink}" stroke-width="2" opacity=".45">
          <path d="M120 140 L180 90 L230 170 L200 250 L90 220 Z"/>
        </g>`
    case 'arches':
      return `
        <g fill="none" stroke="${ink}" stroke-width="6" opacity=".45">
          <path d="M50 400 V220 a50 50 0 0 1 100 0 V400"/>
          <path d="M150 400 V200 a50 50 0 0 1 100 0 V400"/>
        </g>`
    case 'waves':
    default:
      return `
        <g stroke="${ink}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".4">
          <path d="M-20 300 q40 -36 80 0 t80 0 t80 0 t80 0"/>
          <path d="M-20 360 q40 -36 80 0 t80 0 t80 0 t80 0"/>
        </g>`
  }
}

function buildSvg(theme: Theme, seed: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" width="300" height="450">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${theme.from}"/>
        <stop offset="1" stop-color="${theme.to}"/>
      </linearGradient>
      <pattern id="d" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.4" fill="#ffffff" opacity=".10"/>
      </pattern>
    </defs>
    <rect width="300" height="450" fill="url(#g)"/>
    <rect width="300" height="450" fill="url(#d)"/>
    ${motifSvg(theme.motif, theme.ink, seed)}
    <rect x="6" y="6" width="288" height="438" rx="18" fill="none" stroke="#ffffff" stroke-width="3" opacity=".35"/>
  </svg>` 
}

/** 回傳可直接放 backgroundImage 嘅 data URI；用書名＋前幾句推斷題材。 */
export function getGeneratedCover(book: { title: string; sentences?: string[] }): string {
  const sample = book.sentences?.slice(0, 12).join(' ') ?? ''
  const theme = pickTheme(`${book.title} ${sample}`)
  const seed = hashString(book.title)
  const svg = buildSvg(theme, seed)
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
