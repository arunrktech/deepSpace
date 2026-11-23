/**
 * How the board editor shows each sizing field. Choices come from board.ts,
 * so the form can only offer sizes the price snapshot covers.
 */
import { CACHE_SIZES, DB_SIZES, VM_SIZES, type ComponentType } from '../cost/board'
import { SIZING_FIELDS } from './fromRecords'

export type FieldSpec =
  | { kind: 'number'; label: string; unit?: string; step?: number }
  | { kind: 'choice'; label: string; options: readonly (string | number)[] }
  | { kind: 'bool'; label: string }

export const FIELD_SPECS: Record<string, FieldSpec> = {
  count: { kind: 'number', label: 'Count', step: 1 },
  vcpu: { kind: 'choice', label: 'vCPU', options: VM_SIZES },
  hours: { kind: 'number', label: 'Hours per month', unit: 'h', step: 1 },
  ha: { kind: 'bool', label: 'High availability' },
  storage_gb: { kind: 'number', label: 'Storage', unit: 'GB' },
  size: { kind: 'choice', label: 'Size', options: CACHE_SIZES },
  messages_millions: { kind: 'number', label: 'Messages per month', unit: 'million' },
  message_kb: { kind: 'number', label: 'Average message size', unit: 'KB' },
  gb_processed: { kind: 'number', label: 'Data processed per month', unit: 'GB' },
  gb_delivered: { kind: 'number', label: 'Data delivered per month', unit: 'GB' },
  requests_millions: { kind: 'number', label: 'Requests per month', unit: 'million' },
}

/** Database offers 2 or 4 vCPU, services 2, 4 or 8. */
export function specFor(type: ComponentType, field: string): FieldSpec {
  const spec = FIELD_SPECS[field]
  if (type === 'database' && field === 'vcpu') return { ...spec, options: DB_SIZES } as FieldSpec
  return spec
}

export const fieldsFor = (type: ComponentType) => SIZING_FIELDS[type]
