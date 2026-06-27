'use client'

// 【人物關係圖】
// 力導向圖（force-directed graph）：節點=人物，連線=共現關係。
// 純客戶端，不需要 D3 或 API key。

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2 } from 'lucide-react'
import { analyzeCharacters, CharacterGraph as GraphData } from '../utils/characterAnalysis'

interface Props {
  sentences: string[]
  bookTitle: string
  onClose: () => void
}

// ── 顏色調色盤（依角色重要性排序）──
const PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6',
  '#a855f7', '#eab308', '#22c55e', '#f43f5e', '#0ea5e9',
  '#d946ef', '#84cc16', '#fb923c', '#4ade80', '#38bdf8',
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
}

function buildGraph(data: GraphData, width: number, height: number): { nodes: Node[]; edges: Edge[] } {
  const n = data.characters.length
  const cx = width / 2
  const cy = height / 2
  const initR = Math.min(width, height) * 0.3

  const maxCount = Math.max(...data.characters.map(c => c.count), 1)

  const nodes: Node[] = data.characters.map((char, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    const r = 18 + Math.sqrt(char.count / maxCount) * 24
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
  }))

  return { nodes, edges }
}

function runTick(nodes: Node[], edges: Edge[], width: number, height: number) {
  const REPULSION = 4000
  const SPRING_LEN = 130
  const SPRING_K = 0.06
  const DAMP = 0.82
  const GRAVITY = 0.015
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
      const minDist = a.r + b.r + 20
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
    n.y = Math.max(n.r + 40, Math.min(height - n.r - 40, n.y))
  })
}

