// DEMO_DATA=true → realistic fake state so the dashboard can be reviewed without keys.
const H = 3_600_000;

const ACCOUNTS = [
  { id: 'wmt-apple', name: 'WebMobTechnologies', store: 'apple', keyId: 'AB12C7KQ2', issuerId: '69a6de7f-03e1-47e3-e053-5b8c7c11a4d1' },
  { id: 'wmt-play', name: 'WebMobTechnologies', store: 'google', developerId: '1234567890', clientEmail: 'review-bot@wmt-play.iam.gserviceaccount.com' },
];

// Same sample apps as the pen.dev design.
// [account, appId, name, bundle, { channel: [status, version, hoursAgoChanged, hoursAgoSubmitted?, reason?, extra?] }]
const APPS = [
  ['wmt-apple', '6443471885', 'Telfon - Calls & Chats', 'com.webmob.telfon', { appstore: ['WAITING_FOR_REVIEW', '1.0.55', 2.23, 2.23, null, { build: '193', liveVersion: '1.0.54' }] }],
  ['wmt-play', 'com.webmob.telfon', 'Telfon - Calls & Chats', 'com.webmob.telfon', { production: ['READY_TO_PUBLISH', '193 (1.3.80)', 0.9, 7.57, null, { versionCodes: '193', releaseStatus: 'completed' }] }],
  ['wmt-apple', '6752694595', 'Qwik - AI Clothes Changer', 'com.webmob.qwik', { appstore: ['IN_REVIEW', '1.1.4', 1.13, 1.9, null, { build: '52', liveVersion: '1.1.3' }] }],
  ['wmt-play', 'com.webmob.qwik', 'Qwik - AI Clothes Changer', 'com.webmob.qwik', { production: ['LIVE', '30 (1.1.3)', 50, 70, null, { versionCodes: '30', releaseStatus: 'completed' }] }],
  ['wmt-apple', '6450891336', 'QuestnQuiz', 'com.webmob.questnquiz', { appstore: ['WAITING_FOR_REVIEW', '1.0.3', 0.8, 0.8, null, { build: '24', liveVersion: '1.0.2' }] }],
  ['wmt-play', 'com.webmob.questnquiz', 'QuestnQuiz', 'com.webmob.questnquiz', { production: ['IN_REVIEW', '24 (1.0.3)', 3.68, 3.68, null, { versionCodes: '24', releaseStatus: 'completed' }] }],
  ['wmt-apple', '6504763982', 'Dwell Buddy Manager', 'com.webmob.dwellbuddy', { appstore: ['PREPARE_FOR_SUBMISSION', '1.0.0', 30, null, null, { build: '1' }] }],
  ['wmt-play', 'com.webmob.dwellbuddy', 'Dwell Buddy Manager', 'com.webmob.dwellbuddy', { production: ['POLICY_ACTION', '3 (1.0.0)', 2.1, 20, 'Issue found: Missing Permissions Declaration Form', { versionCodes: '3', releaseStatus: 'completed' }] }],
  ['wmt-apple', '6456385009', 'TrooPoo', 'com.webmob.troopoo', { appstore: ['IN_REVIEW', '2.4.0', 5, 26.2, null, { build: '88', liveVersion: '2.3.1' }] }],
  ['wmt-play', 'com.webmob.troopoo', 'TrooPoo', 'com.webmob.troopoo', { production: ['REJECTED', '87 (2.4.0)', 17, 40, "Families policy: ads SDK isn't Families-certified", { versionCodes: '87', releaseStatus: 'completed' }] }],
  ['wmt-play', 'com.webmob.beaconify', 'Beaconify', 'com.webmob.beaconify', { production: ['LIVE', '12 (2.1.0)', 120, 150, null, { versionCodes: '12', releaseStatus: 'completed' }] }],
];

// Store-listing / app-content reviews on live Play builds (no new build): [appKey, [[status, hoursAgo, reason?]…], extra?]
const LISTING = [
  ['google:wmt-play:com.webmob.beaconify', [['IN_REVIEW', 5.2]]],
  ['google:wmt-play:com.webmob.qwik', [['IN_REVIEW', 30], ['REJECTED', 6, 'Data safety: location data not declared']], {
    mailSubject: 'Action required: Your app Qwik - AI Clothes Changer (com.webmob.qwik) was not approved',
    ai: {
      title: 'Data safety form doesn’t declare location data',
      issues: ['The store listing update says the app collects approximate location, but the Data safety form doesn’t declare it.'],
      fixes: ['Play Console → App content → Data safety: add Approximate location (collected, not shared), then send the changes for review again. No new build needed.'],
      deadline: null,
    },
  }],
];

const ch_tf = (chans) => Boolean(chans.testflight);

