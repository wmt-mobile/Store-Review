// Change detection, de-dupe, review duration and error alerts.
// Every source (Apple poll, Apple webhook poke, Play poll, Gmail) funnels through update().
import { describe, isPending, isTerminal, RELEASE_CHANNELS } from './status-map.js';
import { statusCard, safeSend } from './chat.js';
import { consoleLinks } from './links.js';
import { appKeyOf, errText } from './util.js';

// Only public release channels post to Chat: App Store + Google Play production.
export const NOTIFY_CHANNELS = RELEASE_CHANNELS;
// Drafts / internal-only states aren't store updates.
const SILENT_CATEGORIES = new Set(['draft', 'testing', 'none']);

const HISTORY_MAX = 50;


export class Tracker {
  /**
   * @param {object} deps
   * @param {import('./store.js').Store} deps.store
   * @param {(id:string)=>object} deps.accountById
   * @param {object} deps.config  { silentFirstRun, chatWebhook, apps: overrides[] }
   * @param {Function} [deps.send] (message, {webhook, threadKey}) => Promise
   */
  constructor({ store, accountById, config, send = safeSend, onEvent = () => {} }) {
    this.onEvent = onEvent;
    this.store = store;
    this.accountById = accountById;
    this.config = config;
    this.send = send;
  }

  get d() {
    return this.store.data;
  }

  override(app) {
    return (this.config.apps || []).find(
      (o) => o.store === app.store && (!o.account || o.account === app.accountId) && (o.appId === app.appId || o.packageName === app.appId)
    );
  }

  /** Register/refresh a discovered app. Returns the appKey. */
  registerApp({ store, accountId, appId, bundleOrPackage, name, iconUrl, playAppId, platform }) {
    const key = appKeyOf(store, accountId, appId);
    const prev = this.d.apps[key];
    const ov = this.override({ store, accountId, appId });
    this.d.apps[key] = {
      ...prev,
      key,
      store,
      accountId,
      appId,
      bundleOrPackage: bundleOrPackage || prev?.bundleOrPackage || appId,
      storeName: name || prev?.storeName || prev?.name || bundleOrPackage || appId,
      name: ov?.name || prev?.displayName || name || prev?.name || bundleOrPackage || appId,
      iconUrl: iconUrl || prev?.iconUrl,
      playAppId: playAppId || prev?.playAppId,
      platform: platform || prev?.platform,
      hidden: ov ? Boolean(ov.hidden) : Boolean(prev?.hidden),
      muted: ov ? Boolean(ov.muted) : Boolean(prev?.muted),
      chatWebhook: ov?.chatWebhook || prev?.chatWebhook,
      discoveredAt: prev?.discoveredAt || Date.now(),
      lastSeenAt: Date.now(),
    };
    this.store.save();
    return key;
  }

  findAppByPackage(packageName) {
    return Object.values(this.d.apps).find((a) => a.store === 'google' && a.appId === packageName);
  }

  isInitialized(accountId) {
    return !this.config.silentFirstRun || Boolean(this.d.initialized[accountId]);
  }

  markInitialized(accountId) {
    if (!this.d.initialized[accountId]) {
      this.d.initialized[accountId] = Date.now();
      this.store.save();
    }
  }

