# InfuseHER Today

A small dashboard for Quinton and Chelsey. It reads the InfuseHER Tasks and
Projects databases from Notion and shows a short list of what to do today:
five **Chokepoints** (tasks that unlock other tasks) and five **Quick wins**
(small tasks nothing depends on), plus Objectives and tasks Waiting On someone.

The ranking is plain code with fixed rules (`src/lib/ranking.ts`), not AI.
The same Notion data always gives the same lists.

## Status

- [x] Step 1: read-only dashboard, ranking rules, tests
- [ ] Step 2: check-off, owner filter, expandable cards, login
- [ ] Step 3: chat assistant (read only)
- [ ] Step 4: chat write tools, safety rules, activity log
- [ ] Step 5: document upload
- [ ] Step 6: dashboard settings via chat
- [ ] Step 7: deploy to Vercel

**Don't deploy yet.** There is no login until step 2, so anyone with the URL could see your tasks.

## Running it on your computer

You need Node.js 20 or newer (`node -v` to check).

1. **Create the Notion integration** (one time):
   1. Go to <https://www.notion.so/profile/integrations> and click **New integration**.
   2. Name it "InfuseHER Dashboard", pick your workspace, type **Internal**, and save.
   3. On the integration's page, open **Capabilities**. Tick *Read content*, *Update content* and
      *Insert content* (the last two are for later steps). Leave *user information* off.
   4. Copy the **Internal Integration Secret** (it starts with `ntn_`).
   5. In Notion, open the **InfuseHER** page, click **•••** (top right) → **Connections** →
      add "InfuseHER Dashboard". That shares InfuseHER and everything under it, and nothing else.
2. In this folder, copy `.env.example` to `.env.local` and paste the secret after `NOTION_TOKEN=`.
   `.env.local` is ignored by git, so it never gets committed.
3. Run:
   ```
   npm install
   npm run dev
   ```
4. Open <http://localhost:3000>.

If a field in Notion has been renamed, the page will say which one instead of
showing lists. Field names live in `src/lib/notion/fields.ts`.

## How tasks are ranked

A task is **actionable** when its Status isn't Done or Waiting On, everything
in its "Blocked by" is Done, and it has no open sub-tasks.

- **Chokepoints**: actionable tasks with at least one open task behind them,
  following "Blocking" all the way down. Most tasks behind it first, then
  Priority, then due date, then oldest created.
- **Quick wins**: actionable, Effort = Quick, and nothing behind them. Sorted by
  Priority, due date, then oldest created.

Every card says why it's there ("4 open tasks wait on this · High priority").
If tasks block each other in a loop, a warning names them.

## Checks

```
npm test        # ranking rules, including a snapshot of the real data from 2 Oct 2026
npm run build   # type-checks and builds
```

## Notes

- Notion API version is pinned to `2026-03-11` (`src/lib/notion/api.ts`). In that version rows are
  read through the *data source* ID, so `.env.example` uses the data source IDs.
- Notion data is cached on the server for 60 seconds. The browser also keeps the last good copy,
  so if Notion is down you still see your lists, marked as possibly out of date.
- The page refreshes itself every minute and whenever you come back to the tab.
