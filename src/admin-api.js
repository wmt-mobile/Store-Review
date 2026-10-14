// Onboarding + admin endpoints (Supabase mode). Mounted behind the dashboard auth.
import express from 'express';
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { resetGmail, previewGmail } from './google/gmail.js';
import { sign as signData, verifyData } from './auth.js';
import { db } from './supabase.js';
import { encrypt, decrypt } from './crypto.js';
import { audit } from './db-store.js';
import { discoverAccount } from './discovery.js';
import { sendToChat, setChatAppCredentials, listChatSpaces, isSpaceTarget, chatAppEmail, setChatUserAuth, chatUserEmail, setChatDelivery } from './chat.js';
import { describe, channelLabel } from './status-map.js';
import { errText } from './util.js';

export const BOT_NAME = 'app_review_bot';
const PREF_KEYS = ['stuckHours', 'digestEnabled', 'digestTime', 'tz', 'applePollMinutes', 'playPollMinutes', 'gmailPollMinutes', 'silentFirstRun'];

export async function loadSettings(config, registry) {
  const rows = await db.select('settings');
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const s = {
    bot: by.bot?.value || { name: BOT_NAME, onboarded: false },
    prefs: by.prefs?.value || {},
  };
  try { s.chatWebhook = decrypt(by.chat?.value_enc) || ''; } catch { s.chatWebhook = ''; }
  applyPrefs(config, s.prefs);
  s.gmail = by.gmail?.value || {};
  try { applyGmail(config, JSON.parse(decrypt(by.gmail?.value_enc) || '{}'), s.gmail); } catch { /* ignore */ }
  s.chat = by.chat?.value || {};
  s.chatUser = by.chat_user?.value || {};
  try {
    const tok = JSON.parse(decrypt(by.chat_user?.value_enc) || '{}');
    if (tok.refreshToken && config.gmail.clientId) {
      const o = new google.auth.OAuth2(config.gmail.clientId, config.gmail.clientSecret);
      o.setCredentials({ refresh_token: tok.refreshToken });
      setChatUserAuth(o, s.chatUser.email);
    }
  } catch { /* ignore */ }
  setChatDelivery(s.chat.mode === 'app' ? 'app' : 'user');
  if (config.chatSpaceLocked) {
    s.chat = { ...s.chat, mode: s.chat.mode === 'app' ? 'app' : 'user', space: config.chatSpaceLocked, spaceName: s.chat.space === config.chatSpaceLocked ? s.chat.spaceName : config.chatSpaceLocked };
  }
  if (config.chatSpaceLocked) {
    if (s.chat.mode === 'app') setChatAppCredentials(registry?.get(s.chat.accountId)?.serviceAccount || null);
    config.chatWebhook = config.chatSpaceLocked;
  } else if (s.chat.mode === 'user' && s.chat.space) config.chatWebhook = s.chat.space;
  else if (s.chat.mode === 'app' && s.chat.space) {
    const acc = registry?.get(s.chat.accountId);
    setChatAppCredentials(acc?.serviceAccount || null);
    config.chatWebhook = s.chat.space;
  } else if (s.chatWebhook) config.chatWebhook = s.chatWebhook;
  return s;
}

export function applyGmail(config, secret = {}, meta = {}) {
  if (secret.clientId) config.gmail.clientId = secret.clientId;
  if (secret.clientSecret) config.gmail.clientSecret = secret.clientSecret;
  config.gmail.refreshToken = secret.refreshToken || '';
  if (meta.query) config.gmail.query = meta.query;
  resetGmail();
}

export function applyPrefs(config, p = {}) {
  if (p.stuckHours) config.stuckHours = Number(p.stuckHours);
  if (p.digestEnabled !== undefined) config.digestEnabled = Boolean(p.digestEnabled);
  if (p.digestTime) config.digestTime = p.digestTime;
  if (p.tz) config.tz = p.tz;
  if (p.applePollMinutes) config.applePollMs = Number(p.applePollMinutes) * 60_000;
  if (p.playPollMinutes) config.playPollMs = Number(p.playPollMinutes) * 60_000;
  if (p.gmailPollMinutes) config.gmailPollMs = Number(p.gmailPollMinutes) * 60_000;
  if (p.silentFirstRun !== undefined) config.silentFirstRun = Boolean(p.silentFirstRun);
}

