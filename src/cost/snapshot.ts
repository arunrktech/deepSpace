/**
 * Dated price snapshot: per-unit list prices for every board component type,
 * on AWS, Google Cloud and Azure. The app never calls a vendor pricing API at
 * runtime; every number below was read once, on SNAPSHOT_DATE, from the
 * official source in its `url`.
 *
 *   source 'api'  = vendor pricing API or official bulk price file
 *                   (Azure Retail Prices API, AWS Price List bulk CSV)
 *   source 'page' = official vendor pricing web page, read in a browser with
 *                   the region selector switched to the region below
 *
 * Where a price had to be derived (a per-GiB-hour rate turned into a monthly
 * one, a reservation total turned into an hourly rate), the arithmetic is
 * written out in code rather than pre-computed, so it can be checked by eye.
 *
 * This file holds prices only. Turning board sizing into quantities is step 4
 * (src/cost/quantify.ts).
 */
import type { Cloud } from './types'

export const SNAPSHOT_DATE = '2026-11-23'

export const REGIONS: Record<Cloud, string> = {
  aws: 'us-east-1 (N. Virginia)',
  gcp: 'us-east1 (South Carolina)',
  azure: 'eastus (East US)',
}

/** Hours in a month, as used by the vendors' own monthly figures. */
export const HOURS_PER_MONTH = 730
/** Hours in a year, used to turn an Azure reservation total into an hourly rate. */
const HOURS_PER_YEAR = 8760

/**
 * One price band. `up_to` is the end of the band in the entry's unit
 * (null = no upper limit). Bands are in order and start where the last ended.
 */
export interface PriceTier {
  up_to: number | null
  unit_price: number
}

export interface SnapshotPrice {
  /** What this price is for, shared across clouds, e.g. 'vm.2vcpu'. */
  key: PriceKey
  cloud: Cloud
  /** Vendor SKU or meter, as the source names it. */
  item: string
  /** Billing unit of unit_price, e.g. 'hour', 'GB-month', 'GiB'. */
  unit: string
  /** On-demand price per unit; for tiered prices, the first band's price. */
  unit_price: number
  /** Tiered prices (storage, egress, request volumes). The first band matches unit_price. */
  tiers?: PriceTier[]
  /** 1-year commitment price per unit, when the vendor publishes one. */
  commit_unit_price?: number
  commit_label?: string
  source: 'api' | 'page'
  url: string
  retrieved: string
  note?: string
}

export const PRICE_KEYS = [
  // service -> compute_vm: general purpose, 4 GiB memory per vCPU, Linux
  'vm.2vcpu', 'vm.4vcpu', 'vm.8vcpu',
  // database -> relational_db: PostgreSQL, 4 GiB per vCPU; HA = standby in a second zone
  'db.2vcpu', 'db.2vcpu.ha', 'db.4vcpu', 'db.4vcpu.ha', 'db.storage', 'db.storage.ha',
  // cache -> cache: Redis-compatible; HA = primary + one replica
  'cache.small', 'cache.small.ha', 'cache.medium', 'cache.medium.ha',
  // queue -> queue
  'queue.base', 'queue.usage',
  // LB -> load_balancer
  'lb.hour', 'lb.processed',
  // CDN -> cdn
  'cdn.base', 'cdn.transfer', 'cdn.requests',
  // storage -> object_storage
  'storage.gb',
  // internet egress -> data_transfer_out
  'egress.internet',
] as const
export type PriceKey = (typeof PRICE_KEYS)[number]

// --- Official sources -------------------------------------------------------
const AZURE_API = 'https://prices.azure.com/api/retail/prices'
const awsBulk = (service: string, region = 'us-east-1') =>
  `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${service}/current/${region}/index.csv`
const GCP = {
  vm: 'https://cloud.google.com/products/compute/pricing/general-purpose',
  sql: 'https://cloud.google.com/sql/pricing',
  valkey: 'https://cloud.google.com/memorystore/valkey/pricing',
  pubsub: 'https://cloud.google.com/pubsub/pricing',
  network: 'https://cloud.google.com/vpc/network-pricing',
  cdn: 'https://cloud.google.com/cdn/pricing',
  storage: 'https://cloud.google.com/storage/pricing',
}

const R = SNAPSHOT_DATE
const AWS_RI = '1 year Reserved, standard, no upfront'
const GCP_CUD = '1 year committed use discount'
const AZ_RES = '1 year reservation (term price / 8,760 h)'

