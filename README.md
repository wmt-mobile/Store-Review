# Review Radar · app_review_bot

📚 **Full documentation: [docs/](docs/README.md)** · architecture, configuration, how-to recipes, customizing, database, troubleshooting.

Real-time **App Store, TestFlight and Google Play** review status for every WebMob app, in one dashboard. Every change is posted to **Google Chat** within about a minute.

```
 App Store Connect API ─┐
 Play Publishing API ───┼─► /api/cron/tick ─► Tracker ─┬─► Supabase (state, history, audit)
 Gmail (Play emails) ───┘   (every minute,             ├─► Google Chat space (🤖 app_review_bot)
                             Supabase pg_cron)          └─► Dashboard (Vercel)
```

## What it does
- **Discovers every app** in each connected account: App Store Connect teams and Google Play developer accounts.
- **Tracks each channel:**
  - App Store: sent for review → in review → approved → live, plus rejected, metadata rejected and invalid binary.
  - TestFlight: beta review states and new builds.
  - Google Play tracks: production, open, closed and internal testing; sent to Google, rollout and halted.
- **Reads Play Console emails** from a shared Gmail inbox. Google Play has no review-status API, so approvals, "live", rejection reasons and policy notices come from email. Any other Play email is forwarded to Chat as well.
- **Posts every change to Google Chat right away** (no daily digest). Messages are threaded per app version.
- **Dashboard pages:**
  - Overview: a pipeline board and review-time stats.
  - In review: everything currently waiting, with timers against a time limit.
  - Needs attention: rejections and policy issues, with reasons.
  - All apps, Activity.
  - Admin → Setup, Manage apps, Audit log.
- **Login:** email and password via Supabase Auth (optionally "Continue with Google Workspace"). Only emails listed in `AUTH_ALLOWED_EMAILS` can sign in. The session is a signed, HttpOnly cookie that lasts 7 days.
- **Notifications:** a notification centre (bell), toasts while the dashboard is open, and optional **browser push** (approvals, rejections, stuck builds) per user — Settings → Notifications.

## Stack
- **Node 20 + Express** API, and a **React 18 + Tailwind CSS 4** UI in `web/` (built with Vite into `dist/web`, served by Express). The design source is the pen.dev file exported to `design/`.
- **Supabase (Postgres):**
  - Tables: accounts, apps, channel_states, status_events, seen_events, settings, audit_log.
  - RLS is on with no policies, so only the server, using the service-role key, can read or write.
  - Apple `.p8` keys, Play service-account JSON, OAuth refresh tokens and webhooks are **AES-256-GCM encrypted** with `ENCRYPTION_KEY` before they are stored.
- **Vercel:** the whole app is one serverless function (`api/index.js`). Supabase **pg_cron + pg_net** call `POST /api/cron/tick` every minute, with `CRON_SECRET` as a Bearer token. A lease row (`settings.cron_lock`) stops two runs from overlapping.

## Google Chat delivery
The WebMob Workspace blocks Chat apps and incoming webhooks, so messages are sent **as a signed-in user** (Google Chat API, OAuth scope `chat.messages.create`). Every message starts with `🤖 app_review_bot`.
- The target space is fixed in the environment with `GOOGLE_CHAT_SPACE=spaces/AAAA…`; the dashboard cannot change it.
- To connect the sender account: Admin → Setup → Google Chat → **Sign in with Google**.

## Environment variables
Copy `.env.example` to `.env`. On Vercel, set the same variables in Project → Settings → Environment Variables.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Database (server only) + login |
| `ENCRYPTION_KEY` | 32-byte base64 key for stored secrets. **Never change or lose it**: stored keys can't be decrypted without it |
| `AUTH_ALLOWED_EMAILS` | Comma-separated emails allowed to sign in |
| `GOOGLE_CHAT_SPACE` | Fixed Chat space (`spaces/AAAA…` or the space link) |
| `CRON_SECRET` | Bearer token for `/api/cron/tick` |
| `PUBLIC_BASE_URL` | Public URL (e.g. `https://store-review.vercel.app`), used for OAuth redirects |
| `TZ_DISPLAY` | Display time zone (default `Asia/Kolkata`) |

## Run locally
```bash
bun install
cp .env.example .env      # fill in
bun run build             # builds the React UI into dist/web
bun start                 # http://localhost:8080 → login
# UI development with hot reload (API on 8091 in demo mode):
DEMO_DATA=true NO_SCHEDULER=true PORT=8091 DASHBOARD_TOKEN= node src/index.js &
bun run dev:web           # http://localhost:5173/dashboard
bun run test              # node --test
```
Locally, the built-in scheduler polls on its own. Set `NO_SCHEDULER=true` if the cron endpoint drives polling instead. **Don't run a local scheduler and Vercel at the same time**, or every update is posted twice.

## Deploy (Vercel)
1. Push to `main` on **github.com/wmt-mobile/Store-Review**. Vercel (project `store-review`, team `mobile-webmobtechcs-projects`) builds and deploys automatically to **https://wmt-storereview.vercel.app**.
2. Set the environment variables above in Vercel.
3. In Google Cloud → the OAuth client → Authorized redirect URIs, add `https://<your-domain>/api/admin/gmail/callback`. Gmail and Chat sign-ins use the same callback.
4. Supabase SQL (once). This calls the tick endpoint every minute:
   ```sql
   select vault.create_secret('<CRON_SECRET>', 'review_radar_cron_secret');
   select cron.schedule('review-radar-tick', '* * * * *', $$
     select net.http_post(
       url := 'https://<your-domain>/api/cron/tick',
       headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'review_radar_cron_secret')),
       timeout_milliseconds := 55000);
   $$);
   ```

## Adding accounts
Admin → Setup → **Add account** opens the onboarding wizard:
- **Apple:** upload the `.p8`; the Key ID comes from the file name; add the Issuer ID.
- **Google Play:** upload the service-account JSON. Invite that email in Play Console with *View app information*, *View app quality information* and *Release apps to testing tracks*.

Each key is checked step by step before it is saved.

## Project layout
```
api/index.js            Vercel entry (exports the Express app)
src/app.js              routes, auth, cron tick, scheduling
src/index.js            local entry (app.listen + timer)
src/auth.js             Supabase password login, signed sessions
src/admin-api.js        onboarding/admin API, Gmail + Chat OAuth
src/db-store.js         Supabase-backed state (diff sync) + audit log
src/accounts.js         encrypted accounts, live key verification
src/tracker.js          change detection, de-dupe, notifications
src/chat.js             Google Chat (user OAuth / Chat app / webhook)
src/apple/*, src/google/*   store pollers, Gmail reader + parser
src/dashboard/view.js   data model behind /api/dashboard
src/dashboard/*.html    previous single-file UI (still at /classic)
src/ui-api.js, src/push.js   resolve/snooze, notification prefs, browser push
web/                    React + Tailwind UI (pages/, components/, layout/, lib/)
design/                 pen.dev design reference (screens/ screenshots, clean/ Tailwind exports)
test/core.test.js       node --test
```
