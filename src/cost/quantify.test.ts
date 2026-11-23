import { describe, expect, it } from 'vitest'
import type { Board } from './board'
import { compute, validate } from './costModel'
import { EGRESS_ID, boardToPrices, splitTiers, toVendorUnit } from './quantify'
import type { Cloud, PriceLine } from './types'

/** Board -> prices -> compute(), checking validate() on the way. */
function cost(board: Board) {
  const { prices, workload } = boardToPrices(board)
  expect(validate(prices, workload)).toEqual([])
  return { prices, workload, res: compute(prices, workload) }
}

const lines = (prices: { clouds: Partial<Record<Cloud, PriceLine[]>> }, cloud: Cloud, component: string) =>
  prices.clouds[cloud]!.filter((l) => l.component === component)

/** Sum of unit_price x quantity for one component on one cloud (on demand). */
const monthly = (prices: { clouds: Partial<Record<Cloud, PriceLine[]>> }, cloud: Cloud, component: string) =>
  lines(prices, cloud, component).reduce((sum, l) => sum + (l.unit_price ?? 0) * (l.quantity ?? 0), 0)

describe('toVendorUnit', () => {
  it('converts GB to GiB and TiB, leaves GB units alone', () => {
    expect(toVendorUnit(500, 'GiB-month')).toBeCloseTo(465.661287, 6)
    expect(toVendorUnit(1099.511627776, 'TiB')).toBeCloseTo(1, 12)
    expect(toVendorUnit(500, 'GB-month')).toBe(500)
    expect(toVendorUnit(500, 'LCU-hour')).toBe(500)
  })
})

describe('splitTiers', () => {
  const egress = {
    unit_price: 0,
    tiers: [
      { up_to: 100, unit_price: 0 },
      { up_to: 10_240, unit_price: 0.09 },
      { up_to: null, unit_price: 0.085 },
    ],
  }

  it('uses one band when there are no tiers', () => {
    expect(splitTiers({ unit_price: 0.1 }, 7)).toEqual([{ quantity: 7, unit_price: 0.1, from: 0, to: null }])
  })

  it('stops inside the band the quantity ends in', () => {
    expect(splitTiers(egress, 200)).toEqual([
      { quantity: 100, unit_price: 0, from: 0, to: 100 },
      { quantity: 100, unit_price: 0.09, from: 100, to: 10_240 },
    ])
  })

  it('spans every band, including the open last one', () => {
    const bands = splitTiers(egress, 20_000)
    expect(bands.map((b) => b.quantity)).toEqual([100, 10_140, 9_760])
    expect(bands.reduce((s, b) => s + b.quantity, 0)).toBe(20_000)
  })

  it('ends exactly on a band edge without an empty band', () => {
    expect(splitTiers(egress, 100)).toEqual([{ quantity: 100, unit_price: 0, from: 0, to: 100 }])
  })

  it('keeps one zero band for a zero quantity', () => {
    expect(splitTiers(egress, 0)).toEqual([{ quantity: 0, unit_price: 0, from: 0, to: 100 }])
  })
})

describe('cross-check: the comparator example from board sizing', () => {
  // Two web servers (2 vCPU, 8 GiB), 500 GB of files, 200 GB downloaded by
  // users per month: the comparator's own assets/example workload. Our snapshot
  // prices for these SKUs equal the example's, so the totals must match.
  const board: Board = {
    components: [
      { id: 'web', type: 'service', label: 'Web servers', sizing: { count: 2, vcpu: 2 } },
      { id: 'files', type: 'storage', label: 'File storage', sizing: { storage_gb: 500 } },
    ],
    egress_gb: 200,
  }

  it('reproduces AWS $167.67, GCP $173.46, Azure $159.26 on demand', () => {
    const { res } = cost(board)
    expect(res.complete).toBe(true)
    expect(res.variance.ondemand.totals).toEqual({ aws: 167.67, gcp: 173.46, azure: 159.26 })
    expect(res.variance.ondemand.cheapest).toBe('azure')
  })

  it('prices egress after the free 100 GB on AWS and Azure, in GiB on Google Cloud', () => {
    const { prices } = cost(board)
    expect(monthly(prices, 'aws', EGRESS_ID)).toBeCloseTo(100 * 0.09, 10)
    expect(monthly(prices, 'azure', EGRESS_ID)).toBeCloseTo(100 * 0.087, 10)
    expect(monthly(prices, 'gcp', EGRESS_ID)).toBeCloseTo(186.264515 * 0.12, 5)
  })
})

