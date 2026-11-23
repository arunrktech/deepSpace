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

---

## Step 4: Board sizing → price lines (2026-11-23)

**Docs read:** none needed (no DeepSpace features).

**Files:**
- `src/cost/board.ts`: the board's component types, their sizing fields with defaults (from the comparator's `sizing_defaults.md`), and the category and tier for each type.
- `src/cost/quantify.ts`: `boardToPrices(board)` returns `{ prices, workload }` for `compute()`. Its helpers are `toVendorUnit` (GB to GiB or TiB) and `splitTiers` (one line per price band).
- `src/cost/quantify.test.ts`

**How sizing becomes quantity:**

| Type | Sizing (default) | Quantity |
|---|---|---|
| service | count (2), vCPU 2/4/8 (2), hours (730) | count × hours of `vm.{n}vcpu` |
| database | vCPU 2/4 (2), HA (yes), storage GB (100) | 730 h of `db.{n}vcpu[.ha]` + storage of `db.storage[.ha]` |
| cache | size small/medium (small), HA (yes) | 730 h of `cache.{size}[.ha]` |
| queue | M messages (10), message KB (1) | **AWS and Azure:** messages × 3 requests × started 64 KB chunks. **GCP:** messages × max(1, KB) × 2 (publish + subscribe), in TiB. **Azure** also pays the $10 base fee. |
| LB | count (1), GB processed (100) | count × 730 h + processing. AWS LCU-hours and Azure CU-hours ≈ GB; GCP per GiB. |
| CDN | GB delivered (500), M requests (5) | base fee (Azure $35) + transfer + requests ÷ 10K |
| storage | GB (500) | GB-month on AWS and Azure; GiB-month on GCP |
| internet egress (board level) | GB per month (200) | its own "Internet egress" component, like the comparator's `data_transfer_out` |

**Decisions and tradeoffs:**
- **Egress is a board setting, not one of the seven component types.** That keeps it visible as its own line instead of hidden inside the LB or CDN. It's often the biggest difference between clouds.
- **Sizing values are checked one by one.** A missing value takes the default and is labelled `default` in `sizing_basis`. A bad value (negative, NaN, a string, or a size not in the snapshot such as 6 vCPU) makes that component **unpriced on every cloud**, with the reason in the note. The cost model's fair-comparison rule then leaves it out of the ranking and names no overall cheapest cloud. Nothing is ever guessed.
- **Tiered prices give one line per band**, with the band in the item name (for example "0 to 51,200 GB-month band"), per `pricing_quirks.md`. Bands have no published commitment price, so they carry none.
- **Base fees of $0** (SQS, Pub/Sub, CloudFront, Cloud CDN) are skipped instead of shown as $0 lines.
- **Each output line's note says how its quantity was worked out** (for example "50M messages x 3 requests ..."), so the AI reviewer and the UI can explain any number.

**Approximations (stated in line notes too):**
- **LB:** only throughput is counted. ALB LCUs and Application Gateway capacity units also count new connections, active connections and rules, so a connection-heavy app costs more.
- **Queue:** "3 requests per message" (send, receive, delete) is a planning rule of thumb, not a vendor figure. Batching would lower it.
- **Not modelled:** storage requests and operations, CDN cache fill, and the Pub/Sub, SQS and CloudFront free tiers.

