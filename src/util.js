import { config } from './config.js';

export function fmtDuration(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function fmtTime(ts, tz = config.tz) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts)) + (tz === 'Asia/Kolkata' ? ' IST' : '');
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const errText = (e) => {
  const status = e?.response?.status || e?.status || e?.code;
  const msg = e?.response?.data?.error?.message || e?.response?.data?.errors?.[0]?.detail || e?.message || String(e);
  return status ? `${status}: ${msg}` : msg;
};

/** Run async fn over items with a small concurrency limit. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { error: e }; }
    }
  });
  await Promise.all(workers);
  return out;
}

export const appKeyOf = (store, accountId, appId) => `${store}:${accountId}:${appId}`;

/** Version as people read it: "1.3.80 (193)" — version name, then build / version code. */
export function displayVersion(store, version, extra = {}) {
  const v = String(version ?? '').trim();
  if (!v) return '—';
  const m = v.match(/^(\d+)\s*\((.+)\)$/); // Play's default release name: "193 (1.3.80)"
  if (m) return `${m[2].trim()} (${m[1]})`;
  if (v.includes('(')) return v;
  const build = store === 'google' ? extra?.versionCodes : extra?.build;
  if (build && String(build) !== v) return `${v} (${String(build).split(',').join(', ')})`;
  return v;
}
