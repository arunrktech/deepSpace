/**
 * Live monthly cost on AWS, Google Cloud and Azure for one board.
 *
 * The page passes in the compute() result it recalculates on every synced
 * edit, so every viewer sees the same numbers without anything stored. The
 * scenario toggle and expanded rows are per viewer (local state).
 */
import { Fragment, useState } from 'react'
import { REGIONS, SNAPSHOT_DATE } from '../cost/snapshot'
import { CLOUDS, CLOUD_NAMES, type CostResult, type Scenario } from '../cost/types'
import { costView, linesOf, money } from './costView'

export function CostPanel({ result }: { result: CostResult }) {
  const [scenario, setScenario] = useState<Scenario>('ondemand')
  const [open, setOpen] = useState<string | null>(null)
  const view = costView(result, scenario)

  return (
    <section aria-label="Monthly cost" className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Monthly cost (list prices, USD)</h2>
        <div role="group" aria-label="Pricing scenario" className="flex rounded-md border border-border text-xs">
          {(['ondemand', 'commit'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scenario === s}
              onClick={() => setScenario(s)}
              className={`px-3 py-1.5 ${scenario === s ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              {s === 'ondemand' ? 'On demand' : '1-year commitment'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {view.totals.map((t) => (
          <div
            key={t.cloud}
            data-testid={`total-${t.cloud}`}
            className={`rounded-md border p-3 ${t.cheapest ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t.name}</span>
              {t.cheapest && <span className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground">Cheapest</span>}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{money(t.monthly)}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {money(t.annual)} per year{t.vs ? ` · ${t.vs}` : ''}
            </div>
          </div>
        ))}
      </div>

      {view.warning && (
        <div role="status" className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <p>{view.warning}</p>
          {view.likeForLike && (
            <p className="mt-1">
              Over the {view.likeForLike.components} of {view.likeForLike.of} components priced everywhere,{' '}
              <strong>{view.likeForLike.cheapest}</strong> is cheapest (
              {CLOUDS.map((c) => `${CLOUD_NAMES[c]} ${money(view.likeForLike!.totals[c])}`).join(', ')}).
            </p>
          )}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Component</th>
              {CLOUDS.map((c) => <th key={c} className="px-2 py-2 text-right font-medium">{CLOUD_NAMES[c]}</th>)}
              <th className="py-2 pl-2 text-right font-medium">Spread</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-b border-border/60">
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      aria-expanded={open === r.id}
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                      className="text-left hover:underline"
                    >
                      {open === r.id ? '▾' : '▸'} {r.label}
                    </button>
                    {!r.comparable && (
                      <div className="text-xs text-amber-600 dark:text-amber-400">
                        Not priced on {r.gapsOn}{r.reasons.length ? `: ${r.reasons.join('; ')}` : ''}
                      </div>
                    )}
                  </td>
                  {CLOUDS.map((c) => (
                    <td key={c} className={`px-2 py-2 text-right tabular-nums ${r.cheapest === c ? 'font-semibold text-primary' : ''}`}>
                      {r.comparable || r.amounts[c] > 0 ? money(r.amounts[c]) : '—'}
                    </td>
                  ))}
                  <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">
                    {r.spread === null ? '—' : money(r.spread)}
                  </td>
                </tr>
                {open === r.id && (
                  <tr>
                    <td colSpan={5} className="bg-muted/30 p-3">
                      <LineDetails result={result} componentId={r.id} scenario={scenario} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {view.drivers.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Biggest differences between clouds (on demand):{' '}
          {view.drivers.map((d) => `${d.label} ${money(d.spread)}${d.share === null ? '' : ` (${d.share}%)`}`).join(' · ')}
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Price snapshot {SNAPSHOT_DATE}; {CLOUDS.map((c) => `${CLOUD_NAMES[c]} ${REGIONS[c]}`).join(', ')}. List prices
        only: excludes tax, support, discounts and free tiers (except the free internet egress allowance).
      </p>
    </section>
  )
}

/** The price lines behind one component, with links to each official source. */
function LineDetails({ result, componentId, scenario }: { result: CostResult; componentId: string; scenario: Scenario }) {
  const byCloud = linesOf(result, componentId)
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {CLOUDS.map((c) => (
        <div key={c} className="text-xs">
          <div className="mb-1 font-medium">{CLOUD_NAMES[c]}</div>
          <ul className="space-y-1">
            {byCloud[c].map((l, i) =>
              l.source === 'unpriced' ? (
                <li key={i} className="text-amber-600 dark:text-amber-400">Not priced: {l.note}</li>
              ) : 'monthly_ondemand' in l ? (
                <li key={i}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{l.item}</a>
                  <div className="tabular-nums text-muted-foreground">
                    {fmtQty(l.quantity)} {l.unit} × {fmtPrice(scenario === 'commit' && l.commit_unit_price !== null ? l.commit_unit_price : l.unit_price)}
                    {' = '}{money(scenario === 'commit' ? l.monthly_commit : l.monthly_ondemand)}
                  </div>
                  {l.note && <div className="text-muted-foreground">{l.note}</div>}
                </li>
              ) : null,
            )}
          </ul>
        </div>
      ))}
    </div>
  )
}

const fmtQty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
/** Unit prices keep up to 6 decimals (vendors quote $0.000027397), never a float tail. */
const fmtPrice = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 6 })}`