  /**
   * Record an observed status for one app channel.
   * @returns {Promise<{changed:boolean, notified:boolean}>}
   */
  async update(appKey, channel, { version, status, submittedAt, reason, at = Date.now(), eventId, extra } = {}) {
    const app = this.d.apps[appKey];
    if (!app) {
      // App list was reloaded mid-poll (e.g. a just-discovered app not saved yet). Skip; the next tick catches it.
      console.warn(`[tracker] skipped update for unknown app ${appKey}`);
      return { changed: false, notified: false, unknown: true };
    }
    if (eventId) {
      if (this.d.seen[eventId]) return { changed: false, notified: false, duplicate: true };
      this.d.seen[eventId] = Date.now();
    }

    const chans = (this.d.channels[appKey] ||= {});
    const prev = chans[channel];
    const sameState = prev && prev.status === status && (prev.version || '') === (version || '');
    if (sameState) {
      // refresh non-identity fields silently (reason may arrive later, submittedAt from API)
      let dirty = false;
      if (reason && !prev.reason) { prev.reason = reason; dirty = true; }
      if (submittedAt && !prev.submittedAt && isPending(describe(app.store, channel, status).category)) { prev.submittedAt = submittedAt; dirty = true; }
      if (extra) { prev.extra = { ...prev.extra, ...extra }; dirty = true; }
      if (dirty) this.store.save();
      return { changed: false, notified: false };
    }

    const to = describe(app.store, channel, status);
    const from = prev ? describe(app.store, channel, prev.status) : null;
    const versionChanged = prev && (prev.version || '') !== (version || '');

    // submittedAt: start the clock when a review cycle begins, keep it through to the result
    let subAt = null;
    if (isPending(to.category)) {
      subAt = submittedAt || (!versionChanged && prev?.submittedAt && isPending(from?.category) ? prev.submittedAt : null) || at;
    } else if (isTerminal(to.category) || to.category === 'action') {
      subAt = !versionChanged ? prev?.submittedAt || submittedAt || null : submittedAt || null;
    }

    chans[channel] = {
      version: version || '',
      status,
      since: at,
      submittedAt: subAt,
      reviewMs: subAt && isTerminal(to.category) ? at - subAt : null,
      reason: reason || ((to.category === 'rejected' || to.category === 'action') && !versionChanged ? prev?.reason : null) || null,
      extra: extra || undefined,
    };

    const hist = (this.d.history[appKey] ||= []);
    hist.unshift({ at, channel, version: version || '', from: prev?.status || null, to: status, reason: reason || null });
    if (hist.length > HISTORY_MAX) hist.length = HISTORY_MAX;

    // notify?
    let notify = this.isInitialized(app.accountId);
    if (notify && !prev) {
      // First time we see this channel. Post it, unless it's a brand-new app that is simply already live.
      const brandNewApp = Object.keys(chans).length === 1;
      notify = to.category !== 'none' && !(brandNewApp && to.category === 'live');
    }
    if (notify && from && from.category === to.category && from.label === to.label && !versionChanged) notify = false;
    if (app.hidden || app.muted) notify = false;
    if (!NOTIFY_CHANNELS.has(channel) || SILENT_CATEGORIES.has(to.category)) notify = false;
    // Onboarding step 3 "Post these events" (prefs.chatEvents); every event posts unless switched off.
    const evKey = { submitted: 'submitted', in_review: 'in_review', approved: 'approved', live: 'live', rejected: 'rejected', action: 'rejected', removed: 'rejected' }[to.category];
    if (notify && evKey && this.config.chatEvents?.[evKey] === false) notify = false;

    this.store.save();
    this.onEvent('status', { app, channel, version, from: prev?.status || null, to: status, reason: reason || null, notify });
    if (!notify) return { changed: true, notified: false };

    const account = this.accountById(app.accountId);
    const threadKey = this.threadFor(appKey, version);
    const card = statusCard({
      app,
      account,
      channel,
      version,
      extra: { ...prev?.extra, ...extra },
      from: versionChanged ? null : from,
      to,
      at,
      submittedAt: subAt,
      reason: chans[channel].reason,
      links: [...consoleLinks(app, account, channel), ...(extra?.emailUrl ? [{ text: 'Open email', url: extra.emailUrl }] : [])],
    });
    const target = { webhook: app.chatWebhook || this.config.chatWebhook, threadKey };
    if (isQuiet(this.config, at) && !['rejected', 'action', 'removed'].includes(to.category)) {
      // Quiet hours: hold non-critical posts, sent in order once the window ends (flushHeld).
      (this.d.meta.held ||= []).push({ card, target, at });
      this.store.save();
      return { changed: true, notified: false, held: true };
    }
    await this.send(card, target);
    return { changed: true, notified: true };
  }

  /** Post messages held during quiet hours (oldest first). */
  async flushHeld(now = Date.now()) {
    const held = this.d.meta.held || [];
    if (!held.length || isQuiet(this.config, now)) return 0;
    let sent = 0;
    while (held.length) {
      const h = held[0];
      await this.send(h.card, h.target);
      held.shift();
      sent++;
      this.store.save();
    }
    return sent;
  }

  /** A store email we couldn't map to a status. Chat only gets release status messages, so this is just recorded. */
  async notifyStoreMessage({ app, subject }) {
    this.onEvent('store_message', { app, subject });
    return false;
  }


  threadFor(appKey, version) {
    const k = `${appKey}:${version || 'noversion'}`;
    return (this.d.threads[k] ||= k.replace(/[^A-Za-z0-9:._-]/g, '_'));
  }

  pollOk(accountId) {
    const a = this.store.account(accountId);
    a.lastPollAt = Date.now();
    if (a.error) {
      a.error = null;
      a.errorAt = null;
    }
    this.store.save();
  }

  /** Record a failing account. Shown on the dashboard and in the audit log; nothing is posted to Chat. */
  async reportError(accountId, err, context = 'poll') {
    const a = this.store.account(accountId);
    const msg = errText(err);
    a.error = `${context}: ${msg}`;
    a.errorAt = Date.now();
    this.store.save();
    console.error(`[${accountId}] ${context} failed:`, msg);
    this.onEvent('error', { accountId, context, message: msg });
  }

}

/** True inside the quiet-hours window (prefs.quietHours, display time zone; the window may cross midnight). */
export function isQuiet(config, at = Date.now()) {
  const q = config.quietHours;
  if (!q?.enabled) return false;
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: config.tz || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const n = toMin(hm), a = toMin(q.start || '22:00'), b = toMin(q.end || '08:00');
  return a <= b ? n >= a && n < b : n >= a || n < b;
}
