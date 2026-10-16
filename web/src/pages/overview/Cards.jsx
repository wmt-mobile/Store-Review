// Overview cards: metric tiles, In review now, developer accounts (wallets), review time limit, recent activity, store health.
import { useNavigate, Link } from 'react-router-dom';
import { Hourglass, Clock3, CircleCheck, CircleX, Rocket, RefreshCw, ArrowRight, MessageSquare, TriangleAlert } from 'lucide-react';
import { AppleLogo, GooglePlayLogo } from '@phosphor-icons/react';
import { AppIcon, Card, Pill, StoreBadge, cx } from '../../components/ui.jsx';
import { useData, useUi } from '../../lib/store.jsx';
import { TONE, groupIdOf, platformName } from '../../lib/model.js';
import { ago, dur, inFuture, time } from '../../lib/format.js';
import { approvalRates, eventTo, fixLabel } from './helpers.js';

const CardTitle = ({ children }) => <h2 className="text-[17px] font-extrabold tracking-[-0.2px] text-ink whitespace-nowrap">{children}</h2>;
const HeadLink = ({ to, children }) => <Link to={to} className="text-[13px] font-bold text-ink-2 hover:text-ink whitespace-nowrap">{children} →</Link>;

/* ── metric tiles ─────────────────────────────────── */
function Tile({ icon: Icon, chip, label, value, foot, tone = 'plain', onClick, className }) {
  const lime = tone === 'lime';
  const ink = tone === 'ink';
  return (
    <button onClick={onClick} className={cx('text-left flex flex-col gap-[18px] p-[18px] xl:p-5 rounded-[20px] transition hover:-translate-y-px min-w-0', lime ? 'bg-accent' : ink ? 'bg-[#0F110C] dark:bg-surface-3' : 'bg-surface', className)}>
      <span className="flex items-center gap-[10px] min-w-0">
        <span className={cx('size-8 shrink-0 rounded-[10px] inline-flex items-center justify-center', chip)}><Icon size={16} strokeWidth={2.2} /></span>
        <span className={cx('text-[13.5px] font-bold truncate', lime ? 'text-accent-ink' : ink ? 'text-white' : 'text-ink-2')}>{label}</span>
      </span>
      <span className="flex flex-col gap-1 min-w-0">
        <span className={cx('text-[40px] leading-[40px] font-extrabold tracking-[-1.2px]', lime ? 'text-accent-ink' : ink ? 'text-white' : 'text-ink')}>{value}</span>
        <span className={cx('text-[12.5px] font-semibold truncate', lime ? 'text-[#0F110CB3]' : 'text-ink-3')}>{foot}</span>
      </span>
    </button>
  );
}

export function MetricTiles() {
  const nav = useNavigate();
  const { pending, attention, apps, groups, accounts, M } = useData();
  const inReview = pending.filter((r) => r.category === 'in_review');
  const waiting = pending.filter((r) => r.category === 'submitted');
  const longest = [...inReview].sort((a, b) => (b.elapsedMs || 0) - (a.elapsedMs || 0))[0];
  const avgWait = waiting.length ? waiting.reduce((s, r) => s + (r.elapsedMs || 0), 0) / waiting.length : null;
  const chans = apps.flatMap((a) => Object.values(a.channels || {}));
  const approved = chans.filter((c) => c.category === 'approved').length;
  const listings = chans.filter((c) => c.category === 'live' || c.liveVersion).length;
  const liveApps = groups.filter((g) => [g.iosCh, g.androidCh].some((c) => c && (c.category === 'live' || c.liveVersion))).length;
  const next = Math.min(...accounts.map((a) => a.nextCheckAt || (a.lastPollAt ? a.lastPollAt + (a.intervalMin || 5) * 60_000 : Infinity)));
  const every = [...new Set(accounts.map((a) => a.intervalMin || M?.prefs?.applePollMinutes || 5))];
  const nextVal = isFinite(next) ? inFuture(next).replace(/^in /, '').replace(' min', 'm').replace('<1m', '<1m') : '—';
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 xl:gap-4">
      <Tile tone="lime" icon={Hourglass} chip="bg-[#0F110C] text-accent" label="In review now" value={inReview.length} foot={longest ? `Longest ${dur(longest.elapsedMs)} · ${longest.appName}` : 'Nothing in review'} onClick={() => nav('/dashboard/review')} />
      <Tile icon={Clock3} chip="bg-blue-soft text-blue" label="Waiting" value={waiting.length} foot={avgWait != null ? `Avg wait ${dur(avgWait)}` : 'Queue is empty'} onClick={() => nav('/dashboard/review')} />
      <Tile icon={CircleCheck} chip="bg-green-soft text-green" label="Approved" value={approved} foot="Ready to publish" onClick={() => nav('/dashboard/apps?f=ready')} />
      <Tile icon={CircleX} chip="bg-red-soft text-red" label="Rejected" value={attention.length} foot={attention.length ? 'Needs a fix today' : 'All clear'} onClick={() => nav('/dashboard/attention')} />
      <Tile icon={Rocket} chip="bg-accent-soft text-accent-text" label="Live apps" value={liveApps} foot={`${listings} store listing${listings === 1 ? '' : 's'}`} onClick={() => nav('/dashboard/apps?f=live')} />
      <Tile tone="ink" icon={RefreshCw} chip="bg-white/[.12] text-accent" label="Next check" value={nextVal} foot={`${accounts.length > 1 ? 'Both stores' : 'Store'} · every ${every.join('/')} min`} onClick={() => nav('/dashboard/accounts')} className="xl:hidden" />
    </div>
  );
}

