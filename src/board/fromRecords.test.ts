import { describe, expect, it } from 'vitest'
import { compute } from '../cost/costModel'
import { boardToPrices } from '../cost/quantify'
import { SIZING_FIELDS, boardFromRecords, componentFromRecord, type ComponentRow } from './fromRecords'

const comp = (recordId: string, data: Partial<ComponentRow>) => ({
  recordId,
  data: { boardId: 'b1', type: 'service', ...data } as ComponentRow,
})

describe('SIZING_FIELDS', () => {
  it('lists each type’s sizing fields from the defaults', () => {
    expect(SIZING_FIELDS.service).toEqual(['count', 'vcpu', 'hours'])
    expect(SIZING_FIELDS.database).toEqual(['vcpu', 'ha', 'storage_gb'])
    expect(SIZING_FIELDS.cache).toEqual(['size', 'ha'])
  })
})

describe('componentFromRecord', () => {
  it('keeps only the fields its type uses and drops empty ones', () => {
    const c = componentFromRecord(comp('c1', { type: 'cache', label: 'Sessions', size: 'medium', vcpu: 8, ha: null, x: 10 }))
    expect(c).toEqual({ id: 'c1', type: 'cache', label: 'Sessions', sizing: { size: 'medium' } })
  })

  it('reads a 0/1 boolean column as a boolean', () => {
    expect(componentFromRecord(comp('d', { type: 'database', ha: 0 }))!.sizing).toEqual({ ha: false })
    expect(componentFromRecord(comp('d', { type: 'database', ha: 1 }))!.sizing).toEqual({ ha: true })
    expect(componentFromRecord(comp('d', { type: 'database', ha: true }))!.sizing).toEqual({ ha: true })
  })

  it('treats an empty label as none and skips unknown types', () => {
    expect(componentFromRecord(comp('s', { label: '' }))!.label).toBeUndefined()
    expect(componentFromRecord(comp('x', { type: 'mainframe' }))).toBeNull()
  })
})

describe('boardFromRecords', () => {
  const components = [
    comp('web', { type: 'service', label: 'Web servers', count: 2, vcpu: 2 }),
    comp('files', { type: 'storage', label: 'File storage', storage_gb: 500 }),
  ]

  it('drops flows whose ends no longer exist', () => {
    const board = boardFromRecords(undefined, components, [
      { recordId: 'f1', data: { boardId: 'b1', fromId: 'web', toId: 'files', label: 'read/write' } },
      { recordId: 'f2', data: { boardId: 'b1', fromId: 'web', toId: 'deleted' } },
    ])
    expect(board.flows).toEqual([{ from: 'web', to: 'files', label: 'read/write' }])
    expect(board.egress_gb).toBeUndefined()
  })

  it('feeds the cost engine end to end (the comparator example again)', () => {
    const board = boardFromRecords({ recordId: 'b1', data: { name: 'Demo', egress_gb: 200 } }, components, [])
    const { prices, workload } = boardToPrices(board)
    expect(compute(prices, workload).variance.ondemand.totals).toEqual({ aws: 167.67, gcp: 173.46, azure: 159.26 })
  })
})
