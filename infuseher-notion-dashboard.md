# InfuseHER Notion Dashboard: full handoff

Written 2 October 2026 so another Claude session can pick this project up with nothing else to go on.
If you are that Claude: read this whole file, then `README.md`, then the code. The person you're
working with is **Quinton**.

---

## 1. Who and what

- **Quinton** (business and tech) and **Chelsey** (a nurse) are launching **InfuseHER**, a mobile IV
  therapy and cosmetic injectables business in London, Ontario.
- Everything about the business lives in **Notion**, but they find it hard to navigate and can't decide
  what to work on each day. There are about 75 open tasks across 15 projects.
- This app shows **a short list of what to do today**, pulled live from Notion. It will also get a **chat
  assistant (DeepSeek)** that answers questions about the business and updates Notion for them.
- **Both of them use phones and tablets, not a computer.** Chelsey never touches code or Notion. Quinton is
  comfortable following steps but isn't a developer, and **is often on his phone with no computer.**
  Never tell him to "run it locally" or open `localhost`. Everything must work from the deployed URL.

**How Quinton wants you to work**
- Explain decisions in plain language. Short, one-by-one steps for anything he has to do.
- **Ask before anything that costs money or is hard to undo.**
- Tell him plainly if something he asks for is a bad idea or fragile, and suggest the simpler version.
- Build in stages and stop after each one so he can try it.

---

## 2. Where everything is

- **GitHub repo:** `quintonatkinson/InfuseaHER-Notion`
- **Branch:** `claude/infuseher-daily-dashboard-bql7nl`. This is the repo's **default branch**; there is no `main`.
  Vercel deploys from it.
- **This file:** `infuseher-notion-dashboard.md` at the root of the repo.
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest. The only runtime dependencies are
  `next`, `react`, `react-dom` and `server-only`.
- **Hosting:** Vercel, set up from his phone. Status at the time of writing is in section 7.

### Commits so far
1. `Step 1: read-only InfuseHER dashboard`
2. `Step 2: login, check-off with undo, owner filter, expandable cards`
3. `Make deployment phone-friendly: two required settings, home-screen icon`
4. This handoff file.

---

## 3. The Notion workspace (already exists, don't recreate)

- **InfuseHER root page:** `21c0941e7a9b80278586dd7bfa4e7723`
  - Sections are child pages: Start Here, Projects & Tasks, Business Plan & Finance, Marketing & Growth,
    Clinical & Compliance, Operations & Supply, Vendor Decisions, Reference & Vault, Site Map.
- **NEVER TOUCH the "Softwares & Logins" page:** `3c20941e7a9b8150958bf472ca653c7d`. It holds passwords.
  - It is hard-coded as blocked in `src/lib/config.ts` (`ALWAYS_BLOCKED`).
  - The assistant must refuse to open it, exclude it from search results, and never quote or write to it.

### Tasks database
- Database ID `3c30941e7a9b81b680a9dfb0f1f25f5e`; **data source ID `3c30941e-7a9b-81d2-897a-000ba9805db7`** (this is the one the API uses).

| Field | Type | Values |
|---|---|---|
| Task | title | |
| Status | select | Not Started, Waiting On, In Progress, Done |
| Priority | select | High, Medium, Low |
| Owner | select | Quinton, Chelsey, Claude |
| Effort | select | Quick (under 30 minutes), Medium (a few hours), Big (multi-day) |
| Due | date | |
| Notes | text | |
| Project | relation to Projects | |
| Blocked by / Blocking | relation to Tasks (paired) | |
| Parent task / Sub-tasks | relation to Tasks (paired) | |

### Projects database
- Database ID `3c30941e7a9b81f98dd1e133d2c9a2ad`; **data source ID `3c30941e-7a9b-81ee-a593-000be5c15413`**.

| Field | Type | Values |
|---|---|---|
| Project Name | title | |
| Status | select | In Progress, Next Up, Planning, Blocked, Done |
| Priority | select | High, Medium, Low |
| Area | select | Legal & Money, Clinical & Staffing, Supply & Space, Growth & Marketing, Product & Tech |
| Target Date | date | |
| Summary | text | |
| Tasks | relation to Tasks | |