/** Cloud SQL Enterprise edition is priced per vCPU-hour plus per GiB-hour of memory. */
const cloudSql = (vcpu: number, memGiB: number, cpu: number, mem: number) => vcpu * cpu + memGiB * mem

export const SNAPSHOT: SnapshotPrice[] = [
  // ======================= service -> compute_vm ============================
  { key: 'vm.2vcpu', cloud: 'aws', item: 'EC2 m7i.large (2 vCPU, 8 GiB) Linux, shared tenancy', unit: 'hour',
    unit_price: 0.1008, commit_unit_price: 0.06668, commit_label: AWS_RI,
    source: 'api', url: awsBulk('AmazonEC2'), retrieved: R, note: 'Offer file published 2026-11-21' },
  { key: 'vm.4vcpu', cloud: 'aws', item: 'EC2 m7i.xlarge (4 vCPU, 16 GiB) Linux, shared tenancy', unit: 'hour',
    unit_price: 0.2016, commit_unit_price: 0.13336, commit_label: AWS_RI,
    source: 'api', url: awsBulk('AmazonEC2'), retrieved: R, note: 'Offer file published 2026-11-21' },
  { key: 'vm.8vcpu', cloud: 'aws', item: 'EC2 m7i.2xlarge (8 vCPU, 32 GiB) Linux, shared tenancy', unit: 'hour',
    unit_price: 0.4032, commit_unit_price: 0.26672, commit_label: AWS_RI,
    source: 'api', url: awsBulk('AmazonEC2'), retrieved: R, note: 'Offer file published 2026-11-21' },

  { key: 'vm.2vcpu', cloud: 'gcp', item: 'Compute Engine n2-standard-2 (2 vCPU, 8 GiB)', unit: 'hour',
    unit_price: 0.097118, commit_unit_price: 0.061182, commit_label: `${GCP_CUD} (resource-based)`,
    source: 'page', url: GCP.vm, retrieved: R, note: 'Page region set to South Carolina (us-east1)' },
  { key: 'vm.4vcpu', cloud: 'gcp', item: 'Compute Engine n2-standard-4 (4 vCPU, 16 GiB)', unit: 'hour',
    unit_price: 0.194236, commit_unit_price: 0.122364, commit_label: `${GCP_CUD} (resource-based)`,
    source: 'page', url: GCP.vm, retrieved: R, note: 'Page region set to South Carolina (us-east1)' },
  { key: 'vm.8vcpu', cloud: 'gcp', item: 'Compute Engine n2-standard-8 (8 vCPU, 32 GiB)', unit: 'hour',
    unit_price: 0.388472, commit_unit_price: 0.244728, commit_label: `${GCP_CUD} (resource-based)`,
    source: 'page', url: GCP.vm, retrieved: R, note: 'Page region set to South Carolina (us-east1)' },

  { key: 'vm.2vcpu', cloud: 'azure', item: 'Virtual Machines D2s v5 (2 vCPU, 8 GiB) Linux', unit: 'hour',
    unit_price: 0.096, commit_unit_price: 519 / HOURS_PER_YEAR, commit_label: AZ_RES,
    source: 'api', url: AZURE_API, retrieved: R, note: 'Reservation row: $519 per 1-year term' },
  { key: 'vm.4vcpu', cloud: 'azure', item: 'Virtual Machines D4s v5 (4 vCPU, 16 GiB) Linux', unit: 'hour',
    unit_price: 0.192, commit_unit_price: 1038 / HOURS_PER_YEAR, commit_label: AZ_RES,
    source: 'api', url: AZURE_API, retrieved: R, note: 'Reservation row: $1,038 per 1-year term' },
  { key: 'vm.8vcpu', cloud: 'azure', item: 'Virtual Machines D8s v5 (8 vCPU, 32 GiB) Linux', unit: 'hour',
    unit_price: 0.384, commit_unit_price: 2075 / HOURS_PER_YEAR, commit_label: AZ_RES,
    source: 'api', url: AZURE_API, retrieved: R, note: 'Reservation row: $2,075 per 1-year term' },

  // ======================= database -> relational_db ========================
  { key: 'db.2vcpu', cloud: 'aws', item: 'RDS for PostgreSQL db.m7i.large (2 vCPU, 8 GiB) Single-AZ', unit: 'hour',
    unit_price: 0.178, commit_unit_price: 0.119, commit_label: AWS_RI,
    source: 'api', url: awsBulk('AmazonRDS'), retrieved: R, note: 'Offer file published 2026-11-20' },
  { key: 'db.2vcpu.ha', cloud: 'aws', item: 'RDS for PostgreSQL db.m7i.large Multi-AZ', unit: 'hour',
    unit_price: 0.356, commit_unit_price: 0.239, commit_label: AWS_RI,
    source: 'api', url: awsBulk('AmazonRDS'), retrieved: R, note: 'Offer file published 2026-11-20' },
  { key: 'db.4vcpu', cloud: 'aws', item: 'RDS for PostgreSQL db.m7i.xlarge (4 vCPU, 16 GiB) Single-AZ', unit: 'hour',
    unit_price: 0.356, source: 'api', url: awsBulk('AmazonRDS'), retrieved: R,
    note: 'The offer file has no 1 year no upfront row for db.m7i.xlarge, so the commitment scenario uses on demand' },
  { key: 'db.4vcpu.ha', cloud: 'aws', item: 'RDS for PostgreSQL db.m7i.xlarge Multi-AZ', unit: 'hour',
    unit_price: 0.712, source: 'api', url: awsBulk('AmazonRDS'), retrieved: R,
    note: 'The offer file has no 1 year no upfront row for db.m7i.xlarge, so the commitment scenario uses on demand' },
  { key: 'db.storage', cloud: 'aws', item: 'RDS gp3 storage, Single-AZ, PostgreSQL', unit: 'GB-month',
    unit_price: 0.115, source: 'api', url: awsBulk('AmazonRDS'), retrieved: R },
  { key: 'db.storage.ha', cloud: 'aws', item: 'RDS gp3 storage, Multi-AZ, PostgreSQL', unit: 'GB-month',
    unit_price: 0.23, source: 'api', url: awsBulk('AmazonRDS'), retrieved: R },

  { key: 'db.2vcpu', cloud: 'gcp', item: 'Cloud SQL for PostgreSQL Enterprise, 2 vCPU + 8 GiB', unit: 'hour',
    unit_price: cloudSql(2, 8, 0.0413, 0.007), commit_unit_price: cloudSql(2, 8, 0.030975, 0.00525), commit_label: GCP_CUD,
    source: 'page', url: GCP.sql, retrieved: R, note: '2 x $0.0413 per vCPU hour + 8 x $0.007 per GiB hour (us-east1)' },
  { key: 'db.2vcpu.ha', cloud: 'gcp', item: 'Cloud SQL for PostgreSQL Enterprise HA, 2 vCPU + 8 GiB', unit: 'hour',
    unit_price: cloudSql(2, 8, 0.0826, 0.014), commit_unit_price: cloudSql(2, 8, 0.06195, 0.0105), commit_label: GCP_CUD,
    source: 'page', url: GCP.sql, retrieved: R, note: '2 x $0.0826 per HA vCPU hour + 8 x $0.014 per HA GiB hour (us-east1)' },
  { key: 'db.4vcpu', cloud: 'gcp', item: 'Cloud SQL for PostgreSQL Enterprise, 4 vCPU + 16 GiB', unit: 'hour',
    unit_price: cloudSql(4, 16, 0.0413, 0.007), commit_unit_price: cloudSql(4, 16, 0.030975, 0.00525), commit_label: GCP_CUD,
    source: 'page', url: GCP.sql, retrieved: R, note: '4 x $0.0413 per vCPU hour + 16 x $0.007 per GiB hour (us-east1)' },
  { key: 'db.4vcpu.ha', cloud: 'gcp', item: 'Cloud SQL for PostgreSQL Enterprise HA, 4 vCPU + 16 GiB', unit: 'hour',
    unit_price: cloudSql(4, 16, 0.0826, 0.014), commit_unit_price: cloudSql(4, 16, 0.06195, 0.0105), commit_label: GCP_CUD,
    source: 'page', url: GCP.sql, retrieved: R, note: '4 x $0.0826 per HA vCPU hour + 16 x $0.014 per HA GiB hour (us-east1)' },
  { key: 'db.storage', cloud: 'gcp', item: 'Cloud SQL SSD storage', unit: 'GiB-month',
    unit_price: 0.000232877 * HOURS_PER_MONTH, source: 'page', url: GCP.sql, retrieved: R,
    note: '$0.000232877 per GiB hour x 730 h' },
  { key: 'db.storage.ha', cloud: 'gcp', item: 'Cloud SQL SSD storage, HA', unit: 'GiB-month',
    unit_price: 0.000465753 * HOURS_PER_MONTH, source: 'page', url: GCP.sql, retrieved: R,
    note: '$0.000465753 per GiB hour x 730 h' },

  { key: 'db.2vcpu', cloud: 'azure', item: 'Azure Database for PostgreSQL Flexible Server, General Purpose D2ds v5 (2 vCore)', unit: 'hour',
    unit_price: 0.178, commit_unit_price: (2 * 468) / HOURS_PER_YEAR, commit_label: AZ_RES,
    source: 'api', url: AZURE_API, retrieved: R, note: 'Reservation row: $468 per vCore per 1-year term' },
  { key: 'db.2vcpu.ha', cloud: 'azure', item: 'Azure Database for PostgreSQL Flexible Server D2ds v5, zone-redundant HA', unit: 'hour',
    unit_price: 2 * 0.178, commit_unit_price: (2 * 2 * 468) / HOURS_PER_YEAR, commit_label: AZ_RES,
    source: 'api', url: AZURE_API, retrieved: R, note: 'HA bills compute for primary and standby: 2 x single price (FAQ on azure.microsoft.com/pricing/details/postgresql/flexible-server/)' },
  { key: 'db.4vcpu', cloud: 'azure', item: 'Azure Database for PostgreSQL Flexible Server, General Purpose D4ds v5 (4 vCore)', unit: 'hour',
    unit_price: 0.356, commit_unit_price: (4 * 468) / HOURS_PER_YEAR, commit_label: AZ_RES,
    source: 'api', url: AZURE_API, retrieved: R, note: 'Reservation row: $468 per vCore per 1-year term' },
  { key: 'db.4vcpu.ha', cloud: 'azure', item: 'Azure Database for PostgreSQL Flexible Server D4ds v5, zone-redundant HA', unit: 'hour',
    unit_price: 2 * 0.356, commit_unit_price: (2 * 4 * 468) / HOURS_PER_YEAR, commit_label: AZ_RES,
    source: 'api', url: AZURE_API, retrieved: R, note: 'HA bills compute for primary and standby: 2 x single price (FAQ on azure.microsoft.com/pricing/details/postgresql/flexible-server/)' },
  { key: 'db.storage', cloud: 'azure', item: 'Azure Database for PostgreSQL Flexible Server storage', unit: 'GB-month',
    unit_price: 0.115, source: 'api', url: AZURE_API, retrieved: R },
  { key: 'db.storage.ha', cloud: 'azure', item: 'Azure Database for PostgreSQL Flexible Server storage, HA', unit: 'GB-month',
    unit_price: 2 * 0.115, source: 'api', url: AZURE_API, retrieved: R,
    note: 'HA bills storage for primary and standby: 2 x storage (same FAQ)' },

  // ======================= cache -> cache ===================================
  // AWS and Google Cloud price per node, so HA (primary + replica) = 2 nodes.
  // Azure's Standard tier price already covers its primary and replica.
  { key: 'cache.small', cloud: 'aws', item: 'ElastiCache for Valkey cache.t4g.small (1.37 GiB), 1 node', unit: 'hour',
    unit_price: 0.0256, commit_unit_price: 0.0176, commit_label: AWS_RI,
    source: 'api', url: awsBulk('AmazonElastiCache'), retrieved: R, note: 'Valkey, to match Google Cloud (see NOTES.md)' },
  { key: 'cache.small.ha', cloud: 'aws', item: 'ElastiCache for Valkey cache.t4g.small, primary + replica', unit: 'hour',
    unit_price: 2 * 0.0256, commit_unit_price: 2 * 0.0176, commit_label: AWS_RI,
    source: 'api', url: awsBulk('AmazonElastiCache'), retrieved: R, note: '2 nodes x node price' },
  { key: 'cache.medium', cloud: 'aws', item: 'ElastiCache for Valkey cache.m7g.large (6.38 GiB), 1 node', unit: 'hour',
    unit_price: 0.1264, commit_unit_price: 0.0856, commit_label: AWS_RI,
    source: 'api', url: awsBulk('AmazonElastiCache'), retrieved: R },
  { key: 'cache.medium.ha', cloud: 'aws', item: 'ElastiCache for Valkey cache.m7g.large, primary + replica', unit: 'hour',
    unit_price: 2 * 0.1264, commit_unit_price: 2 * 0.0856, commit_label: AWS_RI,
    source: 'api', url: awsBulk('AmazonElastiCache'), retrieved: R, note: '2 nodes x node price' },

  { key: 'cache.small', cloud: 'gcp', item: 'Memorystore for Valkey shared-core-nano (1.4 GB), 1 node', unit: 'hour',
    unit_price: 0.0359, commit_unit_price: 0.02872, commit_label: GCP_CUD,
    source: 'page', url: GCP.valkey, retrieved: R,
    note: 'us-east1. The Memorystore for Redis pricing page returns 404, so Valkey is used' },
  { key: 'cache.small.ha', cloud: 'gcp', item: 'Memorystore for Valkey shared-core-nano, primary + replica', unit: 'hour',
    unit_price: 2 * 0.0359, commit_unit_price: 2 * 0.02872, commit_label: GCP_CUD,
    source: 'page', url: GCP.valkey, retrieved: R, note: '2 nodes x node price (us-east1)' },
  { key: 'cache.medium', cloud: 'gcp', item: 'Memorystore for Valkey standard-small (6.5 GB), 1 node', unit: 'hour',
    unit_price: 0.161, commit_unit_price: 0.1288, commit_label: GCP_CUD,
    source: 'page', url: GCP.valkey, retrieved: R, note: 'us-east1' },
  { key: 'cache.medium.ha', cloud: 'gcp', item: 'Memorystore for Valkey standard-small, primary + replica', unit: 'hour',
    unit_price: 2 * 0.161, commit_unit_price: 2 * 0.1288, commit_label: GCP_CUD,
    source: 'page', url: GCP.valkey, retrieved: R, note: '2 nodes x node price (us-east1)' },

  { key: 'cache.small', cloud: 'azure', item: 'Azure Cache for Redis Basic C1 (1 GB)', unit: 'hour',
    unit_price: 0.055, source: 'api', url: AZURE_API, retrieved: R,
    note: 'No reservation offered for Basic/Standard tiers, so the commitment scenario uses on demand' },
  { key: 'cache.small.ha', cloud: 'azure', item: 'Azure Cache for Redis Standard C1 (1 GB, primary + replica)', unit: 'hour',
    unit_price: 0.138, source: 'api', url: AZURE_API, retrieved: R,
    note: 'The "C1 Cache" meter covers both nodes ($0.069 per instance x 2)' },
  { key: 'cache.medium', cloud: 'azure', item: 'Azure Cache for Redis Basic C3 (6 GB)', unit: 'hour',
    unit_price: 0.18, source: 'api', url: AZURE_API, retrieved: R },
  { key: 'cache.medium.ha', cloud: 'azure', item: 'Azure Cache for Redis Standard C3 (6 GB, primary + replica)', unit: 'hour',
    unit_price: 0.45, source: 'api', url: AZURE_API, retrieved: R,
    note: 'The "C3 Cache" meter covers both nodes ($0.225 per instance x 2)' },

  // ======================= queue -> queue ===================================
  { key: 'queue.base', cloud: 'aws', item: 'SQS has no base fee', unit: 'month',
    unit_price: 0, source: 'api', url: awsBulk('AWSQueueService'), retrieved: R },
  { key: 'queue.usage', cloud: 'aws', item: 'SQS standard queue requests', unit: 'million requests',
    unit_price: 0.4, tiers: [
      { up_to: 100_000, unit_price: 0.4 },
      { up_to: 200_000, unit_price: 0.3 },
      { up_to: null, unit_price: 0.24 },
    ], source: 'api', url: awsBulk('AWSQueueService'), retrieved: R,
    note: 'Billed per 64 KB request chunk; the 1M free requests per month are a free tier and excluded' },

  { key: 'queue.base', cloud: 'gcp', item: 'Pub/Sub has no base fee', unit: 'month',
    unit_price: 0, source: 'page', url: GCP.pubsub, retrieved: R },
  { key: 'queue.usage', cloud: 'gcp', item: 'Pub/Sub message delivery (basic) throughput', unit: 'TiB',
    unit_price: 40, source: 'page', url: GCP.pubsub, retrieved: R,
    note: 'Same price in all regions. 1 KB minimum per request. The first 10 GiB per month is a free tier and excluded' },

  { key: 'queue.base', cloud: 'azure', item: 'Service Bus Standard base unit', unit: 'month',
    unit_price: 10, source: 'api', url: AZURE_API, retrieved: R },
  { key: 'queue.usage', cloud: 'azure', item: 'Service Bus Standard messaging operations', unit: 'million operations',
    unit_price: 0, tiers: [
      { up_to: 13, unit_price: 0 },
      { up_to: 100, unit_price: 0.8 },
      { up_to: 2500, unit_price: 0.5 },
      { up_to: null, unit_price: 0.2 },
    ], source: 'api', url: AZURE_API, retrieved: R, note: 'The first 13M operations per month are included in the base unit' },

  // ======================= LB -> load_balancer ==============================
  { key: 'lb.hour', cloud: 'aws', item: 'Application Load Balancer hour', unit: 'hour',
    unit_price: 0.0225, source: 'api', url: awsBulk('AWSELB'), retrieved: R },
  { key: 'lb.processed', cloud: 'aws', item: 'Application Load Balancer capacity unit (LCU)', unit: 'LCU-hour',
    unit_price: 0.008, source: 'api', url: awsBulk('AWSELB'), retrieved: R,
    note: 'One LCU covers 1 GB per hour processed for EC2 targets (or connections/rules if higher)' },

  { key: 'lb.hour', cloud: 'gcp', item: 'Cloud Load Balancing forwarding rule (first 5)', unit: 'hour',
    unit_price: 0.025, source: 'page', url: GCP.network, retrieved: R },
  { key: 'lb.processed', cloud: 'gcp', item: 'Cloud Load Balancing data processed', unit: 'GiB',
    unit_price: 0.008, source: 'page', url: GCP.network, retrieved: R },

  { key: 'lb.hour', cloud: 'azure', item: 'Application Gateway Standard v2 fixed cost', unit: 'hour',
    unit_price: 0.2, source: 'api', url: AZURE_API, retrieved: R },
  { key: 'lb.processed', cloud: 'azure', item: 'Application Gateway Standard v2 capacity unit', unit: 'CU-hour',
    unit_price: 0.008, source: 'api', url: AZURE_API, retrieved: R,
    note: 'One capacity unit covers about 2.22 Mbps (about 1 GB per hour) of throughput, or connections/compute if higher' },

  // ======================= CDN -> cdn =======================================
  { key: 'cdn.base', cloud: 'aws', item: 'CloudFront has no base fee', unit: 'month',
    unit_price: 0, source: 'api', url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.csv', retrieved: R },
  { key: 'cdn.transfer', cloud: 'aws', item: 'CloudFront data transfer out, United States', unit: 'GB',
    unit_price: 0.085, tiers: [
      { up_to: 10_240, unit_price: 0.085 },
      { up_to: 51_200, unit_price: 0.08 },
      { up_to: 153_600, unit_price: 0.06 },
      { up_to: 512_000, unit_price: 0.04 },
      { up_to: null, unit_price: 0.03 },
    ], source: 'api', url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.csv', retrieved: R,
    note: 'Bands above 1 PB are folded into the last one. The 1 TB per month free tier is excluded' },
  { key: 'cdn.requests', cloud: 'aws', item: 'CloudFront HTTPS requests, United States', unit: '10K requests',
    unit_price: 0.01, source: 'api', url: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.csv', retrieved: R },

  { key: 'cdn.base', cloud: 'gcp', item: 'Cloud CDN has no base fee', unit: 'month',
    unit_price: 0, source: 'page', url: GCP.cdn, retrieved: R },
  { key: 'cdn.transfer', cloud: 'gcp', item: 'Cloud CDN cache data transfer out, North America', unit: 'GiB',
    unit_price: 0.08, tiers: [
      { up_to: 10_240, unit_price: 0.08 },
      { up_to: 153_600, unit_price: 0.055 },
      { up_to: 1_024_000, unit_price: 0.03 },
      { up_to: null, unit_price: 0.02 },
    ], source: 'page', url: GCP.cdn, retrieved: R,
    note: 'Cache fill ($0.01 per GiB within North America) is not included' },
  { key: 'cdn.requests', cloud: 'gcp', item: 'Cloud CDN HTTP/HTTPS cache lookups', unit: '10K requests',
    unit_price: 0.0075, source: 'page', url: GCP.cdn, retrieved: R },

  { key: 'cdn.base', cloud: 'azure', item: 'Azure Front Door Standard base fee', unit: 'month',
    unit_price: 35, source: 'api', url: AZURE_API, retrieved: R },
  { key: 'cdn.transfer', cloud: 'azure', item: 'Azure Front Door Standard data transfer out, Zone 1 (North America, Europe)', unit: 'GB',
    unit_price: 0.0825, tiers: [
      { up_to: 10_000, unit_price: 0.0825 },
      { up_to: 50_000, unit_price: 0.065002 },
      { up_to: 150_000, unit_price: 0.056001 },
      { up_to: 500_000, unit_price: 0.014083 },
      { up_to: 1_000_000, unit_price: 0.00693 },
      { up_to: 5_000_000, unit_price: 0.005742 },
      { up_to: null, unit_price: 0.005404 },
    ], source: 'api', url: AZURE_API, retrieved: R },
  { key: 'cdn.requests', cloud: 'azure', item: 'Azure Front Door Standard requests, Zone 1', unit: '10K requests',
    unit_price: 0.009, source: 'api', url: AZURE_API, retrieved: R, note: 'First 250M requests band; lower bands above that are not modelled' },

  // ======================= storage -> object_storage ========================
  { key: 'storage.gb', cloud: 'aws', item: 'S3 Standard storage', unit: 'GB-month',
    unit_price: 0.023, tiers: [
      { up_to: 51_200, unit_price: 0.023 },
      { up_to: 512_000, unit_price: 0.022 },
      { up_to: null, unit_price: 0.021 },
    ], source: 'api', url: awsBulk('AmazonS3'), retrieved: R, note: 'Requests are not priced' },
  { key: 'storage.gb', cloud: 'gcp', item: 'Cloud Storage Standard, regional', unit: 'GiB-month',
    unit_price: 0.000027397 * HOURS_PER_MONTH, source: 'page', url: GCP.storage, retrieved: R,
    note: '$0.000027397 per GiB hour x 730 h (us-east1). Operations are not priced' },
  { key: 'storage.gb', cloud: 'azure', item: 'Blob Storage Hot LRS data stored', unit: 'GB-month',
    unit_price: 0.0208, tiers: [
      { up_to: 51_200, unit_price: 0.0208 },
      { up_to: 512_000, unit_price: 0.019968 },
      { up_to: null, unit_price: 0.019136 },
    ], source: 'api', url: AZURE_API, retrieved: R, note: 'Operations are not priced' },

  // ======================= internet egress -> data_transfer_out =============
  { key: 'egress.internet', cloud: 'aws', item: 'Data transfer out to internet', unit: 'GB',
    unit_price: 0, tiers: [
      { up_to: 100, unit_price: 0 },
      { up_to: 10_240, unit_price: 0.09 },
      { up_to: 51_200, unit_price: 0.085 },
      { up_to: 153_600, unit_price: 0.07 },
      { up_to: null, unit_price: 0.05 },
    ], source: 'api', url: awsBulk('AWSDataTransfer'), retrieved: R,
    note: 'First 100 GB per month free across all AWS services and regions' },
  { key: 'egress.internet', cloud: 'gcp', item: 'Internet data transfer, Premium tier, worldwide excluding Asia and Australia', unit: 'GiB',
    unit_price: 0.12, tiers: [
      { up_to: 10_240, unit_price: 0.12 },
      { up_to: 153_600, unit_price: 0.11 },
      { up_to: null, unit_price: 0.08 },
    ], source: 'page', url: GCP.storage, retrieved: R, note: 'Premium network tier (the default)' },
  { key: 'egress.internet', cloud: 'azure', item: 'Data transfer out, Microsoft network routing', unit: 'GB',
    unit_price: 0, tiers: [
      { up_to: 100, unit_price: 0 },
      { up_to: 10_335, unit_price: 0.087 },
      { up_to: 51_295, unit_price: 0.083 },
      { up_to: 153_695, unit_price: 0.07 },
      { up_to: null, unit_price: 0.05 },
    ], source: 'api', url: AZURE_API, retrieved: R,
    note: 'First 100 GB per month priced at $0; Microsoft network routing is the default' },
]

/** Look up one price. Throws if the snapshot is missing it, which the tests rule out. */
export function priceFor(key: PriceKey, cloud: Cloud): SnapshotPrice {
  const p = SNAPSHOT.find((s) => s.key === key && s.cloud === cloud)
  if (!p) throw new Error(`No snapshot price for ${key} on ${cloud}`)
  return p
}