**The key test, a cross-check against the comparator:** a board with 2 × 2-vCPU services, 500 GB of storage and 200 GB of egress (the comparator's own example workload) goes through `boardToPrices` and `compute`. It gives exactly the comparator's on-demand totals: **AWS $167.67, GCP $173.46, Azure $159.26**. That checks the hours, the GiB conversion (500 GB = 465.66 GiB), the 100 GB free egress band and tier splitting all together.

**What the agent did:**
- Wrote the three files.
- Results: `vitest run` gives **144/144** passing (24 new), `tsc --noEmit` is clean, and `eslint src/cost` is clean.
- The type-check caught one problem in `readSizing`: TypeScript merged the switch's per-type return objects into one union. It was fixed by declaring the inner function's return type.

**What the owner verified:**
- [ ] Read one hand-worked test (for example the queue test) and agree with the arithmetic
- [ ] Agree with the LB and queue approximations above, or say what to change

---

## Step 5: Shared board on DeepSpace collections (2026-11-23)

**DeepSpace docs read** (as Markdown via https://docs.deep.space/llms.txt, as the scaffold's `AGENTS.md` says to):
- https://docs.deep.space/guides/data-storage: schema, `useQuery`, `useMutations`, `createConfirmed`
- https://docs.deep.space/concepts/data-model and https://docs.deep.space/concepts/realtime-sync: write pipeline, and "the second wins on field-level merge"
- https://docs.deep.space/concepts/permissions: roles; signed-in users default to `member`
- https://docs.deep.space/sdk-reference/worker/schemas: column `storage` and `interpretation`, `maxLength`
- https://docs.deep.space/sdk-reference/client/records: `where` is an exact match, filtered on the server
- https://docs.deep.space/guides/canvas: read in order to decide against it

**Files:**
- `src/schemas/board-schemas.ts`: the `boards`, `components` and `flows` collections, registered in `src/schemas.ts`.
- `src/board/fromRecords.ts` (+ test): records to the `Board` the cost engine takes.
- `src/board/fields.ts`: how each sizing field shows in the form.
- `src/pages/(app)/(protected)/boards/index.tsx` and `boards/[boardId].tsx`: the pages.
- A "Boards" item in `src/nav.ts`.

**Decisions and tradeoffs:**
- **Collections, not the Canvas room.** Canvas stores free-form shapes, and `moveShape` isn't sent back to the sender. Our board is typed data (type, sizing, flows), which is what collections hold. Each record is checked against permissions on the server, and the cost panel and the AI reviewer can read it directly. Positions are plain `x`/`y` columns for a later visual layout.
- **One column per sizing field, not a JSON `sizing` column.** The docs say concurrent `put`s merge field by field. With separate columns, two people editing different fields of the same component both keep their change. A JSON column would be replaced whole and silently drop one edit. **Verified live (below).**
- **Each component reads only its own type's fields.** A stale `vcpu` left on a record is ignored if the type doesn't use it. An empty column means "use the default", and the form's "Default" option clears it.
- **Permissions:** every signed-in `member` can read and write every board; signed-out visitors get nothing. The tradeoff is no per-team privacy yet (the `'team'` permission level would add it).
- **Text and number fields save on blur or Enter**, not on every keystroke, so half-typed values aren't broadcast. While you're typing, a remote change doesn't overwrite your draft; after you leave the field, it shows the shared value again.
- **Deleting a component removes its flows first, then the component.** The records layer has no transactions, so this is done one record at a time on the client. `fromRecords` also drops any flow whose end is missing, so a half-finished delete never shows up in prices.
- **`createConfirmed` for new boards**, so the board page opens only after the server has accepted the board. Plain `create` is used for components, because the list updates when the server echoes the change back.

**What the agent did:**
- Wrote the schemas, the mapping and the pages.
- Results: `vitest run` gives **150/150** passing (6 new), `tsc --noEmit` is clean, and `eslint src` is clean.
- The type-check caught two problems: a missing `ComponentProps` import, and a cast of the defaults union. Both fixed.
- Restarted the dev server (`deepspace dev kill`, then `dev start`), since schemas load when the worker starts.
- Signed out, `/boards` shows "Sign in to continue" (the gate works).
- **Live test in two Chrome tabs** after the owner signed in, on a board called "Sync test" (left in local dev data):
  1. Tab A created the board and added a Database and a Service. Tab B showed both within about 1 s.
  2. **Field merge:** tab B typed Count = 3 while tab A changed vCPU to 4 on the same service, then tab B saved. Both tabs then showed "Count 3 · vCPU 4", so neither edit was lost.
  3. Tab A added the flow Service 1 → Database 1 "SQL". Tab B showed "Flows (1)".
  4. Tab B deleted Database 1. Tab A showed "Components (1)" and "Flows (0)": the component and its flow were both gone.
  5. No console errors in either tab.
- Sign-in note: the browser pane didn't keep a session, so the test ran in the owner's Chrome. The owner completed Google sign-in themselves.

**What the owner verified:**
- [x] Signed in (Chrome)
- [ ] Open a board in two windows and edit it yourself

---

## Step 6: Live cost panel (2026-11-23)

**DeepSpace docs:** no new feature is used. The panel relies on https://docs.deep.space/concepts/realtime-sync (every accepted write is broadcast to every subscribed client) and https://docs.deep.space/sdk-reference/client/records (`useQuery` `orderBy`/`orderDir`), both read in step 5.

**Files:**
- `src/board/costView.ts` (+ test): turns the `compute()` result into what the panel shows. Pure.
- `src/board/CostPanel.tsx`: the panel.
- `boards/[boardId].tsx`: runs `useMemo(boardFromRecords → boardToPrices → compute)` over the page's existing three queries and renders the panel above the components.

**Decisions and tradeoffs:**
- **Each browser computes the cost; nothing is stored.** Every viewer gets the same records and runs the same code with the same bundled price snapshot, so every viewer sees the same numbers on every edit. A server-computed, stored total would add a second write per edit, a moment where the stored totals disagree with the board, and a race when two edits land together. The tradeoff: a viewer on an older version of the app sees its older snapshot until they reload. The panel footer shows the snapshot date.
- **`useMemo` sits above the page's early returns**, because React hooks must run in the same order on every render.
- **"Cheapest" only on a complete comparison**, following the cost model's fair-comparison rule. Otherwise the panel shows the model's own warning plus the like-for-like comparison. Each unpriced component says why it's unpriced, using the reason from its unpriced line.
- **The scenario toggle (on demand / 1-year commitment) and expanded rows are per viewer** (React state), not shared. One person looking at commitment prices shouldn't change everyone's view.
- **Provenance in the panel:** each expanded row shows the vendor item, quantity × unit price = monthly cost, the note on how the quantity was derived, and a link to the official source URL.
- **Board lists are oldest-first** (`orderDir: 'asc'`). The live test showed `orderBy: 'createdAt'` alone lists newest first.

**What the agent did:**
- Wrote the three pieces.
- Results: `vitest run` gives **159/159** passing (9 new), `tsc --noEmit` is clean, and `eslint src` is clean.
- **Live test in two Chrome tabs** on a new board, "Cost check" (left in local dev data):
  1. An empty board shows only the internet egress line, at the 200 GB default.
  2. Tab A added a Service and Object storage, both on default sizing (2 × 2 vCPU, 500 GB, 200 GB egress = the comparator's example). Tab B's panel showed **AWS $167.67 / GCP $173.46 / Azure $159.26, Azure cheapest**, exactly the comparator's totals.
  3. Tab A set the service to 4 vCPU. Tab B updated to AWS **$314.84** (2 × 730 h × $0.2016 + $11.50 + $9.00).
  4. Tab B switched to the 1-year commitment: AWS **$215.21** (1,460 h × $0.13336 + $11.50 + $9.00). Tab A stayed on on-demand, so the toggle is per viewer.
  5. The expanded Service row showed each cloud's SKU, quantity × price, the note and the source link. No console errors.
- **Found and fixed during the test:**
  - Azure's derived commitment price showed as `$0.1184931506849315`; unit prices are now formatted to at most 6 decimals (`$0.118493`).
  - Lists were newest-first; now oldest-first.
  - Re-checked both in the browser.
- **Unconfirmed:** the first "+ Object storage" click, sent immediately after "+ Service", didn't add a component; a second click did. Most likely my automated click landed while the page was shifting (the editor panel opens on add), but I didn't prove that. Worth watching for during manual testing.

**What the owner verified:**
- [ ] Open "Cost check" in two windows, change a size, and watch the totals move in both

---

## Step 7: AI reviewer (2026-11-23)

**DeepSpace docs read** (Markdown):
- https://docs.deep.space/guides/ai-chat: custom tools with Zod input schemas, the model catalog, who pays, and why `ai-messages` can't be created from the browser
- https://docs.deep.space/sdk-reference/worker/ai: `createDeepSpaceAI` (`authToken` passed = the caller pays), the agent-runner limits
- https://docs.deep.space/guides/server-actions: actions run as the app and bypass RBAC; the caller's JWT is verified and passed as `callerJwt`; `tools.get`, `query` and `create`

I also read the starter's `src/ai/agent.ts`, `tools.ts` and `chat-routes.ts`, which is where the membership check comes from.

**Files:**
- `src/ai/review/reviewData.ts` (+ test): tool outputs, the review schema, `cleanReview`, the prompt. Pure.
- `src/actions/reviewBoard.ts`: the server action, registered in `src/actions/index.ts`.
- `src/board/fingerprint.ts`: a hash of the board's content.
- `src/board/ReviewPanel.tsx`: the panel, plus finding-count badges on the component cards in `[boardId].tsx`.
- A `reviews` collection in `src/schemas/board-schemas.ts`.

**How it works:**
1. "Review board" sends `POST /api/actions/reviewBoard {boardId}`. The route verifies the JWT, and unauthenticated calls get **401** (checked with curl).
2. The action checks app membership with `resolveAppMembership`, because actions bypass RBAC. It then reads the board, components and flows, ordered oldest first exactly as the page does, and runs the same cost engine.
3. `generateText` runs with `createDeepSpaceAI(env, 'anthropic', { authToken: callerJwt })('claude-sonnet-5-5')`, so **whoever clicks pays**. It has three tools:
   - `get_board`: components with sizing marked stated or default, and flows by label.
   - `get_costs`: per-component cloud costs, commitment costs, spreads and line notes.
   - `submit_review`: a Zod schema of summary plus findings `{componentId, category cost|reliability, severity high|medium|low, title, detail, suggestion}`.
   The run stops at `hasToolCall('submit_review')` or 6 steps, with `maxOutputTokens: 6000`.
4. `cleanReview` drops findings for unknown component ids and duplicates, and sorts high → low.
5. The action writes a `reviews` record with the summary, findings, totals at review time, and the board fingerprint.
6. The page queries the latest review (`limit: 1`). Everyone sees it live, and cards show finding counts. If the live board's fingerprint differs from the review's, the panel shows "Board changed since this review".

**Decisions and tradeoffs:**
- **A button, not a chat.** The brief wants findings *per component*, visible to the team. The starter's chat is private per user (`read: 'own'`) and free text. A chat could reuse these tools later.
- **The model must read through tools**; the board is never pasted into the prompt. That's the brief's "reads the board via tools", and it keeps the prompt fixed.
- **Read-only reviewer.** It has no tool that writes records. Labels are user-typed, so the prompt and the `get_board` output both say to treat them as data. A prompt injection on the board could at most change what the review says, never the board itself.
- **Reviews can't be forged:** members have `create/update: false` on `reviews`. Only the action (running as the app) writes them. The same reasoning as DeepSpace's own `ai-messages` schema.
- **Sonnet 5.5, not the default Opus 5.5:** faster and cheaper per click. It's a one-line change in `REVIEW_MODEL`. Billed to the caller via their JWT, not the owner.
- **Fingerprint:** FNV-1a over the board JSON, built the same way on server and client. It detects edits; it isn't for security.

**What the agent did:**
- Results: `vitest run` gives **169/169** passing (10 new), and `tsc` and `eslint` are clean.
- Restarted the dev server for the new schema. Unauthenticated action call → 401.
- **Bug found in the live run:** the first click failed with `tool_choice: type "tool" and "any" are not supported for this model` because I had set `toolChoice: 'required'`. The provider rejected the request before generating anything, so it should not have used model credits (not checked against the billing page). Fixed by removing it; the prompt plus the "no submit_review → clear error" check cover the same need. The error toast had closed before I looked, so I found it in the dev server log.
- **Live review on "Cost check"** (Service 1: 2 × 4 vCPU; Object storage 1: 500 GB; Database 1: 2 vCPU, HA turned off; flow Service 1 → Database 1; egress 200 GB), started from tab A, with tab B open:
  - The review appeared in **tab B** live, from `claude-sonnet-5-5`, with 6 findings:
    - high reliability: the database has no HA;
    - high cost: always-on compute with no commitment;
    - high reliability, whole board: no load balancer in front of 2 instances;
    - low: the database's spread between clouds and commitment savings;
    - low: object storage not connected to anything;
    - low: egress spread on GCP.
  - **The numbers came from the tools and are correct.** For example, the DB on AWS is $141.44 = 730 × $0.178 + 100 × $0.115, and its commitment price is $98.37 = 730 × $0.119 + $11.50. The review also told stated values apart from defaults.
  - Cards showed "2 findings" on the database and "1 finding" on the service and on storage.
  - Changing egress to 250 in tab B made tab A show "Board changed since this review". No console errors.
- **Not tested live:** that a browser *can't* create a `reviews` record. That rests on the schema (`create: false`), which the docs say is enforced on the server, but I didn't try a forged write.

**What the owner verified:**
- [ ] Read the review on "Cost check" and judge whether the findings are sensible
- [ ] Decide: keep Sonnet 5.5 and caller-pays, or switch

---

## Step 8: Diagram view, presence, and polish (2026-11-23)

**DeepSpace docs read** (Markdown):
- https://docs.deep.space/guides/presence-and-cursors: `usePresenceRoom`; state is in memory only; `peers` excludes me; identity comes from the verified sign-in; peers can appear a moment after joining; re-send state after a reconnect; `getUserColor`.
- https://docs.deep.space/design/product-polish: use the scaffold's UI kit, never native `<select>` or `confirm()`; a `ConfirmModal` that names the item; the home is the real primary surface with a declared pattern; pulse placeholders while loading; the gate greps.

The worker already had `AppPresenceRoom` wired, so presence needed no server change.

**Files:**
- `src/board/layout.ts` (+ test): automatic layout, arrow endpoints, snapping, and `movesForDrag`.
- `src/board/BoardDiagram.tsx`: the SVG diagram.
- `src/board/BoardPresence.tsx`: the presence hook and avatar strip.
- `src/board/example.ts`: the comparator example board used for previews.
- The board page reworked: Diagram/List tabs, kit `Select`, `ConfirmModal`, a pulse loading state.
- `src/pages/index.tsx` (landing) and `src/pages/(app)/home.tsx`.
- `APP_DISPLAY_NAME` added in `constants.ts`, and used in the nav, the page title and `seo.ts`.

**Decisions and tradeoffs:**
- **Drag saves once, on release**, not on every move. Other viewers see the box jump to its new place on drop, not slide. Smooth shared dragging is what DeepSpace's Canvas room does; we chose collections for typed data in step 5.
- **Automatic layout by layer** (edge → app → data, the comparator's `tier`) for boxes never dragged (`x`, `y` = 0, 0). It's pure, so every viewer computes the same picture without storing it.
- **Pin automatic boxes on the first drag** (`movesForDrag`). Found live: dragging the database made the never-placed storage box jump, because the automatic layout stacked it under the database's new position. Each drag now also saves the current spot of any still-automatic box, so nothing moves by itself.
- **Presence shares only "which component I have selected"**: other viewers see your colour outline and initials on that box, plus an avatar strip ("1 other here"). No live cursors; that would add a lot of messages for little review value. The same person in two tabs counts twice (one presence per connection).
- **The SVG scales to fit its column** (`viewBox` + `width: 100%`). Found live: the data column was cut off. Dragging still lines up because pointer positions go through `getScreenCTM()`.
- **Drag state in a `ref`**, and the final position taken from the release event. Found live: a quick drag (press, one move, release) was read as a click, because React state hadn't updated yet when the release came.
- **Polish gate:** native `<select>` replaced by the kit `Select` (with a `__default__` sentinel, because its values must be non-empty). Delete uses `ConfirmModal` naming the component. Loading shows pulse placeholders.
- **Home:** `/home` signed in = the boards list (the primary surface). Signed out = a pitch, the real `CostPanel` on the example board, and inline sign-in. The pattern is declared on the first line. The static landing `/` is a split hero with the same live example panel.
- **Not done:** a custom theme (the gate's `data-theme` check). The app still uses the scaffold theme. Left out to keep this step small.

**What the agent did:**
- Results: `vitest run` gives **177/177** passing (8 new), `tsc` and `eslint` are clean, and the gate greps are clean (no native `<select>`, `confirm`, `alert` or `prompt`, no placeholder text, home pattern present).
- **Live test in two Chrome tabs** on "Cost check":
  1. The diagram drew the components in layer columns, with the flow arrow.
  2. The presence strip showed "1 other here" in each tab.
  3. Dragging Service 1 saved (110, 210) and showed it in both tabs.
  4. Clicking Service 1 in tab A outlined it in tab B with "Arun Kumar is editing this".
  5. After the scaling fix: a quick drag first failed (read as a click), then worked after the ref fix (Database 1 → (640, 250) in both tabs).
  6. Then the jump bug (storage moved). After the pin fix, dragging Database 1 to (460, 120) left Object storage 1, Cache 1 and Queue 1 exactly where they were.
  7. The delete `ConfirmModal` read 'Delete "Queue 1"?'; Cancel kept it.
  8. The landing showed the example panel with $167.67 / $173.46 / $159.26.
  9. `/home` signed in shows the boards list. No console errors.
- Test data left on "Cost check": Cache 1 and Queue 1 (on default sizing), and moved boxes.
- **Not checked live:** the signed-out `/home`, which would mean signing the owner out.

**What the owner verified:**
- [ ] Drag a box yourself, and watch another window
- [ ] Look at the landing page `/` signed out (a private window) and judge the copy