/* ── In review now ────────────────────────────────── */
export function InReviewCard({ className }) {
  const { pending, M } = useData();
  const { openApp } = useUi();
  const rows = pending.slice(0, 5);
  return (
    <Card className={cx('flex flex-col gap-[6px] p-6 min-w-0', className)}>
      <div className="flex items-center gap-[10px] pb-2">
        <CardTitle>In review now</CardTitle>
        <span className="px-2 py-[2px] rounded-full bg-amber-soft text-amber text-[12px] font-extrabold">{pending.length}</span>
        <span className="flex-1" />
        <HeadLink to="/dashboard/review">View pipeline</HeadLink>
      </div>
      {!rows.length && <p className="py-8 text-center text-[13.5px] text-ink-3">No builds waiting or in review right now 🎉</p>}
      {rows.map((r) => {
        const over = r.stuck;
        const inRev = r.category === 'in_review';
        return (
          <button key={r.appKey + r.channel} onClick={() => openApp(groupIdOf(r.appName), r.store)} className="w-full flex items-center gap-[14px] py-[10px] text-left rounded-[12px] hover:bg-surface-2/60 -mx-2 px-2 box-content">
            <AppIcon name={r.appName} iconUrl={r.iconUrl} size={40} />
            <span className="flex-1 min-w-0 flex flex-col gap-[5px]">
              <span className="text-[14px] font-bold text-ink truncate">{r.appName}</span>
              <span className="flex items-center gap-2 min-w-0">
                <StoreBadge store={r.store} />
                <span className="text-[12.5px] font-semibold text-ink-2 truncate">{r.version}</span>
              </span>
            </span>
            <span className="hidden sm:block"><Pill tone={TONE[r.category]}>{inRev ? 'In review' : 'Waiting'}</Pill></span>
            <span className="w-[72px] shrink-0 flex flex-col items-end gap-[2px]">
              <span className={cx('text-[14px] font-extrabold whitespace-nowrap', over ? 'text-red' : 'text-ink')}>{dur(r.elapsedMs)}</span>
              <span className={cx('text-[11.5px] font-medium whitespace-nowrap', over ? 'text-red' : 'text-ink-3')}>{over ? 'over limit' : inRev ? 'in review' : 'waiting'}</span>
            </span>
          </button>
        );
      })}
      {M && pending.length > rows.length && <Link to="/dashboard/review" className="pt-2 text-[12.5px] font-bold text-ink-2 hover:text-ink">+ {pending.length - rows.length} more in the pipeline</Link>}
    </Card>
  );
}

