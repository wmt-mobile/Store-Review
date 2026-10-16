// In review — kanban (pen.dev frame EaGox) + list view.
import { useMemo, useState } from 'react';
import { Columns3, List, ArrowDownWideNarrow, Clock3, Timer, Rocket, ExternalLink, PartyPopper } from 'lucide-react';
import { AppIcon, Button, Empty, PageHead, Pill, Skeleton, StoreBadge, cx } from '../components/ui.jsx';
import { LS, useData, useUi } from '../lib/store.jsx';
import { dur } from '../lib/format.js';
import { groupIdOf } from '../lib/model.js';
import { AcctChip, ProgressBar, channelRows, pillFor, relDay } from './review/parts.jsx';

const COLS = [
  { key: 'submitted', title: 'Waiting for review', desc: 'Sent to the store, not picked up yet', dot: 'bg-blue' },
  { key: 'in_review', title: 'In review', desc: 'A reviewer is looking at it', dot: 'bg-amber' },
  { key: 'approved', title: 'Approved · ready to publish', desc: 'Passed review — release when ready', dot: 'bg-green' },
  { key: 'live', title: 'Live', desc: 'Released in the last 7 days', dot: 'bg-green' },
];

const SORTS = [
  { key: 'longest', label: 'Longest waiting first' },
  { key: 'recent', label: 'Most recent first' },
  { key: 'name', label: 'App name A–Z' },
];

function sortRows(rows, sort) {
  const r = [...rows];
  if (sort === 'name') return r.sort((a, b) => a.appName.localeCompare(b.appName));
  if (sort === 'recent') return r.sort((a, b) => (b.since || 0) - (a.since || 0));
  return r.sort((a, b) => (b.elapsedMs ?? -(b.since || 0)) - (a.elapsedMs ?? -(a.since || 0)));
}

function useBoard() {
  const { apps, M } = useData();
  return useMemo(() => {
    const now = Date.now();
    const rows = channelRows(apps, M?.accounts);
    const by = { submitted: [], in_review: [], approved: [], live: [] };
    for (const r of rows) {
      if (r.category === 'live') {
        if (r.since && now - r.since < 7 * 86_400_000) by.live.push(r);
      } else if (by[r.category]) by[r.category].push(r);
    }
    return by;
  }, [apps, M]);
}

