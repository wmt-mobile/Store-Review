// When the bot first sees a build that is already waiting / in review (account re-added, app newly
// discovered), the store APIs don't say when it was sent — Google has no submission time at all.
// Earlier Chat posts for the same app + version are in the audit log, so the real start is recoverable.
import { db } from './supabase.js';
import { describe } from './status-map.js';

const PENDING = new Set(['submitted', 'in_review']);

/** Pure: audit rows (any order) → the latest unbroken review run for this channel + version. */
export function reviewRun(rows, { store, channel, version }) {
  const evs = rows
    .map((r) => ({ at: Date.parse(r.at), ...(r.details || {}) }))
    .filter((e) => e.channel === channel && (e.version || '') === (version || '') && Number.isFinite(e.at))
    .sort((a, b) => a.at - b.at);
  let run = [];
  for (const e of evs) {
    if (PENDING.has(describe(store, channel, e.to).category)) run.push({ at: e.at, from: e.from || null, to: e.to });
    else run = [];
  }
  return run.length ? { startAt: run[0].at, events: run } : null;
}

export async function priorReview(app, channel, version) {
  const names = [...new Set([app.name, app.storeName, app.displayName].filter(Boolean))];
  const rows = [];
  for (const n of names) {
    rows.push(...(await db.select('audit_log', { action: 'eq.chat.notified', target: `eq.${n}`, order: 'at.desc', limit: 200 }).catch(() => [])));
  }
  return reviewRun(rows, { store: app.store, channel, version });
}
