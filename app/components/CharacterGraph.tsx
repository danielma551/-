'use client'

// 【人物關係圖】— 視覺升級版
// 力導向圖（force-directed graph）：節點=人物，連線=共現／關係。
// 純客戶端，不需要 D3。視覺：曲線連線 + 光澤節點 + 自動置中。
// 邏輯（LLM 分析、快取、啟發式退回、拖動、hover）與原版完全相同。

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, RefreshCw, BookOpen } from 'lucide-react'
import { analyzeCharacters, analyzeCharactersWithLLM, CharacterGraph as GraphData } from '../utils/characterAnalysis'

interface Props {
  sentences: string[]
  bookTitle: string
  onClose: () => void
  deepseekKey?: string    // 有 DeepSeek key 時用 AI 分析（更準），否則退回啟發式
  bookId?: string         // 用於快取：每本書只跑一次 AI
}

// ── 結果快取（localStorage）：每本書只需呼叫一次 AI ──
const CACHE_PREFIX = 'char-graph:v1:'

function loadCache(bookId?: string): GraphData | null {
  if (!bookId || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + bookId)
    if (!raw) return null
    const data = JSON.parse(raw) as GraphData
    if (data && Array.isArray(data.characters) && data.characters.length > 0) return data
  } catch { /* 忽略損壞快取 */ }
  return null
}

function saveCache(bookId: string | undefined, data: GraphData) {
  if (!bookId || typeof window === 'undefined') return
  try { localStorage.setItem(CACHE_PREFIX + bookId, JSON.stringify(data)) } catch { /* 配額滿則略過 */ }
}

function clearCache(bookId?: string) {
  if (!bookId || typeof window === 'undefined') return
  try { localStorage.removeItem(CACHE_PREFIX + bookId) } catch { /* ignore */ }
}

// ── 顏色調色盤（依角色重要性排序）──
const PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9',
  '#8b5cf6', '#f43f5e', '#14b8a6', '#f97316', '#a855f7',
  '#22c55e', '#3b82f6', '#eab308', '#06b6d4', '#d946ef',
  '#84cc16', '#fb923c', '#4ade80', '#38bdf8', '#ef4444',
]

// ── 力導向物理模擬 ──
interface Node {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  color: string
  count: number
  dialogues: number
}

interface Edge {
  source: string
  target: string
  strength: number
  label?: string
}

function buildGraph(data: GraphData, width: number, height: number): { nodes: Node[]; edges: Edge[] } {
  const n = data.characters.length
  const cx = width / 2
  const cy = height / 2
  const initR = Math.min(width, height) * 0.32

  const maxCount = Math.max(...data.characters.map(c => c.count), 1)

  const nodes: Node[] = data.characters.map((char, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    const r = 20 + Math.sqrt(char.count / maxCount) * 26
    return {
      id: char.name,
      x: cx + initR * Math.cos(angle) + (Math.random() - 0.5) * 10,
      y: cy + initR * Math.sin(angle) + (Math.random() - 0.5) * 10,
      vx: 0,
      vy: 0,
      r,
      color: PALETTE[i % PALETTE.length],
      count: char.count,
      dialogues: char.dialogues,
    }
  })

  const maxStrength = Math.max(...data.relations.map(r => r.strength), 1)
  const edges: Edge[] = data.relations.map(rel => ({
    source: rel.source,
    target: rel.target,
    strength: rel.strength / maxStrength,
    label: rel.label,
  }))

  return { nodes, edges }
}

function runTick(nodes: Node[], edges: Edge[], width: number, height: number) {
  const REPULSION = 7600
  const SPRING_LEN = 158
  const SPRING_K = 0.05
  const DAMP = 0.82
  const GRAVITY = 0.022
  const cx = width / 2
  const cy = height / 2

  // Reset forces
  nodes.forEach(n => { n.vx *= DAMP; n.vy *= DAMP })

  // Node-node repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]
      const dx = b.x - a.x || 0.01
      const dy = b.y - a.y || 0.01
      const dist2 = dx * dx + dy * dy
      const dist = Math.sqrt(dist2)
      const minDist = a.r + b.r + 36
      const force = REPULSION / dist2
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx -= fx; a.vy -= fy
      b.vx += fx; b.vy += fy
      // Overlap correction
      if (dist < minDist) {
        const overlap = (minDist - dist) / 2
        const ox = (dx / dist) * overlap
        const oy = (dy / dist) * overlap
        a.x -= ox; a.y -= oy
        b.x += ox; b.y += oy
      }
    }
  }

  // Edge spring forces
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  for (const edge of edges) {
    const a = nodeMap.get(edge.source)
    const b = nodeMap.get(edge.target)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const targetLen = SPRING_LEN * (1 - edge.strength * 0.4)
    const disp = dist - targetLen
    const force = SPRING_K * disp
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    a.vx += fx; a.vy += fy
    b.vx -= fx; b.vy -= fy
  }

  // Center gravity
  nodes.forEach(n => {
    n.vx += (cx - n.x) * GRAVITY
    n.vy += (cy - n.y) * GRAVITY
  })

  // Apply velocity + boundary
  nodes.forEach(n => {
    n.x += n.vx
    n.y += n.vy
    n.x = Math.max(n.r + 40, Math.min(width - n.r - 40, n.x))
    n.y = Math.max(n.r + 36, Math.min(height - n.r - 36, n.y))
  })
}