function Card({ r, col, onOpen }) {
  const { M } = useData();
  const limit = (M?.stuckHours || 24) * 3_600_000;
  const stuck = r.stuck;
  const pending = col === 'submitted' || col === 'in_review';
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cx('w-full flex flex-col gap-[14px] p-[14px] bg-surface rounded-[16px] text-left cursor-pointer hover:shadow-[0_4px_16px_rgba(15,17,12,.06)] transition', stuck && 'ring-[1.5px] ring-inset ring-red')}>
      <div className="flex items-center gap-[10px]">
        <AppIcon name={r.appName} iconUrl={r.iconUrl} size={36} radius={10} />
        <div className="flex-1 min-w-0 flex flex-col gap-[5px]">
          <div className="text-[14px] font-bold text-ink truncate">{r.appName}</div>
          <div className="flex items-center gap-2 min-w-0">
            <StoreBadge store={r.store} />
            <span className="text-[12px] font-semibold text-ink-2 whitespace-nowrap truncate">{r.version}</span>
          </div>
        </div>
      </div>
      {col === 'in_review' && <ProgressBar value={(r.elapsedMs || 0) / limit} red={stuck} />}
      <div className="flex items-center gap-2">
        {col === 'approved' ? <Timer size={14} className="text-ink-2" /> : col === 'live' ? <Rocket size={14} className="text-ink-3" /> : <Clock3 size={14} className={stuck ? 'text-red' : 'text-ink-3'} />}
        {pending && <span className={cx('text-[13px] font-extrabold', stuck ? 'text-red' : 'text-ink')}>{dur(r.elapsedMs)}</span>}
        {pending && !stuck && <span className="text-[12px] font-medium text-ink-3">{col === 'submitted' ? 'waiting' : 'in review'}</span>}
        {col === 'approved' && <><span className="text-[13px] font-extrabold text-ink">{r.reviewMs ? dur(r.reviewMs) : relDay(r.since)}</span><span className="text-[12px] font-medium text-ink-3">{r.reviewMs ? 'took' : 'approved'}</span></>}
        {col === 'live' && <><span className="text-[13px] font-extrabold text-ink">{relDay(r.since)}</span>{r.status !== 'ROLLOUT' && <span className="text-[12px] font-medium text-ink-3">released</span>}</>}
        <span className="flex-1" />
        {stuck && <span className="px-2 py-[3px] rounded-full bg-red-soft text-red text-[11px] font-extrabold">Over {M?.stuckHours || 24}h</span>}
        {r.status === 'ROLLOUT' && <span className="px-2 py-[3px] rounded-full bg-accent-soft text-accent-text text-[11px] font-extrabold">Staged{r.userFraction != null ? ` · ${Math.round(r.userFraction * 100)}%` : ''}</span>}
        <AcctChip name={r.accountName} />
      </div>
      {col === 'approved' && r.url && (
        <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          className="h-10 rounded-[12px] bg-primary text-on-primary text-[13.5px] font-bold inline-flex items-center justify-center gap-2 hover:opacity-90">
          <ExternalLink size={15} /> {r.store === 'google' ? 'Publish in Play Console' : 'Release in App Store Connect'}
        </a>
      )}
    </div>
  );
}

function Column({ col, rows, onOpen }) {
  return (
    <div className="flex-1 min-w-[260px] flex flex-col gap-3 p-2 bg-surface-2 rounded-[22px] md:min-h-[calc(100vh-230px)]">
      <div className="flex flex-col gap-1 px-[6px] pt-[6px] pb-2">
        <div className="flex items-center gap-2">
          <span className={cx('size-2 rounded-full', col.dot)} />
          <span className="text-[14px] font-extrabold text-ink whitespace-nowrap">{col.title}</span>
          <span className="px-[7px] py-[1px] rounded-full bg-surface text-[12px] font-extrabold text-ink-2">{rows.length}</span>
        </div>
        <div className="text-[12px] font-medium text-ink-3">{col.desc}</div>
      </div>
      {rows.map((r) => <Card key={r.id} r={r} col={col.key} onOpen={() => onOpen(r)} />)}
      {col.key === 'approved' && rows.length < 2 && (
        <div className="flex flex-col items-center justify-center gap-2 h-[94px] rounded-[16px] border-[1.5px] border-dashed border-line text-ink-3">
          <PartyPopper size={18} />
          <span className="text-[12.5px] font-medium">Approvals land here automatically</span>
        </div>
      )}
      {col.key !== 'approved' && !rows.length && <div className="px-2 py-6 text-center text-[12.5px] font-medium text-ink-3">Nothing here right now</div>}
    </div>
  );
}

