/**
 * Checks on the price snapshot's shape and provenance. These can't prove a
 * price is right (NOTES.md lists prices to spot-check by hand); they prove
 * every price is complete, sourced and usable by the cost model.
 */
import { describe, expect, it } from 'vitest'
import { officialUrl, validate } from './costModel'
import { PRICE_KEYS, SNAPSHOT, SNAPSHOT_DATE, priceFor } from './snapshot'
import { CLOUDS, type PriceLine, type PricesFile } from './types'

describe('price snapshot', () => {
  it('has exactly one price per key on every cloud', () => {
    for (const key of PRICE_KEYS) {
      for (const cloud of CLOUDS) {
        const matches = SNAPSHOT.filter((s) => s.key === key && s.cloud === cloud)
        expect(matches, `${key} on ${cloud}`).toHaveLength(1)
      }
    }
    expect(SNAPSHOT).toHaveLength(PRICE_KEYS.length * CLOUDS.length)
  })

  it.each(SNAPSHOT.map((s) => [`${s.key} ${s.cloud}`, s] as const))('%s is sourced from an official host', (_, s) => {
    expect(officialUrl(s.url)).toBeNull()
    expect(s.retrieved).toBe(SNAPSHOT_DATE)
    expect(s.item.length).toBeGreaterThan(0)
    expect(s.unit.length).toBeGreaterThan(0)
  })

  it('has finite, non-negative prices and commitments no dearer than on demand', () => {
    for (const s of SNAPSHOT) {
      expect(Number.isFinite(s.unit_price) && s.unit_price >= 0, `${s.key} ${s.cloud}`).toBe(true)
      if (s.commit_unit_price !== undefined) {
        expect(s.commit_unit_price, `${s.key} ${s.cloud}`).toBeGreaterThan(0)
        expect(s.commit_unit_price, `${s.key} ${s.cloud}`).toBeLessThanOrEqual(s.unit_price)
        expect(s.commit_label, `${s.key} ${s.cloud}`).toBeTruthy()
      }
    }
  })

  it('has tiers that start at unit_price, rise in order and end open', () => {
    for (const s of SNAPSHOT.filter((x) => x.tiers)) {
      const tiers = s.tiers!
      expect(tiers[0].unit_price, `${s.key} ${s.cloud}`).toBe(s.unit_price)
      expect(tiers[tiers.length - 1].up_to, `${s.key} ${s.cloud}`).toBeNull()
      for (let i = 1; i < tiers.length - 1; i++) {
        expect(tiers[i].up_to!, `${s.key} ${s.cloud}`).toBeGreaterThan(tiers[i - 1].up_to!)
      }
    }
  })

  it('prices HA at or above the single-instance price', () => {
    for (const base of ['db.2vcpu', 'db.4vcpu', 'db.storage', 'cache.small', 'cache.medium'] as const) {
      for (const cloud of CLOUDS) {
        const ha = priceFor(`${base}.ha` as (typeof PRICE_KEYS)[number], cloud)
        expect(ha.unit_price, `${base} ${cloud}`).toBeGreaterThanOrEqual(priceFor(base, cloud).unit_price)
      }
    }
  })

  it('passes the cost model validator when turned into price lines', () => {
    const prices: PricesFile = { currency: 'USD', retrieved: SNAPSHOT_DATE, clouds: { aws: [], gcp: [], azure: [] } }
    for (const s of SNAPSHOT) {
      const line: PriceLine = {
        component: s.key, item: s.item, unit: s.unit, unit_price: s.unit_price, quantity: 1,
        commit_unit_price: s.commit_unit_price, commit_label: s.commit_label,
        source: s.source, url: s.url, retrieved: s.retrieved, note: s.note,
      }
      prices.clouds[s.cloud]!.push(line)
    }
    expect(validate(prices, null)).toEqual([])
  })

  it('keeps the derived numbers the notes describe', () => {
    // Spot checks of the arithmetic written out in snapshot.ts.
    expect(priceFor('vm.2vcpu', 'azure').commit_unit_price).toBeCloseTo(519 / 8760, 10) // $0.059247 per hour
    expect(priceFor('db.2vcpu', 'gcp').unit_price).toBeCloseTo(0.1386, 10) // 2 x 0.0413 + 8 x 0.007
    expect(priceFor('storage.gb', 'gcp').unit_price).toBeCloseTo(0.02, 6) // 0.000027397 x 730
    expect(priceFor('cache.medium.ha', 'aws').unit_price).toBeCloseTo(0.2528, 10) // 2 nodes x 0.1264
  })

  it('throws on a missing price', () => {
    expect(() => priceFor('nope' as never, 'aws')).toThrow('No snapshot price')
  })
})
