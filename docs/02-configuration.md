# 02 · Configuration

Configuration lives in **three places**:

| Where | What | How to change |
|---|---|---|
| **Environment variables** (Vercel → Project → Settings → Environment Variables; locally `.env`) | Secrets, URLs, fixed choices (Chat space, allowed logins) | Edit → **redeploy** |
| **Dashboard → Admin → Setup** (stored in Supabase `settings`) | Check intervals, "stuck" limit, quiet first sync, Gmail search, accounts, Google sign-ins | Click in the UI, saved immediately |
| **Dashboard → Admin → Manage apps** (stored in Supabase `apps`) | Watch / mute / rename each app, per-app Chat space | Click in the UI |

When both exist, the **Setup page value wins over the environment default**. The one exception is `GOOGLE_CHAT_SPACE`: when it's set, the dashboard can't change the space.

---

## Environment variables

### Required in production (Vercel)
| Variable | Example / format | Purpose |
|---|---|---|
| `SUPABASE_URL` | `https://eoitrsquccljazldfkvb.supabase.co` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` (legacy JWT) | Server-side DB access. **Secret.** |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` | Alternative to the service-role key (either works) |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Used only to check login passwords against Supabase Auth |
| `ENCRYPTION_KEY` | 32 random bytes, base64 | Encrypts stored keys and tokens. **Never change or lose it.** |
| `AUTH_ALLOWED_EMAILS` | `mobile@webmobtech.com,other@webmobtech.com` | Who may sign in. Empty means any confirmed Supabase Auth user can (not recommended) |
| `GOOGLE_CHAT_SPACE` | `spaces/AAQA3HMSggo`, or the space link | Fixed Chat space. Locks the space in the UI |
| `CRON_SECRET` | 32+ random characters | Bearer token for `/api/cron/tick`. Must match the Supabase Vault secret `review_radar_cron_secret` |
| `PUBLIC_BASE_URL` | `https://store-review-eosin.vercel.app` | Builds the Google OAuth redirect URLs |
| `TZ_DISPLAY` | `Asia/Kolkata` | Time zone used in messages and the dashboard |
| `STATUS_TOKEN` | random | Protects `GET /status?token=…` (raw JSON status) |

### Optional
| Variable | Default | Purpose |
|---|---|---|
| `APPLE_POLL_MINUTES` / `PLAY_POLL_MINUTES` / `GMAIL_POLL_MINUTES` | 5 / 15 / 5 | Defaults only; the Setup page overrides them |
| `DISCOVERY_HOURS` | 6 | How often each account is re-scanned for new apps |
| `STUCK_HOURS` | 48 | Default "stuck in review" limit (Setup overrides it) |
| `SILENT_FIRST_RUN` | true | Record the first statuses of a new account without posting them |
| `GMAIL_QUERY` | Play Console senders, last 14 days | Gmail search for Play emails (Setup → Search filter overrides it) |
| `GOOGLE_CHAT_WEBHOOK_URL` | – | Legacy webhook delivery (blocked in the WebMob Workspace) |
| `DIGEST_ENABLED`, `DIGEST_TIME` | off | Daily summary. **Turned off on purpose:** updates are real-time |

### Local only
| Variable | Purpose |
|---|---|
| `PORT` (8080), `HOST` (127.0.0.1) | Local server address |
| `NO_SCHEDULER=true` | Run locally **without** polling. Use this while Vercel is live, to avoid double posts |
| `DEMO_DATA=true` | Fake data, no keys needed (`bun run demo`) |
| `DASHBOARD_TOKEN` | Old shared-token login for demo/file mode only |

### How to change an environment variable on Vercel
1. Go to https://vercel.com → project **store-review** → **Settings → Environment Variables**.
2. Edit the value for **Production** and save.
3. **Redeploy:** Deployments → newest → ⋯ → **Redeploy**, or push any commit.

From the terminal (inside the project folder):
```bash
printf '%s' 'NEW_VALUE' | bunx vercel env add NAME production --force
bunx vercel deploy --prod      # or just git push
```

---

## Setup page settings (Supabase `settings` table)
| Setting | Where in the UI | Stored as |
|---|---|---|
| Stuck-in-review limit | Setup → Preferences | `settings.prefs.stuckHours` |
| App Store / Play / Gmail check intervals | Setup → Preferences | `prefs.applePollMinutes`, `prefs.playPollMinutes`, `prefs.gmailPollMinutes` |
| Quiet first sync | Setup → Preferences | `prefs.silentFirstRun` |
| Daily summary | (removed from the UI) | `prefs.digestEnabled = false` |
| Gmail OAuth client + mailbox | Setup → Play email reader | `settings.gmail` (encrypted client secret + refresh token) |
| Gmail search filter | Setup → Play email reader → Search filter | `settings.gmail.value.query` |
| Chat sender (signed-in Google account) | Setup → Google Chat → Switch account | `settings.chat_user` (encrypted refresh token) |
| Chat space when **not** locked by env | Setup → Google Chat | `settings.chat` |

> The tick runs every minute, so an interval below 1 minute has no effect. The smallest useful values are 1 (App Store, Gmail) and 1–2 (Play).

---

## External services and the IDs they use
| Service | What is configured there |
|---|---|
| **App Store Connect** (Users and Access → Integrations → Team Keys) | One API key per Apple team. Role App Manager or Admin. The `.p8` is uploaded in onboarding |
| **Google Play Console** (Users and permissions) | Service account `app-review-bot@playstore-review-511513.iam.gserviceaccount.com` with *View app information*, *View app quality information*, *Release apps to testing tracks* |
| **Google Cloud `playstore-review-511513`** | APIs enabled: Google Play Android Developer API, Play Developer Reporting API, Gmail API, Google Chat API. OAuth client `app_review_bot` (Web application). Chat API configuration saved once |
| **OAuth client → Authorized redirect URIs** | `https://store-review-eosin.vercel.app/api/admin/gmail/callback` and `http://localhost:8080/api/admin/gmail/callback` |
| **Gmail** | Shared mailbox `mobile@webmobtech.com` receives Play Console emails (Play Console → Settings → Notifications) |
| **Supabase** | Auth user(s), pg_cron job `review-radar-tick`, Vault secret `review_radar_cron_secret` |