describe('one hand-worked example per component type', () => {
  it('service: count x hours x hourly price', () => {
    const { prices } = cost({ components: [{ id: 's', type: 'service', sizing: { count: 3, vcpu: 4, hours: 100 } }] })
    expect(monthly(prices, 'aws', 's')).toBeCloseTo(3 * 100 * 0.2016, 10)
    expect(lines(prices, 'aws', 's')[0].commit_unit_price).toBe(0.13336)
  })

  it('database: HA compute + HA storage, storage in GiB on Google Cloud', () => {
    const { prices } = cost({ components: [{ id: 'db', type: 'database', sizing: { vcpu: 2, ha: true, storage_gb: 100 } }] })
    expect(monthly(prices, 'aws', 'db')).toBeCloseTo(730 * 0.356 + 100 * 0.23, 10)
    expect(monthly(prices, 'azure', 'db')).toBeCloseTo(730 * 0.356 + 100 * 0.23, 10)
    const gcpStorage = lines(prices, 'gcp', 'db').find((l) => l.unit === 'GiB-month')!
    expect(gcpStorage.quantity).toBeCloseTo(93.132257, 5)
  })

  it('cache: HA uses the two-node price', () => {
    const { prices } = cost({ components: [{ id: 'c', type: 'cache', sizing: { size: 'medium', ha: true } }] })
    expect(monthly(prices, 'aws', 'c')).toBeCloseTo(730 * 2 * 0.1264, 10)
    expect(monthly(prices, 'azure', 'c')).toBeCloseTo(730 * 0.45, 10)
  })

  it('queue: requests on AWS and Azure, bytes on Google Cloud, base fee on Azure', () => {
    const { prices } = cost({ components: [{ id: 'q', type: 'queue', sizing: { messages_millions: 50, message_kb: 1 } }] })
    // 50M messages x 3 requests = 150M requests
    expect(lines(prices, 'aws', 'q')).toHaveLength(1) // SQS has no base fee line
    expect(monthly(prices, 'aws', 'q')).toBeCloseTo(150 * 0.4, 10)
    // Azure: $10 base + 150M operations: 13M free, 87M at $0.80, 50M at $0.50
    expect(monthly(prices, 'azure', 'q')).toBeCloseTo(10 + 87 * 0.8 + 50 * 0.5, 10)
    // Google Cloud: 50M x 1 KB x 2 = 100 GB = 0.0909 TiB at $40
    expect(monthly(prices, 'gcp', 'q')).toBeCloseTo((100e9 / 2 ** 40) * 40, 10)
  })

  it('queue: a 100 KB message is two 64 KB request chunks', () => {
    const { prices } = cost({ components: [{ id: 'q', type: 'queue', sizing: { messages_millions: 1, message_kb: 100 } }] })
    expect(lines(prices, 'aws', 'q')[0].quantity).toBe(1 * 3 * 2)
  })

  it('lb: hours per load balancer plus throughput', () => {
    const { prices } = cost({ components: [{ id: 'lb', type: 'lb', sizing: { count: 2, gb_processed: 1000 } }] })
    expect(monthly(prices, 'aws', 'lb')).toBeCloseTo(2 * 730 * 0.0225 + 1000 * 0.008, 10)
    expect(monthly(prices, 'azure', 'lb')).toBeCloseTo(2 * 730 * 0.2 + 1000 * 0.008, 10)
    expect(monthly(prices, 'gcp', 'lb')).toBeCloseTo(2 * 730 * 0.025 + (1000e9 / 2 ** 30) * 0.008, 10)
  })

  it('cdn: base fee (Azure only) + transfer + requests', () => {
    const { prices } = cost({ components: [{ id: 'cdn', type: 'cdn', sizing: { gb_delivered: 500, requests_millions: 5 } }] })
    expect(monthly(prices, 'aws', 'cdn')).toBeCloseTo(500 * 0.085 + 500 * 0.01, 10)
    expect(monthly(prices, 'azure', 'cdn')).toBeCloseTo(35 + 500 * 0.0825 + 500 * 0.009, 10)
    expect(lines(prices, 'gcp', 'cdn')).toHaveLength(2) // no base fee line
  })

  it('storage: splits across bands above 50 TB', () => {
    const { prices } = cost({ components: [{ id: 'st', type: 'storage', sizing: { storage_gb: 60_000 } }] })
    const aws = lines(prices, 'aws', 'st')
    expect(aws.map((l) => [l.quantity, l.unit_price])).toEqual([[51_200, 0.023], [8_800, 0.022]])
    expect(aws[0].item).toContain('0 to 51,200 GB-month band')
  })
})

describe('defaults and bad sizing', () => {
  it('fills missing sizing from defaults and labels it default', () => {
    const { workload } = cost({ components: [{ id: 'db', type: 'database', sizing: { storage_gb: 50 } }] })
    const db = workload.components.find((c) => c.id === 'db')!
    expect(db.sizing).toEqual({ vcpu: 2, ha: 'true', storage_gb: 50 })
    expect(db.sizing_basis).toEqual({ vcpu: 'default', ha: 'default', storage_gb: 'stated' })
    expect(workload.components.find((c) => c.id === EGRESS_ID)!.sizing_basis).toEqual({ gb_per_month: 'default' })
  })

  it('makes an unpriced size unpriced on every cloud, so no cheapest cloud is named', () => {
    const { prices, res } = cost({
      components: [
        { id: 'web', type: 'service', sizing: { vcpu: 6 } },
        { id: 'st', type: 'storage' },
      ],
    })
    for (const cloud of ['aws', 'gcp', 'azure'] as const) {
      const web = lines(prices, cloud, 'web')
      expect(web).toHaveLength(1)
      expect(web[0].source).toBe('unpriced')
      expect(web[0].note).toContain('vcpu 6 is not priced (choose 2, 4, 8)')
    }
    expect(res.complete).toBe(false)
    expect(res.variance.ondemand.cheapest).toBeNull()
    expect(res.variance.ondemand.like_for_like.components).toEqual(['st', EGRESS_ID])
  })

  it.each([[-1], [Number.NaN], ['12'], [Infinity]])('rejects a bad number (%s)', (bad) => {
    const { prices } = cost({ components: [{ id: 'st', type: 'storage', sizing: { storage_gb: bad } }] })
    expect(lines(prices, 'aws', 'st')[0].source).toBe('unpriced')
  })

  it('treats a bad egress figure as the default', () => {
    const { workload } = cost({ components: [], egress_gb: -5 })
    expect(workload.components[0].sizing).toEqual({ gb_per_month: 200 })
  })

  it('prices an empty board as egress only', () => {
    const { res } = cost({ components: [], egress_gb: 0 })
    expect(res.variance.ondemand.totals).toEqual({ aws: 0, gcp: 0, azure: 0 })
  })
})
