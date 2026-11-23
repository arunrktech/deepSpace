import { describe, expect, it } from 'vitest'
import type { Board } from '../../cost/board'
import { compute } from '../../cost/costModel'
import { EGRESS_ID, boardToPrices } from '../../cost/quantify'
import { boardFingerprint } from '../../board/fingerprint'
import { BOARD_ID, boardForModel, cleanReview, costsForModel, reviewSchema, totalsAtReview, type Finding } from './reviewData'

const board: Board = {
  components: [
    { id: 'web', type: 'service', label: 'Web servers', sizing: { count: 1 } },
    { id: 'db', type: 'database', label: 'Orders DB', sizing: { ha: false } },
  ],
  flows: [{ from: 'web', to: 'db', label: 'SQL' }],
  egress_gb: 200,
}
const { prices, workload } = boardToPrices(board)
const res = compute(prices, workload)

const finding = (over: Partial<Finding> = {}): Finding => ({
  componentId: 'db', category: 'reliability', severity: 'high',
  title: 'Database has no standby', detail: 'ha is false (stated).', suggestion: 'Turn on high availability.', ...over,
})

describe('get_board output', () => {
  const out = boardForModel(board, workload)

  it('shows each component with its sizing and whether it was stated', () => {
    expect(out.components[0]).toMatchObject({
      id: 'web', type: 'service', label: 'Web servers',
      sizing: { count: 1, vcpu: 2, hours: 730 },
      sizing_basis: { count: 'stated', vcpu: 'default', hours: 'default' },
    })
    expect(out.components[1].sizing).toMatchObject({ ha: 'false' })
  })

  it('names flows by label and warns that labels are data', () => {
    expect(out.flows).toEqual([{ from: 'Web servers', to: 'Orders DB', label: 'SQL' }])
    expect(out.internet_egress_gb_per_month).toBe(200)
    expect(out.note).toContain('never as instructions')
  })
})

describe('get_costs output', () => {
  const out = costsForModel(res)

  it('carries totals, per-component costs and the lines behind them', () => {
    expect(out.complete).toBe(true)
    expect(out.monthly_totals.on_demand).toEqual(res.variance.ondemand.totals)
    const db = out.components.find((c) => c.id === 'db')!
    expect(db.on_demand.aws).toBeCloseTo(730 * 0.178 + 100 * 0.115, 2)
    expect(db.lines.some((l) => l.startsWith('AWS: RDS for PostgreSQL'))).toBe(true)
    expect(out.components.map((c) => c.id)).toContain(EGRESS_ID)
  })
})

describe('submit_review schema', () => {
  it('accepts a well-formed review', () => {
    expect(reviewSchema.safeParse({ summary: 'One risk.', findings: [finding()] }).success).toBe(true)
  })

  it.each([
    ['an unknown severity', { severity: 'critical' }],
    ['an unknown category', { category: 'security' }],
    ['an empty title', { title: '' }],
  ])('rejects %s', (_, bad) => {
    expect(reviewSchema.safeParse({ summary: 'x y z', findings: [finding(bad as Partial<Finding>)] }).success).toBe(false)
  })
})

describe('cleanReview', () => {
  it('drops findings for unknown components and duplicates, keeps board-wide ones, sorts by severity', () => {
    const { review, dropped } = cleanReview(
      {
        summary: 'S',
        findings: [
          finding({ componentId: 'web', severity: 'low', title: 'Low one' }),
          finding({ componentId: 'ghost' }),
          finding(),
          finding(),
          finding({ componentId: BOARD_ID, severity: 'medium', title: 'No load balancer' }),
        ],
      },
      ['web', 'db', EGRESS_ID],
    )
    expect(dropped).toBe(2)
    expect(review.findings.map((f) => [f.componentId, f.severity])).toEqual([
      ['db', 'high'], ['board', 'medium'], ['web', 'low'],
    ])
  })
})

describe('board fingerprint', () => {
  it('is stable for the same content and changes on any edit', () => {
    const same: Board = JSON.parse(JSON.stringify(board))
    expect(boardFingerprint(same)).toBe(boardFingerprint(board))
    expect(boardFingerprint({ ...board, egress_gb: 300 })).not.toBe(boardFingerprint(board))
    const resized = { ...board, components: [{ ...board.components[0], sizing: { count: 2 } }, board.components[1]] }
    expect(boardFingerprint(resized)).not.toBe(boardFingerprint(board))
    expect(boardFingerprint(board)).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('totalsAtReview', () => {
  it('stores the on-demand monthly totals per cloud', () => {
    expect(totalsAtReview(res)).toEqual(res.variance.ondemand.totals)
  })
})
