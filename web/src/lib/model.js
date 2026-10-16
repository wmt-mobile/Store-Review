// Turns /api/dashboard into what the screens need: status tones/labels, apps grouped across stores, chart series.

/** Pill tone per server category. */
export const TONE = {
  submitted: 'blue',
  in_review: 'amber',
  approved: 'approved',
  live: 'live',
  rejected: 'red',
  action: 'red',
  removed: 'red',
  draft: 'grey',
  testing: 'grey',
  none: 'grey',
};

/** Design wording per store status (falls back to the server label). */
const LABELS = {
  apple: {
    WAITING_FOR_REVIEW: 'Waiting for review',
    READY_FOR_REVIEW: 'Ready for review',
    IN_REVIEW: 'In review',
    PENDING_DEVELOPER_RELEASE: 'Approved · ready to publish',
    PENDING_APPLE_RELEASE: 'Approved · Apple releasing',
    ACCEPTED: 'Approved',
    PROCESSING_FOR_DISTRIBUTION: 'Approved · processing',
    PROCESSING_FOR_APP_STORE: 'Approved · processing',
    READY_FOR_DISTRIBUTION: 'Live',
    READY_FOR_SALE: 'Live',
    REJECTED: 'Rejected',
    METADATA_REJECTED: 'Rejected · Metadata',
    INVALID_BINARY: 'Rejected · Invalid binary',
    PREPARE_FOR_SUBMISSION: 'Prepare for submission',
    DEVELOPER_REJECTED: 'Removed from review',
    DEVELOPER_REMOVED_FROM_SALE: 'Removed from sale',
    REMOVED_FROM_SALE: 'Removed from sale',
    WAITING_FOR_EXPORT_COMPLIANCE: 'Export compliance needed',
  },
  google: {
    SENT_FOR_REVIEW: 'Sent for review',
    IN_REVIEW: 'In review',
    APPROVED: 'Approved',
    READY_TO_PUBLISH: 'Approved · ready to publish',
    LIVE: 'Live',
    ROLLOUT: 'Staged rollout',
    HALTED: 'Rollout halted',
    DRAFT: 'Draft release',
    REJECTED: 'Rejected',
    REMOVED: 'Removed',
    POLICY_ACTION: 'Rejected · Policy action',
  },
};

export function statusLabel(store, status, fallback, { userFraction } = {}) {
  let l = LABELS[store]?.[status] || fallback || String(status || '—').replace(/_/g, ' ').toLowerCase();
  if (status === 'ROLLOUT' && userFraction != null) l = `Staged rollout · ${Math.round(userFraction * 100)}%`;
  return l;
}

export const storeName = (s) => (s === 'apple' ? 'App Store' : 'Google Play');
export const platformName = (s) => (s === 'apple' ? 'iOS' : 'Android');
export const isPending = (cat) => cat === 'submitted' || cat === 'in_review';
export const isAttention = (cat) => cat === 'rejected' || cat === 'action' || cat === 'removed';

const norm = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** One row per product: the iOS and Android entries with the same name are merged. */
export function groupApps(apps) {
  const by = new Map();
  for (const a of apps || []) {
    const k = norm(a.name);
    if (!by.has(k)) by.set(k, { id: k, name: a.name, iconUrl: null, ios: null, android: null, accountIds: new Set() });
    const g = by.get(k);
    if (a.store === 'apple') g.ios = a;
    else g.android = a;
    g.iconUrl ||= a.iconUrl;
    g.accountIds.add(a.accountId);
  }
  return [...by.values()].map((g) => {
    const ch = (a) => (a ? a.channels.appstore || a.channels.production || null : null);
    const ios = ch(g.ios);
    const android = ch(g.android);
    const last = Math.max(ios?.since || 0, android?.since || 0) || null;
    return { ...g, accountIds: [...g.accountIds], iosCh: ios, androidCh: android, lastChange: last, bundle: g.ios?.bundleOrPackage || g.android?.bundleOrPackage };
  });
}

/** Stable gradient tile per app name when the store gives no icon. */
const GRADS = [
  ['#4F8BFF', '#1D4ED8'],
  ['#B57CFF', '#7C3AED'],
  ['#FF9A4D', '#EA580C'],
  ['#2BB59A', '#0F766E'],
  ['#FFB547', '#D97706'],
  ['#FF6B8A', '#DB2777'],
  ['#5DD0FF', '#0284C7'],
];
export function gradFor(name) {
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADS[h % GRADS.length];
}

/** Pending rows (both stores) enriched for lists. */
export const pendingRows = (M) => (M?.pending || []).map((r) => ({ ...r, tone: TONE[r.category], text: statusLabel(r.store, r.status, r.label, r) }));

/** Bars for the "Releases & reviews" chart: per day submitted / approved / rejected. */
export function chartSeries(M, days, now = Date.now()) {
  const out = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d0 = start.getTime() - i * 86_400_000;
    out.push({ d0, d1: d0 + 86_400_000, submitted: 0, approved: 0, rejected: 0, reviewMs: [] });
  }
  const t0 = out[0].d0;
  for (const app of M?.apps || []) {
    const hist = [...(app.history || [])].sort((a, b) => a.at - b.at);
    let startAt = null;
    for (const h of hist) {
      if (h.at < t0 - 30 * 86_400_000) continue;
      const day = out.find((d) => h.at >= d.d0 && h.at < d.d1);
      if (isPending(h.category)) {
        if (h.category === 'submitted' || startAt == null) {
          if (day && (h.category === 'submitted' || startAt == null)) day.submitted++;
          startAt ??= h.at;
        }
      } else if (h.category === 'approved' || h.category === 'live') {
        if (startAt != null) {
          if (day) { day.approved++; day.reviewMs.push(h.at - startAt); }
          startAt = null;
        }
      } else if (isAttention(h.category)) {
        if (day) day.rejected++;
        startAt = null;
      }
    }
  }
  return out.map((d) => ({ ...d, avgMs: d.reviewMs.length ? d.reviewMs.reduce((a, b) => a + b, 0) / d.reviewMs.length : null }));
}

/** Drawer id for an app name (same normalisation as groupApps). */
export const groupIdOf = (name) => norm(name);