function ListView({ board, onOpen }) {
  const rows = COLS.flatMap((c) => board[c.key].map((r) => ({ ...r, col: c.key })));
  if (!rows.length) return <div className="bg-surface rounded-[20px]"><Empty icon={PartyPopper} title="No apps in review right now 🎉">Everything's either live or waiting on you. We'll post to Google Chat the moment a build is submitted.</Empty></div>;
  return (
    <div className="bg-surface rounded-[20px] p-2 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="text-[11px] font-bold tracking-[1.2px] text-ink-3 uppercase">
            {['App', 'Store', 'Version', 'Status', 'Time', 'Account'].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = pillFor(r.store, r);
            return (
              <tr key={r.id} onClick={() => onOpen(r)} className="cursor-pointer hover:bg-surface-2 [&>td]:first:rounded-l-[14px]">
                <td className="px-4 py-3 rounded-l-[14px]"><span className="flex items-center gap-3"><AppIcon name={r.appName} iconUrl={r.iconUrl} size={32} radius={9} /><span className="text-[14px] font-bold text-ink">{r.appName}</span></span></td>
                <td className="px-4 py-3"><StoreBadge store={r.store} /></td>
                <td className="px-4 py-3 text-[13px] font-semibold text-ink-2 whitespace-nowrap">{r.version}</td>
                <td className="px-4 py-3"><Pill tone={p.tone}>{p.text}</Pill></td>
                <td className={cx('px-4 py-3 text-[13px] font-extrabold whitespace-nowrap', r.stuck ? 'text-red' : 'text-ink')}>
                  {r.col === 'approved' ? (r.reviewMs ? `took ${dur(r.reviewMs)}` : relDay(r.since)) : r.col === 'live' ? relDay(r.since) : dur(r.elapsedMs)}
                </td>
                <td className="px-4 py-3 rounded-r-[14px]"><span className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><AcctChip name={r.accountName} />{r.accountName}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto">
      {COLS.map((c, i) => (
        <div key={c.key} className="flex-1 min-w-[260px] p-2 bg-surface-2 rounded-[22px] flex flex-col gap-3 min-h-[600px]">
          <div className="px-[6px] pt-[6px] pb-2 flex flex-col gap-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-44" /></div>
          {Array.from({ length: [2, 3, 1, 3][i] }).map((_, j) => (
            <div key={j} className="bg-surface rounded-[16px] p-[14px] flex flex-col gap-[14px]">
              <div className="flex gap-[10px] items-center"><Skeleton className="size-9" /><div className="flex-1 flex flex-col gap-2"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function InReview() {
  const { loading } = useData();
  const { openApp } = useUi();
  const board = useBoard();
  const [view, setView] = useState(() => LS.get('rr-review-view', 'board'));
  const [sort, setSort] = useState(() => LS.get('rr-review-sort', 'longest'));
  const setV = (v) => { setView(v); LS.set('rr-review-view', v); };
  const nextSort = () => {
    const i = SORTS.findIndex((s) => s.key === sort);
    const n = SORTS[(i + 1) % SORTS.length].key;
    setSort(n);
    LS.set('rr-review-sort', n);
  };
  const sorted = useMemo(() => Object.fromEntries(Object.entries(board).map(([k, v]) => [k, sortRows(v, sort)])), [board, sort]);
  const open = (r) => openApp(groupIdOf(r.appName), r.store);
  const label = SORTS.find((s) => s.key === sort)?.label;

  return (
    <div>
      <PageHead
        title="In review"
        sub="Every build between submission and release · auto-refreshes every 5 min"
        actions={
          <>
            <div className="flex gap-[2px] p-1 bg-surface rounded-[12px]" role="tablist">
              {[{ v: 'board', l: 'Board', I: Columns3 }, { v: 'list', l: 'List', I: List }].map(({ v, l, I }) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setV(v)}
                  className={cx('h-8 px-3 inline-flex items-center gap-1.5 rounded-[9px] text-[13px] font-bold', view === v ? 'bg-primary text-on-primary' : 'text-ink-2 hover:text-ink')}>
                  <I size={15} />{l}
                </button>
              ))}
            </div>
            <button onClick={nextSort} title="Change sort order" className="h-10 px-[14px] inline-flex items-center gap-2 bg-surface rounded-[12px] text-[13px] font-bold text-ink">
              <ArrowDownWideNarrow size={16} />{label}
            </button>
          </>
        }
      />
      {loading ? (
        <BoardSkeleton />
      ) : view === 'list' ? (
        <ListView board={sorted} onOpen={open} />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x md:snap-none">
          {COLS.map((c) => <Column key={c.key} col={c} rows={sorted[c.key]} onOpen={open} />)}
        </div>
      )}
    </div>
  );
}
