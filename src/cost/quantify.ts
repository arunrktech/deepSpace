/**
 * Board -> prices.json + workload.json, ready for compute().
 *
 * For each board component and each cloud, this picks snapshot prices and
 * works out the quantity from the component's sizing. Rules follow the
 * comparator's pricing_quirks.md:
 *   - a quantity that spans price bands gets one line per band
 *   - quantities are converted to the vendor's unit (Google Cloud bills GiB)
 *   - a size the snapshot doesn't cover becomes an `unpriced` line with a
 *     note, never a guess, so the fair-comparison rule takes over
 */
import {
  CATEGORY, DB_SIZES, CACHE_SIZES, DEFAULT_EGRESS_GB, DEFAULT_SIZING, LABEL, TIER, VM_SIZES,
  type Board, type BoardComponent, type ComponentType,
} from './board'
import { HOURS_PER_MONTH, REGIONS, SNAPSHOT_DATE, priceFor, type PriceKey, type SnapshotPrice } from './snapshot'
import {
  CLOUDS, type Cloud, type PriceLine, type PricesFile, type SizingBasis, type Workload, type WorkloadComponent,
} from './types'

/** Board-level internet egress becomes a component with this id. */
export const EGRESS_ID = 'internet-egress'

const GB = 1e9
const GIB = 2 ** 30
const TIB = 2 ** 40

/**
 * Turn a size in GB (10^9 bytes) into the unit a price is quoted in.
 * Google Cloud quotes GiB (2^30 bytes): 500 GB = 465.66 GiB.
 */
export function toVendorUnit(gb: number, unit: string): number {
  if (unit.startsWith('GiB')) return (gb * GB) / GIB
  if (unit.startsWith('TiB')) return (gb * GB) / TIB
  return gb
}

export interface Band {
  quantity: number
  unit_price: number
  /** Where this band starts and ends, in the price's unit (null = no end). */
  from: number
  to: number | null
}

/**
 * Split a quantity across a price's bands. Without bands, the whole quantity
 * is at unit_price. A zero quantity still returns one (zero) band, so the
 * component stays priced on that cloud.
 */
