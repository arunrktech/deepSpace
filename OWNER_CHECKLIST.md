# Owner checklist

Each item maps to an unticked "What the owner verified" box in NOTES.md (line numbers in brackets). Tick it there yourself and add one line on what you saw. The whole list takes about 45 minutes.

The live site is still release #1, so the Step 10 changes (Delete board, the "Connecting…" fix) are only on localhost.

## Block 1: Live app with two accounts (about 12 minutes)

Covers T16 [489], T18 [491], and the "open in two windows" boxes [240], [277], [384], [421].

1. In a terminal: `cd C:\dev\archreview; npx deepspace logs --follow --json`. Leave it running.
2. Chrome, signed in as you: open https://archreview.app.space/boards and create a board called "Owner check".
3. Incognito window: open the same URL. Sign in with a second account (for example Sign in, then "Sign in with email", `bob-0aca2168@deepspace.test` and the password you set). Open "Owner check".
4. Both windows show "1 other here".
5. Chrome: click "+ Service" and "+ Object storage". Both windows show AWS $167.67, Google Cloud $173.46, Azure $159.26 (Azure marked cheapest).
6. Chrome: select the service and set vCPU to 4. Both windows show AWS $314.84.
7. Incognito: drag a box and release it. Chrome shows it in the new place.
8. Chrome: click "Review board" (one model call on your credits). Findings appear in both windows within about 30 seconds, and the component cards show "N findings".
9. Incognito: set internet egress to 250. Chrome shows "Board changed since this review".
10. Terminal: no line with `"level":"error"` and no exception during steps 2 to 9. Press Ctrl+C.

## Block 2: Signed-out pages (about 5 minutes)

Covers T17 [490], the landing copy [385], and localhost [44].

1. New incognito window, signed out: open https://archreview.app.space/home. Expect the heading "ArchReview Room", a "Sign in to start a board" button, and the sample panel with AWS $167.67, Google Cloud $173.46, Azure $159.26. No boards list.
2. Open https://archreview.app.space/ . The headline reads "Design it together. See what it costs as you go." Judge the copy.
3. With `npx deepspace dev start` running in `C:\dev\archreview`, http://localhost:5173 loads the same landing page.

## Block 3: Price spot checks (about 15 minutes)

Covers [143] to [147] and [493]. If a page shows a different value, write down the value you saw.

1. AWS EC2 m7i.large [143]: https://aws.amazon.com/ec2/pricing/on-demand/ , Region "US East (N. Virginia)", Linux, find m7i.large: $0.1008 per hour. Reserved, 1 year, no upfront: https://aws.amazon.com/ec2/pricing/reserved-instances/pricing/ , same region and size: $0.06668 per hour. (The snapshot used AWS's bulk price file; the page may round.)
2. GCP n2-standard-2 [144]: https://cloud.google.com/products/compute/pricing/general-purpose , table "N2 standard machine types", region "South Carolina (us-east1)": $0.097118 per hour.
3. Azure D2s v5 [145]: https://azure.microsoft.com/pricing/details/virtual-machines/linux/ , Region East US, USD, Hourly, find D2s v5: $0.096 per hour, pay as you go.
4. Azure Application Gateway [146]: https://azure.microsoft.com/pricing/details/application-gateway/ , Region East US, Standard v2 fixed price per gateway-hour: $0.20 (from the Azure API). This is the flagged one; if the page shows $0.246, record that.
5. GCP Memorystore for Valkey [147]: https://cloud.google.com/memorystore/valkey/pricing , "Instance pricing" table, region "South Carolina (us-east1)", standard-small: $0.161 per hour.

## Block 4: Code and tests (about 10 minutes)

Covers [82], [83], [193].

1. `cd C:\dev\archreview; npm run test:unit`. Expect "Tests 177 passed" [83].
2. Open `src/cost/costModel.ts` next to https://github.com/arunrktech/cloud-cost-comparator/blob/main/scripts/cost_model.py and compare the `compute` functions: same steps, same order, same rounding [82].
3. In `src/cost/quantify.test.ts`, the queue test: 50 million messages x 3 requests = 150 million requests. AWS: 150 x $0.40 = $60. Azure: $10 + 87 x $0.80 + 50 x $0.50 = $104.60 [193].

## Block 5: Decisions (about 5 minutes)

Covers [194], [335], [336], and [422] once Blocks 3 to 5 are done.

1. Load balancer and queue approximations (NOTES Step 4): accept them, or write what to change [194].
2. On localhost, open "Cost check" and read its AI review. Are the findings sensible? [335]
3. Reviewer model and billing: keep Claude Sonnet 5.5 billed to whoever clicks, or change it [336].

## Block 6: Secrets (about 3 minutes)

Covers T19 [492].

1. `cd C:\dev\archreview; git log -p | Select-String -Pattern 'sk-ant|AKIA[0-9A-Z]{16}|ghp_|PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.' | Measure-Object` . Expect Count 0.
2. `git check-ignore -v .dev.vars` prints `.gitignore:5:.dev.vars`.
3. `git ls-files | Select-String 'dev.vars'` prints nothing.
