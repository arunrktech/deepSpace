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

---

## Step 3: Dated price snapshot (2026-11-23)

**Docs read:** none needed (no DeepSpace features). Followed the comparator's `references/pricing_sources.md` (official URLs per service) and `references/pricing_quirks.md` (traps that skew totals).

**File:** `src/cost/snapshot.ts` holds 22 price keys × 3 clouds = 66 prices, all dated 2026-11-23. Tests are in `src/cost/snapshot.test.ts`.

**Regions:** AWS `us-east-1`, GCP `us-east1` (South Carolina), Azure `eastus`. All three are on the US East coast, so the comparison is like for like. The comparator's example used GCP Iowa only because Google's pages default to it.

**Where the prices came from:**
- **Azure:** the Retail Prices API (`prices.azure.com`, no login). Source `api`.
- **AWS:** the public Price List bulk CSVs from `pricing.us-east-1.amazonaws.com`, published Nov 11–21. The 300 MB EC2 file was streamed and filtered without saving it. Source `api`.
- **Google Cloud:** the official pricing pages in Chrome, with each table's region selector switched to South Carolina (us-east1). Source `page`.
- **Runtime:** the app never calls a vendor API. "No live vendor APIs" applies to the running app; the snapshot was built once, today.

**What each board type maps to:**

| Board type | AWS | Google Cloud | Azure | Snapshot keys |
|---|---|---|---|---|
| service | EC2 m7i | n2-standard | Dsv5 | `vm.2vcpu`, `vm.4vcpu`, `vm.8vcpu` (4 GiB per vCPU, Linux) |
| database | RDS PostgreSQL db.m7i | Cloud SQL PostgreSQL Enterprise | PG Flexible Server Ddsv5 | `db.{2,4}vcpu[.ha]`, `db.storage[.ha]` |
| cache | ElastiCache **Valkey** t4g.small / m7g.large | Memorystore **Valkey** nano / standard-small | Cache for **Redis** C1 / C3 | `cache.{small,medium}[.ha]` |
| queue | SQS standard | Pub/Sub | Service Bus Standard | `queue.base`, `queue.usage` |
| LB | ALB | Cloud Load Balancing | Application Gateway v2 | `lb.hour`, `lb.processed` |
| CDN | CloudFront | Cloud CDN | Front Door Standard | `cdn.base`, `cdn.transfer`, `cdn.requests` |
| storage | S3 Standard | Cloud Storage Standard | Blob Hot LRS | `storage.gb` |
| (internet egress) | Data transfer out | Premium tier egress | MS-network routing | `egress.internet` |

**Decisions and tradeoffs:**
- **Derived prices are written as arithmetic in code** (`519 / HOURS_PER_YEAR`, `0.000027397 * HOURS_PER_MONTH`, `cloudSql(2, 8, 0.0413, 0.007)`), so a reviewer can check them against the source without a calculator.
- **HA is its own price key (`.ha`).** Each cloud bills HA differently:
  - AWS RDS Multi-AZ has its own SKU.
  - Cloud SQL has HA per-vCPU and per-GiB rates.
  - Azure bills the standby too. This is confirmed by the FAQ on Azure's PostgreSQL pricing page ("billed for the provisioned compute and storage for both the primary and secondary replica").
  - Cache HA is 2 nodes on AWS and GCP; Azure's Standard-tier price already covers both nodes.
- **Cache engine is Valkey on AWS and GCP, Redis on Azure.** Google's Memorystore for **Redis** pricing page returns 404, both in the browser and server-side, so GCP uses Memorystore for Valkey. AWS uses Valkey too, so AWS and GCP match. Azure has no managed Valkey, so it uses Redis. All three speak the Redis protocol. The tradeoff: ElastiCache Redis would cost about 25% more than Valkey ($0.158 vs $0.1264 per hour for m7g.large).
- **Missing commitment prices are left out, not estimated.** The commitment scenario then uses on demand for those lines, the same rule as the cost model. This affects RDS db.m7i.xlarge (no 1-year no-upfront row in the offer file) and Azure Cache Basic/Standard (no reservation offered).
- **Free tiers are excluded, except the internet egress allowance** (per `pricing_quirks.md`). Excluded: SQS's 1M free requests, Pub/Sub's 10 GiB, CloudFront's 1 TB. Kept: AWS's and Azure's first 100 GB of egress (modelled as a $0 band).
- **Tiered prices are stored as bands (`tiers`).** Step 4 will split a quantity across them.
- **GiB vs GB:** each price keeps the vendor's own unit (`GiB-month` on Google Cloud, `GB-month` on AWS and Azure). Step 4 must convert sizes before multiplying.
- **Not priced, and noted on each line:** storage requests and operations, CDN cache fill, Front Door requests above 250M, CDN bands above 1 PB.
- **Two prices needing a check:**
  - GCP n2-standard prices for us-east1 equal Iowa's. The region switch is known to work, because Memorystore's us-east1 prices differ from Iowa's.
  - Azure Application Gateway Standard v2 is $0.20 per hour in the API, which is lower than Azure's often-quoted $0.246.
  Both are listed for spot-checking below.

**What the agent did:**
- Queried the Azure Retail Prices API with OData filters, using a throwaway scratch script.
- Downloaded and filtered the AWS bulk CSVs with a throwaway CSV filter.
- Read six Google Cloud pricing pages in Chrome. A browser tab script picked the table's region option and read the rows.
- Used Chrome again to confirm the Azure HA billing FAQ.
- Wrote `snapshot.ts` and `snapshot.test.ts`.
- Results: `vitest run` gives **120/120** passing (73 new), `tsc --noEmit` is clean, and `eslint src/cost` is clean.

**What the tests prove:** one price per key per cloud; every URL passes `officialUrl`; every entry is dated, finite and non-negative; commitment prices are no higher than on demand; tiers are in order and open-ended; HA costs at least as much as single; the whole snapshot passes the cost model's `validate()`; and four derived numbers match their notes. They **can't** prove a price is correct. That needs a human check against the source.

**What the owner verified (spot-check five prices against their source):**
- [ ] AWS EC2 m7i.large $0.1008/h; 1-year no upfront $0.06668/h (https://aws.amazon.com/ec2/pricing/on-demand/ and its Reserved tab)
- [ ] GCP n2-standard-2, South Carolina: $0.097118/h (https://cloud.google.com/products/compute/pricing/general-purpose)
- [ ] Azure D2s v5 East US Linux: $0.096/h (https://azure.microsoft.com/pricing/details/virtual-machines/linux/)
- [ ] Azure Application Gateway Standard v2 East US fixed price: $0.20/h (https://azure.microsoft.com/pricing/details/application-gateway/)
- [ ] GCP Memorystore for Valkey standard-small, South Carolina: $0.161/h (https://cloud.google.com/memorystore/valkey/pricing)