/* ── Developer accounts ───────────────────────────── */
const RING = "path('M100 0 C155.228 0 200 44.772 200 100 C200 155.228 155.228 200 100 200 C44.772 200 0 155.228 0 100 C0 44.772 44.772 0 100 0 Z M100 20 C55.817 20 20 55.817 20 100 C20 144.183 55.817 180 100 180 C144.183 180 180 144.183 180 100 C180 55.817 144.183 20 100 20 Z')";

function hintOf(a) {
  if (a.store === 'apple') return a.keyHint ? `KEY ID •••• ${a.keyHint}` : 'API KEY';
  const local = a.keyHint || (a.clientEmail ? a.clientEmail.split('@')[0].replace(/[^a-z0-9]/gi, '').slice(-4) : null);
  return local ? `SERVICE ACCOUNT •••• ${local}` : 'SERVICE ACCOUNT';
}

function Wallet({ a }) {
  const apple = a.store === 'apple';
  const fails = (a.checks || []).filter((c) => !c.ok).length || (a.error ? 1 : 0);
  return (
    <Link to="/dashboard/accounts" className={cx('relative overflow-hidden flex-1 min-w-[230px] h-[220px] flex flex-col justify-between p-5 rounded-[18px]', apple ? 'bg-[linear-gradient(218deg,#23261E_15%,#0B0C09_85%)] ring-1 ring-inset ring-white/[.08] text-white' : 'bg-[linear-gradient(218deg,#D4FA5A_15%,#B2E61E_85%)] text-[#0F110C]')}>
      <span aria-hidden className={cx('absolute left-[150px] top-[-70px] size-[200px]', apple ? 'bg-white/[.063]' : 'bg-[#0F110C]/[.07]')} style={{ clipPath: RING }} />
      <span className="relative flex items-center gap-2">
        {apple ? <AppleLogo size={20} /> : <GooglePlayLogo size={20} />}
        <span className="flex-1 text-[13px] font-bold opacity-80 truncate">{apple ? 'App Store Connect' : 'Google Play Console'}</span>
        {a.error ? (
          <span className="inline-flex items-center gap-[5px] px-2 py-[3px] rounded-full bg-white/80 text-red text-[11px] font-extrabold"><span className="size-[6px] rounded-full bg-red" />{fails} error{fails === 1 ? '' : 's'}</span>
        ) : (
          <span className={cx('inline-flex items-center gap-[5px] px-2 py-[3px] rounded-full text-[11px] font-extrabold', apple ? 'bg-accent/15 text-accent' : 'bg-white/80 text-green')}><span className={cx('size-[6px] rounded-full', apple ? 'bg-accent' : 'bg-green')} />Verified</span>
        )}
      </span>
      <span className="relative flex flex-col gap-1 pt-[18px] min-w-0">
        <span className="text-[18px] font-extrabold tracking-[-0.3px] truncate">{a.name}</span>
        <span className="text-[12px] font-semibold tracking-[1px] opacity-60 truncate">{hintOf(a)}</span>
      </span>
      <span className="relative flex items-center gap-2 pt-[18px]">
        <span className="flex-1 text-[12.5px] font-bold">{a.appCount} apps watched</span>
        <span className="text-[12.5px] font-semibold opacity-70 whitespace-nowrap">{a.error ? `Last OK ${ago(a.lastPollAt)}` : `Checked ${ago(a.lastPollAt).replace(' min ago', 'm ago')}`}</span>
      </span>
    </Link>
  );
}

export function AccountsCard({ className }) {
  const { accounts, M } = useData();
  const mins = [...new Set(accounts.map((a) => a.intervalMin || M?.prefs?.applePollMinutes || 5))];
  return (
    <Card className={cx('flex flex-col gap-5 p-6 min-w-0', className)}>
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <CardTitle>Developer accounts</CardTitle>
          <p className="mt-1 text-[13px] leading-[18px] font-medium text-ink-3">{accounts.length} connected · checked every {mins.join('/') || 5} min</p>
        </div>
        <HeadLink to="/dashboard/accounts">Manage</HeadLink>
      </div>
      <div className="grid gap-[14px] grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
        {accounts.map((a) => <Wallet key={a.id} a={a} />)}
        {!accounts.length && <Link to="/onboarding" className="flex-1 h-[220px] rounded-[18px] ring-[1.5px] ring-dashed ring-line inline-flex items-center justify-center text-[13.5px] font-bold text-ink-2">+ Connect a developer account</Link>}
      </div>
    </Card>
  );
}