export function splitTiers(price: Pick<SnapshotPrice, 'unit_price' | 'tiers'>, quantity: number): Band[] {
  if (!price.tiers) return [{ quantity, unit_price: price.unit_price, from: 0, to: null }]
  const bands: Band[] = []
  let from = 0
  for (const tier of price.tiers) {
    const to = tier.up_to
    const end = to === null ? quantity : Math.min(quantity, to)
    if (end > from) bands.push({ quantity: end - from, unit_price: tier.unit_price, from, to })
    if (to === null || quantity <= to) break
    from = to
  }
  return bands.length ? bands : [{ quantity: 0, unit_price: price.tiers[0].unit_price, from: 0, to: price.tiers[0].up_to }]
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** Price lines for one snapshot price and quantity (one line per band used). */
function linesFor(componentId: string, key: PriceKey, cloud: Cloud, quantity: number, how: string): PriceLine[] {
  const p = priceFor(key, cloud)
  const bands = splitTiers(p, quantity)
  return bands.map((b) => ({
    component: componentId,
    item: bands.length > 1 || p.tiers
      ? `${p.item}, ${fmt(b.from)} to ${b.to === null ? 'above' : fmt(b.to)} ${p.unit} band`
      : p.item,
    unit: p.unit,
    unit_price: b.unit_price,
    quantity: b.quantity,
    // Bands have no published commitment price; untiered prices carry theirs.
    ...(p.commit_unit_price !== undefined && !p.tiers
      ? { commit_unit_price: p.commit_unit_price, commit_label: p.commit_label }
      : {}),
    source: p.source,
    url: p.url,
    retrieved: p.retrieved,
    note: [how, p.note].filter(Boolean).join('. '),
  }))
}

function unpriced(componentId: string, item: string, why: string): PriceLine {
  return { component: componentId, item, source: 'unpriced', note: why }
}

// --- Reading sizing safely ----------------------------------------------------

/** One sizing value: the stated value if valid, the default if missing, or an error. */
type Read<T> = { value: T; basis: SizingBasis } | { error: string }

function readNumber(sizing: Record<string, unknown>, field: string, fallback: number): Read<number> {
  const v = sizing[field]
  if (v === undefined || v === null || v === '') return { value: fallback, basis: 'default' }
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return { error: `${field} must be a non negative number, got ${String(v)}` }
  return { value: v, basis: 'stated' }
}

function readChoice<T extends string | number | boolean>(
  sizing: Record<string, unknown>, field: string, fallback: T, allowed: readonly T[],
): Read<T> {
  const v = sizing[field]
  if (v === undefined || v === null || v === '') return { value: fallback, basis: 'default' }
  if (!allowed.includes(v as T)) return { error: `${field} ${String(v)} is not priced (choose ${allowed.join(', ')})` }
  return { value: v as T, basis: 'stated' }
}

const BOOLS = [true, false] as const

/**
 * Read every field of one component. Returns the normalized sizing and each
 * field's basis, or the list of problems.
 */
function readSizing(c: BoardComponent):
  | { sizing: Record<string, number | string | boolean>; basis: Record<string, SizingBasis> }
  | { errors: string[] } {
  const s = c.sizing ?? {}
  const d = DEFAULT_SIZING
  const reads = ((): Record<string, Read<number | string | boolean>> => {
    switch (c.type) {
      case 'service': return {
        count: readNumber(s, 'count', d.service.count),
        vcpu: readChoice(s, 'vcpu', d.service.vcpu, VM_SIZES),
        hours: readNumber(s, 'hours', d.service.hours),
      }
      case 'database': return {
        vcpu: readChoice(s, 'vcpu', d.database.vcpu, DB_SIZES),
        ha: readChoice(s, 'ha', d.database.ha, BOOLS),
        storage_gb: readNumber(s, 'storage_gb', d.database.storage_gb),
      }
      case 'cache': return {
        size: readChoice(s, 'size', d.cache.size, CACHE_SIZES),
        ha: readChoice(s, 'ha', d.cache.ha, BOOLS),
      }
      case 'queue': return {
        messages_millions: readNumber(s, 'messages_millions', d.queue.messages_millions),
        message_kb: readNumber(s, 'message_kb', d.queue.message_kb),
      }
      case 'lb': return {
        count: readNumber(s, 'count', d.lb.count),
        gb_processed: readNumber(s, 'gb_processed', d.lb.gb_processed),
      }
      case 'cdn': return {
        gb_delivered: readNumber(s, 'gb_delivered', d.cdn.gb_delivered),
        requests_millions: readNumber(s, 'requests_millions', d.cdn.requests_millions),
      }
      case 'storage': return {
        storage_gb: readNumber(s, 'storage_gb', d.storage.storage_gb),
      }
    }
  })()
  const errors = Object.values(reads).flatMap((r) => ('error' in r ? [r.error] : []))
  if (errors.length) return { errors }
  const sizing: Record<string, number | string | boolean> = {}
  const basis: Record<string, SizingBasis> = {}
  for (const [k, r] of Object.entries(reads)) {
    if ('value' in r) {
      sizing[k] = r.value
      basis[k] = r.basis
    }
  }
  return { sizing, basis }
}

// --- Sizing -> price lines, per component type ----------------------------------

/** Requests per queue message: send, receive, delete. A planning rule of thumb, not a vendor figure. */
const REQUESTS_PER_MESSAGE = 3
/** SQS and Service Bus bill each started 64 KB of a message as one request. */
const REQUEST_CHUNK_KB = 64
/** Pub/Sub bills at least 1 KB per publish request. */
const PUBSUB_MIN_KB = 1

/** The snapshot price keys a component uses on every cloud (shown in the workload mapping). */
function keysFor(type: ComponentType, s: Record<string, number | string | boolean>): PriceKey[] {
  const ha = s.ha ? '.ha' : ''
  switch (type) {
    case 'service': return [`vm.${s.vcpu}vcpu` as PriceKey]
    case 'database': return [`db.${s.vcpu}vcpu${ha}` as PriceKey, `db.storage${ha}` as PriceKey]
    case 'cache': return [`cache.${s.size}${ha}` as PriceKey]
    case 'queue': return ['queue.base', 'queue.usage']
    case 'lb': return ['lb.hour', 'lb.processed']
    case 'cdn': return ['cdn.base', 'cdn.transfer', 'cdn.requests']
    case 'storage': return ['storage.gb']
  }
}

function componentLines(id: string, type: ComponentType, s: Record<string, number | string | boolean>, cloud: Cloud): PriceLine[] {
  const n = (k: string) => s[k] as number
  const [k1, k2, k3] = keysFor(type, s)
  switch (type) {
    case 'service':
      return linesFor(id, k1, cloud, n('count') * n('hours'), `${n('count')} instances x ${n('hours')} h`)

    case 'database': {
      const storageUnit = priceFor(k2, cloud).unit
      return [
        ...linesFor(id, k1, cloud, HOURS_PER_MONTH, `${HOURS_PER_MONTH} h`),
        ...linesFor(id, k2, cloud, toVendorUnit(n('storage_gb'), storageUnit), `${n('storage_gb')} GB`),
      ]
    }

    case 'cache':
      return linesFor(id, k1, cloud, HOURS_PER_MONTH, `${HOURS_PER_MONTH} h`)

    case 'queue': {
      const msgs = n('messages_millions')
      const kb = n('message_kb')
      let usage: number
      let how: string
      if (cloud === 'gcp') {
        // Publish and subscribe throughput, each message billed at least 1 KB.
        const bytes = msgs * 1e6 * Math.max(PUBSUB_MIN_KB, kb) * 1000 * 2
        usage = bytes / TIB
        how = `${fmt(msgs)}M messages x ${Math.max(PUBSUB_MIN_KB, kb)} KB x 2 (publish + subscribe)`
      } else {
        const chunks = Math.max(1, Math.ceil(kb / REQUEST_CHUNK_KB))
        usage = msgs * REQUESTS_PER_MESSAGE * chunks
        how = `${fmt(msgs)}M messages x ${REQUESTS_PER_MESSAGE} requests (send, receive, delete) x ${chunks} x 64 KB chunk`
      }
      const base = priceFor(k1, cloud).unit_price > 0 ? linesFor(id, k1, cloud, 1, '1 month') : []
      return [...base, ...linesFor(id, k2, cloud, usage, how)]
    }

    case 'lb': {
      const unit = priceFor(k2, cloud).unit
      // AWS LCU and Azure capacity unit each cover about 1 GB per hour of
      // throughput, so their unit-hours are taken as equal to GB processed.
      const processed = toVendorUnit(n('gb_processed'), unit)
      const how = unit.startsWith('GiB')
        ? `${fmt(n('gb_processed'))} GB processed`
        : `${fmt(n('gb_processed'))} GB processed, about 1 GB per ${unit} (throughput only)`
      return [
        ...linesFor(id, k1, cloud, n('count') * HOURS_PER_MONTH, `${n('count')} x ${HOURS_PER_MONTH} h`),
        ...linesFor(id, k2, cloud, processed, how),
      ]
    }

    case 'cdn': {
      const base = priceFor(k1, cloud).unit_price > 0 ? linesFor(id, k1, cloud, 1, '1 month') : []
      const transferUnit = priceFor(k2, cloud).unit
      return [
        ...base,
        ...linesFor(id, k2, cloud, toVendorUnit(n('gb_delivered'), transferUnit), `${fmt(n('gb_delivered'))} GB delivered`),
        ...linesFor(id, k3, cloud, n('requests_millions') * 100, `${fmt(n('requests_millions'))}M requests = ${fmt(n('requests_millions') * 100)} x 10K`),
      ]
    }

    case 'storage': {
      const unit = priceFor(k1, cloud).unit
      return linesFor(id, k1, cloud, toVendorUnit(n('storage_gb'), unit), `${fmt(n('storage_gb'))} GB`)
    }
  }
}

/** The service and SKU each cloud uses, from the snapshot item names. */
function mappingFor(keys: PriceKey[]): WorkloadComponent['mapping'] {
  return Object.fromEntries(
    CLOUDS.map((c) => [c, { service: priceFor(keys[0], c).item, sku: keys[0], reason: `Snapshot ${SNAPSHOT_DATE}, ${REGIONS[c]}` }]),
  )
}

// --- Whole board ----------------------------------------------------------------

export interface BoardPrices {
  prices: PricesFile
  workload: Workload
}

export function boardToPrices(board: Board): BoardPrices {
  const clouds: Record<Cloud, PriceLine[]> = { aws: [], gcp: [], azure: [] }
  const components: WorkloadComponent[] = []

  for (const c of board.components) {
    const label = c.label || LABEL[c.type]
    const read = readSizing(c)
    if ('errors' in read) {
      // Not priced on any cloud, so the component is excluded from the ranking.
      for (const cloud of CLOUDS) clouds[cloud].push(unpriced(c.id, label, `Sizing not priced: ${read.errors.join('; ')}`))
      components.push({ id: c.id, label, category: CATEGORY[c.type], tier: TIER[c.type], sizing: {}, source: 'board' })
      continue
    }
    for (const cloud of CLOUDS) clouds[cloud].push(...componentLines(c.id, c.type, read.sizing, cloud))
    components.push({
      id: c.id, label, category: CATEGORY[c.type], tier: TIER[c.type],
      sizing: Object.fromEntries(Object.entries(read.sizing).map(([k, v]) => [k, typeof v === 'boolean' ? String(v) : v])),
      sizing_basis: read.basis, source: 'board', mapping: mappingFor(keysFor(c.type, read.sizing)),
    })
  }

  // Board-level internet egress, priced like the comparator's data_transfer_out component.
  const egress = board.egress_gb
  const egressGb = typeof egress === 'number' && Number.isFinite(egress) && egress >= 0 ? egress : DEFAULT_EGRESS_GB
  for (const cloud of CLOUDS) {
    const unit = priceFor('egress.internet', cloud).unit
    clouds[cloud].push(...linesFor(EGRESS_ID, 'egress.internet', cloud, toVendorUnit(egressGb, unit), `${fmt(egressGb)} GB to users`))
  }
  components.push({
    id: EGRESS_ID, label: 'Internet egress', category: 'data_transfer_out', tier: 'edge',
    sizing: { gb_per_month: egressGb },
    sizing_basis: { gb_per_month: egress === egressGb ? 'stated' : 'default' },
    source: 'board', mapping: mappingFor(['egress.internet']),
  })

  return {
    prices: { currency: 'USD', retrieved: SNAPSHOT_DATE, clouds },
    workload: {
      project: 'ArchReview Room board',
      regions: { aws: 'us-east-1', gcp: 'us-east1', azure: 'eastus' },
      hours_per_month: HOURS_PER_MONTH,
      components,
      flows: board.flows ?? [],
    },
  }
}
