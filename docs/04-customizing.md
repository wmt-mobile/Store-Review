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
| Store status change | `statusCard()` in `src/chat.js` | The `lines` array: headline, 📱 store line, 🔄 from → to, ⏱️ time, 📝 reason, 🏢/🕒/🔗 footer |
| "What to do next" line per status | `NEXT_STEP` in `src/chat.js` | One line per category (`submitted`, `in_review`, `approved`, `live`, `rejected`, `action`, `removed`, `draft`, `testing`) |
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
- A change to a **new status** or **new version** is posted.
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
These are plain HTML + JavaScript files with no build step. Edit them and refresh.

| Screen | File |
|---|---|
| Login | `src/dashboard/login.html` |
| Onboarding wizard | `src/dashboard/onboarding.html` |
| Dashboard + Admin (Setup, Manage apps, Audit log) | `src/dashboard/page.html`; views are the `vOverview`, `vReview`, `vAttention`, `vApps`, `vAccounts`, `vActivity`, `vSetup`, `vManage`, `vAudit` functions |
| Data behind the dashboard | `src/dashboard/view.js` (`buildDashboard`) |

Colours are CSS variables at the top of each HTML file, with separate light and dark values (`--c-in_review`, `--b-rejected`, …).

---

## Adding a new admin setting
1. Add the key to `PREF_KEYS` in `src/admin-api.js`, and apply it in `applyPrefs()`.
2. Add a row in `vSetup()` in `page.html`, using the `data-a-pref="yourKey"` input. It saves automatically.
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