const maskUrl = (u) => (isSpaceTarget(u) ? u : u ? u.replace(/(key=)[^&]+/, '$1••••').replace(/(token=)[^&]+/, '$1••••') : '');
const validChatUrl = (u) => isSpaceTarget(u) || /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^/]+\/messages\?/.test(String(u || ''));

export function helloText(apps, accounts) {
  return [
    '🤖  *App Review Bot is connected* 👋',
    '',
    "I'll post here the moment anything changes on the App Store, TestFlight or Google Play:",
    '',
    '📤  Sent for review',
    '🔍  In review',
    '✅  Approved',
    '🚀  Live',
    '❌  Rejected — with the reason',
    '📩  Any other Google Play message',
    '',
    `👀  Watching *${apps} app${apps === 1 ? '' : 's'}* across *${accounts} account${accounts === 1 ? '' : 's'}*`,
    '',
    '— 🤖 app_review_bot · Review Radar',
  ].join('\n');
}

export function botCard(title, lines = [], { subtitle, chatText } = {}) {
  const plain = (t) => String(t).replace(/<b>([\s\S]*?)<\/b>/g, '*$1*').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '');
  return {
    text: title,
    chatText: chatText || [`🤖 *${plain(title)}*`, '', ...lines.map(plain)].join('\n'),
    cardsV2: [
      {
        cardId: `bot-${Date.now()}`,
        card: {
          header: { title: BOT_NAME, subtitle: subtitle || 'Review Radar · App Store · TestFlight · Google Play' },
          sections: [{ widgets: [{ textParagraph: { text: `<b>${title}</b>` } }, ...lines.map((l) => ({ textParagraph: { text: l } }))] }],
        },
      },
    ],
  };
}

