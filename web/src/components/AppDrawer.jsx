// App history drawer (pen.dev frame AmKza): per-store status card, timeline for the current version, older releases.
import { useEffect, useMemo, useState } from 'react';
import { X, BellOff, Bell, ExternalLink, Package, ChevronDown, Copy, MessageSquare } from 'lucide-react';
import { AppIcon, Pill, StoreIcon, cx } from './ui.jsx';
import { useData, useUi } from '../lib/store.jsx';
import { api, patch } from '../lib/api.js';
import { ago, date, dateTime, dayKey, dur, time, tz } from '../lib/format.js';
import { TONE, isAttention, isPending, statusLabel } from '../lib/model.js';
import { pillFor } from '../pages/review/parts.jsx';

/** Same rule as the server's displayVersion: Play's "193 (1.3.80)" → "1.3.80 (193)". */
const showVersion = (v) => {
  const s = String(v || '').trim();
  const m = s.match(/^(\d+)\s*\((.+)\)$/);
  return m ? `${m[2].trim()} (${m[1]})` : s || '—';
};

function whenLabel(ts, now = Date.now()) {
  if (dayKey(ts) === dayKey(now)) return `Today ${time(ts)}`;
  if (dayKey(ts) === dayKey(now - 86_400_000)) return `Yesterday ${time(ts)}`;
  return `${date(ts)} ${time(ts)}`;
}

/** Group a channel's history into releases (newest first), each with its events newest first. */
function releasesOf(app, channel) {
  const hist = (app?.history || []).filter((h) => h.channel === channel).sort((a, b) => a.at - b.at);
  const by = new Map();
  for (const h of hist) {
    const k = showVersion(h.version);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(h);
  }
  return [...by.entries()]
    .map(([version, events]) => {
      const firstPending = events.find((e) => isPending(e.category));
      const last = events[events.length - 1];
      const tookMs = firstPending && !isPending(last.category) ? last.at - firstPending.at : null;
      return { version, events, last, firstPending, tookMs, attempts: events.filter((e) => e.category === 'submitted').length, rejected: events.some((e) => isAttention(e.category)) };
    })
    .sort((a, b) => b.last.at - a.last.at);
}

function eventDesc(store, e, prev, isFirst, channelLabel, took) {
  const parts = [];
  if (isFirst && isPending(e.category)) {
    parts.push(store === 'google' ? `Release sent to Google · ${channelLabel} ${e.version}` : `Submitted to App Review · ${showVersion(e.version)}`);
    if (e.from) parts.push(`from ${statusLabel(store, e.from)}`);
  } else {
    if (e.from) parts.push(`From ${statusLabel(store, e.from)}`);
    if (prev && e.category === 'in_review') parts.push(`picked up after ${dur(e.at - prev.at)}`);
    if (!isPending(e.category) && took) parts.push(`review took ${dur(took)}`);
  }
  return parts.join(' · ');
}

