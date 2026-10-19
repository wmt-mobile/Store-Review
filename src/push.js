// Browser push (Review Radar notifications) + per-user notification preferences.
// Subscriptions and prefs live in the settings table (Supabase) or in memory (demo / file mode).
import webpush from 'web-push';
import { db } from './supabase.js';
import { describe } from './status-map.js';
import { displayVersion, fmtDuration } from './util.js';
import { isQuiet } from './tracker.js';

const VAPID = {
  publicKey: process.env.VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || '',
  subject: process.env.VAPID_SUBJECT || 'mailto:mobile@webmobtech.com',
};
export const pushEnabled = () => Boolean(VAPID.publicKey && VAPID.privateKey);
export const vapidPublicKey = () => VAPID.publicKey;
if (pushEnabled()) webpush.setVapidDetails(VAPID.subject, VAPID.publicKey, VAPID.privateKey);

/** Notification events, in the order the settings screen lists them. */
export const EVENTS = ['sent', 'in_review', 'approved', 'live', 'rejected', 'stuck'];
export const DEFAULT_PREFS = {
  events: {
    sent: { push: false, inapp: true },
    in_review: { push: false, inapp: true },
    approved: { push: true, inapp: true },
    live: { push: false, inapp: true },
    rejected: { push: true, inapp: true },
    stuck: { push: true, inapp: true },
  },
  quiet: { enabled: false },
  lastReadAt: 0,
};

export const eventForCategory = (cat) =>
  ({ submitted: 'sent', in_review: 'in_review', approved: 'approved', live: 'live', rejected: 'rejected', action: 'rejected', removed: 'rejected' })[cat] || null;

export function normPrefs(p = {}) {
  const events = {};
  for (const e of EVENTS) events[e] = { push: Boolean(p.events?.[e]?.push ?? DEFAULT_PREFS.events[e].push), inapp: Boolean(p.events?.[e]?.inapp ?? DEFAULT_PREFS.events[e].inapp) };
  return { events, quiet: { enabled: Boolean(p.quiet?.enabled) }, lastReadAt: Number(p.lastReadAt) || 0 };
}

export class PushStore {
  constructor(mode) {
    this.mode = mode;
    this.mem = { subs: [], prefs: {} };
    this.cache = null;
    this.cacheAt = 0;
  }
  get remote() {
    return this.mode === 'supabase';
  }
  async subs() {
    if (!this.remote) return this.mem.subs;
    if (this.cache && Date.now() - this.cacheAt < 30_000) return this.cache;
    const [row] = await db.select('settings', { key: 'eq.push_subs' }).catch(() => []);
    this.cache = row?.value?.subs || [];
    this.cacheAt = Date.now();
    return this.cache;
  }
  async saveSubs(subs) {
    if (!this.remote) return void (this.mem.subs = subs);
    this.cache = subs;
    this.cacheAt = Date.now();
    await db.upsert('settings', [{ key: 'push_subs', value: { subs } }], 'key', { returning: false });
  }
  async addSub(email, sub, ua) {
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('invalid subscription');
    const subs = (await this.subs()).filter((s) => s.endpoint !== sub.endpoint);
    subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, email, ua: String(ua || '').slice(0, 200), at: Date.now() });
    await this.saveSubs(subs.slice(-200));
  }
  async removeSub(endpoint) {
    await this.saveSubs((await this.subs()).filter((s) => s.endpoint !== endpoint));
  }
  async prefs(email) {
    const k = String(email || 'local').toLowerCase();
    if (!this.remote) return normPrefs(this.mem.prefs[k]);
    const [row] = await db.select('settings', { key: `eq.notify:${k}` }).catch(() => []);
    return normPrefs(row?.value);
  }
  async savePrefs(email, p) {
    const k = String(email || 'local').toLowerCase();
    const v = normPrefs(p);
    if (!this.remote) this.mem.prefs[k] = v;
    else await db.upsert('settings', [{ key: `notify:${k}`, value: v }], 'key', { returning: false });
    return v;
  }
}

/** Title/body for one status change, matching the design's notification copy. */
export function pushMessage({ app, channel, version, to, extra, submittedAt, at = Date.now(), event, elapsedMs, listing = false }) {
  const d = describe(app.store, channel, to);
  const store = app.store === 'apple' ? 'App Store' : 'Google Play';
  const platform = app.store === 'apple' ? 'iOS' : 'Android';
  const v = displayVersion(app.store, version, extra);
  const took = submittedAt ? fmtDuration(at - submittedAt) : null;
  const ev = event || eventForCategory(d.category);
  const T = {
    sent: [`${app.name} sent for review`, `${store} · ${v}`],
    in_review: [`${app.name} is in review`, `${store} · ${v}${took ? ` · was waiting ${took}` : ''}`],
    approved: [`${app.name} approved`, `${platform} ${v} is ready to publish on ${store}${took ? ` · review took ${took}` : ''}`],
    live: [`${app.name} is live`, `${platform} ${v} is live on ${store}`],
    rejected: [`${app.name} rejected`, `${store} · ${v} · ${d.label}${extra?.ai ? '. AI summary ready' : ''}`],
    stuck: [`${app.name} over limit`, `${store} · ${v} has been in review ${fmtDuration(elapsedMs || 0)}. Consider an expedited review.`],
  }[ev];
  // store-listing / app-content change: same notification as a build, marked as content changes
  if (listing && T) return { event: ev, title: T[0], body: `${T[1]} · ${extra?.note ? `App content · ${extra.note}` : 'App content changes'}` };
  return T ? { event: ev, title: T[0], body: T[1] } : null;
}

/**
 * Send one notification to every subscribed browser whose owner wants this event pushed.
 * Dead subscriptions (404/410) are dropped.
 */
export async function sendPush(pushStore, { event, title, body, url = '/dashboard', tag }) {
  if (!pushEnabled()) return { sent: 0 };
  const subs = await pushStore.subs();
  if (!subs.length) return { sent: 0 };
  const prefsBy = {};
  const dead = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      prefsBy[s.email] ||= await pushStore.prefs(s.email);
      if (event !== 'test' && !prefsBy[s.email].events[event]?.push) return;
      // personal quiet hours (22:00–08:00): rejections and over-limit alerts still come through
      if (prefsBy[s.email].quiet?.enabled && !['rejected', 'stuck', 'test'].includes(event) && isQuiet({ tz: process.env.TZ_DISPLAY || 'Asia/Kolkata', quietHours: { enabled: true, start: '22:00', end: '08:00' } })) return;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title, body, url, tag: tag || event }), { TTL: 3600 });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint);
        else console.warn('[push] send failed:', e.statusCode || e.message);
      }
    })
  );
  if (dead.length) await pushStore.saveSubs(subs.filter((s) => !dead.includes(s.endpoint)));
  return { sent };
}

