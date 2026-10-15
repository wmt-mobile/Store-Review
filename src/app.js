import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, allAccounts, accountById, gmailEnabled, ROOT } from './config.js';
import { Store, memoryStore } from './store.js';
import { SupabaseStore, audit } from './db-store.js';
import { supabaseEnabled } from './supabase.js';
import { authEnabled, sessionFrom, setSession, clearSession, passwordLogin } from './auth.js';
import { AccountRegistry } from './accounts.js';
import { adminRouter, loadSettings } from './admin-api.js';
import { Tracker } from './tracker.js';
import { discoverAccount } from './discovery.js';
import { pollAppleAccount, pollAppleApp } from './apple/poller.js';
import { appleWebhookHandler } from './apple/webhook.js';
import { pollPlayAccount } from './google/play.js';
import { pollGmail, getEmail } from './google/gmail.js';
import { buildDashboard } from './dashboard/view.js';
import { buildDigest, digestDue } from './digest.js';
import { safeSend } from './chat.js';
import { loadDemoData, DEMO_EMAIL } from './demo.js';
import { waitUntil } from '@vercel/functions';
import { db } from './supabase.js';

// ── mode: demo | supabase | file ───────────────────────────
export const MODE = config.demoData ? 'demo' : supabaseEnabled() ? 'supabase' : 'file';
// On Vercel there is no long-running process: state is re-read per request and polling is
// driven by POST /api/cron/tick (called every minute by Supabase pg_cron).
export const SERVERLESS = Boolean(process.env.VERCEL);
let store;
let registry = null;
let settings = { bot: { onboarded: true }, prefs: {} };

if (MODE === 'demo') {
  store = memoryStore();
  loadDemoData(store);
} else if (MODE === 'supabase') {
  store = await new SupabaseStore().init();
  registry = new AccountRegistry();
  await registry.load();
  settings = await loadSettings(config, registry);
  config.apps = []; // overrides live in the apps table
} else {
  store = new Store();
}

let loadedAt = Date.now();
async function refreshState() {
  if (MODE !== 'supabase') return;
  await store.reload();
  await registry.load();
  const fresh = await loadSettings(config, registry);
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, fresh);
  loadedAt = Date.now();
}

const accounts = () =>
  MODE === 'demo' ? store.data.meta.demoAccounts : MODE === 'supabase' ? registry.list().filter((a) => !a.decryptError) : allAccounts();
const pollable = () => (MODE === 'supabase' ? registry.active() : MODE === 'file' ? allAccounts() : []);
const findAccount = (id) => accounts().find((a) => a.id === id) || (MODE === 'file' ? accountById(id) : undefined);

const tracker = new Tracker({
  store,
  accountById: findAccount,
  config,
  onEvent: (type, e) => {
    if (MODE !== 'supabase') return;
    if (type === 'error') audit('poll.error', { target: findAccount(e.accountId)?.name || e.accountId, details: { context: e.context, message: e.message }, level: 'error' });
    else if (type === 'store_message') audit('chat.store_message', { target: e.app?.name || 'Google Play Console', details: { subject: e.subject } });
    else if (type === 'status' && e.notify) audit('chat.notified', { target: e.app.name, details: { channel: e.channel, version: e.version, from: e.from, to: e.to } });
  },
});

// ── scheduling ─────────────────────────────────────────────
const running = new Set();
const lastRun = {};
async function once(name, fn) {
  if (running.has(name)) return;
  running.add(name);
  lastRun[name] = Date.now();
  try { await fn(); } finally { running.delete(name); }
}
const isRunning = (accountId) => running.has(`poll:${accountId}`);

async function discoverAndPoll(account) {
  try {
    const st = store.account(account.id);
    if (!st.lastDiscoveryAt || Date.now() - st.lastDiscoveryAt > config.discoveryMs) {
      const n = await discoverAccount(account, tracker, config);
      console.log(`[discovery:${account.name || account.id}] ${n} apps`);
    }
    const r = account.store === 'apple' ? await pollAppleAccount(account, tracker) : await pollPlayAccount(account, tracker);
    tracker.pollOk(account.id);
    tracker.markInitialized(account.id);
    console.log(`[poll:${account.name || account.id}] ${r.apps} apps${r.failed ? `, ${r.failed} failed` : ''}`);
  } catch (e) {
    await tracker.reportError(account.id, e, 'poll');
  }
}
const runPoll = (a) => {
  const p = once(`poll:${a.id}`, () => discoverAndPoll(a)).catch((e) => console.error('[poll]', e.message));
  if (SERVERLESS) waitUntil(p.then(() => store.flush()));
  return p;
};

async function pollGmailOnce() {
  try {
    const r = await pollGmail(tracker);
    store.account('gmail').lastPollAt = Date.now();
    store.account('gmail').error = null;
    store.save();
    if (r.processed) console.log(`[gmail] ${r.processed}/${r.scanned} emails applied`);
  } catch (e) {
    await tracker.reportError('gmail', e, 'Gmail read');
  }
}