- The app reads the live schema at startup and **fails with a clear message** if a field is missing or
  renamed. All field names are in `src/lib/notion/fields.ts`.
- Tasks owned by **"Claude"** are ones an AI assistant can do. They show under the Everyone filter with
  the label "Claude can do this".

---

## 4. Ranking rules (done in code, never by the AI)

These are in `src/lib/ranking.ts` and are pure functions. Quinton wants the list stable between page loads
and explainable.

**Actionable** means all of these:
- Status is not Done and not Waiting On.
- Every task in "Blocked by" is Done. Links to pages that aren't loaded are ignored.
- It is not a parent with open sub-tasks. The parent appears under Objectives instead, and its next open
  sub-task is what's actionable.

**Chokepoints** are actionable tasks with at least one open (not Done) task downstream of them.
- "Downstream" follows "Blocking" transitively. Waiting On tasks downstream count, because they're still open.
- Sort order: downstream count (highest first), then Priority (High, Medium, Low), then due date (soonest
  first, none last), then oldest created, then ID as a tie-break.
- Show the top 5. Each card says "Unlocks: <first direct dependent>, and N more".

**Quick wins** are actionable tasks with Effort = Quick and nothing downstream.
- Sort order: Priority, then due date, then oldest created.
- A task can't be in both lists; anything with downstream tasks is a chokepoint.

**Cycles:** found with Tarjan's algorithm over open tasks. The page shows a warning naming the tasks
involved and does not crash.

**Objectives:** every open parent task that has sub-tasks.
- Shows a done/total count and the next sub-task.
- The next sub-task is an actionable one if there is one, otherwise the next link in the chain.

**Waiting On:** a count of Waiting On tasks, which expands into a list.

**Added rule (told to Quinton): "Also on <person>'s plate".**
- Applies only under a person's filter, when Chokepoints and Quick wins hold fewer than `listSize` tasks between them.
- It fills the gap with that person's other actionable tasks, sorted by urgency.
- Reason: Chelsey's real tasks are all Medium effort with nothing downstream, so her view was empty.
  The brief says never to show an empty dashboard that looks like "nothing to do".

