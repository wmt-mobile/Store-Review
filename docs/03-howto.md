# 03 · How-to (runbook)

Step-by-step recipes for the changes you're most likely to need. Each one says whether you need **UI only**, an **env change + redeploy**, or a **code change + push**.

---

## Deploying
**Normal flow: push to GitHub.**
```bash
git add -A && git commit -m "what changed" && git push
```
Vercel builds `main` automatically. Live in about a minute: https://store-review-eosin.vercel.app

**Manual deploy** (only if GitHub auto-deploy is broken):
```bash
bunx vercel deploy --prod --yes
```

**Roll back:** Vercel → project → Deployments → pick an older one → ⋯ → **Promote to Production**.

---

## Accounts and apps
### Add another App Store Connect team or Google Play account *(UI only)*
1. Dashboard → **Admin → Setup** → **Add account**. This opens the wizard.
2. Fill in the account:
   - **Apple:** upload `AuthKey_XXXX.p8` (the Key ID fills in from the file name) and paste the Issuer ID.
   - **Google Play:** upload the service-account JSON. You can reuse the existing `app-review-bot@…` account; first invite it in that Play account with the 3 permissions in [02 · Configuration](02-configuration.md).
3. Click **Verify & connect**. Each check shows ✓ or ✗ with a hint.
4. Choose which apps to watch, then continue.

New accounts start with a **quiet first sync**: current statuses are recorded without posting to Chat.

### Watch / stop watching / mute / rename an app *(UI only)*
Go to **Admin → Manage apps**:
- **Watch** off: the app is hidden and not checked.
- **Notify** off: it's still shown on the dashboard, but nothing is posted to Chat.
- Click the name to rename it, for the dashboard and Chat only.

### Remove an account *(UI only)*
Go to **Setup** → account card → 🗑️. This deletes its apps and history in Supabase.

### Rotate an Apple key or Play service-account key *(UI only)*
1. Create the new key at Apple or Google.
2. Add it as a new account in **Setup → Add account**.
3. Once it shows Healthy, remove the old account card.

---

## Google Chat
### Send updates to a different space *(env + redeploy)*
1. Open the new space in the browser. Its URL ends in `/room/AAAA…` or `#chat/space/AAAA…`.
2. Make sure the sender account (`mobile@webmobtech.com`) is a **member** of that space.
3. In Vercel, set `GOOGLE_CHAT_SPACE=spaces/AAAA…` and redeploy.
4. Dashboard → Setup → Google Chat → **Send test**.

### Change the account that posts the messages *(UI only)*
Go to Setup → Google Chat → **Switch account** and sign in with the new Google account. That account must be a member of the space.

### Change the message wording or layout *(code + push)*
See [04 · Customizing → Chat messages](04-customizing.md#chat-messages).

---

## Gmail (Google Play results)
### Reconnect Gmail or use another mailbox *(UI only)*
Go to Setup → **Play email reader** → **Switch account** (or Disconnect, then Sign in with Google) → choose the mailbox.

Then click **Check inbox now**. It lists the latest Play emails and what the bot understood from each.

### A new kind of Play email isn't recognised *(code + push)*
Add a sample to `test/core.test.js`, adjust the rules in `src/google/gmail-parser.js` and run `bun run test`. See [04 · Customizing](04-customizing.md#play-email-parsing).

Until then, unrecognised Play emails are still **forwarded to Chat** as "📩 New message from Google Play".

---

## Login and users
### Add a dashboard user *(Supabase + env + redeploy)*
1. Create the user:
   - In Supabase → project **app-review-bot** → **Authentication → Users → Add user → Create new user**.
   - Enter the email and password, and tick **Auto Confirm User**.
2. Add the email to `AUTH_ALLOWED_EMAILS` in Vercel, comma-separated, then redeploy.

### Change a password *(Supabase)*
Supabase → Authentication → Users → the user → ⋯ → **Reset password** (sends an email), or **Update user** to set a new password directly.

### Remove a user *(Supabase + env)*
Delete the user in Supabase → Authentication → Users, and remove their email from `AUTH_ALLOWED_EMAILS`. Existing sessions stop working within 7 days at the latest, or immediately once the email is no longer allowed and the app is redeployed.

---

## Schedule and checking speed
### Change how often stores are checked *(UI only)*
Setup → Preferences → **Check App Store Connect / Google Play / Play Console emails every …**

### Pause all checking *(Supabase SQL)*
```sql
select cron.unschedule('review-radar-tick');
```
Resume with the `cron.schedule(...)` statement in [05 · Database](05-database.md#the-cron-job).

### The Vercel domain changed *(Supabase SQL + Google Cloud + env)*
1. Vercel: set `PUBLIC_BASE_URL` to the new domain and redeploy.
2. Google Cloud → OAuth client → **Authorized redirect URIs**: add `https://NEW-DOMAIN/api/admin/gmail/callback`.
3. Supabase: re-create the cron job with the new URL ([05 · Database](05-database.md#the-cron-job)).

---

## Secrets
### Rotate `CRON_SECRET` *(env + Supabase)*
1. Generate a new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. In Vercel, set `CRON_SECRET` to the new value and redeploy.
3. In Supabase SQL:
   ```sql
   select vault.update_secret((select id from vault.secrets where name = 'review_radar_cron_secret'), 'NEW_SECRET');
   ```

### Rotate the Supabase service-role key *(Supabase + env)*
Supabase → Project Settings → API Keys → roll the key. Then update `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) in Vercel and redeploy.

### ⚠️ `ENCRYPTION_KEY`
Don't rotate it casually. If it changes, every stored key and token becomes unreadable, and you'll have to re-add the accounts and redo the Gmail and Chat sign-ins. Keep a copy in the team password manager.

---

## Running locally
```bash
bun install
cp .env.example .env          # fill in (or copy the real one from the password manager)
NO_SCHEDULER=true bun start   # dashboard only — Vercel keeps doing the polling
bun run test                  # 20+ tests
bun run demo                  # fake data, no keys
```
Open http://localhost:8080. Leave out `NO_SCHEDULER=true` only when Vercel/cron is switched off.