// ── 視覺輔助：把整體外框平移到畫布中央，避免偏向一角 ──
function recenterNodes(nodes: Node[], width: number, height: number) {
  if (nodes.length === 0) return
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  nodes.forEach(n => {
    minX = Math.min(minX, n.x - n.r); maxX = Math.max(maxX, n.x + n.r)
    minY = Math.min(minY, n.y - n.r); maxY = Math.max(maxY, n.y + n.r)
  })
  const sx = (width - (minX + maxX)) / 2
  const sy = (height - (minY + maxY)) / 2
  nodes.forEach(n => { n.x += sx; n.y += sy })
}

// ── 視覺輔助：彎曲連線（二次貝茲），回傳路徑與標籤錨點 ──
function edgePath(a: Node, b: Node): { d: string; mx: number; my: number } {
  const dx = b.x - a.x, dy = b.y - a.y
  const dist = Math.hypot(dx, dy) || 1
  const off = Math.min(46, dist * 0.14)
  const cx = (a.x + b.x) / 2 + (-dy / dist) * off
  const cy = (a.y + b.y) / 2 + (dx / dist) * off
  // 二次貝茲在 t=0.5 的點：0.25A + 0.5C + 0.25B
  const mx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x
  const my = 0.25 * a.y + 0.5 * cy + 0.25 * b.y
  return { d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, mx, my }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export default function CharacterGraph({ sentences, bookTitle, onClose, deepseekKey, bookId }: Props) {
  const canvasW = 800
  const canvasH = 560
  const svgRef = useRef<SVGSVGElement>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [analyzing, setAnalyzing] = useState(true)
  const [noData, setNoData] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const mountedRef = useRef(true)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null)
  const nodesRef = useRef<Node[]>([])
  const edgesRef = useRef<Edge[]>([])
  const draggingRef = useRef<Node | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  // 追蹤掛載狀態，避免 await 期間 modal 被關閉後仍 setState
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // 分析：快取優先 → AI（有 key）→ 啟發式。force=true 跳過快取重新分析。
  const runAnalysis = useCallback(async (force: boolean) => {
    setAnalyzing(true)
    setNoData(false)
    setWarning(null)
    setFromCache(false)

    const applyResult = (result: GraphData, cached: boolean) => {
      if (!mountedRef.current) return
      if (result.characters.length === 0) {
        setNoData(true)
        setAnalyzing(false)
        return
      }
      setFromCache(cached)
      setGraphData(result)
      const { nodes: ns, edges: es } = buildGraph(result, canvasW, canvasH)
      // 一次過跑完模擬，定格佈局（唔再飄來飄去），再置中
      for (let k = 0; k < 520; k++) runTick(ns, es, canvasW, canvasH)
      recenterNodes(ns, canvasW, canvasH)
      nodesRef.current = ns
      edgesRef.current = es
      setNodes([...ns])
      setEdges([...es])
      setAnalyzing(false)
    }

    // 1. 快取優先（每本書只需一次 AI 呼叫）
    if (!force) {
      const cached = loadCache(bookId)
      if (cached) { applyResult(cached, true); return }
    }

    // 2. 有 DeepSeek key → AI 分析，成功才寫入快取
    if (deepseekKey) {
      try {
        const result = await analyzeCharactersWithLLM(sentences, deepseekKey)
        saveCache(bookId, result)
        applyResult(result, false)
        return
      } catch (err) {
        if (mountedRef.current) {
          const msg = err instanceof Error ? err.message : '未知錯誤'
          setWarning(`AI 分析失敗（${msg}），已改用基礎分析`)
        }
      }
    }

    // 3. 退回啟發式（不寫快取，保留日後用 AI 重算的機會）
    applyResult(analyzeCharacters(sentences), false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentences, bookId, deepseekKey])

  // 掛載時分析（稍微延遲讓 Loading 動畫先渲染）
  useEffect(() => {
    const t = setTimeout(() => { runAnalysis(false) }, 80)
    return () => clearTimeout(t)
  }, [runAnalysis])

  // 重新分析：清快取後強制重跑（會再用一次 AI）
  const handleReanalyze = useCallback(() => {
    clearCache(bookId)
    runAnalysis(true)
  }, [bookId, runAnalysis])

  // 佈局已在 applyResult 同步定格，唔再用動畫迴圈（避免飄動）

  // Drag handlers (SVG coordinates)
  const getSVGPoint = (e: React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const scaleX = canvasW / rect.width
    const scaleY = canvasH / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const handleMouseDown = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = node
    const pt = getSVGPoint(e)
    dragOffsetRef.current = { x: pt.x - node.x, y: pt.y - node.y }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return
    const pt = getSVGPoint(e)
    draggingRef.current.x = pt.x - dragOffsetRef.current.x
    draggingRef.current.y = pt.y - dragOffsetRef.current.y
    setNodes([...nodesRef.current])
  }, [])

  // 放手即定格，唔再重新模擬（保持穩定不飄）
  const handleMouseUp = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = null
    setNodes([...nodesRef.current])
  }, [])

  // Backdrop click to close
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const hoveredId = hoveredNode?.id
  // hover 時，與該人物有關係嘅鄰居集合（用嚟突出顯示）
  const neighborIds = new Set<string>()
  if (hoveredId) {
    neighborIds.add(hoveredId)
    for (const e of edges) {
      if (e.source === hoveredId) neighborIds.add(e.target)
      if (e.target === hoveredId) neighborIds.add(e.source)
    }
  }
  // 由人物次序對應調色盤顏色（給下方關係清單用）
  const colorOf = (name: string) => {
    const idx = graphData?.characters.findIndex(c => c.name === name) ?? -1
    return idx >= 0 ? PALETTE[idx % PALETTE.length] : '#9ca3af'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(155deg,#6366f1,#8b5cf6)', boxShadow: '0 6px 16px rgba(99,102,241,.34)' }}
            >
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">
                《{bookTitle}》人物關係圖
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {graphData?.source === 'llm'
                  ? '節點大小 = 重要度 · 滑過人物即顯示其關係 · 下方有完整清單'
                  : '基於共現分析 · 節點大小 = 出現頻率 · 連線粗細 = 互動頻率'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {deepseekKey && !analyzing && (
              <button
                onClick={handleReanalyze}
                title="重新用 AI 分析（會再花一次 API 呼叫）"
                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className="relative"
          style={{ background: 'radial-gradient(115% 95% at 50% -8%, #f4f2ff 0%, #fafafb 52%, #ffffff 100%)' }}
        >
          {analyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10" style={{ minHeight: 320 }}>
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-sm text-gray-500">{deepseekKey ? 'DeepSeek AI 分析人物關係中…' : '分析人物中…'}</p>
            </div>
          )}

          {noData && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="text-4xl">🤷</div>
              <p className="text-sm text-gray-500">未能識別足夠的人物（可能是散文、非小說類書籍）</p>
            </div>
          )}

          {!analyzing && !noData && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvasW} ${canvasH}`}
              className="w-full"
              style={{ display: 'block', userSelect: 'none', cursor: draggingRef.current ? 'grabbing' : 'default' }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <defs>
                <radialGradient id="cg-sheen" cx="36%" cy="28%" r="78%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity={0.42} />
                  <stop offset="55%" stopColor="#ffffff" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                </radialGradient>
                <filter id="cg-shadow" x="-60%" y="-60%" width="220%" height="220%">
                  <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#312e81" floodOpacity={0.2} />
                </filter>
              </defs>

              {/* Edges：hover 某人物時，只突出佢嘅連線，其餘淡化 */}
              {edges.map((edge, i) => {
                const a = nodeMap.get(edge.source)
                const b = nodeMap.get(edge.target)
                if (!a || !b) return null
                const connected = !hoveredId || edge.source === hoveredId || edge.target === hoveredId
                const strokeW = 1.5 + edge.strength * 5
                const { d } = edgePath(a, b)
                return (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={strokeW}
                    strokeOpacity={connected ? 0.26 + edge.strength * 0.42 : 0.05}
                    strokeLinecap="round"
                  />
                )
              })}

              {/* Edge labels：只喺 hover 人物時顯示佢嘅關係（保持平時乾淨，完整清單在下方） */}
              {hoveredId && edges
                .filter(edge => edge.label && (edge.source === hoveredId || edge.target === hoveredId))
                .map((edge, i) => {
                  const a = nodeMap.get(edge.source)
                  const b = nodeMap.get(edge.target)
                  if (!a || !b || !edge.label) return null
                  const { mx, my } = edgePath(a, b)
                  const w = edge.label.length * 13 + 14
                  const c = a.color
                  return (
                    <g key={`elabel-${i}`} style={{ pointerEvents: 'none' }}>
                      <rect x={mx - w / 2} y={my - 11} width={w} height={22} rx={7}
                        fill="white" stroke={c} strokeWidth={1} opacity={0.97} />
                      <text x={mx} y={my + 4} textAnchor="middle"
                        fontSize="11.5" fontWeight="700" fill={c}>
                        {edge.label}
                      </text>
                    </g>
                  )
                })}

              {/* Nodes */}
              {nodes.map((node) => {
                const dimmed = hoveredId ? !neighborIds.has(node.id) : false
                const isHover = hoveredNode?.id === node.id
                const maxChars = Math.max(3, Math.floor(node.r / 6))
                const display = node.id.length > maxChars ? node.id.slice(0, maxChars - 1) + '…' : node.id
                return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ cursor: 'grab', opacity: dimmed ? 0.2 : 1, transition: 'opacity .18s' }}
                  onMouseDown={e => handleMouseDown(e, node)}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Outer glow */}
                  <circle
                    r={node.r + 7}
                    fill={node.color}
                    opacity={isHover ? 0.3 : 0.14}
                  />
                  {/* Main circle */}
                  <circle
                    r={node.r}
                    fill={node.color}
                    stroke="white"
                    strokeWidth={3}
                    filter="url(#cg-shadow)"
                  />
                  {/* Glossy sheen */}
                  <circle r={node.r} fill="url(#cg-sheen)" style={{ pointerEvents: 'none' }} />
                  {/* Name label（過長自動截斷，完整名見 tooltip 與下方清單）*/}
                  <text
                    textAnchor="middle"
                    dy="0.34em"
                    fontSize={node.r > 32 ? '15' : '12'}
                    fontWeight="700"
                    fill="white"
                    style={{ pointerEvents: 'none', letterSpacing: '0.5px' }}
                  >
                    {display}
                  </text>
                  {/* Tooltip on hover */}
                  {isHover && (
                    <g transform={`translate(${node.r + 8}, ${-node.r})`}>
                      <rect
                        x={0} y={0}
                        width={120} height={48}
                        rx={8} ry={8}
                        fill="white"
                        stroke="#e5e7eb"
                        strokeWidth={1}
                        filter="drop-shadow(0 2px 6px rgba(0,0,0,.14))"
                      />
                      <text x={10} y={18} fontSize="11" fill="#374151" fontWeight="700">{node.id}</text>
                      {graphData?.source === 'llm' ? (
                        <text x={10} y={32} fontSize="10" fill="#6b7280">重要度 {node.count}/100</text>
                      ) : (
                        <>
                          <text x={10} y={31} fontSize="10" fill="#6b7280">出現 {node.count} 次</text>
                          <text x={10} y={43} fontSize="10" fill="#6b7280">對話 {node.dialogues} 句</text>
                        </>
                      )}
                    </g>
                  )}
                </g>
                )
              })}
            </svg>
          )}

          {/* 人物關係清單（hover 上方氣泡可高亮對應人物）*/}
          {!analyzing && !noData && graphData && graphData.relations.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-100 bg-white">
              <p className="text-xs font-semibold text-gray-500 mb-2.5">人物關係清單（{graphData.relations.length}）</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 max-h-44 overflow-y-auto pr-1">
                {[...graphData.relations]
                  .sort((a, b) => b.strength - a.strength)
                  .map((rel, i) => {
                    const active = !hoveredId || rel.source === hoveredId || rel.target === hoveredId
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-sm" style={{ opacity: active ? 1 : 0.35, transition: 'opacity .15s' }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorOf(rel.source) }} />
                        <span className="font-medium text-gray-700 truncate">{rel.source}</span>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 font-semibold"
                          style={{ background: hexA(colorOf(rel.source), 0.12), color: colorOf(rel.source) }}
                        >
                          {rel.label || '相關'}
                        </span>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colorOf(rel.target) }} />
                        <span className="font-medium text-gray-700 truncate">{rel.target}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Footer legend */}
        {!analyzing && !noData && graphData && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
            {graphData.source === 'llm' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">✨ AI 分析</span>
            )}
            {fromCache && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600" title="讀取自快取，未耗用 API">💾 已快取</span>
            )}
            <p className="text-xs text-gray-400">
              共識別 <span className="font-medium text-gray-600">{graphData.characters.length}</span> 個主要人物、
              <span className="font-medium text-gray-600"> {graphData.relations.length}</span> 條關係線
            </p>
            {warning && <p className="text-xs text-amber-600">⚠️ {warning}</p>}
            <p className="text-xs text-gray-400 ml-auto">可拖動節點 · 滑過高亮 · 全文分析（{sentences.filter(s => s && s !== ' ' && !s.startsWith('data:')).length.toLocaleString()} 句）</p>
          </div>
        )}
      </div>
    </div>
  )
}
