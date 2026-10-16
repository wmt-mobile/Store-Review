# 01 · Architecture

```
                   ┌──────────── every minute ─────────────┐
                   │  Supabase pg_cron  →  pg_net.http_post │
                   └──────────────────┬─────────────────────┘
                                      ▼  POST /api/cron/tick  (Bearer CRON_SECRET)
┌──────────────────────────── Vercel: one Express function (api/index.js → src/app.js) ───────────────┐
│                                                                                                     │
│  refreshState()  ← reads accounts, apps, statuses, settings from Supabase                           │
│  tickOnce()      → for each due account / inbox:                                                    │
│      App Store Connect API  (src/apple/*)   → App Store + TestFlight status per app                 │
│      Play Publishing API    (src/google/play.js) → track releases (sent for review, rollout, halt)  │
│      Gmail API              (src/google/gmail.js) → Play emails: approved / live / rejected+reason   │
│  Tracker (src/tracker.js) → detects changes, de-dupes, decides what to notify                       │
│  store.flush()   → writes changes back to Supabase                                                  │
│                                                                                                     │
│  Dashboard: /login · /dashboard · /onboarding · /api/*  (same function)                             │
└──────────┬───────────────────────────────────────────────┬──────────────────────────────────────────┘
           ▼                                               ▼
   Supabase Postgres (state, history, audit)      Google Chat API → space (posted as the signed-in user)
```

## Why it's built this way
- **Vercel has no long-running process.** On the Hobby plan, Vercel's own cron only runs once a day. So **Supabase pg_cron** calls the tick endpoint every minute instead.
- **Google Chat apps and incoming webhooks are blocked** in the WebMob Workspace. So messages are sent **as a user** (OAuth scope `chat.messages.create`), signed in once as `mobile@webmobtech.com`. Each message starts or ends with "🤖 app_review_bot".
- **Google Play has no review-status API.** The Publishing API only shows that a release was *submitted* (it appears in a track). Approval, live and rejection come from **Play Console emails**, which are read from a shared Gmail inbox.
- **Apple's API doesn't give the reviewer's rejection text.** Rejections say which type (rejected, metadata rejected, invalid binary) and link to App Store Connect.

## Request lifecycle on Vercel
1. Every request except `/health`, `/login` and `/api/cron/*` first runs `refreshState()`. This reloads the latest data from Supabase (skipped if the data was loaded under 3 seconds ago).
2. Before a response is sent, `store.flush()` writes any in-memory changes to Supabase. `res.json`, `res.send` and `res.redirect` are wrapped so this always happens.
3. Background work started by the dashboard ("Sync now", fetching apps) is kept alive with `waitUntil()` from `@vercel/functions`.
4. `/api/cron/tick` takes a **55-second lease** (the `settings.cron_lock` row). Two ticks can never run at the same time, even if Vercel starts two instances.

## Running modes (`src/app.js` → `MODE`)
| Mode | When | Storage | Login |
|---|---|---|---|
| `supabase` | `SUPABASE_URL` + service key are set (production) | Supabase | Email + password (Supabase Auth) |
| `demo` | `DEMO_DATA=true` | in memory, fake data | none |
| `file` | neither of the above (legacy) | `data/state.json` + `config/apps.json` | optional `DASHBOARD_TOKEN` |

`SERVERLESS` is true on Vercel (`process.env.VERCEL`). Locally, `src/index.js` starts a normal server with its own 10-second scheduler timer instead.

## Main modules
| File | Responsibility |
|---|---|
| `api/index.js` | Vercel entry; exports the Express app |
| `src/index.js` | Local entry: `app.listen` + scheduler |
| `src/app.js` | Routes, login guard, cron tick, scheduling, per-request refresh |
| `src/auth.js` | Supabase password login, signed session cookie, login rate limit |
| `src/admin-api.js` | `/api/admin/*`: accounts, apps, Chat, Gmail, prefs, audit; Google OAuth flows |
| `src/db-store.js` | Supabase-backed state (loads everything, writes back only what changed) + `audit()` |
| `src/accounts.js` | Encrypted developer accounts + step-by-step key verification |
| `src/tracker.js` | Change detection, de-dupe, "quiet first sync", which changes notify |
| `src/chat.js` | Google Chat sending + **all message templates** |
| `src/status-map.js` | Every store status → emoji, label, category |
| `src/apple/*` | App Store Connect client (ES256 JWT), poller, signed webhook receiver |
| `src/google/play.js` | Play app discovery (Reporting API) + track reading (Publishing API, read-only edits) |
| `src/google/gmail.js`, `gmail-parser.js` | Read Play emails, turn them into status + reason |
| `web/` | React 18 + Tailwind 4 UI (Vite → `public/`): `pages/` one file per screen, `components/` shared pieces (drawer, email modal, notification centre, command palette, toasts, push), `layout/Shell.jsx` sidebar/top bar, `lib/` API client, data store, formatting, status labels |
| `src/ui-api.js`, `src/push.js` | `/api/ui/*`: mark resolved / snooze, per-user notification prefs, browser push (web-push + VAPID) |
| `src/dashboard/*.html` | Previous single-file UI, kept at `/classic` as a fallback |
| `src/dashboard/view.js` | Builds the dashboard data (pending, attention, stats, activity) |
| `src/crypto.js` | AES-256-GCM encrypt/decrypt with `ENCRYPTION_KEY` |
| `src/supabase.js` | Tiny PostgREST client (service-role key, server only) |

## Security model
- **Secrets on the server only:**
  - Browsers never receive keys, tokens or the service-role key.
  - All `/api/admin/*` routes need a valid session.
- **Login:**
  - Checked against Supabase Auth.
  - Allowed emails come from `AUTH_ALLOWED_EMAILS`.
  - Session is a signed HttpOnly cookie that lasts 7 days.
  - Max 8 failed attempts per IP per 15 minutes.
- **Database:**
  - Row-level security is on, with **no policies**, so the public (publishable) key can read nothing.
  - Only the server's service-role key can read or write.
- **Stored credentials:**
  - Apple `.p8` files, the Play service-account JSON, Gmail and Chat OAuth refresh tokens, and any webhook URLs are encrypted with AES-256-GCM.
- **The cron endpoint:**
  - Requires `Authorization: Bearer <CRON_SECRET>`.
  - In Supabase, the secret is stored in **Vault** (`review_radar_cron_secret`).