export default function CharacterGraph({ sentences, bookTitle, onClose }: Props) {
  const canvasW = 760
  const canvasH = 480
  const svgRef = useRef<SVGSVGElement>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [analyzing, setAnalyzing] = useState(true)
  const [noData, setNoData] = useState(false)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null)
  const animRef = useRef<number>(0)
  const tickRef = useRef(0)
  const nodesRef = useRef<Node[]>([])
  const edgesRef = useRef<Edge[]>([])
  const draggingRef = useRef<Node | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  // Analyze on mount（稍微延遲讓 Loading 動畫先渲染）
  useEffect(() => {
    const t = setTimeout(() => {
      const result = analyzeCharacters(sentences)
      if (result.characters.length === 0) {
        setNoData(true)
        setAnalyzing(false)
        return
      }
      setGraphData(result)
      const { nodes: ns, edges: es } = buildGraph(result, canvasW, canvasH)
      nodesRef.current = ns
      edgesRef.current = es
      setNodes([...ns])
      setEdges([...es])
      setAnalyzing(false)
    }, 80)
    return () => clearTimeout(t)
  }, [sentences])

  // Force simulation loop
  useEffect(() => {
    if (!graphData || nodes.length === 0) return
    tickRef.current = 0

    const tick = () => {
      if (tickRef.current < 350) {
        runTick(nodesRef.current, edgesRef.current, canvasW, canvasH)
        tickRef.current++
        setNodes([...nodesRef.current])
        animRef.current = requestAnimationFrame(tick)
      }
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [graphData])

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
    cancelAnimationFrame(animRef.current)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return
    const pt = getSVGPoint(e)
    draggingRef.current.x = pt.x - dragOffsetRef.current.x
    draggingRef.current.y = pt.y - dragOffsetRef.current.y
    draggingRef.current.vx = 0
    draggingRef.current.vy = 0
    setNodes([...nodesRef.current])
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = null
    // Resume simulation briefly to settle
    tickRef.current = 0
    const tick = () => {
      if (tickRef.current < 120) {
        runTick(nodesRef.current, edgesRef.current, canvasW, canvasH)
        tickRef.current++
        setNodes([...nodesRef.current])
        animRef.current = requestAnimationFrame(tick)
      }
    }
    animRef.current = requestAnimationFrame(tick)
  }, [])

  // Backdrop click to close
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const maxStrength = Math.max(...edges.map(e => e.strength), 0.01)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleBackdrop}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              《{bookTitle}》人物關係圖
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              基於共現分析 · 節點大小 = 出現頻率 · 連線粗細 = 互動頻率
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="relative" style={{ background: '#f9fafb' }}>
          {analyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10" style={{ minHeight: 320 }}>
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-sm text-gray-500">分析人物中…</p>
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
              {/* Edges */}
              {edges.map((edge, i) => {
                const a = nodeMap.get(edge.source)
                const b = nodeMap.get(edge.target)
                if (!a || !b) return null
                const strokeW = 1 + edge.strength * 5
                return (
                  <line
                    key={i}
                    x1={a.x} y1={a.y}
                    x2={b.x} y2={b.y}
                    stroke={a.color}
                    strokeWidth={strokeW}
                    strokeOpacity={0.25 + edge.strength * 0.45}
                    strokeLinecap="round"
                  />
                )
              })}

              {/* Edge labels for strong connections */}
              {edges
                .filter(edge => edge.strength > maxStrength * 0.5)
                .slice(0, 8)
                .map((edge, i) => {
                  const a = nodeMap.get(edge.source)
                  const b = nodeMap.get(edge.target)
                  if (!a || !b) return null
                  const mx = (a.x + b.x) / 2
                  const my = (a.y + b.y) / 2
                  return (
                    <text key={`elabel-${i}`} x={mx} y={my} textAnchor="middle" dy="-4"
                      fontSize="9" fill="#9ca3af" style={{ pointerEvents: 'none' }}>
                      {Math.round(edge.strength * 100 / maxStrength)}%
                    </text>
                  )
                })}

              {/* Nodes */}
              {nodes.map((node) => (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ cursor: 'grab' }}
                  onMouseDown={e => handleMouseDown(e, node)}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Shadow */}
                  <circle
                    r={node.r + 2}
                    fill={node.color}
                    fillOpacity={0.15}
                  />
                  {/* Main circle */}
                  <circle
                    r={node.r}
                    fill={node.color}
                    fillOpacity={hoveredNode?.id === node.id ? 1 : 0.85}
                    stroke="white"
                    strokeWidth={2}
                  />
                  {/* Name label */}
                  <text
                    textAnchor="middle"
                    dy="0.35em"
                    fontSize={node.r > 30 ? '13' : '11'}
                    fontWeight="600"
                    fill="white"
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.id}
                  </text>
                  {/* Tooltip on hover */}
                  {hoveredNode?.id === node.id && (
                    <g transform={`translate(${node.r + 8}, ${-node.r})`}>
                      <rect
                        x={0} y={0}
                        width={120} height={48}
                        rx={6} ry={6}
                        fill="white"
                        stroke="#e5e7eb"
                        strokeWidth={1}
                        filter="drop-shadow(0 2px 4px rgba(0,0,0,.12))"
                      />
                      <text x={8} y={16} fontSize="11" fill="#374151" fontWeight="600">{node.id}</text>
                      <text x={8} y={30} fontSize="10" fill="#6b7280">出現 {node.count} 次</text>
                      <text x={8} y={43} fontSize="10" fill="#6b7280">對話 {node.dialogues} 句</text>
                    </g>
                  )}
                </g>
              ))}
            </svg>
          )}
        </div>

        {/* Footer legend */}
        {!analyzing && !noData && graphData && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center gap-6">
            <p className="text-xs text-gray-400">
              共識別 <span className="font-medium text-gray-600">{graphData.characters.length}</span> 個主要人物、
              <span className="font-medium text-gray-600"> {graphData.relations.length}</span> 條關係線
            </p>
            <p className="text-xs text-gray-400 ml-auto">可拖動節點 · 全文分析（{sentences.filter(s => s && s !== ' ' && !s.startsWith('data:')).length.toLocaleString()} 句）</p>
          </div>
        )}
      </div>
    </div>
  )
}