function Release({ store, rel, current, channelLabel, defaultOpen, title }) {
  const [open, setOpen] = useState(defaultOpen);
  const events = [...rel.events].reverse();
  const finalTone = TONE[rel.last.category];
  const summary = rel.rejected && rel.last.category === 'live'
    ? `Rejected → Live ${date(rel.last.at)} · ${rel.attempts || 2} attempts`
    : `${statusLabel(store, rel.last.to)} ${date(rel.last.at)}${rel.tookMs ? ` · took ${dur(rel.tookMs)}` : ''}`;
  const head = (
    <div className="flex items-center gap-2 w-full">
      <Package size={15} className="text-ink-2 shrink-0" />
      <span className="text-[13.5px] font-extrabold text-ink whitespace-nowrap">{title || rel.version}</span>
      {current ? <span className="px-2 py-[2px] rounded-full bg-accent text-accent-ink text-[11px] font-extrabold">Current</span>
        : rel.last.category === 'live' && !rel.rejected && <span className="px-2 py-[2px] rounded-full text-ink-2 text-[11px] font-extrabold">Live</span>}
      <span className="flex-1" />
      {!current && <span className="text-[12px] font-semibold text-ink-3 truncate">{summary}</span>}
      {!current && <ChevronDown size={16} className={cx('text-ink-3 shrink-0 transition', open && 'rotate-180')} />}
    </div>
  );
  const timeline = (
    <div className="flex flex-col">
      {events.map((e, i) => {
        const older = events[i + 1];
        const isFirst = !older;
        const took = !isPending(e.category) && rel.firstPending && e.at > rel.firstPending.at ? e.at - rel.firstPending.at : null;
        const top = i === 0 && current;
        return (
          <div key={`${e.at}-${e.to}`} className="flex gap-3">
            <div className="w-4 shrink-0 flex flex-col items-center gap-1 pt-1">
              <span className={cx('size-3 rounded-full shrink-0', top ? `outline-[3px] ${finalTone === 'red' ? 'bg-red outline-red-soft' : finalTone === 'amber' ? 'bg-amber outline-amber-soft' : finalTone === 'blue' ? 'bg-blue outline-blue-soft' : 'bg-green outline-green-soft'}` : 'bg-surface outline-2 outline-line')} style={{ outlineStyle: 'solid' }} />
              {!isFirst && <span className="w-[2px] flex-1 min-h-[40px] bg-line" />}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 pb-[18px]">
              <div className="flex items-center gap-2">
                <Pill tone={TONE[e.category]}>{statusLabel(store, e.to)}</Pill>
                <span className="flex-1" />
                <span className="text-[12px] font-bold text-ink-3 whitespace-nowrap">{whenLabel(e.at)}</span>
              </div>
              <div className="text-[13px] leading-[19px] font-medium text-ink-2">{eventDesc(store, e, older, isFirst, channelLabel, took)}</div>
              {e.reason && <div className="text-[12.5px] leading-[18px] font-medium text-red whitespace-pre-line line-clamp-3">{e.reason}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
  if (current) return <div className="flex flex-col"><div className="pb-[10px]">{head}</div>{timeline}</div>;
  return (
    <div className="flex flex-col px-[14px] py-3 bg-surface-2 rounded-[14px]">
      <button onClick={() => setOpen((o) => !o)} className="text-left">{head}</button>
      {open && <div className="pt-4">{timeline}</div>}
    </div>
  );
}

function StatTile({ label, children, foot, footClass }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2 p-[14px] bg-surface-2 rounded-[14px]">
      <div className="text-[10.5px] font-bold tracking-[0.8px] text-ink-3 whitespace-nowrap">{label}</div>
      {children}
      {foot && <div className={cx('text-[11.5px] font-medium truncate', footClass || 'text-ink-3')}>{foot}</div>}
    </div>
  );
}

function releaseSub(c, now = Date.now()) {
  switch (c.category) {
    case 'submitted': return `Waiting for review for ${dur(c.elapsedMs)}`;
    case 'in_review': return `In review for ${dur(c.elapsedMs)}${c.stuck ? ' — over the review time limit' : ''}`;
    case 'approved': return `Approved ${ago(c.since, now)} — publish when you're ready`;
    case 'live': return `Live since ${ago(c.since, now) === 'just now' ? 'just now' : date(c.since)}`;
    case 'draft': return 'Not submitted yet';
    default: return isAttention(c.category) ? `${statusLabel('', c.status, c.label)} ${ago(c.since, now)} — fix and resubmit` : ago(c.since, now);
  }
}

function useMute(app, admin) {
  const [state, setState] = useState(null); // { uuid, notify }
  useEffect(() => {
    setState(null);
    if (!admin || !app) return;
    let live = true;
    api('/api/admin/apps').then((list) => {
      const a = Array.isArray(list) ? list.find((x) => x.key === app.key) : null;
      if (live && a?.uuid) setState({ uuid: a.uuid, notify: a.notify });
    }).catch(() => {});
    return () => { live = false; };
  }, [app?.key, admin]);
  return [state, setState];
}

function DrawerBody({ group, initialStore, onClose }) {
  const { M } = useData();
  const { toast } = useUi();
  const stores = [['apple', group.ios, group.iosCh], ['google', group.android, group.androidCh]];
  const [store, setStore] = useState(() => initialStore && stores.find((s) => s[0] === initialStore && s[1]) ? initialStore : (group.ios && group.iosCh ? 'apple' : group.android ? 'google' : 'apple'));
  const [, app, c] = stores.find((s) => s[0] === store) || stores[0];
  const account = M?.accounts?.find((a) => a.id === app?.accountId);
  const chKey = store === 'apple' ? 'appstore' : 'production';
  const channelLabel = store === 'apple' ? 'App Store' : 'Production';
  const releases = useMemo(() => releasesOf(app, chKey), [app, chKey]);
  const current = c ? releases.find((r) => r.version === c.version || String(c.version).startsWith(`${r.version} (`)) || releases[0] : releases[0];
  const older = releases.filter((r) => r !== current);
  const durations = releases.map((r) => r.tookMs).filter(Boolean);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const [mute, setMute] = useMute(app, M?.admin);
  const p = pillFor(store, c);
  const short = c?.category === 'approved' && c?.status === 'READY_TO_PUBLISH' ? 'Ready to publish' : p.text;

  const toggleMute = async () => {
    if (!mute) return;
    const next = !mute.notify;
    setMute({ ...mute, notify: next });
    try {
      await patch(`/api/admin/apps/${mute.uuid}`, { notify: next });
      toast({ title: next ? `${group.name} alerts back on` : `${group.name} muted`, body: next ? 'Status changes post to Google Chat again' : 'Status is still tracked, no Chat posts' });
    } catch (e) {
      setMute({ ...mute });
      toast({ title: 'Could not change alerts', body: e.message, tone: 'error' });
    }
  };
  const copyLink = async () => {
    const url = `${location.origin}/dashboard/apps?app=${encodeURIComponent(group.id)}&store=${store}`;
    try { await navigator.clipboard.writeText(url); toast({ title: 'Status link copied', icon: 'link' }); }
    catch { toast({ title: 'Copy failed', body: url, tone: 'error' }); }
  };
  const chatUrl = M?.chat?.spaceUrl || 'https://chat.google.com';

  return (
    <>
      <div className="flex flex-col gap-[18px] px-6 pt-6">
        <div className="flex items-center gap-[14px]">
          <AppIcon name={group.name} iconUrl={group.iconUrl} size={52} radius={14} />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h2 className="text-[20px] font-extrabold tracking-[-0.3px] text-ink truncate">{group.name}</h2>
            <div className="text-[12.5px] font-medium text-ink-3 truncate">{[app?.bundleOrPackage || group.bundle, account?.name].filter(Boolean).join(' · ')}</div>
          </div>
          {mute && (
            <button onClick={toggleMute} title={mute.notify ? 'Mute Chat alerts for this app' : 'Unmute Chat alerts'} aria-label={mute.notify ? 'Mute alerts' : 'Unmute alerts'}
              className={cx('size-9 rounded-[10px] inline-flex items-center justify-center', mute.notify ? 'bg-surface text-ink' : 'bg-amber-soft text-amber')}>
              {mute.notify ? <BellOff size={17} /> : <Bell size={17} />}
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="size-9 rounded-[10px] bg-surface inline-flex items-center justify-center text-ink"><X size={18} /></button>
        </div>
        <div className="flex gap-1 p-1 bg-surface-3 rounded-[12px]" role="tablist">
          {stores.map(([s, a, ch]) => {
            const on = s === store;
            const tone = ch ? TONE[ch.category] : null;
            const dot = { blue: 'bg-blue', amber: 'bg-amber', approved: 'bg-green', live: 'bg-green', red: 'bg-red', grey: 'bg-grey' }[tone];
            return (
              <button key={s} role="tab" aria-selected={on} disabled={!a} onClick={() => setStore(s)}
                className={cx('flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-[9px] text-[13px] font-bold transition disabled:opacity-40', on ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(15,17,12,.1)]' : 'text-ink-2')}>
                <StoreIcon store={s} size={15} />{s === 'apple' ? 'App Store' : 'Google Play'}
                {dot && <span className={cx('size-[6px] rounded-full', dot)} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 p-6">
        {!app ? (
          <div className="bg-surface rounded-[20px] p-6 text-[13.5px] text-ink-2">This app isn't on {store === 'apple' ? 'the App Store' : 'Google Play'} in any connected account.</div>
        ) : !c ? (
          <div className="bg-surface rounded-[20px] p-6 text-[13.5px] text-ink-2">No {channelLabel.toLowerCase()} release yet.</div>
        ) : (
          <section className="flex flex-col gap-4 p-5 bg-surface rounded-[20px]">
            <div className="flex items-center gap-[10px]">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="text-[15px] font-extrabold text-ink truncate">{channelLabel} · {c.version}</div>
                <div className="text-[12.5px] font-medium text-ink-3 truncate">{releaseSub(c)}</div>
              </div>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" className="h-9 px-4 rounded-[12px] bg-primary text-on-primary text-[13px] font-bold inline-flex items-center gap-2 shrink-0 hover:opacity-90">
                  <ExternalLink size={15} /> Open Console
                </a>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-[10px]">
              <StatTile label="CURRENT STATUS"><span><Pill tone={p.tone}>{short}</Pill></span></StatTile>
              <StatTile label="SUBMITTED AT" foot={c.submittedAt ? (tz() === 'Asia/Kolkata' ? 'IST' : tz()) : 'not submitted'}>
                <div className="text-[15px] font-extrabold text-ink whitespace-nowrap">{c.submittedAt ? dateTime(c.submittedAt) : '—'}</div>
              </StatTile>
              <StatTile label={isPending(c.category) ? 'IN REVIEW FOR' : 'REVIEW TOOK'} foot={avg ? `avg for app: ${dur(avg)}` : null} footClass="text-green">
                <div className={cx('text-[15px] font-extrabold whitespace-nowrap', c.stuck ? 'text-red' : 'text-ink')}>{isPending(c.category) ? dur(c.elapsedMs) : c.reviewMs ? dur(c.reviewMs) : current?.tookMs ? dur(current.tookMs) : '—'}</div>
              </StatTile>
            </div>
          </section>
        )}

        {app && releases.length > 0 && (
          <section className="flex flex-col gap-[14px] p-5 bg-surface rounded-[20px]">
            <div className="flex items-center">
              <h3 className="flex-1 text-[15px] font-extrabold text-ink">Status history</h3>
              <span className="text-[12px] font-bold text-ink-3">{store === 'apple' ? 'App Store' : 'Google Play · Production'}</span>
            </div>
            {current && <Release store={store} rel={current} current channelLabel={channelLabel} defaultOpen title={c?.version} />}
            {older.map((r) => <Release key={r.version} store={store} rel={r} channelLabel={channelLabel} />)}
          </section>
        )}

        <div className="flex gap-[10px]">
          <button onClick={copyLink} className="flex-1 h-10 px-4 rounded-[12px] ring-[1.5px] ring-inset ring-line text-[14px] font-bold text-ink inline-flex items-center justify-center gap-2 hover:bg-surface">
            <Copy size={16} /> Copy status link
          </button>
          <a href={chatUrl} target="_blank" rel="noreferrer" className="flex-1 h-10 px-4 rounded-[12px] bg-surface-2 text-[14px] font-bold text-ink inline-flex items-center justify-center gap-2 hover:bg-surface-3 whitespace-nowrap">
            <MessageSquare size={16} /> Open in Google Chat
          </a>
        </div>
      </div>
    </>
  );
}

export function AppDrawer() {
  const { drawer, closeApp } = useUi();
  const { allGroups } = useData();
  const group = drawer ? allGroups.find((g) => g.id === drawer.groupId) : null;
  useEffect(() => {
    if (!drawer) return;
    const h = (e) => e.key === 'Escape' && closeApp();
    addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [drawer, closeApp]);
  if (!drawer || !group) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${group.name} history`}>
      <div className="absolute inset-0 bg-scrim" onClick={closeApp} />
      <aside className="absolute right-0 top-0 h-full w-full sm:w-[560px] flex flex-col bg-bg sm:rounded-l-[24px] shadow-[-12px_0_40px_rgba(15,17,12,.2)] overflow-y-auto scroll-thin">
        <DrawerBody key={group.id} group={group} initialStore={drawer.store} onClose={closeApp} />
      </aside>
    </div>
  );
}
