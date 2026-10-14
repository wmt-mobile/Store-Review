// Supabase-backed store. Keeps the same in-memory `data` shape the Tracker uses,
// loads it from Postgres at boot and writes changed rows back (debounced diff sync).
import { db } from './supabase.js';
import { decrypt } from './crypto.js';

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
const ms = (s) => (s ? Date.parse(s) : null);
const EMPTY = () => ({ version: 1, initialized: {}, apps: {}, channels: {}, history: {}, seen: {}, accounts: {}, threads: {}, meta: {} });
const HISTORY_MAX = 50;

async function selectAll(table, query = {}, max = 20000) {
  const out = [];
  for (let offset = 0; offset < max; offset += 1000) {
    const page = await db.select(table, { ...query, limit: 1000, offset });
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

export class SupabaseStore {
  constructor() {
    this.data = EMPTY();
    this.appUuid = {}; // appKey -> uuid
    this.keyByUuid = {}; // uuid -> appKey
    this.snap = { accounts: {}, apps: {}, channels: {}, runtime: '' };
    this.syncedEvents = new WeakSet();
    this.syncedSeen = new Set();
    this._timer = null;
    this._syncing = null;
    this._again = false;
  }

  /** Re-read everything from Postgres into this same instance (serverless: fresh state per request). */
  async reload() {
    clearTimeout(this._timer);
    if (this._syncing) await this._syncing.catch(() => {});
    this.data = EMPTY();
    this.appUuid = {};
    this.keyByUuid = {};
    this.snap = { accounts: {}, apps: {}, channels: {}, runtime: '' };
    this.syncedEvents = new WeakSet();
    this.syncedSeen = new Set();
    return this.init();
  }

  async init() {
    const d = this.data;
    const [accounts, apps, channels, events, seen, runtime] = await Promise.all([
      db.select('accounts'),
      selectAll('apps'),
      selectAll('channel_states'),
      selectAll('status_events', { order: 'at.desc', at: `gte.${iso(Date.now() - 120 * 86_400_000)}` }),
      selectAll('seen_events', { select: 'event_id', seen_at: `gte.${iso(Date.now() - 60 * 86_400_000)}` }),
      db.select('settings', { key: 'eq.runtime' }),
    ]);
    for (const a of accounts) this.applyAccountRow(a);
    for (const r of apps) this.applyAppRow(r);
    for (const c of channels) {
      const key = this.keyByUuid[c.app_id];
      if (!key) continue;
      (d.channels[key] ||= {})[c.channel] = {
        version: c.version || '',
        status: c.status,
        since: ms(c.since),
        submittedAt: ms(c.submitted_at),
        reviewMs: c.review_ms != null ? Number(c.review_ms) : null,
        reason: c.reason,
        extra: c.extra || {},
      };
    }
    for (const e of events) {
      const key = this.keyByUuid[e.app_id];
      if (!key) continue;
      const list = (d.history[key] ||= []);
      if (list.length >= HISTORY_MAX) continue;
      const h = { at: ms(e.at), channel: e.channel, version: e.version || '', from: e.from_status, to: e.to_status, reason: e.reason };
      this.syncedEvents.add(h);
      list.push(h);
    }
    for (const s of seen) {
      d.seen[s.event_id] = Date.now();
      this.syncedSeen.add(s.event_id);
    }
    const rt = runtime[0]?.value || {};
    d.meta = rt.meta || {};
    d.threads = rt.threads || {};
    if (rt.gmail) d.accounts.gmail = rt.gmail;
    this.takeSnapshot();
    return this;
  }

  applyAccountRow(a) {
    this.data.accounts[a.id] = {
      ...this.data.accounts[a.id],
      lastPollAt: ms(a.last_poll_at),
      lastDiscoveryAt: ms(a.last_discovery_at),
      error: a.error,
      errorAt: ms(a.error_at),
      lastAlertAt: ms(a.last_alert_at),
      discoveryWarning: a.discovery_warning,
    };
    if (a.initialized_at) this.data.initialized[a.id] = ms(a.initialized_at);
  }

  applyAppRow(r) {
    const key = `${r.store}:${r.account_id}:${r.store_app_id}`;
    this.appUuid[key] = r.id;
    this.keyByUuid[r.id] = key;
    let chatWebhook;
    try { chatWebhook = decrypt(r.chat_webhook_enc) || undefined; } catch { chatWebhook = undefined; }
    this.data.apps[key] = {
      ...this.data.apps[key],
      key,
      uuid: r.id,
      store: r.store,
      accountId: r.account_id,
      appId: r.store_app_id,
      bundleOrPackage: r.bundle_id || r.store_app_id,
      storeName: r.name,
      name: r.display_name || r.name,
      displayName: r.display_name || null,
      iconUrl: r.icon_url || undefined,
      playAppId: r.play_app_id || undefined,
      platform: r.store === 'apple' ? 'ios' : 'android',
      hidden: !r.tracked,
      muted: !r.notify,
      chatWebhook,
      discoveredAt: ms(r.discovered_at),
      lastSeenAt: ms(r.last_seen_at),
    };
    return key;
  }

  /** Overrides used by Tracker.registerApp so admin choices survive re-discovery. */
  overrides() {
    return Object.values(this.data.apps).map((a) => ({
      store: a.store,
      account: a.accountId,
      appId: a.appId,
      name: a.displayName || undefined,
      hidden: a.hidden,
      muted: a.muted,
      chatWebhook: a.chatWebhook,
    }));
  }

  // ── Store interface used by Tracker ──
  account(id) {
    return (this.data.accounts[id] ||= {});
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.sync().catch((e) => console.error('[db] sync failed:', e.message)), 800);
  }

  async flush() {
    clearTimeout(this._timer);
    await this.sync().catch((e) => console.error('[db] final sync failed:', e.message));
  }

  pruneSeen(maxAgeMs = 60 * 86_400_000) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [k, ts] of Object.entries(this.data.seen)) if (ts < cutoff) delete this.data.seen[k];
    db.delete('seen_events', { seen_at: `lt.${iso(cutoff)}` }).catch(() => {});
  }

  removeAccount(id) {
    const d = this.data;
    for (const [key, app] of Object.entries(d.apps)) {
      if (app.accountId !== id) continue;
      delete d.apps[key];
      delete d.channels[key];
      delete d.history[key];
      delete this.snap.apps[key];
      delete this.snap.channels[key];
      delete this.keyByUuid[this.appUuid[key]];
      delete this.appUuid[key];
    }
    delete d.accounts[id];
    delete d.initialized[id];
    delete this.snap.accounts[id];
  }

  // ── diff sync ──
  accountPatch(id) {
    const a = this.data.accounts[id] || {};
    return {
      last_poll_at: iso(a.lastPollAt),
      last_discovery_at: iso(a.lastDiscoveryAt),
      error: a.error || null,
      error_at: iso(a.errorAt),
      last_alert_at: iso(a.lastAlertAt),
      discovery_warning: a.discoveryWarning || null,
      initialized_at: iso(this.data.initialized[id]),
      app_count: Object.values(this.data.apps).filter((x) => x.accountId === id).length,
    };
  }

  appRow(a) {
    return {
      account_id: a.accountId,
      store: a.store,
      store_app_id: a.appId,
      bundle_id: a.bundleOrPackage || null,
      name: a.storeName || a.name,
      icon_url: a.iconUrl || null,
      play_app_id: a.playAppId || null,
      discovered_at: iso(a.discoveredAt || Date.now()),
      last_seen_at: iso(a.lastSeenAt || Date.now()),
    };
  }

  runtimeValue() {
    return { meta: this.data.meta, threads: this.data.threads, gmail: this.data.accounts.gmail || null };
  }

  takeSnapshot() {
    for (const id of Object.keys(this.data.accounts)) if (id !== 'gmail') this.snap.accounts[id] = JSON.stringify(this.accountPatch(id));
    for (const [k, a] of Object.entries(this.data.apps)) this.snap.apps[k] = JSON.stringify(this.appRow(a));
    for (const [k, ch] of Object.entries(this.data.channels)) this.snap.channels[k] = JSON.stringify(ch);
    this.snap.runtime = JSON.stringify(this.runtimeValue());
  }

  async sync() {
    if (this._syncing) {
      this._again = true;
      return this._syncing;
    }
    this._syncing = this._sync().finally(() => {
      this._syncing = null;
      if (this._again) {
        this._again = false;
        this.save();
      }
    });
    return this._syncing;
  }

  async _sync() {
    const d = this.data;
    // 1) apps (need uuids before channels / events)
    const dirtyApps = Object.entries(d.apps).filter(([k, a]) => JSON.stringify(this.appRow(a)) !== this.snap.apps[k]);
    if (dirtyApps.length) {
      const rows = await db.upsert('apps', dirtyApps.map(([, a]) => this.appRow(a)), 'account_id,store_app_id');
      for (const r of rows) {
        const key = `${r.store}:${r.account_id}:${r.store_app_id}`;
        this.appUuid[key] = r.id;
        this.keyByUuid[r.id] = key;
        if (d.apps[key]) d.apps[key].uuid = r.id;
      }
      for (const [k, a] of dirtyApps) this.snap.apps[k] = JSON.stringify(this.appRow(a));
    }

    // 2) accounts runtime state
    for (const id of Object.keys(d.accounts)) {
      if (id === 'gmail') continue;
      const patch = this.accountPatch(id);
      const s = JSON.stringify(patch);
      if (s === this.snap.accounts[id]) continue;
      await db.update('accounts', { id: `eq.${id}` }, patch).catch((e) => console.warn('[db] account', id, e.message));
      this.snap.accounts[id] = s;
    }

    // 3) channel states
    const chRows = [];
    const chKeys = [];
    for (const [key, chans] of Object.entries(d.channels)) {
      const s = JSON.stringify(chans);
      if (s === this.snap.channels[key] || !this.appUuid[key]) continue;
      chKeys.push([key, s]);
      for (const [channel, c] of Object.entries(chans)) {
        chRows.push({
          app_id: this.appUuid[key],
          channel,
          version: c.version || '',
          status: c.status,
          since: iso(c.since) || iso(Date.now()),
          submitted_at: iso(c.submittedAt),
          review_ms: c.reviewMs ?? null,
          reason: c.reason || null,
          extra: c.extra || {},
        });
      }
    }
    if (chRows.length) {
      await db.upsert('channel_states', chRows, 'app_id,channel', { returning: false });
      for (const [k, s] of chKeys) this.snap.channels[k] = s;
    }

    // 4) history → status_events (append-only)
    const evRows = [];
    const evObjs = [];
    for (const [key, list] of Object.entries(d.history)) {
      if (!this.appUuid[key]) continue;
      for (const h of list) {
        if (this.syncedEvents.has(h)) continue;
        evObjs.push(h);
        evRows.push({
          app_id: this.appUuid[key],
          channel: h.channel,
          version: h.version || '',
          from_status: h.from,
          to_status: h.to,
          reason: h.reason || null,
          at: iso(h.at),
          event_key: `${key}|${h.channel}|${h.at}|${h.to}`,
        });
      }
    }
    if (evRows.length) {
      await db.insert('status_events', evRows, { returning: false, ignoreDuplicates: true, onConflict: 'event_key' });
      evObjs.forEach((h) => this.syncedEvents.add(h));
    }

    // 5) seen ids
    const newSeen = Object.keys(d.seen).filter((k) => !this.syncedSeen.has(k));
    if (newSeen.length) {
      await db.insert('seen_events', newSeen.map((event_id) => ({ event_id })), { returning: false, ignoreDuplicates: true, onConflict: 'event_id' });
      newSeen.forEach((k) => this.syncedSeen.add(k));
    }

    // 6) runtime (gmail cursor, digest date, chat threads)
    const rt = JSON.stringify(this.runtimeValue());
    if (rt !== this.snap.runtime) {
      await db.upsert('settings', [{ key: 'runtime', value: this.runtimeValue() }], 'key', { returning: false });
      this.snap.runtime = rt;
    }
  }
}

/** Fire-and-forget audit entry. */
export function audit(action, { target = null, details = {}, level = 'info', actor = 'system' } = {}) {
  db.insert('audit_log', [{ action, target, details, level, actor }], { returning: false }).catch((e) =>
    console.warn('[audit] failed:', e.message)
  );
}
