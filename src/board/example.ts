/**
 * The sample board shown to signed-out visitors: the comparator's own example
 * workload (two web servers, 500 GB of files, 200 GB to users a month), so
 * the preview numbers are the tested ones (AWS $167.67, GCP $173.46,
 * Azure $159.26).
 */
import type { Board } from '../cost/board'
import { compute } from '../cost/costModel'
import { boardToPrices } from '../cost/quantify'

export const EXAMPLE_BOARD: Board = {
  components: [
    { id: 'web', type: 'service', label: 'Web servers', sizing: { count: 2, vcpu: 2 } },
    { id: 'files', type: 'storage', label: 'File storage', sizing: { storage_gb: 500 } },
  ],
  flows: [{ from: 'web', to: 'files', label: 'read/write' }],
  egress_gb: 200,
}

export function exampleCost() {
  const { prices, workload } = boardToPrices(EXAMPLE_BOARD)
  return compute(prices, workload)
}