**Settings are already supported in the ranking code** (step 6 still needs to wire up storage and the chat tool):
- `defaultOwner`, `listSize`, `pinnedIds`, `snoozed` (task ID → ISO date it comes back), `hiddenProjectIds`.
- Pinned tasks go to the top of their list. A pinned task that fits neither list (for example, it's blocked) goes to the top of Chokepoints.
- Snoozed tasks are skipped until their date. Tasks in hidden projects are skipped.

### Verified against the live data (snapshot in `tests/fixtures/live-2026-10-02.ts`)
- **Chokepoints:**
  1. Draft the NP recruitment message (4)
  2. Find and retain an accountant (3)
  3. Build the real customer tracking table (2)
  4. Send the 16 drafted supply-chain outreach emails (1)
  5. Research and choose the spa location (1)
- "Review and edit the offers landing page content" also has 3 tasks behind it, but it's Waiting On, so it's excluded.
  This matches what Quinton expected.
- **Quick wins:**
  1. Verify the real phone number and postal code
  2. Rotate the hardcoded Notion token
  3. Set a target launch date
  4. Clarify and call Vasi's pharmacy
  5. Call Oxford Pharmacy
- **Objectives:** "Acquire an NP", 0 of 4 (next: Draft the NP recruitment message); "Reach out to distributors", 0 of 3.
- **Other checks:** 5 tasks are Waiting On, and there are no cycles.

---

## 5. What's built (steps 1 and 2 are done)

### Step 1: read-only dashboard
- **Notion access:**
  - `src/lib/notion/api.ts` is a fetch wrapper. It pins `Notion-Version: 2026-03-11` (rows are queried via
    `/v1/data_sources/{id}/query`) and retries on 429/5xx, honouring `Retry-After`.
  - `src/lib/notion/load.ts` handles the schema check, loading tasks and projects, and relations with more
    than 25 links (fetched via the page-property endpoint). Trashed pages (`in_trash`) are skipped.
    It also contains `setTaskStatus`.
- **Caching:**
  - `src/lib/dashboard.ts` is a 60-second in-memory server cache that shares a single request when several arrive together.
  - `invalidateDashboard()` is called after every write.
  - On a Notion failure it returns the last good copy marked `stale`.
- **The page:** `src/components/Dashboard.tsx` is a client component.
  - It shows the last good copy from `localStorage` instantly, then refreshes.
  - It refreshes every minute and whenever the tab becomes visible again ("live").
  - Failure banners name which service failed, and an empty failure state explicitly says it isn't "nothing to do".
- **Tests:** `tests/ranking.test.ts` has 31 tests covering blocked tasks, transitive counts, parents with
  sub-tasks, Waiting On, cycles, owner filter, pins/snoozes/hidden projects, and the live snapshot.
  Run them with `npm test`.

### Step 2: login, check-off, filter, expand
- **Login:**
  - Pages: `src/app/login/page.tsx`. API: `src/app/api/login/route.ts` (POST logs in, DELETE logs out).
  - There is one shared passphrase (`APP_PASSPHRASE`), then a choice of "I'm Quinton" or "I'm Chelsey".
  - The session is an HMAC-signed cookie lasting 30 days (`src/lib/session.ts`). The signing key is
    `SESSION_SECRET` if set, otherwise it's derived from `NOTION_TOKEN`.
  - `src/proxy.ts` (Next 16 renamed middleware to "proxy") guards everything. Each API route also checks
    the session again via `src/lib/auth.ts`.
- **Check-off:**
  - Ticking a card calls `POST /api/tasks/[id]/status` (`src/app/api/tasks/[id]/status/route.ts`).
  - The route only writes to IDs that are rows in the loaded Tasks data, never to blocked pages, and
    validates the status against the schema's options.
  - The UI updates optimistically: the list refills at once, and a toast offers **Undo** for 8 seconds.
  - Each write is logged to the console as `[write] who ...`. There is no persistent activity log yet; that's step 4.
- **Owner filter:** Everyone / Quinton / Chelsey. It defaults to the logged-in person, and the choice is remembered per device.
- **Expand a card:** shows the notes, sub-tasks, what's blocking it, what's waiting on it, and an "Open in Notion" link.
- **Phone polish:**
  - 48px tap targets, a single column on narrow screens and two columns on wide ones.
  - A web app manifest plus `icon.svg` and `apple-icon.png`, so "Add to Home Screen" opens full screen.
  - Safe-area padding for notched phones.
- **Look:** cream background, warm neutrals, one dusty-rose accent (`#b5687a`), and a serif for headings. Tokens are in `src/app/globals.css`.

### Environment variables (see `.env.example`)
- **Required:** `NOTION_TOKEN` and `APP_PASSPHRASE`.
- **Optional:**
  - `SESSION_SECRET`: change it to log everyone out.
  - `CACHE_TTL_SECONDS`.
  - Workspace ID overrides (defaults are built into `src/lib/config.ts`).
  - `NOTION_BLOCKED_PAGE_IDS`: extra pages to block, on top of Softwares & Logins.
  - `NOTION_API_BASE`: testing only, for a fake Notion.
- **For step 3 onwards:**
  - `DEEPSEEK_API_KEY`.
  - `DEEPSEEK_BASE_URL=https://api.deepseek.com`.
  - `DEEPSEEK_MODEL=deepseek-v4-flash`. The old `deepseek-chat` name was retired on 2026-07-24; the
    current names are `deepseek-v4-flash` and `deepseek-v4-pro`. **Check DeepSeek's current docs before building.**

### Testing notes for the next Claude
- **The cloud container used so far could NOT reach `api.notion.com` or `api.deepseek.com`** because its
  network policy blocked them. Everything was tested against the real data snapshot and a fake Notion server.
  The first real connection happens on Vercel.
- The fake Notion server works like this: a small Node HTTP server serving `/data_sources/tasks`,
  `/data_sources/tasks/query`, `/data_sources/projects`, `/data_sources/projects/query` and `PATCH /pages/:id`,
  with pages built from the fixture. Run the app with `NOTION_API_BASE=http://localhost:4555`,
  `NOTION_TASKS_DATA_SOURCE_ID=tasks` and `NOTION_PROJECTS_DATA_SOURCE_ID=projects`. The server isn't
  committed; rebuild it if needed (about 40 lines).
- Playwright and Chromium are available in the cloud container for screenshots, via `npm root -g`/playwright.
- When stopping `next start`, use `fuser -k 3123/tcp`. Don't use `pkill -f "next start"`, because it kills its own shell.
- `npm run build` runs the TypeScript check. TypeScript 7 and Next 16 work together.

---

## 6. What's left to build (steps 3 to 6)

### Step 3: chat assistant, read-only (needs a DeepSeek API key, which costs money, so ask first)
- A chat bubble in the bottom-right opens a panel, which is full screen on mobile.
- Server route only. The key never reaches the browser.
- DeepSeek is OpenAI-compatible and supports tool calling. Put the model name in an env var.
- **Read tools:**
  - Search Notion (exclude Softwares & Logins).
  - Read a page (refuse if blocked).
  - List tasks and projects (from the cache).
- Answers must **cite the page and link to it**. If it can't find something it must say so, not guess.
  This matters because some content is clinical and regulatory.
- **The system prompt lives in its own file** (for example `src/lib/assistant/system-prompt.md`) so Quinton can read and edit it.
  It must explain:
  - who they are and what the business is;
  - how the Notion workspace is laid out;
  - what Chokepoint and Quick win mean;
  - the safety rules, with the reasons for them.

### Step 4: chat write tools, safety rules, activity log
- **Add tasks.** The assistant fills in every field itself: Project, Owner, Priority, Effort, Blocked by.
  - It looks at the existing open tasks first so it can set Blocked by correctly.
  - If the request is really several steps ("get an NP"), it creates a parent with ordered sub-tasks, each blocked by the one before.
  - If the owner or project is unclear, it asks **one** short question instead of guessing.
- **Update tasks and projects:** mark done, owner, priority, due date, status, notes, dependencies.
- **Take in new information.** "The insurance broker quoted $2,400 a year" gets written to the right Notion
  page and to the related task's notes. The assistant says where it put it.
- **"Say it's done" handling (Quinton asked for this):**
  - The assistant checks related tasks and projects and updates them accordingly.
  - When the last open sub-task is done, it offers to mark the parent Done. When a project's last task is done, it offers to mark the project Done.
- **Safety:**
  - Never delete anything. Archive or mark Done instead, and say so.
  - Before changing more than three tasks at once, or rewriting a page's existing content, describe the change and wait for a yes.
  - Never read, quote or write Softwares & Logins.
- **Activity log:** every write the assistant makes records the time, who asked, what changed and a Notion link.
  - It's viewable from a small "Activity" link so mistakes can be undone.
  - Vercel has no permanent disk, so a sensible choice is a new "Dashboard Activity" database in Notion,
    created once under InfuseHER. That costs nothing and is visible to them. **Ask Quinton before creating it.**
  - The checkbox writes from step 2 should also go into this log.
- After any change, the dashboard refreshes and the reply says what changed, with a link.

### Step 5: document upload
- Attach a PDF, Word, image or text file in chat.
- The assistant extracts the text, creates a Notion page under the right section with a short summary at the
  top, attaches or links the original, and offers to create any tasks the document implies.
- If extraction fails (for example a scanned image), it says so instead of filing an empty page.
- I told Quinton that reading scans (OCR) is the fragile part. The proposed simpler version handles typed
  PDF, Word and text files, and says "can't read this" for scans.

### Step 6: dashboard settings via chat
- Requests like "Show me only Chelsey's tasks by default", "Pin the chair decision", "Hide the Instagram tasks
  this week" and "Show 7 instead of 5".
- These are stored settings that the assistant changes through a tool. It never rewrites code.
- `DashboardSettings` and the ranking support already exist; it needs storage and a tool.
- Storage has to survive Vercel, for example a settings page or block in Notion, or Vercel KV/Upstash.
  **Ask before using any paid service.**

### Step 7: deploy
- Being done now; see the next section.

---

## 7. Deployment: the steps Quinton was given (from his phone)

He chose (or is choosing) Vercel. Things to tell him:
- Vercel's free **Hobby** plan says "non-commercial use". **Pro** is $20 US a month. Netlify's free plan allows commercial use.
- Recommendation: start on Hobby and move to Pro once the business is earning.
- **Status at handoff:** he had just been given these steps. It's unknown whether he has finished them,
  so ask him what he sees at the Vercel link.

**Step 1: make the code private (the repo was PUBLIC at handoff)**
1. Open github.com/quintonatkinson/InfuseaHER-Notion in the phone browser.
2. If Settings isn't visible, open the browser menu and choose "Request Desktop Website".
3. Tap **Settings**, scroll to **Danger Zone**, tap **Change visibility**, then **Make private**, and confirm.

**Step 2: give the app a key to Notion**
1. Open notion.so/profile/integrations and tap **New integration**.
2. Name it **InfuseHER Dashboard**, pick the workspace, choose **Internal**, and save.
3. Under Capabilities, tick **Read content**, **Update content** and **Insert content**, then save.
4. Tap **Show** next to the secret (`ntn_...`) and copy it. **Never paste it into a chat.**
5. In the Notion app, open the **InfuseHER** page, tap **•••**, then **Connections**, then add **InfuseHER Dashboard**.

**Step 3: put it on the internet**
1. Open vercel.com/new and log in.
2. Find **InfuseaHER-Notion** and tap **Import**. If it isn't listed, tap "Adjust GitHub App Permissions"
   and give Vercel access to the repo (needed once it's private).
3. Leave the settings alone and open **Environment Variables**. Add:
   - `NOTION_TOKEN`: the secret.
   - `APP_PASSPHRASE`: a few easy words, for example `velvet saline morning`.
4. Tap **Deploy** and wait about two minutes, then tap **Visit**. That URL is the app.

**Step 4: use it**
1. Enter the passphrase and tap **I'm Quinton**.
2. Use the browser's Share menu and choose **Add to Home Screen**.
3. Text Chelsey the link and the passphrase. She taps **I'm Chelsey** and adds it to her home screen.

**After that**
- Every push to the branch redeploys the same URL within a couple of minutes.
- The first contact with real Notion happens here. If something's off, ask for a screenshot.
- Likely real-world issues to watch for:
  - Notion returns 404 because the page wasn't connected to the integration.
  - A field name differs from the schema (the app will name it).
  - A rate limit on the first load.

---

## 8. Things to flag or keep in mind
- Keep every secret out of chat. They go only into Vercel environment variables.
- The in-memory cache is per Vercel instance, which is fine at this scale. The browser's saved copy covers failures and cold starts.
- Don't add dependencies lightly; Quinton asked for few.
- Never commit `.env` files (`.gitignore` covers them).
- No pull requests unless he asks. Commit and push to the branch above.

---

## 9. Prompt to paste into the new Claude session

> I'm Quinton. We're building the InfuseHER daily dashboard. The repo is `quintonatkinson/InfuseaHER-Notion`,
> on branch `claude/infuseher-daily-dashboard-bql7nl`. Read `infuseher-notion-dashboard.md` in the repo root
> first; it has the full brief, what's built, and what's next. I'm usually on my phone, so give me short
> one-by-one steps and ask before anything that costs money. Start by asking me whether the Vercel deploy
> worked and what I see at the link.
