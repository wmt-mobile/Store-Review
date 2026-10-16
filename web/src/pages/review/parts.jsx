// Shared bits for In review / Apps / drawer / Needs attention.
import { cx } from '../../components/ui.jsx';
import { dur, ago, date, dayKey } from '../../lib/format.js';
import { statusLabel, TONE } from '../../lib/model.js';

/** Small black account chip with the account's initial ("W"). */
export function AcctChip({ name, size = 22 }) {
  return (
    <span title={name} className="inline-flex items-center justify-center shrink-0 bg-[#0F110C] dark:bg-surface-3 text-accent font-extrabold" style={{ width: size, height: size, borderRadius: size * 0.32, fontSize: size * 0.45 }}>
      {String(name || 'A').trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Flatten apps → one row per release channel (App Store / Play production). */
export function channelRows(apps, accounts = []) {
  const accName = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const out = [];
  for (const app of apps || []) {
    for (const [chKey, c] of Object.entries(app.channels || {})) {
      out.push({
        ...c,
        id: `${app.key}|${chKey}`,
        appKey: app.key,
        appName: app.name,
        iconUrl: app.iconUrl,
        store: app.store,
        accountId: app.accountId,
        accountName: accName[app.accountId] || app.accountId,
        bundle: app.bundleOrPackage,
        app,
      });
    }
  }
  return out;
}

/** Pill tone + label for a channel, with the "over limit" twist for stuck builds. */
export function pillFor(store, c) {
  if (!c) return { tone: 'grey', text: 'No submission' };
  let text = statusLabel(store, c.status, c.label, c);
  const tone = TONE[c.category] || 'grey';
  if (c.stuck && c.category === 'in_review') text = `${text} · over 24h`;
  return { tone, text };
}

const sameDay = (a, b) => dayKey(a) === dayKey(b);

/** "released" footer date: Yesterday / Today / Oct 14 */
export function relDay(ts, now = Date.now()) {
  if (!ts) return '—';
  if (sameDay(ts, now)) return 'Today';
  if (sameDay(ts, now - 86_400_000)) return 'Yesterday';
  return date(ts);
}

/** Days until a deadline string like "Oct 23, 2026"; null when unparseable. */
export function daysLeft(deadline, now = Date.now()) {
  const t = Date.parse(deadline || '');
  if (!isFinite(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

/** Secondary text under a version in the Apps table. Returns { text, red }. */
export function subText(c, now = Date.now()) {
  if (!c) return { text: '' };
  const live = c.liveVersion ? `live ${c.liveVersion}` : null;
  switch (c.category) {
    case 'submitted':
      return { text: [`${dur(c.elapsedMs)} waiting`, live].filter(Boolean).join(' · ') };
    case 'in_review':
      return { text: [dur(c.elapsedMs), live].filter(Boolean).join(' · '), red: c.stuck };
    case 'approved':
      return { text: c.reviewMs ? `took ${dur(c.reviewMs)}` : `approved ${ago(c.since, now)}` };
    case 'live':
      return { text: `since ${relDay(c.since, now).toLowerCase().replace(/^(\w{3}) /, (m) => m[0].toUpperCase() + m.slice(1))}` };
    case 'draft':
      return { text: 'not submitted' };
    case 'rejected':
    case 'action':
    case 'removed': {
      const d = c.ai?.deadline && daysLeft(c.ai.deadline, now) != null ? `fix by ${c.ai.deadline.replace(/,?\s*\d{4}$/, '')}` : null;
      return { text: d || (live ? `${live} unaffected` : ago(c.since, now)) };
    }
    default:
      return { text: '' };
  }
}

export function ProgressBar({ value, red, className }) {
  const pct = Math.max(2, Math.min(100, value * 100));
  return (
    <div className={cx('h-[6px] w-full rounded-full bg-surface-2 overflow-hidden', className)}>
      <div className={cx('h-full rounded-full', red ? 'bg-red' : 'bg-amber')} style={{ width: `${pct}%` }} />
    </div>
  );
}
