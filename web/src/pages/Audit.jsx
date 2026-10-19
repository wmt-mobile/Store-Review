// Audit log — who changed what, plus every bot and store-check event (pen.dev frame qKMNV).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search, RefreshCw, ScrollText } from 'lucide-react';
import { Button, Card, Empty, PageHead, Skeleton, cx } from '../components/ui.jsx';
import { useUi } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { date, timeSec, dateYear } from '../lib/format.js';
import { ActorAvatar, actorName, downloadCsv } from './admin/common.jsx';

export const ACTIONS = {
  'account.added': 'Connected account', 'account.verify_failed': 'Account verification failed', 'account.removed': 'Removed account', 'account.updated': 'Updated account',
  'account.key_rotated': 'Rotated key', 'apps.discovered': 'Synced app list', 'app.updated': 'Updated app', 'apps.bulk_updated': 'Updated apps in bulk',
  'chat.webhook_set': 'Saved Chat webhook', 'chat.app_set': 'Connected Chat app', 'chat.user_connected': 'Signed in to Google Chat', 'chat.user_connect_failed': 'Google Chat sign-in failed',
  'chat.user_space_set': 'Selected Chat space', 'chat.test_sent': 'Sent test message', 'chat.test_failed': 'Test message failed', 'chat.notified': 'Posted to Google Chat',
  'chat.store_message': 'Recorded Play message', 'chat.digest_sent': 'Posted daily digest', 'chat.digest_failed': 'Daily digest failed',
  'prefs.updated': 'Changed preferences', 'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.login_failed': 'Failed sign-in attempt',
  'auth.reset_requested': 'Requested password reset', 'auth.password_reset': 'Reset password',
  'gmail.client_saved': 'Saved Gmail OAuth client', 'gmail.connected': 'Connected Gmail', 'gmail.connect_failed': 'Gmail connection failed', 'gmail.disconnected': 'Disconnected Gmail',
  'gmail.query_updated': 'Changed Gmail search', 'gmail.parsed': 'Parsed rejection email', 'onboarding.completed': 'Completed onboarding', 'poll.manual': 'Checked stores now',
  'poll.error': 'Store check failed', 'stuck.alert': 'Review limit exceeded', 'attention.resolved': 'Marked resolved', 'attention.reopened': 'Reopened', 'attention.snoozed': 'Snoozed alert',
  'push.subscribed': 'Turned on browser notifications', 'push.unsubscribed': 'Turned off browser notifications', 'notify.prefs_updated': 'Changed notification settings',
};
/** Label for an entry (string action or the whole entry, so app.updated can say what changed). */
export function actionLabel(e) {
  const a = typeof e === 'string' ? e : e?.action;
  const d = (typeof e === 'object' && e?.details) || {};
  if (a === 'app.updated') {
    const keys = Object.keys(d);
    if (keys.length === 1 && keys[0] === 'displayName') return 'Renamed app';
    if (keys.length === 1 && keys[0] === 'notify') return d.notify ? 'Unmuted alerts' : 'Muted alerts';
    if (keys.length === 1 && keys[0] === 'tracked') return d.tracked ? 'Started watching app' : 'Stopped watching app';
    if (keys.length === 1 && keys[0] === 'chatWebhook') return 'Changed app Chat space';
  }
  if (a === 'prefs.updated' && Object.keys(d).length === 1 && /PollMinutes$/.test(Object.keys(d)[0])) return 'Changed polling interval';
  return ACTIONS[a] || String(a || '').replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const STATUS = { READY_TO_PUBLISH: 'Approved', PENDING_DEVELOPER_RELEASE: 'Approved', READY_FOR_DISTRIBUTION: 'Live', READY_FOR_SALE: 'Live', LIVE: 'Live', ROLLOUT: 'Staged rollout', IN_REVIEW: 'In review', WAITING_FOR_REVIEW: 'Waiting for review', SENT_FOR_REVIEW: 'Sent for review', REJECTED: 'Rejected', POLICY_ACTION: 'Policy action', METADATA_REJECTED: 'Metadata rejected' };
const KEY = { tracked: 'watch', notify: 'alerts', displayName: 'name', stuckHours: 'review limit', applePollMinutes: 'App Store check', playPollMinutes: 'Google Play check', gmailPollMinutes: 'Gmail check', digestEnabled: 'daily digest', mentionAll: '@all on rejections', quietHours: 'quiet hours', silentFirstRun: 'quiet first sync' };
const val = (k, v) => {
  if (typeof v === 'boolean') return k === 'notify' ? (v ? 'on' : 'muted') : v ? 'on' : 'off';
  if (/PollMinutes$/.test(k)) return `${v}m`;
  if (k === 'stuckHours') return `${v}h`;
  if (v && typeof v === 'object') return v.enabled != null ? (v.enabled ? `${v.start}–${v.end}` : 'off') : JSON.stringify(v);
  return String(v);
};

/** Human target line from target + details. */
export function targetText(e) {
  const d = e.details || {};
  const t = e.target || '';
  switch (e.action) {
    case 'chat.notified': {
      const plat = d.channel === 'appstore' ? 'iOS' : d.channel === 'production' ? 'Android' : d.channel || '';
      const ver = String(d.version || '').replace(/^(\d+)\s*\((.+)\)$/, '$2 ($1)');
      return `${t} ${plat} ${ver} → ${STATUS[d.to] || String(d.to || '').replace(/_/g, ' ').toLowerCase()}`.replace(/\s+/g, ' ').trim();
    }
    case 'poll.error': return d.message ? (t && !String(d.message).includes(t) ? `${t} — ${d.message}` : d.message) : t;
    case 'app.updated': case 'prefs.updated': case 'apps.bulk_updated': case 'account.updated': {
      const ch = Object.entries(d).filter(([k]) => k !== 'chatWebhook').map(([k, v]) => (k === 'displayName' ? `→ ${v || '(store name)'}` : `${KEY[k] || k}: ${val(k, v)}`)).join(' · ');
      if (e.action === 'app.updated' && Object.keys(d).length === 1 && d.notify === false) return `${t} · alerts muted`;
      return [t, ch].filter(Boolean).join(d.displayName !== undefined ? ' ' : ' · ');
    }
    case 'account.key_rotated': return [t, d.store && (d.store === 'apple' ? 'App Store Connect key' : 'Play service account')].filter(Boolean).join(' · ');
    case 'apps.discovered': return `${t} · ${d.count ?? 0} apps`;
    case 'account.added': return `${t}${d.store ? ` · ${d.store === 'apple' ? 'App Store Connect' : 'Google Play Console'}` : ''}${d.apps != null ? ` · ${d.apps} apps` : ''}`;
    case 'gmail.query_updated': return d.query || t;
    case 'auth.login': case 'auth.login_failed': case 'auth.reset_requested': case 'auth.password_reset': return d.ip ? `from ${d.ip}` : t;
    case 'chat.test_failed': case 'gmail.connect_failed': case 'chat.user_connect_failed': return [t, d.error].filter(Boolean).join(' · ');
    case 'stuck.alert': return [t, d.store, d.version, d.limit && `${d.limit} limit`].filter(Boolean).join(' · ');
    case 'gmail.parsed': return [t, d.store, d.version, d.ai && 'AI summary created'].filter(Boolean).join(' · ');
    default: {
      const extra = Object.entries(d).filter(([, v]) => v != null && typeof v !== 'object').slice(0, 3).map(([k2, v]) => `${k2}: ${v}`).join(' · ');
      return [t, extra].filter(Boolean).join(' · ') || '—';
    }
  }
}

const LEVELS = [
  { value: '', label: 'All levels' },
  { value: 'info', label: 'Info', cls: 'bg-blue-soft text-blue' },
  { value: 'warn', label: 'Warn', cls: 'bg-amber-soft text-amber' },
  { value: 'error', label: 'Error', cls: 'bg-red-soft text-red' },
];
const LevelPill = ({ level }) => {
  const l = LEVELS.find((x) => x.value === level) || LEVELS[1];
  return <span className={cx('inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-full text-[11.5px] font-extrabold whitespace-nowrap', l.cls)}><span className="size-[6px] rounded-full bg-current" />{l.label}</span>;
};
const PAGE = 10;

export default function Audit() {
  const { toast } = useUi();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await api('/api/admin/audit?limit=500');
      setRows(r || []);
      setMore((r || []).length >= 500);
    } catch (e) {
      setErr(e.message);
      setRows([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadOlder = async () => {
    if (!rows?.length) return;
    setLoadingMore(true);
    try {
      const r = await api(`/api/admin/audit?limit=500&before=${encodeURIComponent(rows[rows.length - 1].at)}`);
      setRows((x) => [...x, ...(r || [])]);
      setMore((r || []).length >= 500);
    } catch (e) {
      toast({ title: 'Could not load older entries', body: e.message, tone: 'error' });
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter((e) => (!level || e.level === level) && (!s || `${e.actor} ${actorName(e.actor)} ${e.action} ${actionLabel(e)} ${e.target || ''} ${targetText(e)}`.toLowerCase().includes(s)));
  }, [rows, level, q]);
  useEffect(() => setPage(1), [level, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice((page - 1) * PAGE, page * PAGE);
  const range = rows?.length ? `${date(Date.parse(rows[rows.length - 1].at))} – ${date(Date.parse(rows[0].at))}, ${new Date(Date.parse(rows[0].at)).getFullYear()}` : '';

  const exportCsv = () => downloadCsv(
    `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Time', 'Actor', 'Action', 'Target', 'Level', 'Details'],
    filtered.map((e) => [new Date(e.at).toISOString(), e.actor, actionLabel(e), targetText(e), e.level, JSON.stringify(e.details || {})])
  );

  const nums = pageNumbers(page, pages);
  return (
    <>
      <PageHead
        title="Audit log"
        sub="Admin · who changed what, plus every bot and store-check event"
        actions={<>
          <Button variant="outline" icon={RefreshCw} onClick={load} aria-label="Reload" className="hidden sm:inline-flex">Reload</Button>
          <Button variant="outline" icon={Download} onClick={exportCsv} disabled={!filtered.length}>Export</Button>
        </>}
      />
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <label className="w-full sm:w-[300px] h-[38px] flex items-center gap-2 px-3 bg-surface rounded-[12px]">
          <Search size={15} className="text-ink-3 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actor, action or target…" className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-medium text-ink placeholder:text-ink-3" />
        </label>
        <div className="flex items-center gap-1 p-1 bg-surface rounded-[12px]">
          {LEVELS.map((l) => {
            const on = level === l.value;
            return l.value ? (
              <button key={l.value} onClick={() => setLevel(on ? '' : l.value)} aria-pressed={on} className={cx('inline-flex items-center gap-[5px] px-[9px] py-[3px] rounded-full text-[11.5px] font-extrabold', l.cls, on && 'ring-[1.5px] ring-current')}>
                <span className="size-[6px] rounded-full bg-current" />{l.label}
              </button>
            ) : (
              <button key="all" onClick={() => setLevel('')} className={cx('px-[10px] py-1 rounded-[8px] text-[12px] font-bold', on ? 'bg-primary text-on-primary' : 'text-ink-2 hover:text-ink')}>All levels</button>
            );
          })}
        </div>
        <div className="flex-1" />
        {range && <span className="text-[13px] font-bold text-ink-2 whitespace-nowrap">{range}</span>}
      </div>

      <Card className="px-2 pt-1 pb-2">
        {rows === null ? (
          <div className="flex flex-col gap-3 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : err ? (
          <Empty icon={ScrollText} title="Couldn’t load the audit log" tone="red" action={<Button icon={RefreshCw} onClick={load}>Retry</Button>}>{err}</Empty>
        ) : !filtered.length ? (
          <Empty icon={ScrollText} title={rows.length ? 'No entries match' : 'Nothing logged yet'}>{rows.length ? 'Try another search or level.' : 'Account changes, Chat messages and store-check errors appear here.'}</Empty>
        ) : (
          <div>
            <div className="hidden lg:grid grid-cols-[150px_200px_220px_minmax(0,1fr)_80px] gap-4 px-4 py-3 text-[11px] font-bold tracking-[0.8px] text-ink-3">
              <span>TIME</span><span>ACTOR</span><span>ACTION</span><span>TARGET</span><span>LEVEL</span>
            </div>
            {view.map((e) => {
              const ts = Date.parse(e.at);
              return (
                <div key={e.id ?? `${e.at}-${e.action}`} className={cx('grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[150px_200px_220px_minmax(0,1fr)_80px] gap-x-4 gap-y-1.5 items-center px-3 lg:px-4 py-3 border-t border-line', e.level === 'error' && 'bg-red/[0.035]')}>
                  <span className="font-mono text-[12.5px] font-semibold text-ink-2 whitespace-nowrap">{date(ts)} · {timeSec(ts)}</span>
                  <span className="lg:hidden justify-self-end"><LevelPill level={e.level} /></span>
                  <span className="col-span-2 lg:col-span-1 flex items-center gap-2 min-w-0"><ActorAvatar actor={e.actor} size={26} /><span className="text-[13px] font-bold text-ink truncate" title={e.actor}>{actorName(e.actor)}</span></span>
                  <span className="col-span-2 lg:col-span-1 text-[13px] font-bold text-ink">{actionLabel(e)}</span>
                  <span className="col-span-2 lg:col-span-1 text-[12.5px] font-medium text-ink-2 break-words" title={dateYear(ts)}>{targetText(e)}</span>
                  <span className="hidden lg:block"><LevelPill level={e.level} /></span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {rows?.length ? (
        <div className="flex flex-wrap items-center gap-2 mt-5">
          <span className="flex-1 min-w-[220px] text-[12.5px] font-semibold text-ink-3">
            Showing {filtered.length ? `${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, filtered.length)}` : 0} of {filtered.length.toLocaleString()}{more ? '+' : ''} entries · kept for 90 days
          </span>
          <PageBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</PageBtn>
          {nums.map((n, i) => (n === '…' ? <PageBtn key={`e${i}`} disabled>…</PageBtn> : <PageBtn key={n} on={n === page} onClick={() => setPage(n)}>{n}</PageBtn>))}
          <PageBtn onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}>›</PageBtn>
          {more && page === pages && <Button size="sm" variant="surface" loading={loadingMore} onClick={loadOlder}>Load older</Button>}
        </div>
      ) : null}
    </>
  );
}

const PageBtn = ({ on, children, ...rest }) => (
  <button {...rest} className={cx('min-w-8 h-8 px-2 rounded-[9px] text-[12.5px] font-bold inline-flex items-center justify-center disabled:opacity-50', on ? 'bg-primary text-on-primary' : 'bg-surface text-ink-2 hover:text-ink')}>{children}</button>
);

function pageNumbers(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const s = new Set([1, 2, 3, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const arr = [...s].sort((a, b) => a - b);
  const out = [];
  arr.forEach((n, i) => { if (i && n - arr[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}
