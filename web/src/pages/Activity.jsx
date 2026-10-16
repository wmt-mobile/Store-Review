// Activity — every release status change the bot has seen, grouped by day (pen.dev frame ySYko).
import { useMemo, useState } from 'react';
import { ArrowRight, Calendar, Download, LayoutGrid, MessageSquare, Wallet, Activity as ActivityIcon } from 'lucide-react';
import { AppIcon, Button, Card, Empty, PageHead, Pill, Skeleton, StoreBadge, cx } from '../components/ui.jsx';
import { useData, useUi } from '../lib/store.jsx';
import { dayHeading, dayKey, time, dateYear } from '../lib/format.js';
import { TONE, statusLabel, groupIdOf } from '../lib/model.js';
import { Dropdown, downloadCsv } from './admin/common.jsx';

// Design labels for the "from" side (server sends its own wording).
const FROM = {
  'Sent for review': { apple: 'Waiting for review' },
  'Release sent to Google': { google: 'Sent for review' },
  'Approved – pending your release': { apple: 'Approved · ready' },
  'Ready to publish (managed publishing)': { google: 'Approved · ready' },
  'Approved · ready to publish': { google: 'Approved · ready', apple: 'Approved · ready' },
  'Policy action required': { google: 'Policy action' },
};
const fromText = (e) => (e.fromLabel ? FROM[e.fromLabel]?.[e.store] || e.fromLabel : null);
const toStatus = (e) => String(e.id || '').split('|').pop();

const CHIPS = [
  { key: 'waiting', label: 'Waiting', dot: 'bg-blue', cats: ['submitted'] },
  { key: 'review', label: 'In review', dot: 'bg-amber', cats: ['in_review'] },
  { key: 'approved', label: 'Approved', dot: 'bg-green', cats: ['approved'] },
  { key: 'rejected', label: 'Rejected', dot: 'bg-red', cats: ['rejected', 'action', 'removed'] },
  { key: 'live', label: 'Live', dot: 'bg-ink', cats: ['live'] },
];
const RANGES = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