/* ── Review time limit ────────────────────────────── */
export function LimitCard({ className }) {
  const { pending, M } = useData();
  const { openApp } = useUi();
  const limit = M?.stuckHours || 24;
  const rows = pending.filter((r) => r.category === 'in_review' || r.stuck).sort((a, b) => (b.elapsedMs || 0) - (a.elapsedMs || 0)).slice(0, 3);
  const over = pending.filter((r) => r.stuck).length;
  return (
    <Card className={cx('flex flex-col gap-5 p-6 min-w-0', className)}>
      <div>
        <CardTitle>Review time limit</CardTitle>
        <p className="mt-1 text-[13px] leading-[18px] font-medium text-ink-3">Flags builds stuck in review longer than {limit}h</p>
      </div>
      <div className="flex items-center gap-[10px]">
        <span className={cx('text-[40px] leading-[40px] font-extrabold tracking-[-1px]', over ? 'text-red' : 'text-ink')}>{over}</span>
        <span className="text-[13px] leading-[18px] font-semibold text-ink-2">build{over === 1 ? '' : 's'} over the limit<br />{over ? 'flagged on the In review board' : 'everything is within the limit'}</span>
      </div>
      {!rows.length && <p className="text-[13px] text-ink-3">No builds in review right now.</p>}
      {rows.map((r) => {
        const p = Math.min(1, (r.elapsedMs || 0) / (limit * 3_600_000));
        return (
          <button key={r.appKey + r.channel} onClick={() => openApp(groupIdOf(r.appName), r.store)} className="w-full flex flex-col gap-2 text-left">
            <span className="w-full flex items-center gap-2">
              <span className="text-[13px] font-bold text-ink truncate max-w-[60%]">{r.appName.split(/\s[-–]\s/)[0]} · {platformName(r.store)}</span>
              <span className="flex-1 text-[12px] font-semibold text-ink-3 truncate">{r.version}</span>
              <span className={cx('text-[13px] font-extrabold whitespace-nowrap', r.stuck ? 'text-red' : 'text-amber')}>{dur(r.elapsedMs)}{r.stuck ? ` / ${limit}h` : ''}</span>
            </span>
            <span className="relative w-full h-2 rounded-full bg-surface-2 overflow-hidden">
              <span className={cx('absolute inset-y-0 left-0 rounded-full', r.stuck ? 'bg-red' : 'bg-amber')} style={{ width: `${Math.max(3, p * 100)}%` }} />
            </span>
          </button>
        );
      })}
    </Card>
  );
}

/* ── Recent activity ──────────────────────────────── */
export function ActivityCard({ className }) {
  const { activity } = useData();
  const { openApp } = useUi();
  const rows = activity.slice(0, 5);
  return (
    <Card className={cx('flex flex-col gap-1 p-6 min-w-0', className)}>
      <div className="flex items-center gap-[10px] pb-3 flex-wrap">
        <CardTitle>Recent activity</CardTitle>
        <span className="inline-flex items-center gap-[6px] px-2 py-[3px] rounded-full bg-accent-soft text-accent-text text-[11.5px] font-bold"><span className="size-[6px] rounded-full bg-accent-text" />Live from app_review_bot</span>
        <span className="flex-1" />
        <HeadLink to="/dashboard/activity">Open activity</HeadLink>
      </div>
      {!rows.length && <p className="py-8 text-center text-[13.5px] text-ink-3">No status changes yet. They appear here the moment the bot sees one.</p>}
      {rows.map((e, i) => (
        <button key={e.id} onClick={() => openApp(groupIdOf(e.appName), e.store)} className={cx('w-full flex items-center gap-[14px] py-3 text-left', i < rows.length - 1 && 'border-b border-line')}>
          <span className="w-[44px] shrink-0 text-[12.5px] font-bold text-ink-3">{time(e.at)}</span>
          <AppIcon name={e.appName} iconUrl={e.iconUrl} size={34} radius={10} />
          <span className="flex-1 min-w-0 flex flex-col gap-[6px]">
            <span className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-[14px] font-bold text-ink truncate">{e.appName}</span>
              <StoreBadge store={e.store} />
              <span className="text-[12.5px] font-semibold text-ink-2 whitespace-nowrap">{e.version}</span>
            </span>
            <span className="flex items-center gap-2 min-w-0 flex-wrap">
              {e.fromLabel && <><span className="text-[12.5px] font-semibold text-ink-3 whitespace-nowrap">{fixLabel(e.store, e.fromLabel)}</span><ArrowRight size={14} className="text-ink-3 shrink-0" /></>}
              <Pill tone={TONE[e.category]}>{eventTo(e.store, e)}</Pill>
            </span>
          </span>
          <span className="hidden sm:flex items-center gap-[6px] text-ink-3 shrink-0"><MessageSquare size={15} /><span className="text-[12px] font-semibold">Posted to Chat</span></span>
        </button>
      ))}
    </Card>
  );
}

