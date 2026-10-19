// /api/ui: endpoints the React UI needs on top of /api/dashboard.
// - Mark an attention item resolved / snooze a stuck-review alert (stored in runtime meta)
// - Per-user notification preferences + browser push subscriptions
import express from 'express';
import { audit } from './db-store.js';
import { PushStore, pushEnabled, vapidPublicKey, sendPush, normPrefs } from './push.js';

const KEY_RE = /^(apple|google):[\w.-]+:[\w.-]+\|[\w-]+\|[\w .()-]{0,60}$/;

export function uiRouter({ store, mode, pushStore = new PushStore(mode) }) {
  const r = express.Router();
  r.use(express.json({ limit: '64kb' }));
  const actor = (req) => req.user?.email || (mode === 'demo' ? 'demo@reviewradar.app' : 'admin');
  const log = (...a) => (mode === 'supabase' ? audit(...a) : undefined);
  const meta = () => store.data.meta;

  /** key = `${appKey}|${channel}|${rawVersion}` */
  function checkKey(req, res) {
    const key = String(req.body?.key || req.query.key || '');
    if (!KEY_RE.test(key)) {
      res.status(400).json({ error: 'invalid key' });
      return null;
    }
    const [appKey, channel] = key.split('|');
    const app = store.data.apps[appKey];
    if (!app) {
      res.status(404).json({ error: 'unknown app' });
      return null;
    }
    return { key, app, channel };
  }

  r.post('/resolve', (req, res) => {
    const k = checkKey(req, res);
    if (!k) return;
    const note = String(req.body?.note || '').slice(0, 200);
    const ch = store.data.channels[k.app.key]?.[k.channel];
    (meta().resolved ||= {})[k.key] = { at: Date.now(), by: actor(req), note: note || ch?.extra?.ai?.title || ch?.reason?.split('\n')[0]?.slice(0, 120) || '', appName: k.app.name, store: k.app.store, version: k.key.split('|')[2] };
    // keep the list short
    const entries = Object.entries(meta().resolved).sort((a, b) => b[1].at - a[1].at).slice(0, 50);
    meta().resolved = Object.fromEntries(entries);
    store.save();
    log('attention.resolved', { actor: actor(req), target: k.app.name, details: { key: k.key } });
    res.json({ ok: true, resolved: meta().resolved });
  });

  r.delete('/resolve', (req, res) => {
    const k = checkKey(req, res);
    if (!k) return;
    delete meta().resolved?.[k.key];
    store.save();
    log('attention.reopened', { actor: actor(req), target: k.app.name, details: { key: k.key } });
    res.json({ ok: true, resolved: meta().resolved || {} });
  });

  r.post('/snooze', (req, res) => {
    const k = checkKey(req, res);
    if (!k) return;
    const hours = Math.max(1, Math.min(168, Number(req.body?.hours) || 12));
    (meta().snoozed ||= {})[k.key] = Date.now() + hours * 3_600_000;
    for (const [key, until] of Object.entries(meta().snoozed)) if (until < Date.now()) delete meta().snoozed[key];
    store.save();
    log('attention.snoozed', { actor: actor(req), target: k.app.name, details: { key: k.key, hours } });
    res.json({ ok: true, until: meta().snoozed[k.key] });
  });

  // ── notifications ──
  r.get('/notify', async (req, res) => {
    const prefs = await pushStore.prefs(actor(req));
    const subs = (await pushStore.subs()).filter((s) => s.email === actor(req)).map((s) => ({ endpoint: s.endpoint, ua: s.ua, at: s.at }));
    res.json({ prefs, push: { enabled: pushEnabled(), publicKey: vapidPublicKey() || null }, subscriptions: subs });
  });

  r.put('/notify', async (req, res) => {
    const cur = await pushStore.prefs(actor(req));
    const next = normPrefs({ ...cur, ...req.body, lastReadAt: req.body?.lastReadAt ?? cur.lastReadAt });
    res.json({ ok: true, prefs: await pushStore.savePrefs(actor(req), next) });
  });

  r.post('/notify/read', async (req, res) => {
    const cur = await pushStore.prefs(actor(req));
    const at = Math.min(Date.now(), Number(req.body?.at) || Date.now());
    res.json({ ok: true, prefs: await pushStore.savePrefs(actor(req), { ...cur, lastReadAt: Math.max(cur.lastReadAt, at) }) });
  });

  r.post('/push/subscribe', async (req, res) => {
    if (!pushEnabled()) return res.status(409).json({ error: 'Browser push is not configured on the server (VAPID keys missing)' });
    try {
      await pushStore.addSub(actor(req), req.body?.subscription, req.get('user-agent'));
      log('push.subscribed', { actor: actor(req), details: { ua: String(req.get('user-agent') || '').slice(0, 120) } });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  r.post('/push/unsubscribe', async (req, res) => {
    const endpoint = String(req.body?.endpoint || '');
    const mine = (await pushStore.subs()).some((s) => s.endpoint === endpoint && s.email === actor(req));
    if (mine) await pushStore.removeSub(endpoint);
    res.json({ ok: true });
  });

  r.post('/push/test', async (req, res) => {
    if (!pushEnabled()) return res.status(409).json({ error: 'Browser push is not configured on the server' });
    const subs = (await pushStore.subs()).filter((s) => s.email === actor(req));
    if (!subs.length) return res.status(409).json({ error: 'Turn on browser notifications first' });
    const one = new PushStore('memory');
    one.mem.subs = subs;
    const r2 = await sendPush(one, { event: 'test', title: 'Telfon approved', body: 'Android 1.3.80 (193) is ready to publish on Google Play · review took 6h 40m (test)', url: '/dashboard' });
    res.json({ ok: true, ...r2 });
  });

  return r;
}