export default function Activity() {
  const { activity, M, loading } = useData();
  const { openApp } = useUi();
  const [range, setRange] = useState('7');
  const [app, setApp] = useState('');
  const [account, setAccount] = useState('');
  const [chips, setChips] = useState(() => new Set());

  const apps = useMemo(() => [...new Set(activity.map((e) => e.appName))].sort((a, b) => a.localeCompare(b)), [activity]);
  const accountNames = useMemo(() => [...new Set((M?.accounts || []).map((a) => a.name))], [M]);

  const rows = useMemo(() => {
    const now = Date.now();
    const from = range === '1' ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : now - Number(range) * 86_400_000;
    const cats = new Set([...chips].flatMap((k) => CHIPS.find((c) => c.key === k).cats));
    return activity.filter((e) => e.at >= from && (!app || e.appName === app) && (!account || e.accountName === account) && (!cats.size || cats.has(e.category)));
  }, [activity, range, app, account, chips]);

  const days = useMemo(() => {
    const out = [];
    for (const e of rows) {
      const k = dayKey(e.at);
      if (!out.length || out[out.length - 1].k !== k) out.push({ k, at: e.at, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [rows]);

  const total30 = useMemo(() => activity.filter((e) => e.at >= Date.now() - 30 * 86_400_000).length, [activity]);
  const toggle = (k) => setChips((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const dirty = range !== '7' || app || account || chips.size;
  const clear = () => { setRange('7'); setApp(''); setAccount(''); setChips(new Set()); };

  const exportCsv = () => downloadCsv(
    `review-activity-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Date', 'Time', 'App', 'Store', 'Version', 'From', 'To', 'Account', 'Reason'],
    rows.map((e) => [dateYear(e.at), time(e.at), e.appName, e.store === 'apple' ? 'App Store' : 'Google Play', e.version, fromText(e) || '', statusLabel(e.store, toStatus(e), e.label), e.accountName, e.reason || ''])
  );

  return (
    <>
      <PageHead
        title="Activity"
        sub={`Every status change the bot has seen · ${total30} event${total30 === 1 ? '' : 's'} in the last 30 days`}
        actions={<Button variant="outline" icon={Download} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>}
      />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Dropdown icon={Calendar} value={range} options={RANGES} onChange={setRange} />
        <Dropdown icon={LayoutGrid} value={app} options={[{ value: '', label: 'All apps' }, ...apps.map((a) => ({ value: a, label: a }))]} onChange={setApp} />
        <Dropdown icon={Wallet} value={account} options={[{ value: '', label: 'All accounts' }, ...accountNames.map((a) => ({ value: a, label: a }))]} onChange={setAccount} />
        <span className="hidden md:block w-px h-6 bg-line mx-1" />
        {CHIPS.map((c) => {
          const on = chips.has(c.key);
          return (
            <button key={c.key} onClick={() => toggle(c.key)} aria-pressed={on}
              className={cx('h-[34px] inline-flex items-center gap-1.5 px-3 rounded-full text-[12.5px] font-bold transition',
                on ? 'bg-primary text-on-primary' : chips.size ? 'ring-[1.5px] ring-inset ring-line text-ink-3' : 'bg-surface text-ink')}>
              <span className={cx('size-[7px] rounded-full', on && c.key === 'live' ? 'bg-accent' : c.dot)} />
              {c.label}
            </button>
          );
        })}
        <div className="flex-1" />
        {dirty ? <button onClick={clear} className="text-[12.5px] font-bold text-ink-2 hover:text-ink">Clear filters</button> : null}
      </div>

      <Card className="px-4 sm:px-6 pt-2 pb-4">
        {loading ? (
          <div className="flex flex-col gap-4 py-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !days.length ? (
          <Empty icon={ActivityIcon} title="No status changes here">{dirty ? 'Nothing matches these filters. Try a longer date range or clear the filters.' : 'Status changes appear here the moment the bot sees them.'}</Empty>
        ) : (
          days.map((d) => (
            <div key={d.k}>
              <div className="flex items-center gap-[10px] pt-[10px] pb-1">
                <span className="text-[11.5px] font-extrabold tracking-[1px] text-ink-3 whitespace-nowrap">{dayHeading(d.at)}</span>
                <span className="flex-1 h-px bg-line" />
                <span className="text-[11.5px] font-bold text-ink-3 whitespace-nowrap">{d.items.length} event{d.items.length === 1 ? '' : 's'}</span>
              </div>
              {d.items.map((e) => {
                const to = statusLabel(e.store, toStatus(e), e.label);
                const from = fromText(e);
                return (
                  <button key={e.id} onClick={() => openApp?.(groupIdOf(e.appName), e.store)}
                    className="w-full text-left grid grid-cols-[48px_1fr] md:grid-cols-[48px_minmax(0,310px)_minmax(0,1fr)_auto_96px] items-center gap-x-4 gap-y-2 py-[10px] rounded-[12px] hover:bg-surface-2/60 -mx-2 px-2">
                    <span className="font-mono text-[13px] font-bold text-ink-3">{time(e.at)}</span>
                    <span className="flex items-center gap-3 min-w-0">
                      <AppIcon name={e.appName} iconUrl={e.iconUrl} size={34} radius={10} />
                      <span className="min-w-0 flex flex-col gap-1">
                        <span className="text-[14px] font-bold text-ink truncate">{e.appName}</span>
                        <span className="flex items-center gap-2"><StoreBadge store={e.store} /><span className="text-[12px] font-semibold text-ink-2 whitespace-nowrap">{e.version}</span></span>
                      </span>
                    </span>
                    <span className="col-start-2 md:col-start-auto flex flex-wrap items-center gap-[10px] min-w-0">
                      {from && <><span className="text-[12.5px] font-semibold text-ink-3 whitespace-nowrap">{from}</span><ArrowRight size={14} className="text-ink-3 shrink-0" /></>}
                      <Pill tone={TONE[e.category]}>{to}</Pill>
                    </span>
                    <span className="hidden md:block text-[12.5px] font-semibold text-ink-3 whitespace-nowrap">{e.accountName}</span>
                    <span className="hidden md:flex items-center justify-end gap-1.5 text-[12.5px] font-bold text-ink-2"><MessageSquare size={14} />Posted</span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </Card>
    </>
  );
}