export function loadDemoData(store) {
  const now = Date.now();
  const d = store.data;
  d.meta.demoAccounts = ACCOUNTS;
  for (const a of ACCOUNTS) d.accounts[a.id] = { lastPollAt: now - Math.random() * 4 * 60_000, lastDiscoveryAt: now - 2 * H };
  d.accounts['wmt-play'].error = 'poll: 403 PERMISSION_DENIED on com.webmob.troopoo';
  d.accounts['wmt-play'].errorAt = now - 4 * 60_000;
  d.accounts['wmt-play'].lastPollAt = now - 38 * 60_000;

  for (const [accountId, appId, name, bundle, chans] of APPS) {
    const store_ = accountId.endsWith('apple') ? 'apple' : 'google';
    const key = `${store_}:${accountId}:${appId}`;
    d.apps[key] = { key, store: store_, accountId, appId, bundleOrPackage: bundle, name, discoveredAt: now - 30 * 24 * H };
    d.channels[key] = {};
    d.history[key] = [];
    for (const [ch, [status, version, ago, subAgo, reason, extra0]] of Object.entries(chans)) {
      d.channels[key][ch] = {
        version,
        status,
        since: now - ago * H,
        submittedAt: subAgo != null ? now - subAgo * H : null,
        reviewMs: subAgo != null && !['IN_REVIEW', 'WAITING_FOR_REVIEW', 'SENT_FOR_REVIEW'].includes(status) ? (subAgo - ago) * H : null,
        reason: reason || null,
        extra: { ...(extra0 || {}) },
      };
      const first = store_ === 'apple' ? 'WAITING_FOR_REVIEW' : 'SENT_FOR_REVIEW';
      const hadSubmit = subAgo != null && subAgo !== ago;
      if (hadSubmit) d.history[key].push({ at: now - subAgo * H, channel: ch, version, from: null, to: first });
      d.history[key].push({ at: now - ago * H, channel: ch, version, from: hadSubmit ? first : null, to: status, reason: reason || null });
    }
    // older completed review cycles so stats + activity look real
    const pubCh = store_ === 'apple' ? 'appstore' : 'production';
    let seed = [...appId].reduce((n, c) => n + c.charCodeAt(0), 0);
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let cycle = 0; cycle < 2; cycle++) {
      const start = now - (12 + cycle * 9 + rnd() * 4) * 24 * H;
      const reviewH = store_ === 'apple' ? 8 + rnd() * 30 : 20 + rnd() * 50;
      const [ma, mi, pa] = String(chans[pubCh]?.[1] || '1.0.0').split(/[.\s]/).map(Number);
      const n = Math.max(1, (ma || 1) * 100 + (mi || 0) * 10 + (pa || 0) - (cycle + 1));
      const ver = `${Math.floor(n / 100)}.${Math.floor((n % 100) / 10)}.${n % 10}`;
      const sub = store_ === 'apple' ? 'WAITING_FOR_REVIEW' : 'SENT_FOR_REVIEW';
      const rejected = rnd() < 0.18;
      d.history[key].push({ at: start, channel: pubCh, version: ver, from: null, to: sub });
      if (store_ === 'apple') d.history[key].push({ at: start + reviewH * 0.7 * H, channel: pubCh, version: ver, from: sub, to: 'IN_REVIEW' });
      d.history[key].push({ at: start + reviewH * H, channel: pubCh, version: ver, from: store_ === 'apple' ? 'IN_REVIEW' : sub, to: rejected ? 'REJECTED' : store_ === 'apple' ? 'READY_FOR_DISTRIBUTION' : 'LIVE', reason: rejected ? 'Guideline 4.0 – Design' : null });
      if (store_ === 'apple' && ch_tf(chans)) {
        d.history[key].push({ at: start - 2 * H, channel: 'testflight', version: `${ver} (${100 + cycle})`, from: null, to: 'WAITING_FOR_REVIEW' });
        d.history[key].push({ at: start + (4 + rnd() * 20) * H, channel: 'testflight', version: `${ver} (${100 + cycle})`, from: 'WAITING_FOR_REVIEW', to: 'APPROVED' });
      }
    }
    d.history[key].sort((a, b) => b.at - a.at);
  }
  d.channels['google:wmt-play:com.webmob.dwellbuddy'].production.extra = {
    ...d.channels['google:wmt-play:com.webmob.dwellbuddy'].production.extra,
    messageId: DEMO_EMAIL.id,
    mailSubject: DEMO_EMAIL.subject,
    mailText: DEMO_EMAIL.text,
    emailUrl: 'https://mail.google.com/',
    ai: {
      title: 'Permissions declaration missing for QUERY_ALL_PACKAGES',
      issues: ['The build requests QUERY_ALL_PACKAGES, but no Permissions Declaration Form was submitted, so Google treats it as undeclared high-risk access.'],
      fixes: ['Drop the permission if it isn’t core, or complete Play Console → App content → Sensitive permissions. Then upload a new build (versionCode 4+).'],
      deadline: 'Oct 23, 2026',
    },
  };
  for (const [key, steps, mail] of LISTING) {
    const ch = d.channels[key]?.production;
    if (!ch) continue;
    let prev = null;
    let sub = null;
    for (const [status, ago, reason] of steps) {
      const at = now - ago * H;
      if (status === 'IN_REVIEW') sub ??= at;
      const cat = status === 'IN_REVIEW' ? 'in_review' : status === 'REJECTED' ? 'rejected' : status === 'LIVE' ? 'live' : 'approved';
      ch.extra.listing = { status, category: cat, since: at, submittedAt: sub, reviewMs: cat === 'in_review' ? null : at - sub, reason: reason || null, ...(cat === 'rejected' ? mail : {}) };
      d.history[key].unshift({ at, channel: 'production', version: ch.version, from: prev, to: status, reason: reason || null, kind: 'listing' });
      prev = status;
    }
    d.history[key].sort((a, b) => b.at - a.at);
  }
  d.accounts.gmail = { lastPollAt: now - 90_000 };
  // last 24 checks per account (Accounts screen) – Play's last two failed like the design
  const M5 = 5 * 60_000;
  d.meta.checks = {
    'wmt-apple': Array.from({ length: 24 }, (_, i) => ({ at: now - 2 * 60_000 - i * M5, ok: true, ms: 900 + ((i * 137) % 600), apps: 5, changes: i === 0 ? 1 : i === 7 ? 2 : 0 })),
    'wmt-play': Array.from({ length: 24 }, (_, i) => (i < 2
      ? { at: now - 4 * 60_000 - i * M5, ok: false, ms: 800 + i * 100, error: '403 PERMISSION_DENIED on com.webmob.troopoo' }
      : { at: now - 4 * 60_000 - i * M5, ok: true, ms: 1300 + ((i * 211) % 900), apps: 5, changes: i === 8 ? 1 : 0 })),
  };
  d.meta.resolved = {
    'apple:wmt-apple:6443471885|appstore|1.0.54': { at: now - 5 * 24 * H, by: 'riya.k@webmobtechnologies.com', note: 'Guideline 2.1 — demo account', appName: 'Telfon - Calls & Chats', store: 'apple', version: '1.0.54' },
    'google:wmt-play:com.webmob.qwik|production|25 (1.1.2)': { at: now - 10 * 24 * H, by: 'arjun.m@webmobtechnologies.com', note: 'Data safety form mismatch', appName: 'Qwik - AI Clothes Changer', store: 'google', version: '1.1.2' },
    'apple:wmt-apple:6450891336|appstore|1.0.1': { at: now - 17 * 24 * H, by: 'riya.k@webmobtechnologies.com', note: 'Guideline 4.3 — spam', appName: 'QuestnQuiz', store: 'apple', version: '1.0.1' },
  };
  d.initialized = Object.fromEntries(ACCOUNTS.map((a) => [a.id, now]));
}