export function adminRouter(ctx) {
  const { config, store, registry, tracker, settings, runPoll, gmailEnabled, isRunning } = ctx;
  const r = express.Router();
  r.use(express.json({ limit: '256kb' }));
  let currentActor = 'admin';
  r.use((req, _res, next) => { currentActor = req.user?.email || 'admin'; next(); });

  const accountState = (a) => {
    const st = store.data.accounts[a.id] || {};
    const apps = Object.values(store.data.apps).filter((x) => x.accountId === a.id);
    return {
      ...registry.publicView(a),
      lastPollAt: st.lastPollAt || null,
      lastDiscoveryAt: st.lastDiscoveryAt || null,
      error: a.decryptError || st.error || null,
      warning: st.discoveryWarning || null,
      appCount: apps.length,
      trackedCount: apps.filter((x) => !x.hidden).length,
      polling: isRunning(a.id),
    };
  };

  const appView = (a) => {
    const chans = store.data.channels[a.key] || {};
    return {
      uuid: a.uuid,
      key: a.key,
      name: a.name,
      storeName: a.storeName || a.name,
      displayName: a.displayName || null,
      store: a.store,
      accountId: a.accountId,
      bundleOrPackage: a.bundleOrPackage,
      iconUrl: a.iconUrl || null,
      tracked: !a.hidden,
      notify: !a.muted,
      hasWebhook: Boolean(a.chatWebhook),
      webhookMasked: maskUrl(a.chatWebhook),
      channels: Object.entries(chans).map(([ch, s]) => {
        const d = describe(a.store, ch, s.status);
        return { channel: ch, channelLabel: channelLabel(ch), version: s.version, label: d.label, category: d.category, since: s.since };
      }),
    };
  };

  r.get('/setup', (_req, res) => {
    res.json({
      mode: 'supabase',
      bot: { ...settings.bot, name: BOT_NAME },
      prefs: { ...settings.prefs },
      chat: { configured: Boolean(config.chatWebhook), masked: maskUrl(config.chatWebhook), mode: settings.chat?.mode || (config.chatWebhook ? 'webhook' : null), spaceName: settings.chat?.spaceName || null, appEmail: chatAppEmail(), userEmail: chatUserEmail(), hasOauthClient: Boolean(config.gmail.clientId), locked: Boolean(config.chatSpaceLocked) },
      gmail: { enabled: gmailEnabled(), lastPollAt: store.data.accounts.gmail?.lastPollAt || null, error: store.data.accounts.gmail?.error || null },
      accounts: registry.list().map(accountState),
      apps: { total: Object.keys(store.data.apps).length, tracked: Object.values(store.data.apps).filter((a) => !a.hidden).length },
    });
  });

  // ── accounts ──
  r.post('/accounts', async (req, res) => {
    const b = req.body || {};
    try {
      const { account, verification } = await registry.add(b);
      if (!account) {
        audit('account.verify_failed', { actor: currentActor, target: b.name || b.store, details: { store: b.store, steps: verification.steps.filter((s) => !s.ok) }, level: 'warn' });
        return res.status(422).json({ ok: false, steps: verification.steps });
      }
      audit('account.added', { actor: currentActor, target: account.name, details: { id: account.id, store: account.store, apps: verification.apps.length } });
      res.json({ ok: true, steps: verification.steps, account: accountState(account), apps: verification.apps });
    } catch (e) {
      res.status(500).json({ ok: false, error: errText(e), steps: [{ label: 'Save account', ok: false, detail: errText(e) }] });
    }
  });

  r.patch('/accounts/:id', async (req, res) => {
    const a = await registry.rename(req.params.id, req.body || {});
    if (!a) return res.status(404).json({ error: 'not found' });
    audit('account.updated', { actor: currentActor, target: a.name, details: req.body });
    res.json(accountState(a));
  });

  r.delete('/accounts/:id', async (req, res) => {
    const a = registry.get(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    await registry.remove(a.id);
    store.removeAccount(a.id);
    audit('account.removed', { actor: currentActor, target: a.name, details: { store: a.store }, level: 'warn' });
    res.json({ ok: true });
  });

  r.post('/accounts/:id/discover', async (req, res) => {
    const a = registry.get(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    try {
      const n = await discoverAccount(a, tracker, { ...config, apps: [] });
      await store.sync();
      audit('apps.discovered', { actor: currentActor, target: a.name, details: { count: n } });
      runPoll(a); // statuses arrive in the background
      res.json({ ok: true, count: n, apps: Object.values(store.data.apps).filter((x) => x.accountId === a.id).map(appView) });
    } catch (e) {
      res.status(502).json({ ok: false, error: errText(e) });
    }
  });

  r.post('/accounts/:id/poll', (req, res) => {
    const a = registry.get(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    runPoll(a);
    audit('poll.manual', { actor: currentActor, target: a.name });
    res.json({ ok: true });
  });

  // ── apps ──
  r.get('/apps', (_req, res) => {
    res.json(Object.values(store.data.apps).map(appView).sort((x, y) => x.name.localeCompare(y.name)));
  });

  async function patchApp(uuid, body) {
    const a = Object.values(store.data.apps).find((x) => x.uuid === uuid);
    if (!a) return null;
    const patch = {};
    if (body.tracked !== undefined) { patch.tracked = Boolean(body.tracked); a.hidden = !patch.tracked; }
    if (body.notify !== undefined) { patch.notify = Boolean(body.notify); a.muted = !patch.notify; }
    if (body.displayName !== undefined) {
      const dn = String(body.displayName || '').trim() || null;
      patch.display_name = dn;
      a.displayName = dn;
      a.name = dn || a.storeName || a.name;
    }
    if (body.chatWebhook !== undefined) {
      const url = String(body.chatWebhook || '').trim();
      if (url && !validChatUrl(url)) throw Object.assign(new Error('Use a Google Chat webhook URL or a space name like spaces/AAAA…'), { status: 400 });
      patch.chat_webhook_enc = url ? encrypt(url) : null;
      a.chatWebhook = url || undefined;
    }
    if (Object.keys(patch).length) await db.update('apps', { id: `eq.${uuid}` }, patch);
    return a;
  }

  r.patch('/apps/:uuid', async (req, res) => {
    try {
      const a = await patchApp(req.params.uuid, req.body || {});
      if (!a) return res.status(404).json({ error: 'not found' });
      const changed = { ...req.body };
      if (changed.chatWebhook) changed.chatWebhook = 'set';
      audit('app.updated', { actor: currentActor, target: a.name, details: changed });
      res.json(appView(a));
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  r.post('/apps/bulk', async (req, res) => {
    const { uuids = [], tracked, notify } = req.body || {};
    const done = [];
    for (const u of uuids) {
      const a = await patchApp(u, { tracked, notify }).catch(() => null);
      if (a) done.push(a.name);
    }
    audit('apps.bulk_updated', { actor: currentActor, target: `${done.length} apps`, details: { tracked, notify } });
    res.json({ ok: true, updated: done.length });
  });

  // ── Google Chat bot ──
  r.put('/settings/chat', async (req, res) => {
    const b = req.body || {};
    if (config.chatSpaceLocked) return res.status(403).json({ ok: false, error: `The Chat space is fixed in .env (GOOGLE_CHAT_SPACE=${config.chatSpaceLocked}) and can't be changed here.` });
    if (b.mode === 'user') {
      if (!isSpaceTarget(b.space)) return res.status(400).json({ ok: false, error: 'Pick a space' });
      const value = { mode: 'user', space: b.space, spaceName: String(b.spaceName || b.space), setAt: new Date().toISOString() };
      await db.upsert('settings', [{ key: 'chat', value, value_enc: null }], 'key', { returning: false });
      settings.chat = value;
      setChatDelivery('user');
      config.chatWebhook = b.space;
      audit('chat.user_space_set', { actor: currentActor, target: value.spaceName, details: { space: b.space, as: chatUserEmail() } });
      return res.json({ ok: true, pendingSignIn: !chatUserEmail() });
    }
    if (b.mode === 'app') {
      const acc = registry.get(b.accountId);
      if (!acc?.serviceAccount) return res.status(400).json({ ok: false, error: 'Pick the Google service account that belongs to the Chat app’s GCP project' });
      if (!isSpaceTarget(b.space)) return res.status(400).json({ ok: false, error: 'Pick a space (spaces/AAAA…)' });
      const value = { mode: 'app', accountId: acc.id, space: b.space, spaceName: String(b.spaceName || b.space), setAt: new Date().toISOString() };
      await db.upsert('settings', [{ key: 'chat', value, value_enc: null }], 'key', { returning: false });
      settings.chat = value;
      setChatAppCredentials(acc.serviceAccount);
      setChatDelivery('app');
      config.chatWebhook = b.space;
      audit('chat.app_set', { actor: currentActor, target: value.spaceName, details: { space: b.space, serviceAccount: acc.serviceAccount.client_email } });
      return res.json({ ok: true, masked: b.space });
    }
    const url = String(b.webhookUrl || '').trim();
    if (!validChatUrl(url) || isSpaceTarget(url)) return res.status(400).json({ ok: false, error: 'Paste the full Google Chat webhook URL (https://chat.googleapis.com/v1/spaces/…/messages?key=…&token=…)' });
    await db.upsert('settings', [{ key: 'chat', value: { mode: 'webhook', setAt: new Date().toISOString() }, value_enc: encrypt(url) }], 'key', { returning: false });
    settings.chat = { mode: 'webhook' };
    setChatAppCredentials(null);
    config.chatWebhook = url;
    audit('chat.webhook_set', { actor: currentActor, target: BOT_NAME });
    res.json({ ok: true, masked: maskUrl(url) });
  });

  r.get('/settings/chat/spaces', async (req, res) => {
    if (req.query.mode === 'user') {
      try { return res.json({ user: chatUserEmail(), spaces: (await listChatSpaces(null, { asUser: true })).filter((sp) => sp.type !== 'DIRECT_MESSAGE') }); }
      catch (e) {
        const m = errText(e);
        return res.status(502).json({ error: m, hint: /disabled|has not been used/i.test(m) ? 'Enable the Google Chat API in project playstore-review-511513.' : /configuration|not found|404/i.test(m) ? 'Google requires a Chat app configuration in the project (Google Chat API → Configuration) even for posting as yourself — fill it in and Save.' : /scope|insufficient/i.test(m) ? 'Sign in again and approve all permissions.' : null });
      }
    }
    const acc = registry.get(String(req.query.accountId || ''));
    if (!acc?.serviceAccount) return res.status(400).json({ error: 'Pick a Google service account first' });
    try {
      res.json({ serviceAccount: acc.serviceAccount.client_email, spaces: await listChatSpaces(acc.serviceAccount) });
    } catch (e) {
      const m = errText(e);
      const hint = /has not been used|disabled|SERVICE_DISABLED/i.test(m) ? 'Enable the Google Chat API in this service account’s GCP project.'
        : /404|not found|Chat app not found|configuration/i.test(m) ? 'The Chat app isn’t configured in this GCP project yet (Google Chat API → Configuration), or the service account is from a different project.'
        : /403|permission/i.test(m) ? 'The Chat app is configured, but this service account can’t act as it — it must be a service account in the same GCP project.' : null;
      res.status(502).json({ error: m, hint });
    }
  });

  r.post('/settings/chat/test', async (req, res) => {
    const url = config.chatSpaceLocked || String(req.body?.webhookUrl || req.body?.space || config.chatWebhook || '').trim();
    if (!validChatUrl(url)) return res.status(400).json({ ok: false, error: 'No Google Chat space or webhook configured yet' });
    const sa = req.body?.accountId ? registry.get(req.body.accountId)?.serviceAccount : undefined;
    const tracked = Object.values(store.data.apps).filter((a) => !a.hidden).length;
    try {
      await sendToChat(
        botCard('👋 Hi! app_review_bot is connected.', [
          `I'll post here whenever an app's review status changes on the App Store, TestFlight or Google Play — sent for review, in review, approved, live, or rejected (with the reason).`,
          `Watching <b>${tracked}</b> app${tracked === 1 ? '' : 's'} across <b>${registry.list().length}</b> account${registry.list().length === 1 ? '' : 's'}.`,
        ], { chatText: helloText(tracked, registry.list().length) }),
        { webhook: url, threadKey: 'app-review-bot-hello', sa }
      );
      audit('chat.test_sent', { actor: currentActor, target: BOT_NAME });
      res.json({ ok: true });
    } catch (e) {
      audit('chat.test_failed', { actor: currentActor, target: BOT_NAME, details: { error: errText(e) }, level: 'error' });
      res.status(502).json({ ok: false, error: errText(e) });
    }
  });

  r.put('/settings/prefs', async (req, res) => {
    const p = { ...settings.prefs };
    for (const k of PREF_KEYS) if (req.body?.[k] !== undefined) p[k] = req.body[k];
    if (p.stuckHours) p.stuckHours = Math.max(1, Math.min(720, Number(p.stuckHours)));
    if (p.digestTime && !/^\d{2}:\d{2}$/.test(p.digestTime)) return res.status(400).json({ error: 'digestTime must be HH:MM' });
    await db.upsert('settings', [{ key: 'prefs', value: p }], 'key', { returning: false });
    settings.prefs = p;
    applyPrefs(config, p);
    audit('prefs.updated', { actor: currentActor, details: req.body });
    res.json({ ok: true, prefs: p });
  });

  r.post('/onboarding/complete', async (_req, res) => {
    settings.bot = { ...settings.bot, name: BOT_NAME, onboarded: true, onboardedAt: new Date().toISOString() };
    await db.upsert('settings', [{ key: 'bot', value: settings.bot }], 'key', { returning: false });
    audit('onboarding.completed', { actor: currentActor, details: { accounts: registry.list().length } });
    res.json({ ok: true });
  });


  // ── Gmail (Play approvals / rejections) ──
  const redirectUri = (req) => `${config.publicBaseUrl || `${req.protocol}://${req.get('host')}`}/api/admin/gmail/callback`;
  const gmailSecret = () => ({ clientId: config.gmail.clientId, clientSecret: config.gmail.clientSecret, refreshToken: config.gmail.refreshToken });
  async function saveGmail(meta = settings.gmail) {
    settings.gmail = meta;
    await db.upsert('settings', [{ key: 'gmail', value: meta, value_enc: encrypt(JSON.stringify(gmailSecret())) }], 'key', { returning: false });
  }

  r.get('/gmail', (req, res) => {
    res.json({
      redirectUri: redirectUri(req),
      hasClient: Boolean(config.gmail.clientId && config.gmail.clientSecret),
      clientIdMasked: config.gmail.clientId ? config.gmail.clientId.replace(/^(.{8}).*(\.apps\.googleusercontent\.com)$/, '$1…$2') : '',
      connected: Boolean(config.gmail.refreshToken),
      email: settings.gmail?.email || null,
      connectedAt: settings.gmail?.connectedAt || null,
      query: config.gmail.query,
      lastPollAt: store.data.accounts.gmail?.lastPollAt || null,
      error: store.data.accounts.gmail?.error || null,
    });
  });

  r.put('/gmail/client', async (req, res) => {
    const clientId = String(req.body?.clientId || '').trim();
    const clientSecret = String(req.body?.clientSecret || '').trim();
    if (!/\.apps\.googleusercontent\.com$/.test(clientId)) return res.status(400).json({ error: 'Client ID should end with .apps.googleusercontent.com' });
    if (clientSecret.length < 10) return res.status(400).json({ error: 'Paste the client secret too' });
    config.gmail.clientId = clientId;
    config.gmail.clientSecret = clientSecret;
    config.gmail.refreshToken = '';
    resetGmail();
    await saveGmail({ ...settings.gmail, email: null, connectedAt: null });
    audit('gmail.client_saved', { actor: currentActor });
    res.json({ ok: true });
  });

  r.get('/gmail/connect', (req, res) => {
    if (!config.gmail.clientId) return res.redirect('/dashboard#/setup');
    const state = signData({ kind: 'gmail', n: crypto.randomBytes(8).toString('hex'), exp: Date.now() + 15 * 60_000 });
    const oauth = new google.auth.OAuth2(config.gmail.clientId, config.gmail.clientSecret, redirectUri(req));
    res.redirect(oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/userinfo.email'],
      state,
    }));
  });

  r.get('/gmail/callback', async (req, res) => {
    const back = (q) => res.redirect(`/dashboard#/setup?gmail=${encodeURIComponent(q)}`);
    const st = verifyData(req.query.state);
    if (!st) return back('error:Sign-in expired, try again');
    if (st.kind === 'chat') return chatCallback(req, res);
    if (req.query.error) return back(`error:${req.query.error}`);
    try {
      const oauth = new google.auth.OAuth2(config.gmail.clientId, config.gmail.clientSecret, redirectUri(req));
      const { tokens } = await oauth.getToken(String(req.query.code || ''));
      if (!tokens.refresh_token) return back('error:Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.');
      oauth.setCredentials(tokens);
      const profile = await google.gmail({ version: 'v1', auth: oauth }).users.getProfile({ userId: 'me' });
      config.gmail.refreshToken = tokens.refresh_token;
      resetGmail();
      store.data.meta.gmailAfter = Date.now() - 7 * 86_400_000; // look back a week on first read
      store.account('gmail').error = null;
      store.save();
      await saveGmail({ ...settings.gmail, email: profile.data.emailAddress, connectedAt: new Date().toISOString() });
      audit('gmail.connected', { actor: currentActor, target: profile.data.emailAddress });
      back('ok');
    } catch (e) {
      audit('gmail.connect_failed', { actor: currentActor, details: { error: errText(e) }, level: 'error' });
      back(`error:${errText(e)}`);
    }
  });

  r.put('/gmail/query', async (req, res) => {
    const q = String(req.body?.query || '').trim();
    if (q.length < 5) return res.status(400).json({ error: 'Query is too short' });
    config.gmail.query = q;
    await saveGmail({ ...settings.gmail, query: q });
    audit('gmail.query_updated', { actor: currentActor, details: { query: q } });
    res.json({ ok: true });
  });

  r.post('/gmail/test', async (_req, res) => {
    if (!config.gmail.refreshToken) return res.status(400).json({ error: 'Gmail is not connected yet' });
    try {
      res.json({ ok: true, ...(await previewGmail(tracker)) });
    } catch (e) {
      res.status(502).json({ error: errText(e) });
    }
  });

  r.delete('/gmail', async (_req, res) => {
    config.gmail.refreshToken = '';
    resetGmail();
    await saveGmail({ ...settings.gmail, email: null, connectedAt: null });
    audit('gmail.disconnected', { actor: currentActor, level: 'warn' });
    res.json({ ok: true });
  });

  // ── Google Chat: "post as me" (user OAuth, no Chat app install needed) ──
  r.get('/chat/user/connect', (req, res) => {
    if (!config.gmail.clientId) return res.redirect('/dashboard#/setup?chat=' + encodeURIComponent('error:Save the Google OAuth client first (Play email reader, step 1)'));
    const state = signData({ kind: 'chat', n: crypto.randomBytes(8).toString('hex'), exp: Date.now() + 15 * 60_000 });
    const oauth = new google.auth.OAuth2(config.gmail.clientId, config.gmail.clientSecret, redirectUri(req));
    res.redirect(oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      scope: ['https://www.googleapis.com/auth/chat.messages.create', 'https://www.googleapis.com/auth/chat.spaces.readonly', 'https://www.googleapis.com/auth/userinfo.email'],
      state,
    }));
  });

  async function chatCallback(req, res) {
    const back = (q) => res.redirect(`/dashboard#/setup?chat=${encodeURIComponent(q)}`);
    if (req.query.error) return back(`error:${req.query.error}`);
    try {
      const oauth = new google.auth.OAuth2(config.gmail.clientId, config.gmail.clientSecret, redirectUri(req));
      const { tokens } = await oauth.getToken(String(req.query.code || ''));
      if (!tokens.refresh_token) return back('error:Google did not return a refresh token. Remove app_review_bot at myaccount.google.com/permissions and sign in again.');
      oauth.setCredentials(tokens);
      const me = await google.oauth2({ version: 'v2', auth: oauth }).userinfo.get();
      const email = me.data.email;
      await db.upsert('settings', [{ key: 'chat_user', value: { email, connectedAt: new Date().toISOString() }, value_enc: encrypt(JSON.stringify({ refreshToken: tokens.refresh_token })) }], 'key', { returning: false });
      const o = new google.auth.OAuth2(config.gmail.clientId, config.gmail.clientSecret);
      o.setCredentials({ refresh_token: tokens.refresh_token });
      setChatUserAuth(o, email);
      settings.chatUser = { email };
      audit('chat.user_connected', { actor: currentActor, target: email });
      // A space was already chosen → say hello right away so the user sees it working.
      if (settings.chat?.mode !== 'app' && isSpaceTarget(config.chatSpaceLocked || settings.chat?.space)) {
        try {
          const tracked = Object.values(store.data.apps).filter((a) => !a.hidden).length;
          await sendToChat(botCard('👋 Hi! app_review_bot is connected.', [`I'll post every App Store, TestFlight and Google Play update for the <b>${tracked}</b> watched app${tracked === 1 ? '' : 's'} here — sent for review, in review, approved, live, or rejected (with the reason).`], { chatText: helloText(tracked, registry.list().length) }), { webhook: config.chatSpaceLocked || settings.chat.space, threadKey: 'app-review-bot-hello' });
          audit('chat.test_sent', { actor: currentActor, target: settings.chat.spaceName });
          return back('ok-sent');
        } catch (e) {
          audit('chat.test_failed', { actor: currentActor, target: settings.chat.spaceName, details: { error: errText(e) }, level: 'error' });
          return back(`error:Signed in, but posting to ${settings.chat.space} failed: ${errText(e)}`);
        }
      }
      back('ok');
    } catch (e) {
      audit('chat.user_connect_failed', { actor: currentActor, details: { error: errText(e) }, level: 'error' });
      back(`error:${errText(e)}`);
    }
  }

  // ── audit log ──
  r.get('/audit', async (req, res) => {
    const q = { order: 'at.desc', limit: Math.min(500, Number(req.query.limit) || 200) };
    if (req.query.level) q.level = `eq.${req.query.level}`;
    if (req.query.before) q.at = `lt.${req.query.before}`;
    res.json(await db.select('audit_log', q));
  });

  return r;
}