/* ── Store health ─────────────────────────────────── */
function Gauge({ value }) {
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const label = value == null ? 'No data yet' : v >= 0.8 ? 'Healthy' : v >= 0.6 ? 'Fair' : 'Needs attention';
  return (
    <div className="relative w-full h-[150px] flex justify-center">
      <svg viewBox="0 0 220 112" className="absolute top-3 w-[220px] h-[112px]" aria-hidden>
        <path d="M12.1 110 A97.9 97.9 0 0 1 207.9 110" fill="none" stroke="var(--surface-2)" strokeWidth="24.2" />
        <path d="M12.1 110 A97.9 97.9 0 0 1 207.9 110" fill="none" stroke="var(--accent)" strokeWidth="24.2" pathLength="100" strokeDasharray={`${v * 100} 100`} />
      </svg>
      <div className="absolute top-[70px] flex flex-col items-center gap-[2px]">
        <span className="text-[36px] leading-none font-extrabold tracking-[-1px] text-ink">{value == null ? '—' : `${Math.round(v * 100)}%`}</span>
        <span className={cx('text-[13px] font-bold', v >= 0.8 || value == null ? 'text-accent-text' : v >= 0.6 ? 'text-amber' : 'text-red')}>{label}</span>
      </div>
    </div>
  );
}

export function HealthCard({ className }) {
  const { M, apps, accounts } = useData();
  const r = approvalRates(apps);
  const overall = M?.stats?.approvalRate30 ?? r.all;
  const broken = accounts.filter((a) => a.error);
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  return (
    <Card className={cx('flex flex-col gap-3 p-6 min-w-0', className)}>
      <div>
        <CardTitle>Store health</CardTitle>
        <p className="mt-1 text-[13px] leading-[18px] font-medium text-ink-3">Approval rate &amp; check success, 30d</p>
      </div>
      <Gauge value={overall} />
      <div className="flex gap-[10px]">
        {[['apple', 'App Store', r.apple], ['google', 'Google Play', r.google]].map(([s, l, v]) => (
          <div key={s} className="flex-1 flex flex-col gap-1 p-3 rounded-[14px] bg-surface-2">
            <span className="flex items-center gap-[6px] text-ink-2">{s === 'apple' ? <AppleLogo size={14} className="text-ink" /> : <GooglePlayLogo size={14} className="text-ink" />}<span className="text-[12px] font-semibold">{l}</span></span>
            <span className={cx('text-[18px] font-extrabold', v != null && v < 0.9 ? 'text-amber' : 'text-ink')}>{pct(v)}</span>
          </div>
        ))}
      </div>
      <div className="flex-1" />
      {broken.map((a) => {
        const fails = (a.checks || []).slice(0, 24).findIndex((c) => c.ok);
        const n = fails < 0 ? (a.checks || []).length : fails;
        return (
          <Link key={a.id} to="/dashboard/accounts" className="flex items-center gap-2 p-3 rounded-[14px] bg-amber-soft text-amber">
            <TriangleAlert size={16} className="shrink-0" />
            <span className="flex-1 text-[12px] leading-[17px] font-semibold">{a.store === 'apple' ? 'App Store' : 'Play'} check failed{n > 1 ? ` ${n}×` : ''} — {String(a.error).replace(/^poll:\s*/, '')}</span>
          </Link>
        );
      })}
    </Card>
  );
}