const DEMO_TEXT = `Hi Developers at WebMob Technologies,

After review, Dwell Buddy Manager, com.webmob.dwellbuddy, has been rejected and wasn't published because it doesn't comply with the Permissions and APIs that Access Sensitive Information policy.

Issue found: Missing Permissions Declaration Form
Your app requests the QUERY_ALL_PACKAGES permission, but you haven't submitted a valid declaration in Play Console.

Action required: Remove the permission or complete the declaration, then submit an updated version of your app. Please address this issue by October 23, 2026.

The Google Play Team`;

export const DEMO_EMAIL = {
  id: 'demo0dwellbuddy1',
  subject: 'Action required: Dwell Buddy Manager (com.webmob.dwellbuddy) was rejected',
  from: 'Google Play Console <noreply-play-developer-console@google.com>',
  to: 'mobile@webmobtech.com',
  at: Date.now() - 4 * 3_600_000,
  text: DEMO_TEXT,
  html: `<div style="font-family:Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#202124">
<div style="padding:24px 0;border-bottom:1px solid #e0e0e0"><b style="font-size:20px;color:#01875f">Google Play</b> <span style="color:#5f6368">Console</span></div>
${DEMO_TEXT.split('\n\n').map((p, i) => i === 2 ? `<div style="background:#fce8e6;border-left:4px solid #d93025;padding:12px 16px;margin:16px 0">${p.replace(/\n/g, '<br>')}</div>` : `<p style="line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('')}
<p><a href="https://play.google.com/console" style="display:inline-block;background:#01875f;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Go to Play Console</a></p></div>`,
};
