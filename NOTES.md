# ArchReview Room — build log

Take-home due **Wed Nov 25, 11:59 PM ET**.

## How we work
- Every step is proposed first (what and why), then it runs only after the owner says OK.
- Before building a feature, the matching DeepSpace docs page is read and cited here.
- Each entry records decisions and tradeoffs, what the agent did, and what the owner checked by hand.

---

## Step 1: Environment, scaffold, auth, dev server (2026-11-23)

**Docs read:**
- https://docs.deep.space/get-started/installation (Node versions, scaffolding into `.`)
- https://docs.deep.space/get-started/quickstart (dev and deploy flow)
- https://docs.deep.space/guides/authentication (`auth login` / `whoami`)
- https://docs.deep.space/cli-reference/commands (`dev start`, `--template`)

**Decisions:**
- **Default `starter` template, not `copilot`.** The brief says to use the starter template. We'll build the AI reviewer ourselves on top of it, so every line can be explained.
- **Scaffolded in place (`npm create deepspace@latest .`).** The cloned repo contained only `.git`, which passes the scaffolder's "near-empty folder" check.
- **Dev command: `npx deepspace dev start` (per the docs).** The npm README says `npm run dev`, but in the generated `package.json` that script just runs `deepspace dev start`, so the two are the same.
- **No deploy until the owner says so.**

**What the agent did:**
- `node --version` → v24.11.1. Supported: the docs allow 22.15+ (22.x), 24.x, and 26.x.
- `npm --version` → 11.6.4.
- `npm create deepspace@latest .` → installed create-deepspace **0.44.2**, which pins deepspace **0.44.2**. The docs site says it was built with 0.43.0. The scaffold added 546 packages and printed deprecation warnings for `eslint@9.39.5` and `node-domexception` (left as-is for now).
- The scaffold also added `AGENTS.md`, `CLAUDE.md`, and the DeepSpace agent skill.
- `npx deepspace auth whoami` → "Not logged in on production" (exit 1). The owner ran `npx deepspace auth login` (browser OAuth). After that, `whoami` returned exit 0 (account type: developer; the session renews on use).
- `npx deepspace dev start` (Terminal tab "deepspace login"):
  - registered the app as `app_01M84NGNH39EV0GST0M2EQTP5T` on **production** under the owner's account;
  - port 5173, secrets config `prd`, local secrets read from `.dev.vars`.
- `GET http://localhost:5173` → HTTP 200 with `<title>archreview</title>`. The browser shows the starter landing page ("A DeepSpace app with a static front door" plus an "Enter the app" button), with no console errors.

**Things to know:**
- The scaffolder's message said registration in a brand-new repo would make the initial commit. **It didn't.** After `dev start`, `main` still has no commits and every file is untracked. Committing is still our decision.
- The app is registered to whichever account is logged in when it first runs, which here is the owner's.
- The starter landing page is static: no auth call and no realtime connection. The live, signed-in app sits behind "Enter the app".

