# 04 · Customizing the code

Each change follows the same loop: edit, test locally, push. Vercel deploys automatically.
```bash
bun run test                    # must stay green
NO_SCHEDULER=true bun start     # look at the UI on http://localhost:8080 (no double posting)
git add -A && git commit -m "…" && git push
```

---

## Chat messages
All templates are in **`src/chat.js`**, plus the "connected" message in `src/admin-api.js`. Each builder returns:
- `chatText`: the text that is **actually posted**. We post as a user, which only allows text, not cards.
- `cardsV2`: a rich card, only used if delivery is ever switched to a real Chat app or a webhook.

| Message | Function | What to edit |
|---|---|---|
| Play store-listing / app-content review | `statusCard({ listing: true })` in `src/chat.js` | Same as a build message plus a "🗂️ Changes" row |
| Store status change | `statusCard()` in `src/chat.js` | Follows the design's "Google Chat card kit": headline (`HEADLINE`: 📨 Sent for review, 🔎 In review, ☑️ Approved · ready to publish, 🚀 Live · staged rollout, 🚫 Rejected), "app · store" line, label/value rows (📦 Version, ⏱️ Review took, 🕒 Waited, 🔁 From, 📈 Rollout, 💼 Account), ✨ AI summary for rejections, then the action links (Publish in Play Console / Open in Review Radar / View email / Mark resolved) and the full email |
| Links into the dashboard | `radarLink()` in `src/chat.js` | Uses `PUBLIC_BASE_URL`; `/dashboard/apps?app=…` opens the app drawer, `/dashboard/attention?email=…` opens the email, `?resolve=…` marks it resolved |
| @all on rejections | `prefs.mentionAll` (Setup → Google Chat) | Adds `<users/all> Rejection on … — summary below 👇` above rejection messages |
| Other Google Play email | `storeMessageCard()` | The `t` array |
| Sync problem alert | `alertCard()` (called from `reportError()` in `src/tracker.js`) | `chatText` and the `hint` text |
| "Connected" test message | `helloText()` in `src/admin-api.js` | The list of lines |

**Google Chat text formatting:**

| Markup | Result |
|---|---|
| `*bold*` | bold |
| `_italic_` | italic |
| `~strike~` | strikethrough |
| `` `code` `` | inline code |
| ` ``` block ``` ` | a monospace box (we use it for reasons) |
| `<https://url\|link text>` | a link |
| `\n` | a new line; a blank line separates sections |

Avoid underscores inside bold or italic text (e.g. `*app_review_bot*`), because Chat may misread them.

**Preview without posting:**
```bash
node --input-type=module -e "
const { statusCard } = await import('./src/chat.js');
const { describe: d } = await import('./src/status-map.js');
console.log(statusCard({ app:{name:'Demo App',store:'apple',accountId:'a'}, account:{name:'WebMob'}, channel:'appstore', version:'1.0',
  from:d('apple','appstore','WAITING_FOR_REVIEW'), to:d('apple','appstore','IN_REVIEW'), at:Date.now(), submittedAt:Date.now()-3600e3,
  links:[{text:'Open App Store Connect',url:'https://appstoreconnect.apple.com'}] }).chatText)"
```

**Threads:** every update is a new message. This is set in `sendToChat()` (`const threadKey = undefined`). To group messages per app version again, remove that line.

---

## Status names, emoji and categories
**`src/status-map.js`** maps every raw store status to `{ emoji, label, category }`:
- `APP_STORE`: Apple `appVersionState` values
- `TESTFLIGHT`: beta review / build processing states
- `PLAY`: our own Play states (`SENT_FOR_REVIEW`, `APPROVED`, `LIVE`, `REJECTED`, `ROLLOUT`, `HALTED`, …)

Change the emoji or label here and it updates everywhere: Chat, the dashboard and the activity feed. The **category** decides which dashboard column and "next step" line a status gets, so only change it on purpose.

---

## Which changes get posted
The rules are in **`Tracker.update()`** in `src/tracker.js`:
- **Only release status messages go to Chat.** Sync problems (failing keys, Gmail errors) and unclassified Play emails are shown on the dashboard and in the audit log only.
- **Only release channels are shown and posted:** the App Store and Google Play **production** (`RELEASE_CHANNELS` in `src/status-map.js`). TestFlight and the Play testing tracks (open `beta`, closed `alpha`, `internal`) are hidden from the dashboard and never posted. To bring them back, add their names to `RELEASE_CHANNELS`.
- Drafts and internal-only states ("Prepare for submission", "Ready for beta submission", "Internal testing") are never posted (`SILENT_CATEGORIES`).
- A change to a **new status** or **new version** is posted.
- **Google Play: build vs store listing.** Play also reviews store-listing and app-content changes (description, screenshots, Data safety, content rating, policy forms) that have no new build. `meta.playCycle[appKey]` remembers the versionCodes of the last release. That "build cycle" is open from the moment new codes appear until the release is fully `LIVE`.
  - While a cycle is open, results (emails and the release lifecycle) go to the build as before.
  - Once it's closed, any new review result is a listing change. `tracker.updateListing()` stores it as `channels[app].production.extra.listing` and leaves the build's status and version alone. It posts as "📝 Store listing update · In review / Approved / Rejected" and "✅ Store listing changes published", with no build number. Rejections keep the AI summary and the full email.
  - The dashboard shows it as a "Store listing" pill next to the build, a separate card on In review and Needs attention, and entries in the history, Activity and bell.
  - App removals always stay on the build.
  - The Chat message, push and bell look exactly like a build's ("🔎 In review", "☑️ Approved · ready to publish", "🚀 Live", "🚫 Rejected"). The only addition is a "🗂️ Changes · App content · <note>" row.
  - **Google has no API for Play Console's "Changes in review"** (App content declarations, store listing). The releases API keeps saying PUBLISHED, and no email is sent when the review starts. So the app drawer (Google Play tab) has **Content change sent for review**, with an optional note such as "Ads declaration" (`POST /api/ui/listing`, `action: in_review | published | clear`). Google's later email ("changes are ready to publish" or a rejection) updates it automatically.
  - Support-ticket emails ("[5-…] Google Play Developer Support", surveys, replies) are never read as review results (`SUPPORT_RE` in `gmail-parser.js`).
  - The routing is in `pollGmail()` (`src/google/gmail.js`) and `listingFromLifecycle()` (`src/google/play.js`).