/** One scheduling round: poll every account/inbox that is due. Used by the local timer and the cron endpoint. */
export async function tickOnce({ force = false } = {}) {
  const now = Date.now();
  const due = (last, every) => force || !last || now - last >= every - 15_000;
  const jobs = [];
  const ran = [];
  for (const a of pollable()) {
    const every = a.store === 'apple' ? config.applePollMs : config.playPollMs;
    const last = SERVERLESS ? store.data.accounts[a.id]?.lastPollAt : lastRun[`poll:${a.id}`];
    if (due(last, every)) { jobs.push(once(`poll:${a.id}`, () => discoverAndPoll(a))); ran.push(a.name + ' · ' + a.store); }
  }
  if (gmailEnabled() && pollable().some((a) => a.store === 'google')) {
    const last = SERVERLESS ? store.data.accounts.gmail?.lastPollAt : lastRun.gmail;
    if (due(last, config.gmailPollMs)) { jobs.push(once('gmail', pollGmailOnce)); ran.push('gmail'); }
  }
  await Promise.allSettled(jobs);
  return ran;
}

function startSchedulers() {
  if (MODE === 'demo') return console.log('[demo] schedulers disabled (DEMO_DATA=true)');
  if (MODE === 'file' && config.missing) console.warn(`[config] ${config.file} not found — copy config/apps.example.json or set SUPABASE_URL`);
  const tick = () => tickOnce().catch((e) => console.error('[tick]', e.message));
  tick();
  setInterval(tick, 10_000);
  setInterval(async () => {
    if (!config.digestEnabled || !pollable().length) return;
    const day = digestDue(store.data.meta, { tz: config.tz, digestTime: config.digestTime });
    if (!day) return;
    store.data.meta.lastDigestDate = day;
    store.save();
    await safeSend(buildDigest(store, accounts(), config));
    if (MODE === 'supabase') audit('chat.digest_sent', { target: 'app_review_bot' });
  }, 60_000);
  setInterval(() => store.pruneSeen(), 86_400_000);
}

// ── HTTP ───────────────────────────────────────────────────
export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

if (SERVERLESS && MODE === 'supabase') {
  app.use(async (req, res, next) => {
    if (req.path === '/health' || req.path === '/login' || req.path.startsWith('/api/cron/')) return next();
    try {
      if (Date.now() - loadedAt > 3000) await refreshState();
    } catch (e) {
      return next(e);
    }
    // make sure in-memory changes reach Postgres before the function is frozen
    for (const m of ['json', 'send', 'redirect']) {
      const orig = res[m].bind(res);
      res[m] = (...args) => {
        if (res._flushing) return orig(...args);
        res._flushing = true;
        store.flush().finally(() => orig(...args));
        return res;
      };
    }
    next();
  });
}

const safeEq = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
const cookieToken = (req) => (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith('srn_dash='))?.slice(9);

const page = (f) => path.join(ROOT, 'src/dashboard', f);
const useLogin = () => MODE === 'supabase' && authEnabled();

