/**
 * Landing page, a STATIC page (no DeepSpace providers, prerendered at build).
 *
 * Pattern: split-hero. One-line pitch on the left, the real cost panel on the
 * right, computed from the comparator's example board (pure code, no data
 * hooks, so it renders statically). Docs: design/product-polish.
 */
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { APP_DISPLAY_NAME } from '../constants'
import { seo } from '../seo'
import { CostPanel } from '../board/CostPanel'
import { exampleCost } from '../board/example'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-[2fr_3fr]">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">{APP_DISPLAY_NAME}</p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Design it together. See what it costs as you go.
          </h1>
          <p className="mb-6 text-muted-foreground">
            Lay out services, queues, databases, caches, load balancers, CDNs and storage on a shared board. Every
            edit reprices the design on AWS, Google Cloud and Azure for everyone on the board, and an AI reviewer
            flags cost and reliability issues per component.
          </p>
          <Link
            to="/boards"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open your boards
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">Sign in with GitHub, Google or email.</p>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Example: two web servers, 500 GB of files, 200 GB served a month.</p>
          <CostPanel result={exampleCost()} />
        </div>
      </div>
    </>
  )
}
