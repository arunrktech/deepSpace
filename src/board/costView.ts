/**
 * compute() result -> what the cost panel shows. Pure, so it is unit tested;
 * CostPanel.tsx only renders what this returns.
 *
 * The one rule that matters: a cloud is called "cheapest" only when every
 * component is priced on every cloud (the cost model's fair-comparison rule).
 * Otherwise the panel shows the warning and the like-for-like comparison.
 */
import { CLOUDS, CLOUD_NAMES, type Cloud, type CostLine, type CostResult, type PriceLine, type Scenario } from '../cost/types'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const money = (n: number) => usd.format(n)

/** "+$12.34 (8.1%)" against the cheapest cloud; "" for the cheapest itself. */
export function vsLabel(v: { usd: number; pct: number | null } | null | undefined): string {
  if (!v || v.usd === 0) return ''
  return `+${money(v.usd)}${v.pct === null ? '' : ` (${v.pct}%)`}`
}

export interface CloudTotal {
  cloud: Cloud
  name: string
  monthly: number
  annual: number
  /** Only true on a complete comparison. */
  cheapest: boolean
  vs: string
}

export interface ComponentRowView {
  id: string
  label: string
  comparable: boolean
  amounts: Record<Cloud, number>
  cheapest: Cloud | null
  spread: number | null
  /** e.g. "AWS, Azure" for a component missing a price there. */
  gapsOn: string
  /** Why it isn't priced, from the unpriced lines' notes. */
  reasons: string[]
}

export interface CostView {
  scenario: Scenario
  complete: boolean
  totals: CloudTotal[]
  warning: string | null
  /** When incomplete: the cheapest cloud over the components priced everywhere. */
  likeForLike: { cheapest: string; components: number; of: number; totals: Record<Cloud, number> } | null
  rows: ComponentRowView[]
  drivers: { label: string; spread: number; share: number | null }[]
}

export function costView(res: CostResult, scenario: Scenario): CostView {
  const v = res.variance[scenario]
  const lf = v.like_for_like
  const names = (clouds: Cloud[]) => clouds.map((c) => CLOUD_NAMES[c]).join(', ')

  return {
    scenario,
    complete: res.complete,
    totals: CLOUDS.map((c) => ({
      cloud: c,
      name: CLOUD_NAMES[c],
      monthly: v.totals[c],
      annual: v.annual[c],
      cheapest: v.cheapest === c,
      vs: vsLabel(v.vs_cheapest?.[c]),
    })),
    warning: res.warnings[0] ?? null,
    likeForLike:
      !res.complete && lf.cheapest && lf.totals
        ? { cheapest: CLOUD_NAMES[lf.cheapest], components: lf.components.length, of: res.components.length, totals: lf.totals }
        : null,
    rows: res.components.map((r) => ({
      id: r.component,
      label: r.label,
      comparable: r.comparable,
      amounts: r[scenario],
      cheapest: r[`${scenario}_cheapest`],
      spread: r[`${scenario}_spread_usd`],
      gapsOn: names(r.gaps_on),
      reasons: [...new Set(res.unpriced.filter((u) => u.component === r.component).map((u) => u.note ?? ''))].filter(Boolean),
    })),
    drivers: res.top_variance_drivers.map((d) => ({ label: d.label, spread: d.spread_usd, share: d.share_of_component_spread_pct })),
  }
}

/** The price lines behind one component, per cloud, for the expanded row. */
export function linesOf(res: CostResult, componentId: string): Record<Cloud, (CostLine | (PriceLine & { cloud: Cloud }))[]> {
  const out = { aws: [], gcp: [], azure: [] } as Record<Cloud, (CostLine | (PriceLine & { cloud: Cloud }))[]>
  for (const l of res.lines) if (l.component === componentId) out[l.cloud].push(l)
  for (const u of res.unpriced) if (u.component === componentId) out[u.cloud].push(u)
  return out
}
