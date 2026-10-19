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
      // review time stops at approval: approved → live keeps the time it took to get approved
      reviewMs: subAt && isTerminal(to.category)
        ? (to.category === 'live' && from?.category === 'approved' && !versionChanged ? prev.reviewMs || (prev.since ? prev.since - subAt : null) : at - subAt)
        : null,
      reason: reason || ((to.category === 'rejected' || to.category === 'action') && !versionChanged ? prev?.reason : null) || null,
      extra: extra || undefined,
    };

    if (app.store === 'google' && channel === 'production') this.trackPlayCycle(appKey, extra?.versionCodes ?? prev?.extra?.versionCodes, status);

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
    return this.deliver(card, target, to.category, at);
  }

  /** Post now, or hold it during quiet hours (rejections always go out). */
  async deliver(card, target, category, at) {
    if (isQuiet(this.config, at) && !['rejected', 'action', 'removed'].includes(category)) {
      // Quiet hours: hold non-critical posts, sent in order once the window ends (flushHeld).
      (this.d.meta.held ||= []).push({ card, target, at });
      this.store.save();
      return { changed: true, notified: false, held: true };
    }
    await this.send(card, target);
    return { changed: true, notified: true };
  }

  // ── Google Play: build releases vs store-listing / app-content changes ──
  // Play reviews listing and content edits (description, screenshots, Data safety, content rating…) without a
  // new build. A "build cycle" per app remembers the versionCodes of the last release: it is open from the moment
  // new codes appear until that release is fully live. Review results that arrive while the cycle is closed
  // belong to a listing/content change, not to the build, and are tracked separately (updateListing).

  /** Seed (first use), open (new codes) or close (fully live) the cycle for this app. */
  trackPlayCycle(appKey, codes, status) {
    const m = (this.d.meta.playCycle ||= {});
    codes = String(codes || '');
    const c = m[appKey];
    if (!c || (codes && c.codes !== codes)) m[appKey] = { codes, closed: false };
    if (status === 'LIVE') m[appKey].closed = true;
  }

  /** True when a Play production result belongs to a build that is still on its way to live. */
  playBuildPending(appKey, codes) {
    const m = (this.d.meta.playCycle ||= {});
    codes = String(codes || '');
    if (!m[appKey]) {
      // first time: a fully released build (live, or a completed release that only had a listing result) is settled
      const ch = this.d.channels[appKey]?.production;
      const cat = ch ? describe('google', 'production', ch.status).category : null;
      const settled = ch && (ch.status === 'LIVE' || (ch.extra?.releaseStatus === 'completed' && ['rejected', 'action', 'removed'].includes(cat)));
      m[appKey] = { codes: String(ch?.extra?.versionCodes || codes), closed: Boolean(settled) };
      this.store.save();
    }
    const c = m[appKey];
    if (codes && c.codes && c.codes !== codes) return true;
    return !c.closed;
  }

  /**
   * A review result for a store-listing / app-content change (no new build). Stored on the production channel as
   * extra.listing, so the build's own status and version are untouched; posted as "Store listing update".
   */
  async updateListing(appKey, { status, reason, at = Date.now(), eventId, extra = {} } = {}) {
    const app = this.d.apps[appKey];
    const ch = this.d.channels[appKey]?.production;
    if (!app || !ch) return { changed: false, notified: false };
    if (eventId) {
      if (this.d.seen[eventId]) return { changed: false, notified: false, duplicate: true };
      this.d.seen[eventId] = Date.now();
    }
    const prevL = ch.extra?.listing || null;
    const to = describe('google', 'production', status);
    const from = prevL ? describe('google', 'production', prevL.status) : null;
    const bad = ['rejected', 'action', 'removed'].includes(to.category);
    const mail = Object.fromEntries(['ai', 'mailSubject', 'mailText', 'messageId', 'emailUrl'].map((k) => [k, extra[k]]).filter(([, v]) => v != null));
    if (prevL && prevL.status === status) {
      // same result again (email + API both report it): only fill in details
      if (Object.keys(mail).length || (reason && !prevL.reason) || (extra.note && extra.note !== prevL.note)) {
        ch.extra.listing = { ...prevL, ...mail, reason: prevL.reason || reason || null, note: extra.note || prevL.note || null };
        this.store.save();
      }
      return { changed: false, notified: false };
    }
    const fromPending = from && (isPending(from.category) || from.category === 'approved');
    let subAt = null;
    if (isPending(to.category)) subAt = fromPending && isPending(from.category) ? prevL.submittedAt : at;
    else if (fromPending) subAt = prevL.submittedAt || null;
    ch.extra = {
      ...ch.extra,
      listing: {
        status,
        label: to.label,
        category: to.category,
        since: at,
        submittedAt: subAt,
        reviewMs: subAt && isTerminal(to.category) ? (to.category === 'live' && from?.category === 'approved' ? prevL.reviewMs || prevL.since - subAt : at - subAt) : null,
        reason: reason || (bad && prevL?.reason) || null,
        // what was changed (from "Sent content change for review" on the dashboard), kept until it's published
        note: extra.note || (prevL && prevL.category !== 'live' ? prevL.note : null) || null,
        by: extra.by || (prevL && prevL.category !== 'live' ? prevL.by : null) || null,
        ...(bad ? mail : { emailUrl: mail.emailUrl }),
      },
    };
    const hist = (this.d.history[appKey] ||= []);
    hist.unshift({ at, channel: 'production', version: ch.version || '', from: prevL?.status || null, to: status, reason: reason || null, kind: 'listing' });
    if (hist.length > HISTORY_MAX) hist.length = HISTORY_MAX;

    let notify = this.isInitialized(app.accountId) && !app.hidden && !app.muted && !SILENT_CATEGORIES.has(to.category);
    // "approved" by email and "ready to publish" from the API are the same news
    if (notify && from && from.category === to.category && !bad) notify = false;
    const evKey = { submitted: 'submitted', in_review: 'in_review', approved: 'approved', live: 'live', rejected: 'rejected', action: 'rejected', removed: 'rejected' }[to.category];
    if (notify && evKey && this.config.chatEvents?.[evKey] === false) notify = false;

    this.store.save();
    this.onEvent('status', { app, channel: 'production', version: ch.version, from: prevL?.status || null, to: status, reason: reason || null, notify, listing: true });
    if (!notify) return { changed: true, notified: false };

    const account = this.accountById(app.accountId);
    const L = ch.extra.listing;
    const card = statusCard({
      app,
      account,
      channel: 'production',
      version: ch.version,
      extra: { ...ch.extra, ...L },
      from,
      to,
      at,
      submittedAt: L.submittedAt,
      reason: L.reason,
      listing: true,
      links: [...consoleLinks(app, account, 'production'), ...(L.emailUrl ? [{ text: 'Open email', url: L.emailUrl }] : [])],
    });
    const target = { webhook: app.chatWebhook || this.config.chatWebhook, threadKey: this.threadFor(appKey, 'listing') };
    return this.deliver(card, target, to.category, at);
  }

  /** Remove the store-listing state (dashboard "Clear"). */
  clearListing(appKey) {
    const ch = this.d.channels[appKey]?.production;
    if (!ch?.extra?.listing) return false;
    delete ch.extra.listing;
    this.store.save();
    return true;
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
