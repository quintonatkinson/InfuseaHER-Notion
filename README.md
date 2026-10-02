# InfuseHER Today

A small dashboard for Quinton and Chelsey. It reads the InfuseHER Tasks and
Projects databases from Notion and shows a short list of what to do today:
five **Chokepoints** (tasks that unlock other tasks) and five **Quick wins**
(small tasks nothing depends on), plus Objectives and tasks Waiting On someone.

The ranking is plain code with fixed rules (`src/lib/ranking.ts`), not AI.
The same Notion data always gives the same lists.

## Status

- [x] Step 1: read-only dashboard, ranking rules, tests
- [x] Step 2: check-off, owner filter, expandable cards, login
- [ ] Step 3: chat assistant (read only)
- [ ] Step 4: chat write tools, safety rules, activity log
- [ ] Step 5: document upload
- [ ] Step 6: dashboard settings via chat
- [ ] Step 7: deploy to Vercel


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
2. In this folder, copy `.env.example` to `.env.local` and fill in:
   - `NOTION_TOKEN`: the secret from step 1.
   - `APP_PASSPHRASE`: the shared passphrase you and Chelsey will type to log in. A few words is
     easier on a phone than symbols, e.g. `velvet saline morning`.
   - `SESSION_SECRET`: a long random string. Generate one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

   `.env.local` is ignored by git, so it never gets committed.
3. Run:
   ```
   npm install
   npm run dev
   ```
4. Open <http://localhost:3000>.

### Trying it on your phone

`localhost` always means "this device", so on your phone it points at the phone itself. To use
the dev server from your phone:

1. Phone and computer on the same Wi-Fi.
2. Run `npm run dev:phone` instead of `npm run dev`.
3. Find your computer's local address. On a Mac: `ipconfig getifaddr en0`. On Windows: `ipconfig`,
   and look for "IPv4 Address". It looks like `192.168.1.23`.
4. On your phone, open `http://192.168.1.23:3000` (your address, port 3000).

If it doesn't load, your computer's firewall may be blocking it. On a Mac, allow "node" to accept
incoming connections when asked. Once it's on Vercel (step 7) none of this is needed.

## Using it

- Log in with the passphrase and pick who you are. You stay logged in on that device for 30 days.
  "switch" (top right) logs out so the other person can log in.
- The filter starts on your own tasks. Your choice is remembered on that device.
- Tap the circle to mark a task Done in Notion. The list refills straight away, and **Undo** puts
  it back for 8 seconds after.
- Tap a card to see its notes, sub-tasks, what's blocking it, what's waiting on it, and a link to Notion.
- If a person's view has fewer than five tasks across Chokepoints and Quick wins, an
  "Also on …'s plate" section shows their other doable tasks so the screen is never empty.

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