- The first time a channel is seen, it is posted, **except** for a brand-new app that is simply already live.
- Nothing is posted during an account's **quiet first sync** (`silentFirstRun`).
- Nothing is posted for apps that are **not watched** or are **muted** (Manage apps).
- Unrecognised Play emails are posted via `notifyStoreMessage()`.

---

## Play email parsing
**`src/google/gmail-parser.js`** turns an email (subject + body) into `{ packageName, status, reason, track }`:
- `RULES`: regex → status, checked in order (most specific first).
- `TRACKS`: words → track (production, open/closed/internal testing).
- `REASON_MARKERS`: where the rejection reason starts in the body.

When Google changes its wording:
1. Copy the real email's subject and body into a new test in `test/core.test.js` (see the existing `gmail:` tests).
2. Adjust `RULES` or `REASON_MARKERS` until `bun run test` passes.
3. Use **Setup → Play email reader → Check inbox now** to see how each real email is understood.

---

## Polling logic
| What | Where |
|---|---|
| App Store + TestFlight per app | `src/apple/poller.js` (`pickAppStoreState`, `pickTestflightState`) |
| Play tracks → "sent for review / rollout / halted" | `deriveTrackState()` in `src/google/play.js` |
| Which accounts are due each minute | `tickOnce()` in `src/app.js` |
| App discovery (new apps in an account) | `src/discovery.js` (every `DISCOVERY_HOURS`) |

---

## Dashboard and admin UI
The UI is a React + Tailwind app in `web/` (Vite). Run the API in demo mode and `bun run dev:web` for hot reload; `bun run build` before deploying (Vercel runs it automatically).

| Screen | File |
|---|---|
| Login · Forgot / reset password · Onboarding | `web/src/pages/Login.jsx`, `ResetPassword.jsx`, `auth/AuthLayout.jsx`, `Onboarding.jsx` |
| Overview | `web/src/pages/Overview.jsx` (+ `pages/overview/`) |
| In review · Apps · Needs attention | `web/src/pages/InReview.jsx`, `Apps.jsx`, `Attention.jsx` |
| Accounts · Activity | `web/src/pages/Accounts.jsx`, `Activity.jsx` |
| Admin: Setup · Manage apps · Audit log | `web/src/pages/Setup.jsx`, `Manage.jsx`, `Audit.jsx` |
| Notification settings | `web/src/pages/NotificationSettings.jsx` |
| App drawer · email modal · bell panel · Ctrl K · toasts | `web/src/components/` |
| Sidebar, top bar, tablet rail, phone tabs | `web/src/layout/Shell.jsx` |
| Colours, fonts (design tokens, light + dark) | `web/src/index.css` |
| Status wording / pill colours | `web/src/lib/model.js` (`LABELS`, `TONE`) |
| Data behind the dashboard | `src/dashboard/view.js` (`buildDashboard`) |

Design reference: `design/screens/<frame>.webp` and `design/clean/<frame>.html` (exported from the pen.dev file; see `design/README.md`).

## Adding a new admin setting
1. Add the key to `PREF_KEYS` in `src/admin-api.js`, and apply it in `applyPrefs()`.
2. Add a control in `web/src/pages/Setup.jsx` and include the key in the prefs saved with `PUT /api/admin/settings/prefs`. Return it in `prefs` from `/api/dashboard` (`src/app.js`) so screens can read it.
3. Read it from `config.*` where it's needed.

---

## Tests
`test/core.test.js` covers:
- the status map
- the Gmail parser (real-style emails)
- tracker de-dupe and notification rules
- the dashboard grouping
- the Apple and Play state pickers
- webhook signatures
- encryption
- the Chat text conversion

Run them with `bun run test`. Add a test for every behaviour you change.

## Rejection emails (AI summary + full email)
When a Play Console email is a **rejection, removal or policy action**, `src/google/gmail.js`:
1. Takes the whole email text and sends it to Groq (`src/ai.js`, model `GROQ_MODEL`) with a fixed prompt. The reply has a fixed format: `TITLE`, `ISSUE`, `FIX`, `DEADLINE`.
2. Stores the summary, the email subject, the text (up to 8,000 characters) and the Gmail message id in `channel_states.extra`.
3. The Chat message (`statusCard()` in `src/chat.js`) shows 🚫 title, 🔎 What's wrong, 🛠️ How to fix, ⏰ Deadline, then 📧 the full email in a box, trimmed so the whole message fits Chat's 4,096-character limit.

On the dashboard, **Needs attention** cards show the summary, and **View email** opens the original email as it looks in Gmail. It's served by `GET /api/email/:id`, which only returns emails the bot has linked to an app, rendered in a sandboxed frame with scripts blocked.

To change the wording or the sections, edit `PROMPT` and `parseSummary()` in `src/ai.js`. If Groq fails or there's no key, the message still posts, with the full email but no summary.
