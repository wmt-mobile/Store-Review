// DEMO_DATA=true: in-memory stand-ins for /api/admin so the admin screens can be reviewed without Supabase.
// Same response shapes as src/admin-api.js. Nothing here talks to a store, Gmail or Chat.
import express from 'express';
import { describe, channelLabel } from './status-map.js';

const H = 3_600_000;
const M = 60_000;

export function demoAdminRouter({ config, store }) {
  const r = express.Router();
  r.use(express.json({ limit: '256kb' }));

  const now = Date.now();
  const st = {
    prefs: { stuckHours: config.stuckHours || 24, applePollMinutes: 5, playPollMinutes: 5, gmailPollMinutes: 5, silentFirstRun: true, digestEnabled: false, digestTime: '09:30', mentionAll: true, quietHours: { enabled: false, start: '22:00', end: '08:00' } },
    gmail: { hasClient: true, connected: true, email: 'dev-accounts@webmobtechnologies.com', connectedAt: new Date(now - 20 * 86_400_000).toISOString(), query: 'from:(no_reply@email.apple.com OR noreply-play-developer-console@google.com) newer_than:30d' },
    chat: { configured: true, masked: 'spaces/AAQA3HMSggo', mode: 'user', spaceName: 'app-reviews · WebMob Mobile Team', appEmail: null, userEmail: 'mobile@webmobtech.com', hasOauthClient: true, locked: true },
    audit: seedAudit(now),
  };
  const accounts = () => store.data.meta.demoAccounts || [];
  const log = (action, { actor = 'riya.k@webmobtechnologies.com', target = null, details = {}, level = 'info' } = {}) =>
    st.audit.unshift({ id: Date.now() + Math.random(), at: new Date().toISOString(), actor, action, target, details, level });

  const accountState = (a) => {
    const s = store.data.accounts[a.id] || {};
    const apps = Object.values(store.data.apps).filter((x) => x.accountId === a.id);
    return {
      id: a.id, store: a.store, name: a.name, status: s.error ? 'error' : 'verified', keyId: a.keyId, issuerId: a.issuerId, clientEmail: a.clientEmail, developerId: a.developerId,
      createdAt: a.createdAt || new Date(now - 44 * 86_400_000).toISOString(), decryptError: null,
      lastPollAt: s.lastPollAt || null, lastDiscoveryAt: s.lastDiscoveryAt || null, error: s.error || null, warning: s.discoveryWarning || null,
      appCount: apps.length, trackedCount: apps.filter((x) => !x.hidden).length, polling: false,
    };
  };
  const appView = (a) => {
    const chans = store.data.channels[a.key] || {};
    return {
      uuid: a.key, key: a.key, name: a.name, storeName: a.storeName || a.name, displayName: a.displayName || null, store: a.store, accountId: a.accountId,
      bundleOrPackage: a.bundleOrPackage, iconUrl: a.iconUrl || null, tracked: !a.hidden, notify: !a.muted, hasWebhook: Boolean(a.chatWebhook), webhookMasked: a.chatWebhook || '',
      channels: Object.entries(chans).map(([ch, s]) => {
        const d = describe(a.store, ch, s.status);
        return { channel: ch, channelLabel: channelLabel(ch), version: s.version, label: d.label, category: d.category, since: s.since };
      }),
    };
  };
  const findAcc = (id) => accounts().find((a) => a.id === id);

  r.get('/setup', (_req, res) => {
    res.json({
      mode: 'demo', bot: { name: 'app_review_bot', onboarded: true }, prefs: { ...st.prefs }, chat: { ...st.chat },
      gmail: { enabled: st.gmail.connected, lastPollAt: store.data.accounts.gmail?.lastPollAt || null, error: null },
      accounts: accounts().map(accountState),
      apps: { total: Object.keys(store.data.apps).length, tracked: Object.values(store.data.apps).filter((a) => !a.hidden).length },
    });
  });

  // ── accounts ──
  r.post('/accounts', (req, res) => {
    const b = req.body || {};
    const store_ = b.store === 'google' ? 'google' : 'apple';
    const a = { id: `demo-${Date.now()}`, store: store_, name: String(b.name || '').trim() || (store_ === 'apple' ? 'Apple account' : 'Play account'), keyId: b.keyId, issuerId: b.issuerId, createdAt: new Date().toISOString() };
    store.data.meta.demoAccounts = [...accounts(), a];
    store.data.accounts[a.id] = { lastPollAt: Date.now() };
    log('account.added', { target: a.name, details: { store: a.store, apps: 0 } });
    res.json({ ok: true, steps: [{ label: 'Credentials accepted', ok: true }, { label: 'Listed apps (demo)', ok: true }], account: accountState(a), apps: [] });
  });
  r.patch('/accounts/:id', (req, res) => {
    const a = findAcc(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    if (req.body?.name) a.name = String(req.body.name).trim();
    if (req.body?.developerId !== undefined) a.developerId = String(req.body.developerId).trim() || undefined;
    log('account.updated', { target: a.name, details: req.body });
    res.json(accountState(a));
  });
  r.delete('/accounts/:id', (req, res) => {
    const a = findAcc(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    store.data.meta.demoAccounts = accounts().filter((x) => x.id !== a.id);
    log('account.removed', { target: a.name, details: { store: a.store }, level: 'warn' });
    res.json({ ok: true });
  });
  r.post('/accounts/:id/discover', (req, res) => {
    const a = findAcc(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    const apps = Object.values(store.data.apps).filter((x) => x.accountId === a.id);
    store.account(a.id).lastDiscoveryAt = Date.now();
    log('apps.discovered', { target: a.name, details: { count: apps.length } });
    res.json({ ok: true, count: apps.length, apps: apps.map(appView) });
  });
  r.post('/accounts/:id/poll', (req, res) => {
    const a = findAcc(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    const s = store.account(a.id);
    s.lastPollAt = Date.now();
    s.error = null;
    s.errorAt = null;
    log('poll.manual', { target: a.name });
    res.json({ ok: true });
  });
  r.put('/accounts/:id/secret', (req, res) => {
    const a = findAcc(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    if (a.store === 'apple') {
      if (!/BEGIN PRIVATE KEY/.test(b.privateKey || '')) return res.status(422).json({ ok: false, error: 'That doesn’t look like an App Store Connect .p8 key', steps: [{ label: 'Read private key', ok: false, detail: 'Missing -----BEGIN PRIVATE KEY-----' }] });
      if (b.keyId) a.keyId = String(b.keyId).trim();
      if (b.issuerId) a.issuerId = String(b.issuerId).trim();
    } else {
      let sa;
      try { sa = JSON.parse(b.serviceAccountJson || ''); } catch { /* invalid */ }
      if (!sa?.client_email || !sa?.private_key) return res.status(422).json({ ok: false, error: 'Paste the full service-account JSON key file', steps: [{ label: 'Read JSON key', ok: false, detail: 'client_email / private_key missing' }] });
      a.clientEmail = sa.client_email;
    }
    const s = store.account(a.id);
    s.error = null;
    s.lastPollAt = Date.now();
    log('account.key_rotated', { target: a.name, details: { store: a.store }, level: 'warn' });
    res.json({ ok: true, steps: [{ label: 'Key verified', ok: true }], account: accountState(a) });
  });

  // ── apps ──
  r.get('/apps', (_req, res) => res.json(Object.values(store.data.apps).map(appView).sort((x, y) => x.name.localeCompare(y.name))));
  const patchApp = (uuid, body) => {
    const a = store.data.apps[uuid];
    if (!a) return null;
    if (body.tracked !== undefined) a.hidden = !body.tracked;
    if (body.notify !== undefined) a.muted = !body.notify;
    if (body.displayName !== undefined) {
      a.storeName ||= a.name;
      const dn = String(body.displayName || '').trim() || null;
      a.displayName = dn;
      a.name = dn || a.storeName;
    }
    if (body.chatWebhook !== undefined) a.chatWebhook = String(body.chatWebhook || '').trim() || undefined;
    return a;
  };
  r.patch('/apps/:uuid', (req, res) => {
    const a = patchApp(req.params.uuid, req.body || {});
    if (!a) return res.status(404).json({ error: 'not found' });
    log('app.updated', { target: a.name, details: req.body });
    res.json(appView(a));
  });
  r.post('/apps/bulk', (req, res) => {
    const { uuids = [], tracked, notify } = req.body || {};
    let n = 0;
    for (const u of uuids) if (patchApp(u, { tracked, notify })) n++;
    log('apps.bulk_updated', { target: `${n} apps`, details: { tracked, notify } });
    res.json({ ok: true, updated: n });
  });

  // ── Chat ──
  r.put('/settings/chat', (req, res) => {
    if (st.chat.locked) return res.status(403).json({ ok: false, error: 'The Chat space is fixed in .env (GOOGLE_CHAT_SPACE=spaces/AAQA3HMSggo) and can’t be changed here.' });
    const b = req.body || {};
    st.chat = { ...st.chat, configured: true, mode: b.mode || 'user', masked: b.space || st.chat.masked, spaceName: b.spaceName || b.space };
    res.json({ ok: true });
  });
  r.get('/settings/chat/spaces', (_req, res) => res.json({ user: st.chat.userEmail, spaces: [{ name: 'spaces/AAQA3HMSggo', displayName: 'app-reviews · WebMob Mobile Team', type: 'SPACE' }, { name: 'spaces/AAQAmobile01', displayName: 'mobile-team', type: 'SPACE' }] }));
  r.post('/settings/chat/test', (_req, res) => {
    log('chat.test_sent', { target: 'app_review_bot' });
    res.json({ ok: true, demo: true });
  });
  r.get('/chat/user/connect', (_req, res) => res.redirect('/dashboard/setup?chat=ok'));

  r.put('/settings/prefs', (req, res) => {
    const keys = ['stuckHours', 'digestEnabled', 'digestTime', 'tz', 'applePollMinutes', 'playPollMinutes', 'gmailPollMinutes', 'silentFirstRun', 'quietHours', 'mentionAll'];
    for (const k of keys) if (req.body?.[k] !== undefined) st.prefs[k] = req.body[k];
    if (st.prefs.stuckHours) st.prefs.stuckHours = Math.max(1, Math.min(720, Number(st.prefs.stuckHours)));
    config.stuckHours = st.prefs.stuckHours;
    log('prefs.updated', { details: req.body });
    res.json({ ok: true, prefs: st.prefs });
  });
  r.post('/onboarding/complete', (_req, res) => res.json({ ok: true }));

  // ── Gmail ──
  r.get('/gmail', (req, res) => res.json({
    redirectUri: `${req.protocol}://${req.get('host')}/api/admin/gmail/callback`, hasClient: st.gmail.hasClient, clientIdMasked: st.gmail.hasClient ? '81234567…apps.googleusercontent.com' : '',
    connected: st.gmail.connected, email: st.gmail.connected ? st.gmail.email : null, connectedAt: st.gmail.connected ? st.gmail.connectedAt : null, query: st.gmail.query,
    lastPollAt: store.data.accounts.gmail?.lastPollAt || null, error: null,
  }));
  r.put('/gmail/client', (req, res) => {
    if (!/\.apps\.googleusercontent\.com$/.test(String(req.body?.clientId || '').trim())) return res.status(400).json({ error: 'Client ID should end with .apps.googleusercontent.com' });
    if (String(req.body?.clientSecret || '').trim().length < 10) return res.status(400).json({ error: 'Paste the client secret too' });
    st.gmail = { ...st.gmail, hasClient: true, connected: false };
    res.json({ ok: true });
  });
  r.get('/gmail/connect', (_req, res) => { st.gmail.connected = true; res.redirect('/dashboard/setup?gmail=ok'); });
  r.put('/gmail/query', (req, res) => {
    const q = String(req.body?.query || '').trim();
    if (q.length < 5) return res.status(400).json({ error: 'Query is too short' });
    st.gmail.query = q;
    log('gmail.query_updated', { details: { query: q } });
    res.json({ ok: true });
  });
  r.post('/gmail/test', (_req, res) => {
    if (!st.gmail.connected) return res.status(400).json({ error: 'Gmail is not connected yet' });
    const t = Date.now();
    res.json({ ok: true, total: 3, emails: [
      { at: t - 2 * H, subject: 'Action required: Dwell Buddy Manager was rejected', from: 'Google Play Console <noreply-play-developer-console@google.com>', packageName: 'com.webmob.dwellbuddy', appName: 'Dwell Buddy Manager', status: 'REJECTED', track: 'production', reason: null },
      { at: t - 26 * H, subject: 'The status of your app TrooPoo 2.4.0 is now In Review', from: 'App Store Connect <no_reply@email.apple.com>', packageName: null, appName: 'TrooPoo', status: 'IN_REVIEW', track: null, reason: null },
      { at: t - 28 * H, subject: 'Your update to TrooPoo (2.4.0) was rejected', from: 'Google Play Console <noreply-play-developer-console@google.com>', packageName: 'com.webmob.troopoo', appName: 'TrooPoo', status: 'REJECTED', track: 'production', reason: null },
    ] });
  });
  r.delete('/gmail', (_req, res) => { st.gmail.connected = false; log('gmail.disconnected', { level: 'warn' }); res.json({ ok: true }); });

  // ── audit ──
  r.get('/audit', (req, res) => {
    let rows = st.audit;
    if (req.query.level) rows = rows.filter((x) => x.level === req.query.level);
    if (req.query.before) rows = rows.filter((x) => x.at < req.query.before);
    res.json(rows.slice(0, Math.min(500, Number(req.query.limit) || 200)));
  });

  return r;
}

function seedAudit(now) {
  const bot = 'system';
  const rows = [
    [4, 'poll.error', bot, 'WebMobTechnologies', { context: 'poll', message: 'Google Play · com.webmob.troopoo — 403 PERMISSION_DENIED' }, 'error'],
    [6, 'chat.notified', bot, 'Telfon - Calls & Chats', { channel: 'production', version: '193 (1.3.80)', from: 'IN_REVIEW', to: 'READY_TO_PUBLISH' }, 'info'],
    [33, 'stuck.alert', bot, 'TrooPoo', { store: 'iOS', version: '2.4.0 (88)', limit: '24h' }, 'warn'],
    [77, 'app.updated', 'riya.k@webmobtechnologies.com', 'Qwik - AI Clothes Changer', { displayName: 'Qwik – AI Outfit Try-On' }, 'info'],
    [106, 'app.updated', 'arjun.m@webmobtechnologies.com', 'Dwell Buddy Manager', { notify: false }, 'warn'],
    [121, 'gmail.parsed', 'gmail_reader', 'Dwell Buddy Manager', { store: 'Android', version: '1.0.0 (3)', ai: 'summary created' }, 'info'],
    [16 * 60 + 30, 'chat.notified', bot, 'TrooPoo', { channel: 'production', version: '87 (2.4.0)', from: 'IN_REVIEW', to: 'REJECTED' }, 'info'],
    [20 * 60 + 40, 'prefs.updated', 'riya.k@webmobtechnologies.com', null, { playPollMinutes: 5 }, 'info'],
    [25 * 60 + 50, 'chat.test_failed', bot, 'app_review_bot', { error: 'Chat API 503 · retried, delivered 09:31' }, 'error'],
    [42 * 60 + 45, 'account.key_rotated', 'arjun.m@webmobtechnologies.com', 'App Store Connect', { store: 'apple' }, 'warn'],
    [44 * 60, 'auth.login', 'riya.k@webmobtechnologies.com', null, { ip: '122.170.96.84' }, 'info'],
    [45 * 60, 'poll.manual', 'riya.k@webmobtechnologies.com', 'all accounts', {}, 'info'],
    [47 * 60, 'apps.discovered', bot, 'WebMobTechnologies', { count: 5 }, 'info'],
    [50 * 60, 'auth.login_failed', 'unknown', null, { ip: '49.36.12.7' }, 'warn'],
    [52 * 60, 'chat.notified', bot, 'Qwik - AI Clothes Changer', { channel: 'production', version: '30 (1.1.3)', from: 'READY_TO_PUBLISH', to: 'ROLLOUT' }, 'info'],
    [60 * 60, 'gmail.query_updated', 'riya.k@webmobtechnologies.com', null, { query: 'from:(…) newer_than:30d' }, 'info'],
    [70 * 60, 'chat.notified', bot, 'QuestnQuiz', { channel: 'production', version: '24 (1.0.3)', from: 'SENT_FOR_REVIEW', to: 'IN_REVIEW' }, 'info'],
    [74 * 60, 'auth.logout', 'arjun.m@webmobtechnologies.com', null, {}, 'info'],
    [80 * 60, 'poll.error', bot, 'WebMobTechnologies', { context: 'poll', message: 'App Store Connect · 429 rate limited, retried' }, 'warn'],
    [96 * 60, 'chat.test_sent', 'riya.k@webmobtechnologies.com', 'app_review_bot', {}, 'info'],
    [100 * 60, 'gmail.connected', 'riya.k@webmobtechnologies.com', 'dev-accounts@webmobtechnologies.com', {}, 'info'],
    [110 * 60, 'account.added', 'riya.k@webmobtechnologies.com', 'WebMobTechnologies', { store: 'google', apps: 5 }, 'info'],
    [111 * 60, 'account.added', 'riya.k@webmobtechnologies.com', 'WebMobTechnologies', { store: 'apple', apps: 6 }, 'info'],
    [112 * 60, 'onboarding.completed', 'riya.k@webmobtechnologies.com', null, { accounts: 2 }, 'info'],
    [130 * 60, 'chat.notified', bot, 'Telfon - Calls & Chats', { channel: 'appstore', version: '1.0.54', from: 'IN_REVIEW', to: 'READY_FOR_DISTRIBUTION' }, 'info'],
    [140 * 60, 'apps.bulk_updated', 'arjun.m@webmobtechnologies.com', '2 apps', { tracked: false }, 'info'],
    [150 * 60, 'chat.notified', bot, 'TrooPoo', { channel: 'production', version: '86 (2.3.1)', from: 'SENT_FOR_REVIEW', to: 'LIVE' }, 'info'],
    [160 * 60, 'account.updated', 'riya.k@webmobtechnologies.com', 'WebMobTechnologies', { name: 'WebMobTechnologies' }, 'info'],
    [170 * 60, 'poll.error', bot, 'WebMobTechnologies', { context: 'poll', message: 'Google Play · 500 backend error' }, 'error'],
    [180 * 60, 'chat.notified', bot, 'Dwell Buddy Manager', { channel: 'production', version: '2 (1.0.0)', from: 'SENT_FOR_REVIEW', to: 'REJECTED' }, 'info'],
  ];
  return rows.map(([minAgo, action, actor, target, details, level], i) => ({ id: 1000 - i, at: new Date(now - minAgo * M).toISOString(), actor, action, target, details, level }));
}
