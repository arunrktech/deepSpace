/**
 * The system design board, as the cost model sees it: typed components with
 * sizing, flows between them, and one board-level egress figure.
 *
 * Step 5 stores these on the shared DeepSpace board; this file only defines
 * the shapes and the defaults. Defaults follow the comparator's
 * references/sizing_defaults.md and are deliberately modest.
 */
import type { Flow } from './types'

export const COMPONENT_TYPES = ['service', 'queue', 'database', 'cache', 'lb', 'cdn', 'storage'] as const
export type ComponentType = (typeof COMPONENT_TYPES)[number]

/** Category key from the comparator's service_map.md, per board type. */
export const CATEGORY: Record<ComponentType, string> = {
  service: 'compute_vm',
  queue: 'queue',
  database: 'relational_db',
  cache: 'cache',
  lb: 'load_balancer',
  cdn: 'cdn',
  storage: 'object_storage',
}

/** Diagram layer (the comparator's `tier`), used later for layout. */
export const TIER: Record<ComponentType, string> = {
  service: 'app',
  queue: 'app',
  database: 'data',
  cache: 'data',
  lb: 'edge',
  cdn: 'edge',
  storage: 'data',
}

export const LABEL: Record<ComponentType, string> = {
  service: 'Service',
  queue: 'Queue',
  database: 'Database',
  cache: 'Cache',
  lb: 'Load balancer',
  cdn: 'CDN',
  storage: 'Object storage',
}

// --- Sizing per type ----------------------------------------------------------

export const VM_SIZES = [2, 4, 8] as const
export const DB_SIZES = [2, 4] as const
export const CACHE_SIZES = ['small', 'medium'] as const

export interface ServiceSizing {
  count: number
  vcpu: (typeof VM_SIZES)[number]
  /** Hours running per month; 730 = always on. */
  hours: number
}
export interface DatabaseSizing {
  vcpu: (typeof DB_SIZES)[number]
  /** Standby in a second zone. */
  ha: boolean
  storage_gb: number
}
export interface CacheSizing {
  /** small is about 1.4 GB of memory, medium about 6.5 GB. */
  size: (typeof CACHE_SIZES)[number]
  /** Primary plus one replica. */
  ha: boolean
}
export interface QueueSizing {
  messages_millions: number
  /** Average message size in KB (1,000 bytes). */
  message_kb: number
}
export interface LbSizing {
  count: number
  gb_processed: number
}
export interface CdnSizing {
  gb_delivered: number
  requests_millions: number
}
export interface StorageSizing {
  storage_gb: number
}

export interface SizingByType {
  service: ServiceSizing
  queue: QueueSizing
  database: DatabaseSizing
  cache: CacheSizing
  lb: LbSizing
  cdn: CdnSizing
  storage: StorageSizing
}

export const DEFAULT_SIZING: { [T in ComponentType]: SizingByType[T] } = {
  service: { count: 2, vcpu: 2, hours: 730 },
  queue: { messages_millions: 10, message_kb: 1 },
  database: { vcpu: 2, ha: true, storage_gb: 100 },
  cache: { size: 'small', ha: true },
  lb: { count: 1, gb_processed: 100 },
  cdn: { gb_delivered: 500, requests_millions: 5 },
  storage: { storage_gb: 500 },
}

/** Internet egress to users per month, when the board doesn't say. */
export const DEFAULT_EGRESS_GB = 200

// --- The board ----------------------------------------------------------------

export interface BoardComponent {
  id: string
  type: ComponentType
  label?: string
  /**
   * Only the fields someone set. Missing fields take DEFAULT_SIZING and are
   * reported as "default" rather than "stated". Typed loosely on purpose:
   * board data comes from many editors, so quantify.ts checks every value.
   */
  sizing?: Record<string, unknown>
}

export interface Board {
  components: BoardComponent[]
  flows?: Flow[]
  /** Internet egress to users, GB per month. */
  egress_gb?: number
}