function requireDashboard(req, res, next) {
  const isApi = req.originalUrl.startsWith('/api');
  if (useLogin()) {
    const sess = sessionFrom(req);
    if (sess) { req.user = { email: sess.email }; return next(); }
    if (isApi) return res.status(401).json({ error: 'unauthorized', login: '/login' });
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  // demo / file mode: optional shared token (legacy)
  const expected = config.dashboardToken;
  if (!expected) return next();
  const given = req.query.token || req.get('x-dashboard-token') || decodeURIComponent(cookieToken(req) || '');
  if (!safeEq(given, expected)) return isApi ? res.status(401).json({ error: 'unauthorized' }) : res.status(401).send('Unauthorized');
  if (req.query.token) {
    res.setHeader('Set-Cookie', `srn_dash=${encodeURIComponent(given)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${90 * 86400}${req.secure ? '; Secure' : ''}`);
    if (!isApi) return res.redirect(req.path);
  }
  next();
}

// ── login ──
app.get('/login', (req, res) => {
  if (!useLogin()) return res.redirect('/dashboard');
  if (sessionFrom(req)) return res.redirect(safeNext(req.query.next));
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(fs.readFileSync(page('login.html'), 'utf8'));
});
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/dashboard');
app.post('/api/auth/login', express.json({ limit: '8kb' }), async (req, res) => {
  if (!useLogin()) return res.json({ ok: true, next: '/dashboard' });
  const r = await passwordLogin(req.body?.email, req.body?.password, req.ip);
  if (!r.ok) {
    if (MODE === 'supabase') audit('auth.login_failed', { actor: String(req.body?.email || '').slice(0, 120) || 'unknown', details: { ip: req.ip }, level: 'warn' });
    return res.status(401).json(r);
  }
  setSession(res, req, r.email);
  audit('auth.login', { actor: r.email, details: { ip: req.ip } });
  res.json({ ok: true, next: safeNext(req.body?.next) });
});
app.post('/api/auth/logout', (req, res) => {
  const s = sessionFrom(req);
  clearSession(res);
  if (s && MODE === 'supabase') audit('auth.logout', { actor: s.email });
  res.json({ ok: true });
});
app.get('/api/auth/me', requireDashboard, (req, res) => res.json({ email: req.user?.email || null, login: useLogin() }));

app.get('/health', (_req, res) => res.json({ ok: true, mode: MODE, uptime: process.uptime() }));

app.get('/status', (req, res) => {
  if (!safeEq(req.query.token, config.statusToken)) return res.status(401).json({ error: 'unauthorized' });
  res.json(buildDashboard(store.data, accounts(), { stuckHours: config.stuckHours }));
});

const needsOnboarding = () => MODE === 'supabase' && (!registry.list().length || !settings.bot?.onboarded);

app.get('/', (_req, res) => res.redirect('/dashboard'));
app.get('/dashboard', requireDashboard, (_req, res) => {
  if (needsOnboarding()) return res.redirect('/onboarding');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(fs.readFileSync(page('page.html'), 'utf8'));
});
app.get('/onboarding', requireDashboard, (_req, res) => {
  if (MODE !== 'supabase') return res.redirect('/dashboard');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(fs.readFileSync(page('onboarding.html'), 'utf8'));
});

app.get('/api/dashboard', requireDashboard, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...buildDashboard(store.data, accounts(), { stuckHours: config.stuckHours }),
    tz: config.tz,
    demo: MODE === 'demo',
    mode: MODE,
    admin: MODE === 'supabase',
    user: req.user?.email || null,
    gmail: { enabled: MODE === 'demo' || gmailEnabled(), lastPollAt: store.data.accounts.gmail?.lastPollAt || null, error: store.data.accounts.gmail?.error || null },
  });
});
// Full Play Console email behind a status (dashboard → "View email"). Only emails the bot linked to an app.
app.get('/api/email/:id', requireDashboard, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.params.id || '');
  if (MODE === 'demo') return id === DEMO_EMAIL.id ? res.json(DEMO_EMAIL) : res.status(404).json({ error: 'not found' });
  const linked = Object.values(store.data.channels || {}).some((chs) => Object.values(chs || {}).some((c) => c?.extra?.messageId === id));
  if (!/^[0-9a-f]{8,32}$/i.test(id) || !linked) return res.status(404).json({ error: 'not found' });
  if (!gmailEnabled()) return res.status(409).json({ error: 'Gmail is not connected' });
  try {
    res.json(await getEmail(id));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.post('/api/refresh', requireDashboard, (_req, res) => {
  if (MODE === 'demo') return res.json({ ok: true, demo: true });
  for (const a of pollable()) runPoll(a);
  if (MODE === 'supabase') audit('poll.manual', { actor: _req.user?.email || 'admin', target: 'all accounts' });
  res.json({ ok: true });
});

// Called every minute by Supabase pg_cron (net.http_post). Bearer CRON_SECRET.
app.all('/api/cron/tick', async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  const given = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || !safeEq(given, secret)) return res.status(401).json({ error: 'unauthorized' });
  if (MODE !== 'supabase') return res.json({ ok: true, skipped: MODE });
  const t0 = Date.now();
  // single-flight across instances: a 55 s lease in the settings table
  const until = Date.now() + 55_000;
  await db.insert('settings', [{ key: 'cron_lock', value: { until: 0 } }], { returning: false, ignoreDuplicates: true, onConflict: 'key' }).catch(() => {});
  const got = await db.update('settings', { key: 'eq.cron_lock', 'value->>until': `lt.${Date.now()}` }, { value: { until } }).catch(() => []);
  if (!got.length) return res.json({ ok: true, skipped: 'another tick is running' });
  try {
    await refreshState();
    const ran = await tickOnce({ force: req.query.force === '1' });
    await store.flush();
    res.json({ ok: true, ran, ms: Date.now() - t0 });
  } catch (e) {
    console.error('[cron]', e);
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    await db.update('settings', { key: 'eq.cron_lock' }, { value: { until: 0 } }).catch(() => {});
  }
});

if (MODE === 'supabase') {
  app.use('/api/admin', requireDashboard, adminRouter({ config, store, registry, tracker, settings, runPoll, gmailEnabled, isRunning }));
}

app.post(
  '/apple/webhook/:accountId',
  express.raw({ type: '*/*', limit: '1mb' }),
  appleWebhookHandler({
    accountById: findAccount,
    poke: async (account, appId) => {
      if (appId) {
        await new Promise((r) => setTimeout(r, 3000)); // let ASC settle
        await once(`apple-app:${appId}`, () => pollAppleApp(account, tracker, appId));
      } else await runPoll(account);
    },
  })
);

export function startLocal() {
  const server = app.listen(config.port, config.host, () => {
    const base = `http://localhost:${config.port}`;
    console.log(`Review Radar (${MODE} mode) on :${config.port}`);
    const path_ = needsOnboarding() ? 'onboarding' : 'dashboard';
    console.log(`  → ${base}/${useLogin() ? 'login' : path_}  (${useLogin() ? 'email + password login' : 'no login'}; listening on ${config.host})`);
    if (process.env.NO_SCHEDULER === 'true') console.log('  scheduler off (NO_SCHEDULER=true) — polling is done by the cron endpoint');
    else startSchedulers();
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      await store.flush();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    });
  }
  return server;
}

export default app;
