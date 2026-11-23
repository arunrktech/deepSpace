/**
 * DeepSpace records -> the Board shape the cost engine takes.
 *
 * Records arrive as envelopes with the fields under `.data`
 * (docs: https://docs.deep.space/guides/data-storage). Sizing is stored one
 * column per field across all component types; each component reads only the
 * fields its own type uses, so a stale `vcpu` left on a component that was
 * changed to a cache is ignored. Empty columns are left out, so quantify.ts
 * falls back to the default and labels it "default".
 */
import { COMPONENT_TYPES, DEFAULT_SIZING, type Board, type BoardComponent, type ComponentType } from '../cost/board'

/** The sizing columns each component type reads. */
export const SIZING_FIELDS: { [T in ComponentType]: string[] } = Object.fromEntries(
  COMPONENT_TYPES.map((t) => [t, Object.keys(DEFAULT_SIZING[t])]),
) as { [T in ComponentType]: string[] }

/** Fields stored on a component record (see src/schemas/board-schemas.ts). */
export type ComponentRow = {
  boardId: string
  type: string
  label?: string
  x?: number
  y?: number
} & Partial<Record<string, unknown>>

export type FlowRow = { boardId: string; fromId: string; toId: string; label?: string }
export type BoardRow = { name: string; egress_gb?: number | null }

/** The record envelope shape we use (recordId + data). */
export interface Envelope<T> {
  recordId: string
  data: T
}

const isType = (t: unknown): t is ComponentType => (COMPONENT_TYPES as readonly unknown[]).includes(t)

/** A boolean column may come back as a boolean or as 0/1. */
function readValue(field: string, v: unknown): unknown {
  if (field === 'ha' && (v === 0 || v === 1)) return v === 1
  return v
}

export function componentFromRecord(r: Envelope<ComponentRow>): BoardComponent | null {
  if (!isType(r.data.type)) return null
  const type = r.data.type
  const sizing: Record<string, unknown> = {}
  for (const field of SIZING_FIELDS[type]) {
    const v = r.data[field]
    if (v !== undefined && v !== null && v !== '') sizing[field] = readValue(field, v)
  }
  return { id: r.recordId, type, label: r.data.label || undefined, sizing }
}

export function boardFromRecords(
  board: Envelope<BoardRow> | undefined,
  components: Envelope<ComponentRow>[],
  flows: Envelope<FlowRow>[],
): Board {
  const parts = components.map(componentFromRecord).filter((c): c is BoardComponent => c !== null)
  const ids = new Set(parts.map((c) => c.id))
  return {
    components: parts,
    // A flow whose end was deleted (or never synced) is dropped, not priced.
    flows: flows
      .filter((f) => ids.has(f.data.fromId) && ids.has(f.data.toId))
      .map((f) => ({ from: f.data.fromId, to: f.data.toId, ...(f.data.label ? { label: f.data.label } : {}) })),
    egress_gb: typeof board?.data.egress_gb === 'number' ? board.data.egress_gb : undefined,
  }
}
