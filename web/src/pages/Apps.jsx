// Apps — one row per product across App Store + Google Play (pen.dev frame I7JyL8).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Table2, LayoutGrid, ChevronRight, Search } from 'lucide-react';
import { AppIcon, Button, Empty, ListingStrip, PageHead, Pill, Skeleton, StoreIcon, cx } from '../components/ui.jsx';
import { LS, useData, useUi } from '../lib/store.jsx';
import { whenShort } from '../lib/format.js';
import { isAttention, isPending } from '../lib/model.js';
import { pillFor, subText } from './review/parts.jsx';

const FILTERS = [
  { key: 'all', label: 'All apps', test: () => true },
  { key: 'review', label: 'In review', test: (cats) => cats.some(isPending) },
  { key: 'attention', label: 'Needs attention', test: (cats) => cats.some(isAttention) },
  { key: 'ready', label: 'Ready to publish', test: (cats) => cats.includes('approved') },
  { key: 'live', label: 'Live', test: (cats) => cats.includes('live') },
];

const catsOf = (g) => [g.iosCh?.category, g.androidCh?.category, g.androidCh?.listing?.category].filter(Boolean);

function StoreCell({ store, c }) {
  if (!c) return <div className="text-[12.5px] font-medium text-ink-3">{store === 'apple' ? 'Not on the App Store' : 'Not on Google Play'}</div>;
  const p = pillFor(store, c);
  const s = subText(c);
  return (
    <div className="flex flex-col items-start gap-[6px] min-w-0">
      <Pill tone={p.tone}>{p.text}</Pill>
      <div className="flex gap-[6px] text-[12.5px] whitespace-nowrap min-w-0">
        <span className="font-bold text-ink">{c.version || '—'}</span>
        {s.text && <span className={cx('font-medium truncate', s.red ? 'text-red' : 'text-ink-3')}>· {s.text}</span>}
      </div>
      <ListingStrip listing={c.listing} className="max-w-full" />
    </div>
  );
}

function accountLabel(g, accounts) {
  const names = [...new Set(g.accountIds.map((id) => accounts.find((a) => a.id === id)?.name || id))];
  return names.join(', ');
}

