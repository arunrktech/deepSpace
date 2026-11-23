/**
 * The AI review section of the board page.
 *
 * "Review board" calls the reviewBoard server action (docs:
 * guides/server-actions, "Call from the client"). The action saves a
 * `reviews` record; this panel shows the latest one, which arrives through
 * the page's useQuery like any other record, so everyone on the board sees a
 * new review at the same time.
 */
import { useState } from 'react'
import { getAuthToken } from 'deepspace'
import { Button, useToast } from '@/components/ui'
import type { Finding } from '../ai/review/reviewData'
import { BOARD_ID } from '../ai/review/reviewData'

export type ReviewRow = {
  boardId: string
  requestedBy?: string
  model?: string
  summary?: string
  findings?: Finding[]
  totals?: Record<string, number>
  fingerprint?: string
}

const SEVERITY_STYLE: Record<Finding['severity'], string> = {
  high: 'bg-red-500/15 text-red-600 dark:text-red-400',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  low: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
}

export function ReviewPanel({
  boardId,
  review,
  currentFingerprint,
  labelOf,
}: {
  boardId: string
  review: { recordId: string; createdAt?: string; data: ReviewRow } | undefined
  currentFingerprint: string
  labelOf: (componentId: string) => string
}) {
  const [running, setRunning] = useState(false)
  const { error, success } = useToast()

  async function runReview() {
    setRunning(true)
    try {
      const res = await fetch('/api/actions/reviewBoard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAuthToken()}` },
        body: JSON.stringify({ boardId }),
      })
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { findings: number } }
      if (!res.ok || !body.success) throw new Error(body.error ?? `Request failed (${res.status})`)
      success('Review ready', `${body.data?.findings ?? 0} finding(s)`)
    } catch (e) {
      error('Review failed', e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const findings = review?.data.findings ?? []
  const stale = review && review.data.fingerprint !== currentFingerprint
  // Group by component, keeping the review's high → low order inside each group.
  const groups = new Map<string, Finding[]>()
  for (const f of findings) groups.set(f.componentId, [...(groups.get(f.componentId) ?? []), f])

  return (
    <section aria-label="AI review" className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">AI review</h2>
          {review && (
            <p className="text-xs text-muted-foreground">
              {review.data.model}
              {review.createdAt ? ` · ${new Date(review.createdAt).toLocaleString()}` : ''}
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => void runReview()} loading={running} disabled={running}>
          {running ? 'Reviewing…' : review ? 'Review again' : 'Review board'}
        </Button>
      </div>

      {running && <p className="mt-3 text-sm text-muted-foreground">Reading the board and its costs. This takes a little while.</p>}

      {!review ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No review yet. The reviewer reads the board and its costs, then flags cost and reliability issues per
          component. It is billed to whoever starts it.
        </p>
      ) : (
        <>
          {stale && (
            <p role="status" className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm">
              Board changed since this review. Run it again to include the latest edits.
            </p>
          )}
          {review.data.summary && <p className="mt-3 text-sm">{review.data.summary}</p>}
          {findings.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No issues flagged.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {[...groups.entries()].map(([componentId, list]) => (
                <div key={componentId}>
                  <h3 className="text-sm font-semibold">{componentId === BOARD_ID ? 'Whole board' : labelOf(componentId)}</h3>
                  <ul className="mt-1 space-y-2">
                    {list.map((f, i) => (
                      <li key={i} className="rounded-md border border-border p-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_STYLE[f.severity]}`}>{f.severity}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{f.category}</span>
                          <span className="font-medium">{f.title}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{f.detail}</p>
                        <p className="mt-1"><span className="font-medium">Suggestion:</span> {f.suggestion}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Findings per component, for the badges on the component cards. */
export function findingCounts(findings: Finding[] | undefined): Map<string, { total: number; high: number }> {
  const counts = new Map<string, { total: number; high: number }>()
  for (const f of findings ?? []) {
    const c = counts.get(f.componentId) ?? { total: 0, high: 0 }
    c.total += 1
    if (f.severity === 'high') c.high += 1
    counts.set(f.componentId, c)
  }
  return counts
}
