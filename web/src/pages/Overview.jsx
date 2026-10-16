// Overview (pen.dev "Overview — Desktop" / "Tablet — Overview" / "Skeleton — Overview").
import { Download, RefreshCw, CloudOff, Loader2 } from 'lucide-react';
import { Button, Card, Skeleton, cx } from '../components/ui.jsx';
import { useData, useUi } from '../lib/store.jsx';
import { ago } from '../lib/format.js';
import { statusLabel } from '../lib/model.js';
import { ReleasesChart } from './overview/ReleasesChart.jsx';
import { MetricTiles, InReviewCard, AccountsCard, LimitCard, ActivityCard, HealthCard } from './overview/Cards.jsx';
import { downloadCsv } from './overview/helpers.js';

function exportStatuses(apps, M) {
  const acc = Object.fromEntries((M?.accounts || []).map((a) => [a.id, a.name]));
  const rows = [['App', 'Store', 'Channel', 'Version', 'Status', 'Since', 'Account']];
  for (const a of apps) {
    for (const c of Object.values(a.channels || {})) {
      rows.push([a.name, a.store === 'apple' ? 'App Store' : 'Google Play', c.channelLabel, c.version, statusLabel(a.store, c.status, c.label, c), c.since ? new Date(c.since).toISOString() : '', acc[a.accountId] || a.accountId]);
    }
  }
  downloadCsv(`review-radar-statuses-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

function Header() {
  const { M, pending, attention, apps, accounts, checkNow, checking } = useData();
  const { toast } = useUi();
  const last = Math.max(0, ...accounts.map((a) => a.lastPollAt || 0)) || null;
  const inRev = pending.filter((r) => r.category === 'in_review').length;
  const run = async () => {
    await checkNow();
    toast({ title: 'Stores checked', body: 'App Store and Google Play statuses are up to date.', tone: 'ok' });
  };
  return (
    <div className="flex flex-wrap items-end gap-4 pb-1">
      <div className="flex-1 min-w-[240px] flex flex-col gap-[6px]">
        <h1 className="text-[28px] xl:text-[32px] leading-[1.15] font-extrabold tracking-[-0.8px] text-ink">Overview</h1>
        <p className="text-[13px] xl:text-[14px] font-medium text-ink-2">
          {inRev} app{inRev === 1 ? '' : 's'} in review · {attention.length} need{attention.length === 1 ? 's' : ''} attention · {last ? `stores checked ${ago(last)}` : 'waiting for the first check'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" icon={Download} onClick={() => exportStatuses(apps, M)} disabled={!M}>Export</Button>
        <Button icon={checking ? undefined : RefreshCw} loading={checking} onClick={run} disabled={!M}>{checking ? 'Checking…' : 'Check stores now'}</Button>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading overview">
      <div className="flex items-end gap-4 pb-1">
        <div className="flex-1 flex flex-col gap-3"><Skeleton className="h-[34px] w-[220px]" /><Skeleton className="h-[14px] w-[420px] max-w-full" /></div>
        <Skeleton className="hidden sm:block h-10 w-[110px] rounded-[12px]" /><Skeleton className="hidden sm:block h-10 w-[170px] rounded-[12px]" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 xl:gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3"><Skeleton className="size-8" /><Skeleton className="h-3 w-[90px]" /></div>
            <Skeleton className="h-9 w-[60px]" /><Skeleton className="h-3 w-[120px]" />
          </Card>
        ))}
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_500px] gap-5">
        <Card className="p-6 h-[452px] flex flex-col gap-4">
          <Skeleton className="h-4 w-[180px]" /><Skeleton className="h-3 w-[260px]" />
          <div className="flex gap-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-[70px]" />)}</div>
          <div className="flex-1 flex items-end gap-3">
            {Array.from({ length: 14 }, (_, i) => (
              <div key={i} className="flex-1 flex items-end gap-1 h-full">
                <div className="skeleton flex-1 rounded-[4px]" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
                <div className="skeleton flex-1 rounded-[4px]" style={{ height: `${20 + ((i * 53) % 50)}%` }} />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 h-[452px] flex flex-col gap-5">
          <Skeleton className="h-4 w-[130px]" />
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="size-10" /><div className="flex-1 flex flex-col gap-2"><Skeleton className="h-3 w-[60%]" /><Skeleton className="h-3 w-[40%]" /></div><Skeleton className="h-6 w-[70px] rounded-full" /></div>)}
        </Card>
      </div>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 h-[38px] px-4 rounded-full bg-[#0F110C] text-white text-[13px] font-bold shadow-lg">
        <Loader2 size={14} className="animate-spin text-accent" /> Syncing App Store &amp; Google Play…
      </div>
    </div>
  );
}

function OverviewError({ error, retry }) {
  return (
    <Card className="max-w-[440px] mx-auto mt-10 flex flex-col items-center text-center px-6 py-10">
      <span className="size-[72px] rounded-full bg-red-soft text-red inline-flex items-center justify-center mb-5"><CloudOff size={30} /></span>
      <h3 className="text-[18px] font-bold text-ink">Couldn’t load the dashboard</h3>
      <p className="mt-2 max-w-[320px] text-[13.5px] leading-[1.5] text-ink-2">{error?.message || 'The server did not answer.'} Statuses keep updating in the background.</p>
      <div className="mt-5"><Button icon={RefreshCw} onClick={retry}>Retry now</Button></div>
    </Card>
  );
}

export function Overview() {
  const { M, error, loading, reload } = useData();
  if (loading) return <OverviewSkeleton />;
  if (!M) return <OverviewError error={error} retry={reload} />;
  return (
    <div className="flex flex-col gap-4 xl:gap-5">
      <Header />
      <MetricTiles />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_500px] gap-4 xl:gap-5">
        <ReleasesChart className="md:h-[400px] xl:h-[452px]" />
        <InReviewCard className="xl:h-[452px]" />
      </div>
      <div className="grid lg:grid-cols-2 xl:grid-cols-[620px_minmax(0,1fr)] gap-4 xl:gap-5">
        <AccountsCard className="lg:col-span-2 xl:col-span-1" />
        <LimitCard className="lg:col-span-2 xl:col-span-1" />
      </div>
      <div className={cx('grid xl:grid-cols-[minmax(0,1fr)_320px] gap-4 xl:gap-5')}>
        <ActivityCard />
        <HealthCard />
      </div>
    </div>
  );
}
