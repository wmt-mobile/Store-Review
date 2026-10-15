# 05 · Database (Supabase)

Project **app-review-bot**, ref `eoitrsquccljazldfkvb`, region ap-south-1, dashboard https://supabase.com/dashboard/project/eoitrsquccljazldfkvb

Row-level security is **on for every table with no policies**. Only the server, using the service-role key, can read or write. Never add public policies.

## Tables (`public` schema)
| Table | One row per | Important columns |
|---|---|---|
| `accounts` | Developer account (Apple team / Play account) | `store` (apple/google), `name`, `status`, `config` (keyId, issuerId, clientEmail, developerId), `secret_enc` (encrypted .p8 / service-account JSON), `last_poll_at`, `last_discovery_at`, `initialized_at`, `error`, `discovery_warning`, `app_count` |
| `apps` | App in an account | `store_app_id` (Apple app id / Play package), `bundle_id`, `name`, `display_name`, `icon_url`, `tracked` (Watch), `notify`, `chat_webhook_enc` (per-app space) |
| `channel_states` | App × channel (appstore, testflight, production, beta, alpha, internal) | `version`, `status`, `since`, `submitted_at`, `review_ms`, `reason`, `extra` |
| `status_events` | Every status change (history, Activity page) | `app_id`, `channel`, `version`, `from_status`, `to_status`, `reason`, `at`, `event_key` (unique, de-dupe) |
| `seen_events` | Processed Gmail message ids (de-dupe) | `event_id`, `seen_at` (pruned after 60 days) |
| `settings` | Key/value config | see below |
| `audit_log` | Who did what (Admin → Audit log) | `at`, `actor`, `action`, `target`, `details`, `level` |

### `settings` keys
| key | value |
|---|---|
| `prefs` | Intervals, stuck hours, quiet first sync, digest (off) |
| `bot` | `{ name: "app_review_bot", onboarded: true }` |
| `chat` | Chat delivery mode + space (overridden by `GOOGLE_CHAT_SPACE`) |
| `chat_user` | Account that posts to Chat; `value_enc` = encrypted refresh token |
| `gmail` | Mailbox email + search query; `value_enc` = encrypted OAuth client + refresh token |
| `runtime` | Gmail read position, Gmail first-read flag, last digest date |
| `cron_lock` | `{ until: <ms> }`, the lease that stops overlapping ticks |

Deleting an `accounts` row **cascades**: it removes that account's apps, statuses and history.

## Useful queries (SQL editor)
```sql
-- current status of every watched app
select a.name, c.channel, c.version, c.status, c.since
from apps a join channel_states c on c.app_id = a.id
where a.tracked order by a.name, c.channel;

-- last 50 changes
select e.at, a.name, e.channel, e.version, e.from_status, e.to_status, e.reason
from status_events e join apps a on a.id = e.app_id
order by e.at desc limit 50;

-- account health
select name, store, last_poll_at, error from accounts;

-- recent errors / failed logins
select at, actor, action, target, details from audit_log where level <> 'info' order by at desc limit 50;
```

## The cron job
Extensions: `pg_cron`, `pg_net`. The secret is stored in Vault as `review_radar_cron_secret`.

```sql
-- see the job and its last runs
select jobid, jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;

-- HTTP responses from the tick endpoint (pg_net)
select created, status_code, left(content, 200) from net._http_response order by created desc limit 10;

-- pause / resume
select cron.unschedule('review-radar-tick');
select cron.schedule('review-radar-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://wmt-storereview.vercel.app/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'review_radar_cron_secret'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000);
$$);

-- change the secret (must match CRON_SECRET in Vercel)
select vault.update_secret((select id from vault.secrets where name = 'review_radar_cron_secret'), 'NEW_SECRET');
```

## Auth
Dashboard users are listed under **Authentication → Users**. A user can sign in only if they're **confirmed** and their email is in `AUTH_ALLOWED_EMAILS` (Vercel env).

## Backups
The Supabase free plan has no point-in-time recovery. Before risky changes, export the tables (Table editor → Export to CSV) or run `bunx supabase db dump`. Stored keys are encrypted, so a dump is only useful together with the same `ENCRYPTION_KEY`.
