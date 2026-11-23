# ArchReview Room

A team edits a system design board together. A live panel shows what the design would cost per month on **AWS, Google Cloud and Azure**, updating for everyone on every edit. An **AI reviewer** reads the board through tools and flags cost and reliability issues per component.

Built on [DeepSpace](https://docs.deep.space) (Cloudflare Workers + Durable Objects, real-time records, presence, AI proxy).

- **Live:** https://archreview.app.space (sign in with GitHub, Google or email)
- **Build log:** [NOTES.md](NOTES.md) covers every step: the docs read, decisions, tradeoffs, what was verified, and what wasn't.

## What it does

| Feature | How |
|---|---|
| **Shared design board** | Typed components (service, queue, database, cache, load balancer, CDN, object storage) with sizing, plus flows between them. They're stored as DeepSpace collections (`boards`, `components`, `flows`), with **one column per sizing field**, so two people editing different fields of the same component both keep their change. Shown as a draggable diagram (layout by layer) or a list. |
| **Live 3-cloud cost** | Every browser recomputes cost from the synced records with the same code and the same **dated price snapshot** (2026-11-23, US East regions, every price linked to its official source), so everyone sees the same numbers on every edit and nothing extra is stored. Shows on demand or 1-year commitment, per-component rows with price-line provenance, and a fair-comparison rule: no cheapest cloud is named unless every component is priced on all three. |
| **AI reviewer** | The "Review board" server action runs Claude Sonnet 5.5 (billed to whoever clicks) with **read-only tools**: `get_board` and `get_costs`. It must finish with a schema-checked `submit_review` (findings per component: cost or reliability, high/medium/low, detail, suggestion). The result is saved as a `reviews` record that only the server can write, so everyone sees it live, and it's marked stale when the board changes. |
| **Presence** | Who is on the board, and which component each person has selected. |

## Cost engine

`src/cost/` is a TypeScript port of `scripts/cost_model.py` and the `workload.json` / `prices.json` schema from [cloud-cost-comparator](https://github.com/arunrktech/cloud-cost-comparator):

- `costModel.ts`: `validate` and `compute`, line for line, with the same names. **Golden tests** assert the full output deep-equals the original Python's on 4 inputs, produced by `scripts/make-cost-golden.py`.
- `pyMath.ts`: Python's `round()` (half to even) and Python 3.12+ `sum()` (Neumaier), so the cents match exactly.
- `snapshot.ts`: 66 dated list prices. Sources: the Azure Retail Prices API, the AWS Price List bulk files, and Google Cloud pricing pages read with the region set to us-east1. Derived prices are written as arithmetic.
- `quantify.ts`: board sizing → price lines (GB→GiB, one line per price band; unpriced, never guessed, for sizes the snapshot lacks).

Cross-check: a board equal to the comparator's example reproduces its totals exactly (**AWS $167.67, GCP $173.46, Azure $159.26**).

## Run it locally

Needs Node 22.15+, 24 or 26, and a DeepSpace account.

```bash
npm install
npx deepspace auth login     # browser sign-in
npx deepspace dev start      # http://localhost:5173
```

## Tests

```bash
npm run test:unit            # vitest: 177 tests (cost model, snapshot, sizing, layout, reviewer data)
npm run type-check
npm run lint
```

The live behaviour (multi-tab sync, concurrent field edits, cost updates, a real AI review, drag and presence) was checked by hand in two browser tabs. Each step's results are in NOTES.md.

## Layout

```
src/cost/          cost model port, price snapshot, sizing -> price lines (pure, tested)
src/board/         records -> board, cost/review panels, diagram, layout, presence
src/ai/review/     reviewer tool outputs, review schema, prompt (pure, tested)
src/actions/       reviewBoard server action
src/schemas/       board-schemas.ts: boards, components, flows, reviews
src/pages/         landing, home, boards list, board page
scripts/           make-cost-golden.py (regenerates golden test data from the Python model)
```

## Known limits

- List prices only: no tax, support or negotiated discounts. Free tiers are excluded except the internet egress allowance.
- Load balancer cost counts throughput only. A queue message is assumed to be 3 requests (send, receive, delete).
- Every signed-in user can edit every board (no per-team privacy yet).
- Dragging saves on release: other viewers see the box jump, not slide.
