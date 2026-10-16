// Time and number formatting used across the UI. Times show in the server's display time zone.
let TZ = 'Asia/Kolkata';
export const setTz = (tz) => { if (tz) TZ = tz; };
export const tz = () => TZ;

const fmt = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });
const fmtUS = (opts) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts });

/** 26h 12m · 3h 41m · 48m · 2d 4h */
export function dur(ms, { long = false } = {}) {
  if (ms == null || !isFinite(ms)) return '—';
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  if (h < 48 || !long) return `${h}h ${mm}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** "2 min ago", "38 min ago", "3h ago", "Yesterday", "Oct 14" */
export function ago(ts, now = Date.now()) {
  if (!ts) return 'never';
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  if (dayKey(ts) === dayKey(now - 86_400_000)) return 'Yesterday';
  return date(ts);
}

/** "in 3 min" */
export function inFuture(ts, now = Date.now()) {
  const m = Math.max(0, Math.round((ts - now) / 60000));
  return m < 1 ? 'in <1 min' : m < 60 ? `in ${m} min` : `in ${Math.round(m / 60)}h`;
}

export const time = (ts) => (ts ? fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(ts) : '');
export const timeSec = (ts) => (ts ? fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ts) : '');
export const date = (ts) => (ts ? fmtUS({ month: 'short', day: 'numeric' }).format(ts) : '');
export const dateLong = (ts) => (ts ? fmtUS({ weekday: 'short', month: 'short', day: 'numeric' }).format(ts) : '');
export const dateYear = (ts) => (ts ? fmtUS({ month: 'short', day: 'numeric', year: 'numeric' }).format(ts) : '');
export const dayKey = (ts) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);

/** "Oct 16, 03:58" */
export const dateTime = (ts) => (ts ? `${date(ts)}, ${time(ts)}` : '—');

/** "10:42 today" / "09:58 yesterday" / "Oct 12" */
export function whenShort(ts, now = Date.now()) {
  if (!ts) return '—';
  if (dayKey(ts) === dayKey(now)) return `${time(ts)} today`;
  if (dayKey(ts) === dayKey(now - 86_400_000)) return `${time(ts)} yesterday`;
  return date(ts);
}

/** "TODAY · THU, OCT 16" style group headings */
export function dayHeading(ts, now = Date.now()) {
  const pretty = fmtUS({ weekday: 'short', month: 'short', day: 'numeric' }).format(ts).toUpperCase();
  if (dayKey(ts) === dayKey(now)) return `TODAY · ${pretty}`;
  if (dayKey(ts) === dayKey(now - 86_400_000)) return `YESTERDAY · ${pretty}`;
  return pretty;
}

export const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
