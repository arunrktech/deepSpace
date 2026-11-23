/**
 * Types for the cost model, ported from cloud-cost-comparator
 * (references/workload_schema.md and the output of scripts/cost_model.py).
 *
 * Field names stay snake_case on purpose: they are the JSON file formats of the
 * original tool, so a workload.json / prices.json / costs.json can move between
 * the Python tool and this app unchanged.
 */

export const CLOUDS = ['aws', 'gcp', 'azure'] as const
export type Cloud = (typeof CLOUDS)[number]

export const CLOUD_NAMES: Record<Cloud, string> = {
  aws: 'AWS',
  gcp: 'Google Cloud',
  azure: 'Azure',
}

// ---------------------------------------------------------------------------
// workload.json: what is being built
// ---------------------------------------------------------------------------

/** "stated" = came from the input or the user; "default" = from sizing_defaults.md. */
export type SizingBasis = 'stated' | 'default'

export interface ServiceMapping {
  service: string
  sku: string
  reason: string
}

export interface WorkloadComponent {
  id: string
  label?: string
  /** A category key from service_map.md, e.g. compute_vm, cache, cdn. */
  category: string
  /** Diagram layer: edge, web, app, data, analytics, ops. */
  tier?: string
  sizing: Record<string, number | string>
  sizing_basis?: Record<string, SizingBasis>
  source?: string
  mapping?: Partial<Record<Cloud, ServiceMapping>>
}

export interface Flow {
  from: string
  to: string
  label?: string
}

export interface Assumption {
  item: string
  value: string
  basis: SizingBasis
  impact: 'low' | 'medium' | 'high'
}

export interface Workload {
  project?: string
  inputs?: string[]
  regions?: Partial<Record<Cloud, string>>
  hours_per_month?: number
  components: WorkloadComponent[]
  flows?: Flow[]
  assumptions?: Assumption[]
}

// ---------------------------------------------------------------------------
// prices.json: one line per billable item, per cloud
// ---------------------------------------------------------------------------

/** api = vendor pricing API, page = vendor pricing web page, unpriced = no price found. */
export type PriceSource = 'api' | 'page' | 'unpriced'

export interface PriceLine {
  component: string
  item?: string
  unit?: string
  /** null only on unpriced lines. */
  unit_price?: number | null
  /** In the same unit as unit_price (per 1,000 requests means quantity counts thousands). */
  quantity?: number
  /** Optional; when absent the on-demand price is used in the commitment scenario. */
  commit_unit_price?: number | null
  commit_label?: string
  source: PriceSource
  url?: string
  /** ISO date the price was read, e.g. 2026-11-05. */
  retrieved?: string
  note?: string
}

export interface PricesFile {
  currency?: string
  retrieved?: string
  clouds: Partial<Record<Cloud, PriceLine[]>>
}

// ---------------------------------------------------------------------------
// costs.json: what compute() returns
// ---------------------------------------------------------------------------

export type Scenario = 'ondemand' | 'commit'
export type PerCloud<T> = Record<Cloud, T>

export interface VsCheapest {
  usd: number
  /** null when the cheapest total is 0 (no percentage of zero). */
  pct: number | null
}

export interface LikeForLike {
  components: string[]
  excluded_components: string[]
  totals: PerCloud<number> | null
  cheapest: Cloud | null
  vs_cheapest: PerCloud<VsCheapest> | null
}

export interface ScenarioVariance {
  scenario: Scenario
  complete: boolean
  totals: PerCloud<number>
  annual: PerCloud<number>
  /** Only set when every component is priced on every cloud. */
  cheapest: Cloud | null
  vs_cheapest: PerCloud<VsCheapest> | null
  incomplete_clouds: Cloud[]
  like_for_like: LikeForLike
}

export interface ComponentRow {
  component: string
  label: string
  comparable: boolean
  /** Clouds where this component is missing or has an unpriced line (sorted A to Z). */
  gaps_on: Cloud[]
  ondemand: PerCloud<number>
  ondemand_cheapest: Cloud | null
  ondemand_spread_usd: number | null
  commit: PerCloud<number>
  commit_cheapest: Cloud | null
  commit_spread_usd: number | null
}

export interface CostLine {
  cloud: Cloud
  component: string
  item: string
  unit: string
  unit_price: number
  quantity: number
  monthly_ondemand: number
  commit_unit_price: number | null
  monthly_commit: number
  commit_label: string
  source: 'api' | 'page'
  url: string
  retrieved: string
  note: string
}

export interface SourceRef {
  cloud: Cloud
  url: string
  retrieved: string
  source: 'api' | 'page'
  items: string[]
}

export interface VarianceDriver {
  component: string
  label: string
  spread_usd: number
  share_of_component_spread_pct: number | null
}

export interface CostResult {
  currency: string
  retrieved: string | null
  complete: boolean
  warnings: string[]
  variance: Record<Scenario, ScenarioVariance>
  components: ComponentRow[]
  top_variance_drivers: VarianceDriver[]
  lines: CostLine[]
  unpriced: (PriceLine & { cloud: Cloud })[]
  sources: SourceRef[]
  source_mix: { api: number; page: number }
}
