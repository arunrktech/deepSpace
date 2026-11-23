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
