/**
 * Where each component box sits in the diagram.
 *
 * A component someone has dragged keeps its saved x/y. One still at the
 * starting point (0, 0, or never saved) is placed automatically in a column
 * by its layer: edge (LB, CDN) on the left, app (services, queues) in the
 * middle, data (databases, caches, storage) on the right. This is the
 * comparator's `tier` idea. The result depends only on the records, so every
 * viewer computes the same layout without saving anything.
 */
import { TIER, type ComponentType } from '../cost/board'

export const BOX = { width: 200, height: 88 }
const GAP_Y = 32
const MARGIN = 40
const COLUMN_X: Record<string, number> = { edge: MARGIN, app: MARGIN + 300, data: MARGIN + 600 }

export interface Placed {
  x: number
  y: number
}

export interface LayoutInput {
  id: string
  type: ComponentType
  x?: number | null
  y?: number | null
}

const isPlaced = (c: LayoutInput) => (c.x ?? 0) !== 0 || (c.y ?? 0) !== 0

/** Positions for every component; components keep their input order. */
export function layoutBoard(components: LayoutInput[]): Map<string, Placed> {
  const out = new Map<string, Placed>()
  // Lowest free y in each column, so auto-placed boxes stack under anything already there.
  const nextY: Record<string, number> = { edge: MARGIN, app: MARGIN, data: MARGIN }

  for (const c of components) {
    if (!isPlaced(c)) continue
    out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 })
    const col = TIER[c.type]
    // A dragged box in roughly this column pushes new boxes below it.
    if (Math.abs((c.x ?? 0) - COLUMN_X[col]) < BOX.width) {
      nextY[col] = Math.max(nextY[col], (c.y ?? 0) + BOX.height + GAP_Y)
    }
  }

  for (const c of components) {
    if (isPlaced(c)) continue
    const col = TIER[c.type]
    out.set(c.id, { x: COLUMN_X[col], y: nextY[col] })
    nextY[col] += BOX.height + GAP_Y
  }
  return out
}

/**
 * Where an arrow from box `a` to box `b` should start and end: on each box's
 * edge, along the line between their centres, so the arrowhead isn't hidden
 * under the box.
 */
export function arrowBetween(a: Placed, b: Placed): { x1: number; y1: number; x2: number; y2: number } {
  const ca = { x: a.x + BOX.width / 2, y: a.y + BOX.height / 2 }
  const cb = { x: b.x + BOX.width / 2, y: b.y + BOX.height / 2 }
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  if (dx === 0 && dy === 0) return { x1: ca.x, y1: ca.y, x2: cb.x, y2: cb.y }
  // Fraction of the centre-to-centre vector that lies inside one box.
  const t = Math.min(
    dx === 0 ? Infinity : BOX.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : BOX.height / 2 / Math.abs(dy),
  )
  return { x1: ca.x + dx * t, y1: ca.y + dy * t, x2: cb.x - dx * t, y2: cb.y - dy * t }
}

/**
 * The writes for one drag: the dragged box, plus every box still placed
 * automatically, pinned where it is now. Without the pins, saving the dragged
 * box can change the automatic layout and make other boxes jump (found in
 * the live test: dragging the database moved the storage box).
 */
export function movesForDrag(
  components: LayoutInput[],
  layout: Map<string, Placed>,
  dragged: { id: string; x: number; y: number },
): { id: string; x: number; y: number }[] {
  const pins = components
    .filter((c) => c.id !== dragged.id && !isPlaced(c))
    .flatMap((c) => {
      const p = layout.get(c.id)
      return p ? [{ id: c.id, x: p.x, y: p.y }] : []
    })
  return [dragged, ...pins]
}

/** Snap a dragged position to a 10 px grid and keep it on the canvas. */
export const snap = (v: number) => Math.max(0, Math.round(v / 10) * 10)
