/**
 * Monthly cost per cloud, per component, and the variance between clouds.
 *
 * A line-for-line TypeScript port of scripts/cost_model.py from
 * github.com/arunrktech/cloud-cost-comparator. The function names, field names
 * and rules are the same so the two files can be read side by side. Only the
 * CLI (argparse, file reading and writing, printing) is left out: the app
 * passes objects in and gets an object back.
 *
 * Validation (validate returns a list of errors; empty means valid):
 *   - every priced line has unit_price, quantity, source in {api, page}, an
 *     https url on an official vendor host (OFFICIAL_HOSTS) and a retrieved date
 *   - unpriced lines must have source 'unpriced' and a note
 *   - every workload component (if a workload is given) has at least one line
 *     on every cloud, or an unpriced line
 *
 * Fair comparison rule:
 *   A component is "comparable" only if it is fully priced on all three clouds
 *   (no unpriced line and at least one priced line on each). If any component
 *   is not comparable, no overall cheapest cloud is declared. Instead the
 *   result carries a like-for-like comparison over the comparable components,
 *   and the totals are flagged as incomplete.
 */
import { pyRound, pySum } from './pyMath'
import {
  CLOUDS,
  CLOUD_NAMES,
  type Cloud,
  type ComponentRow,
  type CostLine,
  type CostResult,
  type PerCloud,
  type PriceLine,
  type PricesFile,
  type Scenario,
  type ScenarioVariance,
  type SourceRef,
  type VsCheapest,
  type Workload,
} from './types'

/**
 * Exact hostnames accepted as official pricing sources. Exact match only, so
 * look-alike hosts (notgoogle.com.evil.example), other products on the same
 * parent domain (docs.google.com Sheets, www.amazon.com retail) and user
 * content hosts (*.s3.amazonaws.com buckets) are rejected.
 */
export const OFFICIAL_HOSTS = new Set([
  // AWS
  'aws.amazon.com', 'docs.aws.amazon.com', 'calculator.aws',
  'pricing.us-east-1.amazonaws.com', 'api.pricing.us-east-1.amazonaws.com',
  'api.pricing.eu-central-1.amazonaws.com', 'api.pricing.ap-south-1.amazonaws.com',
  // Google Cloud
  'cloud.google.com', 'docs.cloud.google.com', 'cloudbilling.googleapis.com',
  // Microsoft Azure
  'azure.microsoft.com', 'learn.microsoft.com', 'prices.azure.com', 'www.microsoft.com',
])

