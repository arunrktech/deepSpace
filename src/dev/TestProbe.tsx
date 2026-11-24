/**
 * DEVELOPMENT-ONLY TEST PROBE. Exists solely for tests/board.spec.ts T14.
 *
 * T14 checks that a signed-in browser cannot create a `reviews` record
 * directly: only the reviewBoard server action may write reviews
 * (src/schemas/board-schemas.ts, `create: false` for members). The app has no
 * UI that would ever try, so this probe puts the real SDK write path,
 * `useMutations(...).createConfirmed`, on `window` for the test to call.
 *
 * - Mounted only when `import.meta.env.DEV` is true (src/pages/(app)/_layout.tsx).
 *   Vite replaces that with `false` in `vite build`, so neither this module
 *   nor the name below is in the production bundle.
 *   scripts/check-no-test-probe.mjs fails if it ever is.
 * - Exposes only createConfirmed, and only for 'reviews' and 'components'
 *   ('components' is T14's positive control: the same path that must fail
 *   for reviews must succeed for a collection members can write).
 * - Runs as the signed-in user, so the Durable Object applies the normal
 *   permissions. The probe grants nothing the user couldn't already do from
 *   the browser console.
 */
import { useEffect } from 'react'
import { useMutations } from 'deepspace'

type ProbeCollection = 'reviews' | 'components'

export interface ArchreviewTestProbe {
  createConfirmed: (collection: ProbeCollection, data: Record<string, unknown>) => Promise<string>
}

declare global {
  interface Window {
    __archreviewTestProbe?: ArchreviewTestProbe
  }
}

export function TestProbe() {
  const reviews = useMutations<Record<string, unknown>>('reviews')
  const components = useMutations<Record<string, unknown>>('components')

  useEffect(() => {
    window.__archreviewTestProbe = {
      createConfirmed: (collection, data) => {
        if (collection === 'reviews') return reviews.createConfirmed(data)
        if (collection === 'components') return components.createConfirmed(data)
        return Promise.reject(new Error(`Test probe does not expose ${String(collection)}`))
      },
    }
    return () => {
      delete window.__archreviewTestProbe
    }
  }, [reviews, components])

  return null
}
