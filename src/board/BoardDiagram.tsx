/**
 * The board as a diagram: component boxes and flow arrows in one SVG.
 *
 * Dragging moves a box locally and saves x/y once, on release, so the shared
 * board isn't flooded with writes; other viewers see the box move when it's
 * dropped. (Smooth live dragging is what DeepSpace's Canvas room is for; we
 * chose collections for typed data. Docs: guides/canvas.) A press that
 * barely moves counts as a click and selects the box.
 *
 * Boxes that another viewer has selected get that viewer's colour, from the
 * presence room (docs: guides/presence-and-cursors).
 */
import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { LABEL, type ComponentType } from '../cost/board'
import type { ComponentRow, FlowRow } from './fromRecords'
import { BOX, arrowBetween, layoutBoard, movesForDrag, snap, type Placed } from './layout'

export interface PeerSelection {
  userId: string
  userName: string
  color: string
  componentId: string
}

interface Props {
  components: { recordId: string; data: ComponentRow }[]
  flows: { recordId: string; data: FlowRow }[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Positions to save after a drag: the dragged box plus any auto-placed boxes, pinned. */
  onMove: (moves: { id: string; x: number; y: number }[]) => void
  findingCounts: Map<string, { total: number; high: number }>
  summaryOf: (row: ComponentRow) => string
  peerSelections: PeerSelection[]
}

/** Below this many pixels of movement, a press is a click, not a drag. */
const CLICK_SLOP = 4

export function BoardDiagram({ components, flows, selectedId, onSelect, onMove, findingCounts, summaryOf, peerSelections }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  // The drag lives in a ref so pointer events see it immediately (state updates
  // only after a re-render, which lost fast drags: press, one move, release).
  // The state copy is only for drawing the box while it moves.
  const dragRef = useRef<{ id: string; dx: number; dy: number; start: Placed; pos: Placed } | null>(null)
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; start: Placed; pos: Placed } | null>(null)

  const inputs = useMemo(
    () => components.map((c) => ({ id: c.recordId, type: c.data.type as ComponentType, x: c.data.x, y: c.data.y })),
    [components],
  )
  const layout = useMemo(() => layoutBoard(inputs), [inputs])
  const posOf = (id: string): Placed | undefined => (drag?.id === id ? drag.pos : layout.get(id))

  // Canvas size grows to fit the boxes.
  const all = [...layout.values()]
  const width = Math.max(900, ...all.map((p) => p.x + BOX.width + 40))
  const height = Math.max(360, ...all.map((p) => p.y + BOX.height + 40))

  /** Pointer position in SVG coordinates (the SVG may be scaled to fit). */
  function toSvg(e: PointerEvent): Placed {
    const svg = svgRef.current!
    const m = svg.getScreenCTM()
    if (!m) return { x: e.clientX, y: e.clientY }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  function startDrag(e: PointerEvent<SVGGElement>, id: string) {
    const at = layout.get(id)
    if (!at) return
    const p = toSvg(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { id, dx: p.x - at.x, dy: p.y - at.y, start: at, pos: at }
    setDrag(dragRef.current)
  }

  /** Where the box would be with the pointer at this event. */
  function posAt(e: PointerEvent, d: NonNullable<typeof dragRef.current>): Placed {
    const p = toSvg(e)
    return { x: Math.max(0, p.x - d.dx), y: Math.max(0, p.y - d.dy) }
  }

  function moveDrag(e: PointerEvent<SVGGElement>) {
    const d = dragRef.current
    if (!d) return
    d.pos = posAt(e, d)
    setDrag({ ...d })
  }

  function endDrag(e: PointerEvent<SVGGElement>) {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    const end = posAt(e, d) // from the release itself, so a lost last move doesn't matter
    const moved = Math.hypot(end.x - d.start.x, end.y - d.start.y)
    if (moved < CLICK_SLOP) onSelect(d.id)
    // One write per drag, on release. 0,0 means "place for me" to the layout,
    // so a drop exactly in the corner is nudged to 10,10.
    else onMove(movesForDrag(inputs, layout, { id: d.id, x: snap(end.x) || 10, y: snap(end.y) || 10 }))
    setDrag(null)
  }

  if (components.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Nothing here yet. Add a service, database or any other component above.
      </p>
    )
  }

  return (
    <div className="overflow-auto rounded-lg border border-border bg-card">
      <svg
        ref={svgRef}
        role="group"
        aria-label="Board diagram"
        // Fill the column and scale the drawing to fit, so no box is cut off.
        // Dragging still lines up: toSvg() converts through the scaling.
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMin meet"
        className="block h-auto w-full touch-none select-none"
      >
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        {flows.map((f) => {
          const a = posOf(f.data.fromId)
          const b = posOf(f.data.toId)
          if (!a || !b) return null
          const l = arrowBetween(a, b)
          return (
            <g key={f.recordId}>
              <line {...l} className="stroke-muted-foreground" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
              {f.data.label && (
                <text x={(l.x1 + l.x2) / 2} y={(l.y1 + l.y2) / 2 - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {f.data.label}
                </text>
              )}
            </g>
          )
        })}

        {components.map((c) => {
          const p = posOf(c.recordId)
          if (!p) return null
          const selected = c.recordId === selectedId
          const peers = peerSelections.filter((s) => s.componentId === c.recordId)
          const count = findingCounts.get(c.recordId)
          return (
            <g
              key={c.recordId}
              transform={`translate(${p.x},${p.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${c.data.label || LABEL[c.data.type as ComponentType]}, ${LABEL[c.data.type as ComponentType]}`}
              aria-pressed={selected}
              onPointerDown={(e) => startDrag(e, c.recordId)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => { dragRef.current = null; setDrag(null) }}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(c.recordId)}
              className={`cursor-grab focus:outline-none ${drag?.id === c.recordId ? 'cursor-grabbing' : ''}`}
            >
              <rect
                width={BOX.width}
                height={BOX.height}
                rx={8}
                className={selected ? 'fill-accent stroke-primary' : 'fill-background stroke-border'}
                strokeWidth={selected ? 2 : 1}
                style={peers[0] && !selected ? { stroke: peers[0].color, strokeWidth: 2 } : undefined}
              />
              <text x={12} y={20} className="fill-muted-foreground text-[10px] uppercase tracking-wide">
                {LABEL[c.data.type as ComponentType] ?? c.data.type}
              </text>
              <text x={12} y={42} className="fill-foreground text-[14px] font-medium">
                {truncate(c.data.label || '(unnamed)', 24)}
              </text>
              <text x={12} y={62} className="fill-muted-foreground text-[11px]">
                {truncate(summaryOf(c.data), 30)}
              </text>
              {count && (
                <g transform={`translate(${BOX.width - 12},12)`}>
                  <title>Findings in the latest AI review</title>
                  <rect x={-58} y={-2} width={58} height={16} rx={4} className={count.high ? 'fill-red-500/20' : 'fill-amber-500/20'} />
                  <text x={-29} y={10} textAnchor="middle" className={`text-[10px] ${count.high ? 'fill-red-600' : 'fill-amber-700'}`}>
                    {count.total} finding{count.total === 1 ? '' : 's'}
                  </text>
                </g>
              )}
              {peers.map((s, i) => (
                <g key={s.userId} transform={`translate(${12 + i * 22},${BOX.height - 6})`}>
                  <title>{`${s.userName} is editing this`}</title>
                  <circle r={9} cy={-4} style={{ fill: s.color }} />
                  <text y={0} textAnchor="middle" className="fill-white text-[9px] font-semibold">
                    {initials(s.userName)}
                  </text>
                </g>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
