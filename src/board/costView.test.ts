import { describe, expect, it } from 'vitest'
import type { Board } from '../cost/board'
import { compute } from '../cost/costModel'
import { EGRESS_ID, boardToPrices } from '../cost/quantify'
import { costView, linesOf, money, vsLabel } from './costView'

const run = (board: Board) => {
  const { prices, workload } = boardToPrices(board)
  return compute(prices, workload)
}

const example: Board = {
  components: [
    { id: 'web', type: 'service', label: 'Web servers', sizing: { count: 2, vcpu: 2 } },
    { id: 'files', type: 'storage', label: 'File storage', sizing: { storage_gb: 500 } },
  ],
  egress_gb: 200,
}

describe('formatting', () => {
  it('formats dollars with cents and thousands', () => {
    expect(money(1234.5)).toBe('$1,234.50')
    expect(money(0)).toBe('$0.00')
  })

  it('labels the difference from the cheapest cloud', () => {
    expect(vsLabel({ usd: 8.41, pct: 5.3 })).toBe('+$8.41 (5.3%)')
    expect(vsLabel({ usd: 0, pct: 0 })).toBe('')
    expect(vsLabel({ usd: 3, pct: null })).toBe('+$3.00')
    expect(vsLabel(null)).toBe('')
  })
})

describe('costView on a complete board', () => {
  const view = costView(run(example), 'ondemand')

  it('shows the totals and marks only the cheapest cloud', () => {
    expect(view.complete).toBe(true)
    expect(view.totals.map((t) => [t.name, t.monthly, t.cheapest])).toEqual([
      ['AWS', 167.67, false],
      ['Google Cloud', 173.46, false],
      ['Azure', 159.26, true],
    ])
    expect(view.totals[0].vs).toBe('+$8.41 (5.3%)')
    expect(view.totals[2].vs).toBe('')
    expect(view.warning).toBeNull()
    expect(view.likeForLike).toBeNull()
  })

  it('has one row per component, egress included', () => {
    expect(view.rows.map((r) => r.id)).toEqual(['web', 'files', EGRESS_ID])
    expect(view.rows[0]).toMatchObject({ label: 'Web servers', comparable: true, cheapest: 'azure', gapsOn: '', reasons: [] })
  })

  it('switches every figure to the commitment scenario', () => {
    const commit = costView(run(example), 'commit')
    expect(commit.totals[0].monthly).toBeLessThan(167.67)
    expect(commit.rows[0].amounts.aws).toBeCloseTo(1460 * 0.06668, 2)
  })
})

describe('costView on an incomplete board', () => {
  const res = run({ ...example, components: [...example.components, { id: 'big', type: 'service', label: 'Big VM', sizing: { vcpu: 6 } }] })
  const view = costView(res, 'ondemand')

  it('names no cheapest cloud and explains why', () => {
    expect(view.complete).toBe(false)
    expect(view.totals.every((t) => !t.cheapest && t.vs === '')).toBe(true)
    expect(view.warning).toContain('No overall cheapest cloud declared')
  })

  it('offers the like-for-like comparison instead', () => {
    expect(view.likeForLike).toEqual({
      cheapest: 'Azure', components: 3, of: 4, totals: { aws: 167.67, gcp: 173.46, azure: 159.26 },
    })
  })

  it('marks the unpriced component with its reason', () => {
    const big = view.rows.find((r) => r.id === 'big')!
    expect(big.comparable).toBe(false)
    expect(big.cheapest).toBeNull()
    expect(big.gapsOn).toBe('AWS, Azure, Google Cloud')
    expect(big.reasons[0]).toContain('vcpu 6 is not priced')
  })

  it('lists priced and unpriced lines per cloud for a row', () => {
    expect(linesOf(res, 'big').aws[0]).toMatchObject({ source: 'unpriced' })
    expect(linesOf(res, 'web').gcp[0]).toMatchObject({ unit: 'hour', quantity: 1460 })
  })
})
