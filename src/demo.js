// DEMO_DATA=true → realistic fake state so the dashboard can be reviewed without keys.
const H = 3_600_000;

const ACCOUNTS = [
  { id: 'wmt-apple', name: 'WebMob Technologies', store: 'apple' },
  { id: 'clientx-apple', name: 'Client X Inc', store: 'apple' },
  { id: 'wmt-play', name: 'WebMob Technologies', store: 'google', developerId: '1234567890' },
  { id: 'clientx-play', name: 'Client X Inc', store: 'google' },
];

// [account, appId, name, bundle, { channel: [status, version, hoursAgoChanged, hoursAgoSubmitted?, reason?] }]
const APPS = [
  ['wmt-apple', '1450001', 'Troopool', 'com.wmt.troopool', { appstore: ['IN_REVIEW', '3.4.0', 3, 30], testflight: ['APPROVED', '3.4.0 (212)', 40] }],
  ['wmt-apple', '1450002', 'FocusHub', 'com.wmt.focushub', { appstore: ['WAITING_FOR_REVIEW', '2.1.0', 52, 52], testflight: ['IN_REVIEW', '2.1.0 (88)', 5, 9] }],
  ['wmt-apple', '1450003', 'LocalNest', 'com.wmt.localnest', { appstore: ['REJECTED', '1.8.2', 6, 50, 'Guideline 2.1 – Performance – App Completeness. Open App Store Connect → Resolution Center for the reviewer message.'], testflight: ['APPROVED', '1.8.2 (41)', 72] }],
  ['wmt-apple', '1450004', 'Wriggle', 'com.wmt.wriggle', { appstore: ['READY_FOR_DISTRIBUTION', '1.2.0', 200] }],
  ['wmt-apple', '1450005', 'Beaconify', 'com.wmt.beaconify', { appstore: ['PENDING_DEVELOPER_RELEASE', '4.0.0', 8, 31], testflight: ['WAITING_FOR_REVIEW', '4.0.1 (300)', 2, 2] }],
  ['wmt-apple', '1450006', 'Arkiq', 'com.wmt.arkiq', { appstore: ['PREPARE_FOR_SUBMISSION', '0.9.0', 20], testflight: ['INTERNAL_ONLY', '0.9.0 (12)', 20] }],
  ['clientx-apple', '1550001', 'ShopEase', 'com.clientx.shopease', { appstore: ['METADATA_REJECTED', '5.2.1', 14, 40, 'Metadata rejected – screenshots do not reflect the app in use.'] }],
  ['clientx-apple', '1550002', 'Rideshare Pro', 'com.clientx.ride', { appstore: ['READY_FOR_DISTRIBUTION', '7.0.3', 300], testflight: ['APPROVED', '7.1.0 (900)', 26] }],
  ['clientx-apple', '1550003', 'MediBook', 'com.clientx.medibook', { appstore: ['WAITING_FOR_REVIEW', '2.0.0', 10, 10] }],
  ['clientx-apple', '1550004', 'TravelMate', 'com.clientx.travel', {}],
  ['wmt-play', 'com.wmt.troopool', 'Troopool', 'com.wmt.troopool', { production: ['SENT_FOR_REVIEW', '3.4.0 (340)', 20, 20], beta: ['LIVE', '3.4.0 (339)', 50] }],
  ['wmt-play', 'com.wmt.focushub', 'FocusHub', 'com.wmt.focushub', { production: ['ROLLOUT', '2.0.5 (205)', 30], internal: ['LIVE', '2.1.0 (210)', 3] }],
  ['wmt-play', 'com.wmt.localnest', 'LocalNest', 'com.wmt.localnest', { production: ['REJECTED', '1.8.2 (182)', 4, 28, 'Issue found: Violation of Data safety policy\nYour Data safety form does not accurately reflect the data collected by your app (Location).'] }],
  ['wmt-play', 'com.wmt.wriggle', 'Wriggle', 'com.wmt.wriggle', { production: ['LIVE', '1.2.0 (12)', 180] }],
  ['wmt-play', 'com.wmt.beaconify', 'Beaconify', 'com.wmt.beaconify', { production: ['READY_TO_PUBLISH', '4.0.0 (400)', 7, 30], alpha: ['SENT_FOR_REVIEW', '4.0.1 (401)', 60, 60] }],
  ['clientx-play', 'com.clientx.shopease', 'ShopEase', 'com.clientx.shopease', { production: ['POLICY_ACTION', '5.2.0 (520)', 12, null, 'Action required: complete the Health apps declaration by Nov 1.'] }],
  ['clientx-play', 'com.clientx.ride', 'Rideshare Pro', 'com.clientx.ride', { production: ['LIVE', '7.0.3 (703)', 400], beta: ['SENT_FOR_REVIEW', '7.1.0 (710)', 5, 5] }],
  ['clientx-play', 'com.clientx.medibook', 'MediBook', 'com.clientx.medibook', { production: ['HALTED', '1.9.0 (190)', 9] }],
];