/** Return null if u is an https URL on an official host, else a reason string. */
export function officialUrl(u: unknown): string | null {
  const text = String(u).trim()
  // Checked before parsing so a bare "aws.amazon.com/..." gets the same message as in Python.
  if (!/^https:\/\//i.test(text)) return 'must start with https://'
  let p: URL
  try {
    p = new URL(text)
  } catch {
    return 'not a valid URL'
  }
  const host = p.hostname.toLowerCase().replace(/\.+$/, '')
  // "https://aws.amazon.com@evil.example/" really points at evil.example.
  if (p.username || p.password) return 'must not contain credentials'
  if (!OFFICIAL_HOSTS.has(host)) return `host '${host || '?'}' is not an official vendor pricing host`
  return null
}

/** Python's `x in (None, "")`. */
const isBlank = (v: unknown) => v === undefined || v === null || v === ''

/** Python prints a missing value as None inside f-strings; keep the messages identical. */
const show = (v: unknown) => (v === undefined || v === null ? 'None' : String(v))

export function validate(prices: unknown, workload?: Workload | null): string[] {
  const errs: string[] = []
  const clouds = (prices as PricesFile | null)?.clouds
  if (typeof prices !== 'object' || prices === null || Array.isArray(prices) ||
      typeof clouds !== 'object' || clouds === null || Array.isArray(clouds)) {
    return ["prices.json must be an object with a 'clouds' object holding aws, gcp and azure lists"]
  }
  for (const c of CLOUDS) {
    ;(clouds[c] ?? []).forEach((line, i) => {
      const l = line as unknown as Record<string, unknown>
      const tag = `${c}[${i}] ${show(l.component)}/${show(l.item)}`
      if (l.source === 'unpriced') {
        if (!l.note) errs.push(`${tag}: unpriced line needs a note explaining why`)
        if (!l.component) errs.push(`${tag}: missing component`)
        return // Python: continue
      }
      for (const f of ['component', 'item', 'unit', 'unit_price', 'quantity', 'url', 'retrieved']) {
        if (isBlank(l[f])) errs.push(`${tag}: missing ${f}`)
      }
      if (l.source !== 'api' && l.source !== 'page') {
        errs.push(`${tag}: source must be api, page or unpriced`)
      }
      for (const f of ['unit_price', 'quantity', 'commit_unit_price']) {
        const v = l[f]
        // typeof also rules out booleans, which Python has to exclude by hand (bool is an int there).
        if (v !== undefined && v !== null && (typeof v !== 'number' || v < 0)) {
          errs.push(`${tag}: ${f} must be a non negative number`)
        }
      }
      if (l.url) {
        const why = officialUrl(l.url)
        if (why) errs.push(`${tag}: url ${why}: ${String(l.url)}`)
      }
    })
  }
  if (workload) {
    const ids = (workload.components ?? []).map((x) => x.id)
    for (const c of CLOUDS) {
      const have = new Set((clouds[c] ?? []).map((l) => l.component))
      for (const cid of ids) {
        if (!have.has(cid)) errs.push(`${c}: component '${cid}' has no price line (add one or an unpriced line)`)
      }
    }
  }
  return errs
}

/** Per-cloud object built from a function of the cloud, always in AWS, GCP, Azure order. */
const perCloud = <T>(f: (c: Cloud) => T): PerCloud<T> =>
  Object.fromEntries(CLOUDS.map((c) => [c, f(c)])) as PerCloud<T>

/**
 * Python's min(d, key=d.get): the first key with the smallest value.
 * Iterating in CLOUDS order means a tie goes to AWS, then GCP, then Azure.
 */
const cheapestOf = (vals: PerCloud<number>): Cloud =>
  CLOUDS.reduce((best, c) => (vals[c] < vals[best] ? c : best), CLOUDS[0])

/**
 * Compute costs. Assumes `prices` already passed validate(); like the Python,
 * it does not re-check fields.
 */
export function compute(prices: PricesFile, workload?: Workload | null): CostResult {
  const order: string[] = workload ? workload.components.map((x) => x.id) : []
  const labels = new Map((workload?.components ?? []).map((x) => [x.id, x.label ?? x.id]))
  const label = (cid: string) => labels.get(cid) ?? cid

  const lines: CostLine[] = []
  const unpriced: (PriceLine & { cloud: Cloud })[] = []
  const sources = new Map<string, SourceRef>() // keyed by url, first seen first
  // comp[id][cloud] = { ondemand, commit }
  const comp = new Map<string, Partial<Record<Cloud, Record<Scenario, number>>>>()
  // component -> clouds with an unpriced line
  const unpricedOn = new Map<string, Set<Cloud>>()

  for (const c of CLOUDS) {
    for (const l of prices.clouds[c] ?? []) {
      const cid = l.component
      if (!order.includes(cid)) order.push(cid)
      if (l.source === 'unpriced') {
        unpriced.push({ cloud: c, ...l })
        if (!unpricedOn.has(cid)) unpricedOn.set(cid, new Set())
        unpricedOn.get(cid)!.add(c)
        continue
      }
      // Validated lines always carry these; the casts only tell TypeScript so.
      const unitPrice = l.unit_price as number
      const quantity = l.quantity as number
      const od = pyRound(unitPrice * quantity, 4)
      const cu = l.commit_unit_price ?? null
      const cm = pyRound((cu !== null ? cu : unitPrice) * quantity, 4)
      lines.push({
        cloud: c, component: cid, item: l.item as string, unit: l.unit as string, unit_price: unitPrice,
        quantity, monthly_ondemand: od, commit_unit_price: cu, monthly_commit: cm,
        commit_label: l.commit_label ?? '', source: l.source, url: l.url as string,
        retrieved: l.retrieved as string, note: l.note ?? '',
      })
      if (!comp.has(cid)) comp.set(cid, {})
      const cell = (comp.get(cid)![c] ??= { ondemand: 0, commit: 0 })
      cell.ondemand += od
      cell.commit += cm
      const url = l.url as string
      if (!sources.has(url)) {
        sources.set(url, { cloud: c, url, retrieved: l.retrieved as string, source: l.source, items: [] })
      }
      sources.get(url)!.items.push(l.item as string)
    }
  }

  // A component is comparable only when every cloud has priced lines and no cloud has an unpriced line.
  const gaps = new Map<string, Cloud[]>()
  for (const cid of order) {
    const missingOn = CLOUDS.filter((c) => !comp.get(cid)?.[c])
    const union = new Set<Cloud>([...(unpricedOn.get(cid) ?? []), ...missingOn])
    gaps.set(cid, [...union].sort()) // Python sorted(): alphabetical, so aws, azure, gcp
  }
  const comparable = order.filter((cid) => gaps.get(cid)!.length === 0)
  const excluded = order.filter((cid) => gaps.get(cid)!.length > 0)
  const complete = excluded.length === 0

  const value = (cid: string, c: Cloud, scn: Scenario) => comp.get(cid)?.[c]?.[scn] ?? 0

  const sums = (ids: string[], scn: Scenario) =>
    perCloud((c) => pyRound(pySum(ids.map((cid) => value(cid, c, scn))), 2))

  const ranking = (vals: PerCloud<number>): [Cloud, PerCloud<VsCheapest>] => {
    const cheapest = cheapestOf(vals)
    const base = vals[cheapest]
    return [
      cheapest,
      perCloud((c) => ({
        usd: pyRound(vals[c] - base, 2),
        pct: base ? pyRound(((vals[c] - base) / base) * 100, 1) : null,
      })),
    ]
  }

  const variance = (scn: Scenario): ScenarioVariance => {
    const totals = sums(order, scn)
    const incomplete = new Set(excluded.flatMap((cid) => gaps.get(cid)!))
    const out: ScenarioVariance = {
      scenario: scn,
      complete,
      totals,
      annual: perCloud((c) => pyRound(totals[c] * 12, 2)),
      cheapest: null,
      vs_cheapest: null,
      incomplete_clouds: CLOUDS.filter((c) => incomplete.has(c)), // sorted by CLOUDS order
      like_for_like: { components: comparable, excluded_components: excluded, totals: null, cheapest: null, vs_cheapest: null },
    }
    if (comparable.length > 0) {
      const lt = sums(comparable, scn)
      const [lc, lv] = ranking(lt)
      out.like_for_like = { ...out.like_for_like, totals: lt, cheapest: lc, vs_cheapest: lv }
    }
    if (complete) {
      // Only a fully priced comparison may name an overall cheapest cloud.
      ;[out.cheapest, out.vs_cheapest] = ranking(totals)
    }
    return out
  }

  const compRows: ComponentRow[] = order.map((cid) => {
    const gapsOn = gaps.get(cid)!
    const row = { component: cid, label: label(cid), comparable: gapsOn.length === 0, gaps_on: gapsOn } as ComponentRow
    for (const scn of ['ondemand', 'commit'] as const) {
      const v = perCloud((c) => pyRound(value(cid, c, scn), 2))
      row[scn] = v
      if (gapsOn.length > 0) {
        row[`${scn}_cheapest`] = null
        row[`${scn}_spread_usd`] = null
      } else {
        row[`${scn}_cheapest`] = cheapestOf(v)
        row[`${scn}_spread_usd`] = pyRound(Math.max(...CLOUDS.map((c) => v[c])) - Math.min(...CLOUDS.map((c) => v[c])), 2)
      }
    }
    return row
  })

  const ranked = compRows.filter((r) => r.comparable)
  const sumSpread = pySum(ranked.map((r) => r.ondemand_spread_usd as number))
  // Array.prototype.sort is stable, like Python's sorted(), so equal spreads keep board order.
  const drivers = [...ranked].sort((a, b) => (b.ondemand_spread_usd as number) - (a.ondemand_spread_usd as number)).slice(0, 3)

  const warnings: string[] = []
  if (!complete) {
    const detail = excluded
      .map((cid) => `${label(cid)} on ${gaps.get(cid)!.map((c) => CLOUD_NAMES[c]).join(', ')}`)
      .join('; ')
    warnings.push(
      `No overall cheapest cloud declared: ${excluded.length} component(s) are not priced on every cloud (${detail}). ` +
        `Totals are incomplete; the like for like comparison covers ${comparable.length} of ${order.length} components.`,
    )
  }

  return {
    currency: prices.currency ?? 'USD',
    retrieved: prices.retrieved ?? null,
    complete,
    warnings,
    variance: { ondemand: variance('ondemand'), commit: variance('commit') },
    components: compRows,
    top_variance_drivers: drivers.map((d) => ({
      component: d.component,
      label: d.label,
      spread_usd: d.ondemand_spread_usd as number,
      share_of_component_spread_pct: sumSpread ? pyRound(((d.ondemand_spread_usd as number) / sumSpread) * 100, 1) : null,
    })),
    lines,
    unpriced,
    sources: [...sources.values()],
    source_mix: {
      api: lines.filter((l) => l.source === 'api').length,
      page: lines.filter((l) => l.source === 'page').length,
    },
  }
}