function TableView({ rows, accounts, onOpen }) {
  return (
    <div className="bg-surface rounded-[20px] p-2 overflow-x-auto scroll-thin">
      <div className="min-w-[860px]">
        <div className="flex items-center gap-4 px-4 py-3 text-[11px] font-bold tracking-[0.8px] text-ink-3">
          <div className="flex-1">APP</div>
          <div className="w-[250px] flex items-center gap-1.5"><StoreIcon store="apple" size={12} />APP STORE · PRODUCTION</div>
          <div className="w-[250px] flex items-center gap-1.5"><StoreIcon store="google" size={12} />GOOGLE PLAY · PRODUCTION</div>
          <div className="w-[130px]">LAST CHANGE</div>
          <div className="w-9" />
        </div>
        {rows.map((g) => (
          <div key={g.id} role="button" tabIndex={0} onClick={() => onOpen(g)} onKeyDown={(e) => e.key === 'Enter' && onOpen(g)}
            className="group flex items-center gap-4 px-4 py-[14px] rounded-[14px] cursor-pointer hover:bg-surface-2 transition-colors">
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <AppIcon name={g.name} iconUrl={g.iconUrl} size={40} radius={11} />
              <div className="min-w-0 flex flex-col gap-[3px]">
                <div className="text-[14px] font-bold text-ink truncate">{g.name}</div>
                <div className="text-[12px] font-medium text-ink-3 truncate">{[g.bundle, accountLabel(g, accounts)].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div className="w-[250px]"><StoreCell store="apple" c={g.iosCh} /></div>
            <div className="w-[250px]"><StoreCell store="google" c={g.androidCh} /></div>
            <div className="w-[130px] text-[13px] font-semibold text-ink-2">{whenShort(g.lastChange)}</div>
            <span className="size-9 rounded-[10px] inline-flex items-center justify-center text-ink group-hover:bg-surface"><ChevronRight size={18} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileList({ rows, onOpen }) {
  return (
    <div className="md:hidden bg-surface rounded-[20px] p-2 flex flex-col">
      {rows.map((g) => (
        <button key={g.id} onClick={() => onOpen(g)} className="text-left flex flex-col gap-3 p-3 rounded-[14px] active:bg-surface-2">
          <div className="flex items-center gap-3 min-w-0">
            <AppIcon name={g.name} iconUrl={g.iconUrl} size={40} radius={11} />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-ink truncate">{g.name}</div>
              <div className="text-[12px] font-medium text-ink-3 truncate">{whenShort(g.lastChange)}</div>
            </div>
            <ChevronRight size={18} className="text-ink-3 shrink-0" />
          </div>
          {[['apple', g.iosCh], ['google', g.androidCh]].filter(([, c]) => c).map(([st, c]) => (
            <div key={st} className="flex items-start gap-2 pl-[52px] min-w-0">
              <StoreIcon store={st} size={14} className="mt-[6px] text-ink-2" />
              <div className="min-w-0 flex-1"><StoreCell store={st} c={c} /></div>
            </div>
          ))}
        </button>
      ))}
    </div>
  );
}

function GridView({ rows, accounts, onOpen }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((g) => (
        <button key={g.id} onClick={() => onOpen(g)} className="text-left bg-surface rounded-[20px] p-5 flex flex-col gap-4 hover:shadow-[0_6px_20px_rgba(15,17,12,.07)] transition">
          <div className="flex items-center gap-3">
            <AppIcon name={g.name} iconUrl={g.iconUrl} size={44} radius={12} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-ink truncate">{g.name}</div>
              <div className="text-[12px] font-medium text-ink-3 truncate">{g.bundle}</div>
            </div>
            <ChevronRight size={18} className="text-ink-3" />
          </div>
          {[['apple', g.iosCh], ['google', g.androidCh]].map(([s, c]) => (
            <div key={s} className="flex items-start gap-3 p-3 rounded-[14px] bg-surface-2">
              <span className="size-8 rounded-[9px] bg-surface inline-flex items-center justify-center text-ink"><StoreIcon store={s} size={15} /></span>
              <div className="min-w-0 flex-1"><StoreCell store={s} c={c} /></div>
            </div>
          ))}
          <div className="flex justify-between text-[12px] font-medium text-ink-3">
            <span className="truncate">{accountLabel(g, accounts)}</span>
            <span>{whenShort(g.lastChange)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-surface rounded-[20px] p-2">
      <div className="px-4 py-3 flex gap-4"><Skeleton className="h-3 w-12" /><span className="flex-1" /><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-24" /></div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-[14px]">
          <Skeleton className="size-10" />
          <div className="flex-1 flex flex-col gap-2"><Skeleton className="h-3.5 w-48" /><Skeleton className="h-3 w-64" /></div>
          <div className="w-[250px] flex flex-col gap-2"><Skeleton className="h-6 w-32 rounded-full" /><Skeleton className="h-3 w-40" /></div>
          <div className="w-[250px] flex flex-col gap-2"><Skeleton className="h-6 w-32 rounded-full" /><Skeleton className="h-3 w-40" /></div>
          <Skeleton className="h-3 w-[100px]" />
        </div>
      ))}
    </div>
  );
}

export default function Apps() {
  const { groups, loading, M, filters: gf } = useData();
  const { openApp } = useUi();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState(() => (FILTERS.some((f) => f.key === params.get('f')) ? params.get('f') : 'all'));
  const [view, setView] = useState(() => LS.get('rr-apps-view', 'table'));
  const accounts = M?.accounts || [];

  // Deep link: /dashboard/apps?app=<id>&store=<apple|google> opens that app's history.
  useEffect(() => {
    const f = params.get('f');
    if (f && FILTERS.some((x) => x.key === f)) setFilter(f);
    const id = params.get('app');
    if (id && M) {
      openApp(id, params.get('store') || undefined);
      params.delete('app');
      params.delete('store');
      setParams(params, { replace: true });
    }
  }, [params, M, openApp, setParams]);

  const q = (gf.q || '').toLowerCase();
  const base = useMemo(() => groups.filter((g) => !q || `${g.name} ${g.bundle}`.toLowerCase().includes(q)), [groups, q]);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, base.filter((g) => f.test(catsOf(g))).length]));
  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) || FILTERS[0];
    return base.filter((g) => f.test(catsOf(g))).sort((a, b) => (b.lastChange || 0) - (a.lastChange || 0));
  }, [base, filter]);
  const setV = (v) => { setView(v); LS.set('rr-apps-view', v); };
  const onOpen = (g) => openApp(g.id);

  return (
    <div>
      <PageHead
        title="Apps"
        sub={`${base.length} apps watched across App Store and Google Play`}
        actions={
          <>
            <div className="flex gap-[2px] p-1 bg-surface rounded-[12px]" role="tablist">
              {[{ v: 'table', l: 'Table', I: Table2 }, { v: 'grid', l: 'Grid', I: LayoutGrid }].map(({ v, l, I }) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setV(v)}
                  className={cx('h-8 px-3 inline-flex items-center gap-1.5 rounded-[9px] text-[13px] font-bold', view === v ? 'bg-primary text-on-primary' : 'text-ink-2 hover:text-ink')}>
                  <I size={15} />{l}
                </button>
              ))}
            </div>
            {M?.admin && <Button icon={Plus} onClick={() => nav('/dashboard/manage')}>Watch an app</Button>}
          </>
        }
      />
      <div className="flex gap-2 mb-5 overflow-x-auto scroll-thin -mx-4 px-4 md:mx-0 md:px-0">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cx('h-[34px] shrink-0 px-3 inline-flex items-center gap-2 rounded-full text-[13px] font-bold transition', on ? 'bg-primary text-on-primary' : 'bg-surface text-ink hover:bg-surface-3')}>
              {f.label}
              <span className={cx('text-[12px] font-bold', on ? 'text-accent dark:text-accent-text' : 'text-ink-3')}>{counts[f.key]}</span>
            </button>
          );
        })}
      </div>
      {loading ? (
        <TableSkeleton />
      ) : !rows.length ? (
        <div className="bg-surface rounded-[20px]"><Empty icon={Search} title="No apps match">Try another filter, or clear the search and store filter at the top.</Empty></div>
      ) : view === 'grid' ? (
        <GridView rows={rows} accounts={accounts} onOpen={onOpen} />
      ) : (
        <>
          <MobileList rows={rows} onOpen={onOpen} />
          <div className="hidden md:block"><TableView rows={rows} accounts={accounts} onOpen={onOpen} /></div>
        </>
      )}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap justify-between gap-2 px-2 mt-4 text-[13px]">
          <span className="font-medium text-ink-3">Showing {rows.length} of {base.length} apps · statuses refresh every 5 minutes</span>
          <span className="font-semibold text-ink-2 hidden sm:inline">Click a row to open its history</span>
        </div>
      )}
    </div>
  );
}
