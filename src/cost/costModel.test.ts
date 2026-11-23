/**
 * Tests for the cost model port.
 *
 * 1. Golden tests: the full compute() result must deep-equal what the original
 *    Python cost_model.py returns for the same input. The golden file is made by
 *    scripts/make-cost-golden.py (see the header there to regenerate it).
 * 2. Ports of tests/test_cost_model.py, so each rule the original tool was
 *    reviewed for (unpriced lines, fair comparison, official URLs) is checked
 *    by name. The FriendlyErrors tests are not ported: they test the Python
 *    CLI's file handling, which this port does not have.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { compute, validate } from './costModel'
import type { PricesFile, Workload } from './types'
import pricesJson from './__fixtures__/prices.example.json'
import workloadJson from './__fixtures__/workload.example.json'
import golden from './__fixtures__/costs.golden.json'

// Fresh deep copies so a test that edits its input cannot leak into another.
// The fixtures are plain JSON, like a file read from disk, so they go through
// `unknown`: TypeScript's guessed type for a JSON import is not our schema type.
const prices = (): PricesFile => structuredClone(pricesJson) as unknown as PricesFile
const workload = (): Workload => structuredClone(workloadJson) as unknown as Workload

describe('golden: same result as the Python cost_model.py', () => {
  it('example', () => {
    expect(compute(prices(), workload())).toEqual(golden.example)
  })

  it('AWS web unpriced', () => {
    const p = prices()
    p.clouds.aws = p.clouds.aws!.filter((l) => l.component !== 'web')
    p.clouds.aws.push({ component: 'web', item: 'EC2 m7i.large', source: 'unpriced', note: 'price not found' })
    expect(compute(p, workload())).toEqual(golden['aws-web-unpriced'])
  })

  it('GCP web partly unpriced', () => {
    const p = prices()
    p.clouds.gcp!.push({ component: 'web', item: 'OS licence', source: 'unpriced', note: 'not found' })
    expect(compute(p, workload())).toEqual(golden['gcp-partial'])
  })

  it('Azure files missing, no workload', () => {
    const p = prices()
    p.clouds.azure = p.clouds.azure!.filter((l) => l.component !== 'files')
    expect(compute(p, null)).toEqual(golden['azure-files-missing-no-workload'])
  })
})

describe('CompleteExample', () => {
  it('example totals and cheapest', () => {
    expect(validate(prices(), workload())).toEqual([])
    const res = compute(prices(), workload())
    const v = res.variance.ondemand
    expect(res.complete).toBe(true)
    expect(v.cheapest).toBe('azure')
    expect(v.totals).toEqual({ aws: 167.67, gcp: 173.46, azure: 159.26 })
    expect(res.variance.commit.cheapest).toBe('azure')
    expect(res.warnings).toEqual([])
  })
})

describe('UnpricedItems: an unpriced line must never make a cloud look cheapest', () => {
  let p: PricesFile
  beforeEach(() => {
    p = prices()
    p.clouds.aws = p.clouds.aws!.filter((l) => l.component !== 'web')
    p.clouds.aws.push({ component: 'web', item: 'EC2 m7i.large', source: 'unpriced', note: 'price not found' })
  })

  it('no overall cheapest when incomplete', () => {
    expect(validate(p, workload())).toEqual([])
    const res = compute(p, workload())
    const v = res.variance.ondemand
    expect(res.complete).toBe(false)
    expect(v.cheapest).toBeNull()
    expect(v.vs_cheapest).toBeNull()
    expect(res.variance.commit.cheapest).toBeNull()
    expect(v.incomplete_clouds).toEqual(['aws'])
    expect(res.warnings[0]).toContain('No overall cheapest')
  })

  it('like for like excludes the gap component on every cloud', () => {
    const lf = compute(p, workload()).variance.ondemand.like_for_like
    expect(lf.excluded_components).toEqual(['web'])
    expect(lf.components).toEqual(['files', 'egress'])
    // files + egress only: AWS 11.50 + 9.00, GCP 9.31 + 22.35, Azure 10.40 + 8.70
    expect(lf.totals).toEqual({ aws: 20.5, gcp: 31.66, azure: 19.1 })
    expect(lf.cheapest).toBe('azure')
  })

  it('gap component is not ranked', () => {
    const res = compute(p, workload())
    const web = res.components.find((r) => r.component === 'web')!
    expect(web.comparable).toBe(false)
    expect(web.gaps_on).toEqual(['aws'])
    expect(web.ondemand_cheapest).toBeNull()
    expect(web.ondemand_spread_usd).toBeNull()
    expect(res.top_variance_drivers.map((d) => d.component)).not.toContain('web')
  })

  it('partially priced component is not comparable', () => {
    const q = prices()
    q.clouds.gcp!.push({ component: 'web', item: 'OS licence', source: 'unpriced', note: 'not found' })
    const res = compute(q, workload())
    expect(res.variance.ondemand.cheapest).toBeNull()
    expect(res.variance.ondemand.like_for_like.excluded_components).toEqual(['web'])
  })

  it('component missing on a cloud without a workload', () => {
    const q = prices()
    q.clouds.azure = q.clouds.azure!.filter((l) => l.component !== 'files')
    const res = compute(q, null)
    expect(res.variance.ondemand.cheapest).toBeNull()
    expect(res.variance.ondemand.like_for_like.excluded_components).toContain('files')
  })
})

describe('OfficialUrls: the URL check must match the real hostname, not a substring', () => {
  const check = (url: string) => {
    const p = prices()
    p.clouds.aws![0].url = url
    return validate(p, null)
  }

  it.each([
    'https://docs.google.com/spreadsheets/d/abc/edit',
    'https://notgoogle.com.evil.example/pricing',
    'https://cloud.google.com.evil.example/x',
    'https://evil.example/?ref=aws.amazon.com',
    'https://www.amazon.com/dp/B000',
    'https://my-bucket.s3.amazonaws.com/prices.csv',
    'https://aws.amazon.com@evil.example/x',
    'http://aws.amazon.com/ec2/pricing/',
    'aws.amazon.com/ec2/pricing/',
    'ftp://pricing.us-east-1.amazonaws.com/x',
  ])('rejects %s', (bad) => {
    expect(check(bad).some((e) => e.includes('url'))).toBe(true)
  })

  it.each([
    'https://aws.amazon.com/ec2/pricing/on-demand/',
    'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-east-1/index.csv',
    'https://cloud.google.com/storage/pricing',
    'https://docs.cloud.google.com/bigquery/docs/introduction',
    'https://prices.azure.com/api/retail/prices',
    'https://azure.microsoft.com/en-us/pricing/details/storage/blobs/',
    'https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices',
    'HTTPS://AWS.AMAZON.COM/s3/pricing/',
  ])('accepts %s', (good) => {
    expect(check(good)).toEqual([])
  })
})

describe('validate: other line rules', () => {
  it('rejects a non-object prices file', () => {
    expect(validate(null)).toHaveLength(1)
    expect(validate({ clouds: [] })).toHaveLength(1)
  })

  it('needs a note on unpriced lines', () => {
    const p = prices()
    p.clouds.aws!.push({ component: 'web', source: 'unpriced' })
    expect(validate(p, null)).toEqual(['aws[3] web/None: unpriced line needs a note explaining why'])
  })

  it('rejects negative, boolean and text prices', () => {
    const p = prices()
    const line = p.clouds.aws![0] as unknown as Record<string, unknown>
    line.unit_price = -1
    line.quantity = true
    line.commit_unit_price = '0.06'
    const errs = validate(p, null)
    for (const f of ['unit_price', 'quantity', 'commit_unit_price']) {
      expect(errs.some((e) => e.endsWith(`${f} must be a non negative number`))).toBe(true)
    }
  })

  it('reports a workload component with no line on a cloud', () => {
    const p = prices()
    p.clouds.gcp = p.clouds.gcp!.filter((l) => l.component !== 'egress')
    expect(validate(p, workload())).toEqual(["gcp: component 'egress' has no price line (add one or an unpriced line)"])
  })
})
