# Review Radar: documentation

Review Radar watches the **App Store, TestFlight and Google Play** review status of WebMob's apps. It shows them in a web dashboard and posts every change to Google Chat as **🤖 app_review_bot**.

| Live app | https://store-review-eosin.vercel.app |
|---|---|
| Code | https://github.com/wmt-mobile/Store-Review (`main` auto-deploys) |
| Hosting | Vercel, project `store-review`, team `mobile-webmobtechcs-projects` (signed in as mobile@webmobtech.com) |
| Database | Supabase project `app-review-bot` (ref `eoitrsquccljazldfkvb`, region ap-south-1) |
| Google Cloud | project `playstore-review-511513` (Play service account, OAuth client, Chat API, Gmail API) |
| Chat space | `spaces/AAQA3HMSggo` (fixed by `GOOGLE_CHAT_SPACE`) |

## Start here
| I want to… | Read |
|---|---|
| Understand how it works | [01 · Architecture](01-architecture.md) |
| Know what each setting / env variable does | [02 · Configuration](02-configuration.md) |
| Make a common change (add an account, change the Chat space, add a login user, rotate a key…) | [03 · How-to (runbook)](03-howto.md) |
| Change the Chat messages, statuses, dashboard or polling in code | [04 · Customizing the code](04-customizing.md) |
| Look at or fix data in Supabase | [05 · Database](05-database.md) |
| Fix something that's broken | [06 · Troubleshooting](06-troubleshooting.md) |

## The 30-second version
1. Every minute, **Supabase pg_cron** calls `POST /api/cron/tick` on Vercel.
2. That request reads the current state from Supabase. It then checks every account that is due: App Store Connect, Google Play, and the Gmail inbox that receives Play Console emails.
3. Any change in status is saved to Supabase and posted to the Google Chat space. Each change is its own message, never a thread reply.
4. The dashboard reads the same Supabase data. Sign-in is email and password through Supabase Auth.

## Golden rules
- **Never lose or change `ENCRYPTION_KEY`.** Every stored key (`.p8`, service-account JSON, OAuth tokens) is encrypted with it.
- **Don't run the app locally (`bun start`) while Vercel is live** unless you set `NO_SCHEDULER=true`. Otherwise every update is posted to Chat twice.
- **Secrets never go in Git.** `.env`, `keys/`, `*.p8`, service-account JSON and `.vercel/` are all git-ignored. Keep it that way.
- **After changing a Vercel environment variable, redeploy** (push a commit, or Vercel → Deployments → ⋯ → Redeploy). Running deployments don't pick up new values.