**What the owner verified:**
- [x] Logged in with `npx deepspace auth login`
- [ ] `http://localhost:5173` loads the starter app (the agent checked this; the owner hasn't yet)

---

## Step 2: Baseline commit, then port the cost model to TypeScript (2026-11-23)

**Docs read:** none needed. This step is plain TypeScript with no DeepSpace features; it uses the starter's existing vitest setup (`vitest.config.ts` runs `src/**/*.test.ts`).

**Source ported:** `scripts/cost_model.py` and `references/workload_schema.md` from github.com/arunrktech/cloud-cost-comparator at commit `c142d6d` (2026-11-06).

**Files:**
- `src/cost/types.ts`: types for workload.json, prices.json, and the costs.json result.
- `src/cost/pyMath.ts`: `pyRound` and `pySum`, which behave like Python's `round()` and `sum()`.
- `src/cost/costModel.ts`: `officialUrl`, `validate`, `compute`, ported line for line with the same names.
- `src/cost/*.test.ts` and `src/cost/__fixtures__/`: the example workload and prices files, plus the golden output.
- `scripts/make-cost-golden.py`: runs the original Python model to regenerate the golden output.

**Decisions and tradeoffs:**
- **Kept snake_case field names** (`unit_price`, `like_for_like`, …). They are the original tool's file formats, so JSON moves between the Python tool and this app unchanged. The cost is that it isn't idiomatic TypeScript.
- **Kept the same function names and order as the Python**, so a reviewer can read the two files side by side.
- **Dropped the CLI** (argparse, file I/O, printing) because the app passes objects in and gets an object back. So the Python `FriendlyErrors` tests weren't ported; they only test CLI file handling.
- **Rounding (`pyRound`).** Python's `round()` rounds the exact binary value and breaks exact ties to the even digit (`round(0.125, 2) == 0.12`). `Math.round(x*100)/100` rounds ties up, and `x*100` is itself inexact (`1.005*100 = 100.4999…`). `toFixed()` already rounds the exact binary value, so `pyRound` uses it and handles only the exact-tie case itself.
- **Summing (`pySum`).** Since Python 3.12, `sum()` of floats uses compensated (Neumaier) summation: `sum([0.1, 0.2, 0.3]) == 0.6`, but a plain JS loop gives `0.6000000000000001`. One bit can move a value across a rounding boundary, so the port matches it. The Python's own `+=` accumulations stay plain `+=`.
- **Ties between clouds.** Python's `min(d, key=d.get)` returns the first smallest key, so the port walks clouds in AWS, GCP, Azure order to break ties the same way.
- **Two sort orders preserved exactly.** `gaps_on` is sorted alphabetically (aws, azure, gcp) because the Python uses `sorted()`. `incomplete_clouds` follows CLOUDS order (aws, gcp, azure).
- **URL check.** The scheme is checked before parsing, so a bare `aws.amazon.com/...` gets the same "must start with https://" message as Python. After that, WHATWG `new URL()` stands in for `urlparse`. All ten look-alike and credential-trick URLs from the Python tests are rejected, and all eight official ones are accepted.
- **Faithful, not improved.** Like the Python, `validate` accepts `NaN` and `Infinity` as prices. Our own price snapshot will never contain them; we can tighten this later if board input ever reaches `validate`.

**Testing approach: golden tests.** `scripts/make-cost-golden.py` runs the original `cost_model.compute()` (Python 3.14.5) on the example and three variants (AWS web unpriced, GCP web partly unpriced, Azure files missing with no workload) and saves the results. The TypeScript `compute()` output must deep-equal each one. On top of that, every Python test except the CLI ones is ported by name.

**What the agent did:**
- Checked that `.gitignore` covers `.dev.vars` (secrets), `.deepspace/` and `node_modules`, then committed the untouched scaffold as `e18a718` (local `main` only, not pushed). Git printed LF→CRLF warnings because the global `core.autocrlf` is on; they're harmless.
- Ran Python to confirm the behaviours above: `round(0.125,2)=0.12`, `round(2.675,2)=2.67`, `sum([0.1,0.2,0.3])=0.6`, `sum([1e16,1,-1e16])=1.0`.
- Results: `vitest run` gives 47/47 passing (44 new: 12 for `pyMath`, 4 golden, 24 ported from Python, 4 extra `validate` checks; plus the starter's 3), `tsc --noEmit` is clean, and `eslint src/cost` is clean.
- The type-check caught one problem: a JSON import's inferred type didn't match `Workload`. It was fixed by casting the fixtures through `unknown`, since they are untyped data like a file read from disk.
- Example on-demand totals match the original: **AWS $167.67, GCP $173.46, Azure $159.26 (Azure cheapest)**.

**What the owner verified:**
- [ ] Read `costModel.ts` side by side with `cost_model.py`
- [ ] Ran `npm run test:unit` yourself
