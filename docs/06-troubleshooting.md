# 06 · Troubleshooting

Where to look first:
1. **Dashboard → Admin → Audit log**, filtered to Errors and Warnings.
2. **Dashboard → Admin → Setup**: each account card shows its health and last sync time.
3. **Vercel → project store-review → Logs** (filter on `/api/cron/tick`).
4. **Supabase SQL:** the `cron.job_run_details` and `net._http_response` queries in [05 · Database](05-database.md#the-cron-job).
5. **Health check:** https://wmt-storereview.vercel.app/health should return `{"ok":true,"mode":"supabase"}`.

## No messages in Google Chat
| Check | Fix |
|---|---|
| Setup → Google Chat → **Send test** fails | Read the error. "Not signed in": **Switch account** and sign in again. "403 / not a member": add the sender account to the space |
| "Last sync" on the accounts is old (more than a few minutes) | The cron isn't running; see the next section |
| The app is muted or not watched | Admin → Manage apps → turn **Watch** and **Notify** on |
| It was the account's first sync | Quiet first sync only records statuses. The next real change will post |
| Google Play approved, but nothing was posted | Play results come from Gmail. Check that Setup → Play email reader is Connected, and use **Check inbox now** |

## Checks stopped (cron)
| Symptom | Fix |
|---|---|
| `net._http_response` shows **401** | `CRON_SECRET` in Vercel ≠ Vault secret. Update one so they match ([03 · How-to](03-howto.md#rotate-cron_secret-env--supabase)) |
| `net._http_response` shows **404 / DNS errors** | The domain changed. Re-create the cron job with the new URL |
| Every response is `{"skipped":"another tick is running"}` | A stale lease. Run `update settings set value='{"until":0}' where key='cron_lock';` |
| `cron.job` has no `review-radar-tick` row | Re-create it with the SQL in [05 · Database](05-database.md#the-cron-job) |

## Account shows "Failing"
| Error contains | Meaning | Fix |
|---|---|---|
| `401` (Apple) | Key revoked or Key ID / Issuer ID mismatch | New Team Key → Setup → Add account → remove the old one |
| `403` (Apple) | Key role too low | Use App Manager or Admin |
| `403 / permission` (Play) | Service account not invited, or missing permissions | Play Console → Users and permissions → the 3 permissions |
| `has not been used / disabled` | A Google API is turned off in GCP | Enable it in project `playstore-review-511513` |
| `invalid_grant` | Service-account key deleted | Upload a new JSON key |
| `Cannot decrypt stored key` | `ENCRYPTION_KEY` changed | Restore the original key, or re-add the account |

## Gmail
| Problem | Fix |
|---|---|
| "Gmail read failing" + `invalid_grant` | The sign-in expired or was revoked. Setup → Play email reader → **Switch account** and sign in again |
| Emails aren't matched to an app | The email shows "no app found" in **Check inbox now**. Make sure the app is watched; otherwise extend `gmail-parser.js` |
| Nothing found at all | Widen the search filter (Setup → Search filter), e.g. `from:google.com newer_than:30d` |

## Login
| Problem | Fix |
|---|---|
| "Wrong email or password" for a correct password | The email isn't in `AUTH_ALLOWED_EMAILS` (Vercel), or the user isn't confirmed in Supabase |
| "Too many attempts" | Wait 15 minutes (per-IP limit) |
| Login loops back to the sign-in page | Cookies are blocked, or `ENCRYPTION_KEY` changed between deployments |

## Google sign-in (Gmail / Chat) errors
| Error | Fix |
|---|---|
| `redirect_uri_mismatch` | Add `https://wmt-storereview.vercel.app/api/admin/gmail/callback` to the OAuth client's Authorized redirect URIs |
| "This app is blocked by your organisation" | The Workspace admin must allow the internal OAuth app |
| "Google did not return a refresh token" | Remove app_review_bot at https://myaccount.google.com/permissions and sign in again |

## Duplicate messages in Chat
The app is running twice, almost always because a local `bun start` is running alongside Vercel. Stop the local one, or start it with `NO_SCHEDULER=true`.