const ch_tf = (chans) => Boolean(chans.testflight);

export function loadDemoData(store) {
  const now = Date.now();
  const d = store.data;
  d.meta.demoAccounts = ACCOUNTS;
  for (const a of ACCOUNTS) d.accounts[a.id] = { lastPollAt: now - Math.random() * 4 * 60_000, lastDiscoveryAt: now - 2 * H };
  d.accounts['clientx-play'].error = 'poll: 403: The caller does not have permission (service account not invited to this Play account)';
  d.accounts['clientx-play'].errorAt = now - 3 * H;

  for (const [accountId, appId, name, bundle, chans] of APPS) {
    const store_ = accountId.endsWith('apple') ? 'apple' : 'google';
    const key = `${store_}:${accountId}:${appId}`;
    d.apps[key] = { key, store: store_, accountId, appId, bundleOrPackage: bundle, name, discoveredAt: now - 30 * 24 * H };
    d.channels[key] = {};
    d.history[key] = [];
    for (const [ch, [status, version, ago, subAgo, reason]] of Object.entries(chans)) {
      d.channels[key][ch] = {
        version,
        status,
        since: now - ago * H,
        submittedAt: subAgo != null ? now - subAgo * H : null,
        reviewMs: subAgo != null && !['IN_REVIEW', 'WAITING_FOR_REVIEW', 'SENT_FOR_REVIEW'].includes(status) ? (subAgo - ago) * H : null,
        reason: reason || null,
        extra: status === 'ROLLOUT' ? { userFraction: 0.2 } : ch === 'appstore' && status !== 'READY_FOR_DISTRIBUTION' && appId === '1450002' ? { liveVersion: '2.0.4' } : {},
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
  d.channels['google:wmt-play:com.wmt.localnest'].production.extra = {
    messageId: DEMO_EMAIL.id,
    mailSubject: DEMO_EMAIL.subject,
    mailText: DEMO_EMAIL.text,
    emailUrl: 'https://mail.google.com/',
    ai: {
      title: "Data safety form doesn't match collected data",
      issues: ['Data safety form omits Location data the app collects', 'Detected in version code 182 (1.8.2)'],
      fixes: ['Update Data safety in Play Console › App content to declare Location', 'Or remove location collection, then resubmit 1.8.2'],
      deadline: '1 Nov 2026',
    },
  };
  d.accounts.gmail = { lastPollAt: now - 90_000 };
  d.initialized = Object.fromEntries(ACCOUNTS.map((a) => [a.id, now]));
}

const DEMO_TEXT = `Hi Developers at WebMob Technologies,

We reviewed LocalNest, with package name com.wmt.localnest, and found that your app is not compliant with Google Play Policies.

Publishing status
Your app update with version code 182 (1.8.2) has been rejected.

Issue found: Violation of Data safety policy
Your Data safety form does not accurately reflect the data collected by your app (Location).

Action required
Update your Data safety form in Play Console > Policy > App content, or remove the data collection, then resubmit.

If you don't fix this by 1 November 2026, your app may be removed from Google Play.

The Google Play Team`;

export const DEMO_EMAIL = {
  id: 'demo0localnest01',
  subject: 'Action required: Your app update for LocalNest was rejected',
  from: 'Google Play Console <no-reply-googleplay-developer@google.com>',
  to: 'mobile@webmobtech.com',
  at: Date.now() - 4 * 3_600_000,
  text: DEMO_TEXT,
  html: `<div style="font-family:Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#202124">
<div style="padding:24px 0;border-bottom:1px solid #e0e0e0"><b style="font-size:20px;color:#01875f">Google Play</b> <span style="color:#5f6368">Console</span></div>
${DEMO_TEXT.split('\n\n').map((p, i) => i === 3 ? `<div style="background:#fce8e6;border-left:4px solid #d93025;padding:12px 16px;margin:16px 0">${p.replace(/\n/g, '<br>')}</div>` : `<p style="line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('')}
<p><a href="https://play.google.com/console" style="display:inline-block;background:#01875f;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none">Go to Play Console</a></p></div>`,
};
