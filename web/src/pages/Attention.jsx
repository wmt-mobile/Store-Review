// Needs attention — rejections with the AI summary, stuck builds, recently resolved (pen.dev frame W3oYib).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, ExternalLink, Check, Sparkles, Ban, Search, Wrench, AlarmClock, TimerOff, Zap, BellOff, History, CircleCheck, RotateCcw, PartyPopper } from 'lucide-react';
import { AppIcon, Button, Empty, PageHead, Pill, StoreBadge, cx } from '../components/ui.jsx';
import { useData, useUi } from '../lib/store.jsx';
import { api, post } from '../lib/api.js';
import { date, dur, whenShort } from '../lib/format.js';
import { TONE, isAttention, platformName, statusLabel } from '../lib/model.js';
import { daysLeft } from './review/parts.jsx';

const keyOf = (r) => `${r.appKey}|${r.channel}|${r.rawVersion ?? r.version}`;
const shortLabel = (r) => (r.status === 'POLICY_ACTION' ? 'Policy action' : r.status === 'REMOVED' ? 'Removed' : statusLabel(r.store, r.status, r.label, r));
const EXPEDITE = {
  apple: 'https://developer.apple.com/contact/app-store/?topic=expedite',
  google: 'https://support.google.com/googleplay/android-developer/contact/publishing',
};

function AiRow({ icon: Icon, label, children, strong, red }) {
  return (
    <div className="flex gap-3">
      <Icon size={18} strokeWidth={1.8} className="w-[22px] shrink-0 mt-[1px] text-ink" />
      <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
        <div className="text-[11px] font-extrabold tracking-[0.8px] text-ink-3">{label}</div>
        <div className={cx('text-[13.5px] leading-[20px]', strong ? 'font-bold text-ink' : 'font-medium', red ? 'text-red' : !strong && 'text-ink')}>{children}</div>
      </div>
    </div>
  );
}

function AiSummary({ r }) {
  const ai = r.ai;
  if (!ai) {
    return (
      <div className="flex flex-col gap-[10px] p-[18px] bg-surface-2 rounded-[16px]">
        <div className="text-[11px] font-extrabold tracking-[0.8px] text-ink-3">{r.store === 'apple' ? 'FROM APP STORE CONNECT' : 'FROM THE STORE EMAIL'}</div>
        <div className="text-[13.5px] leading-[20px] font-medium text-ink whitespace-pre-line">
          {r.reason || (r.store === 'apple' ? 'Apple doesn’t share rejection reasons by API. Open App Store Connect → Resolution Center for the reviewer’s message.' : 'No details yet — the bot fills this in when the Play Console email arrives.')}
        </div>
      </div>
    );
  }
  const left = daysLeft(ai.deadline);
  return (
    <div className="flex flex-col gap-[14px] p-[18px] bg-surface-2 rounded-[16px]">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-[9px] py-[3px] rounded-full bg-[#0F110C] text-white text-[11.5px] font-extrabold"><Sparkles size={12} className="text-accent" />AI summary</span>
        <span className="text-[12px] font-semibold text-ink-3">Generated from the rejection email</span>
      </div>
      {ai.title && <AiRow icon={Ban} label="ISSUE" strong>{ai.title}</AiRow>}
      {ai.issues?.length > 0 && <AiRow icon={Search} label="WHAT'S WRONG">{ai.issues.join(' ')}</AiRow>}
      {ai.fixes?.length > 0 && <AiRow icon={Wrench} label="HOW TO FIX">{ai.fixes.join(' ')}</AiRow>}
      <AiRow icon={AlarmClock} label="DEADLINE" red={Boolean(ai.deadline)}>
        {ai.deadline ? `${ai.deadline}${left != null ? ` · ${left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : left === 0 ? 'due today' : 'overdue'}` : ''}` : `No deadline${r.liveVersion ? ` · live ${r.liveVersion} stays available` : ''}`}
      </AiRow>
    </div>
  );
}

function RejectionCard({ r, resolved, onResolve, onReopen, busy }) {
  const { openEmail } = useUi();
  return (
    <article className={cx('flex flex-col gap-[18px] p-5 sm:p-6 bg-surface rounded-[20px]', resolved && 'opacity-70')}>
      <div className="flex items-center gap-[14px]">
        <AppIcon name={r.appName} iconUrl={r.iconUrl} size={44} radius={12} />
        <div className="flex-1 min-w-0 flex flex-col gap-[5px]">
          <div className="text-[16px] font-extrabold text-ink truncate">{r.appName}</div>
          <div className="flex items-center gap-2 min-w-0">
            <StoreBadge store={r.store} />
            <span className="text-[12.5px] font-semibold text-ink-3 truncate">{r.version} · received {whenShort(r.since)}</span>
          </div>
        </div>
        <Pill tone={resolved ? 'green' : TONE[r.category]} className="hidden sm:inline-flex">{resolved ? 'Resolved' : shortLabel(r)}</Pill>
      </div>
      <AiSummary r={r} />
      <div className="flex flex-wrap items-center gap-[10px]">
        {r.messageId && <Button icon={Mail} onClick={() => openEmail({ id: r.messageId, appName: r.appName, store: r.store, version: r.version, emailUrl: r.emailUrl })}>View email</Button>}
        {r.url && <Button as="a" href={r.url} target="_blank" rel="noreferrer" variant="outline" icon={ExternalLink}>{r.store === 'apple' ? 'Open App Store Connect' : 'Open Play Console'}</Button>}
        <span className="flex-1" />
        {resolved
          ? <Button variant="secondary" icon={RotateCcw} loading={busy} onClick={onReopen}>Reopen</Button>
          : <Button variant="secondary" icon={Check} loading={busy} onClick={onResolve}>Mark resolved</Button>}
      </div>
    </article>
  );
}

function StuckCard({ r, limitH, onSnooze, busy }) {
  const over = r.elapsedMs - limitH * 3_600_000;
  return (
    <section className="flex flex-col gap-4 p-6 bg-surface rounded-[20px] ring-[1.5px] ring-inset ring-red">
      <div className="flex items-center gap-2"><TimerOff size={17} className="text-red" /><h2 className="text-[15px] font-extrabold text-ink">Stuck in review</h2></div>
      <div className="flex items-center gap-3">
        <AppIcon name={r.appName} iconUrl={r.iconUrl} size={40} radius={11} />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="text-[14px] font-bold text-ink truncate">{r.appName}</div>
          <div className="flex items-center gap-2"><StoreBadge store={r.store} /><span className="text-[12.5px] font-semibold text-ink-2">{r.version}</span></div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-[34px] font-extrabold tracking-[-1px] text-red leading-none">{dur(r.elapsedMs)}</div>
        <div className="text-[13px] font-semibold text-ink-2">{r.category === 'in_review' ? 'in review' : 'waiting'} · {dur(over)} over your {limitH}h limit</div>
      </div>
      <div className="h-2 rounded-full bg-red-soft overflow-hidden"><div className="h-full w-full rounded-full bg-red" /></div>
      <div className="flex flex-col gap-2">
        <Button as="a" href={EXPEDITE[r.store]} target="_blank" rel="noreferrer" icon={Zap} className="w-full">Request expedited review</Button>
        <Button variant="secondary" icon={BellOff} loading={busy} onClick={onSnooze} className="w-full">Snooze alert for 12h</Button>
      </div>
    </section>
  );
}

/** Rejections that later went live/approved (from history) + ones marked resolved here. */
function useResolvedList(apps, resolvedMap, now = Date.now()) {
  return useMemo(() => {
    const out = [];
    for (const app of apps || []) {
      const hist = [...(app.history || [])].sort((a, b) => a.at - b.at);
      let rej = null;
      for (const h of hist) {
        if (isAttention(h.category)) rej = h;
        else if (rej && (h.category === 'live' || h.category === 'approved') && now - h.at < 30 * 86_400_000) {
          out.push({ id: `${app.key}|${rej.at}`, app, title: `${app.name} · ${platformName(app.store)} ${String(rej.version).replace(/^\d+\s*\((.+)\)$/, '$1')}`, desc: rej.reason || statusLabel(app.store, rej.to), at: h.at });
          rej = null;
        }
      }
    }
    for (const [key, v] of Object.entries(resolvedMap || {})) {
      const [appKey, , version] = key.split('|');
      const app = (apps || []).find((a) => a.key === appKey);
      if (!app) continue;
      out.push({ id: key, app, title: `${app.name} · ${platformName(app.store)} ${String(version).replace(/^\d+\s*\((.+)\)$/, '$1')}`, desc: v?.note || `Marked resolved${v?.by ? ` by ${String(v.by).split('@')[0]}` : ''}`, at: v?.at || 0 });
    }
    return out.sort((a, b) => b.at - a.at);
  }, [apps, resolvedMap, now]);
}

export default function Attention() {
  const { attention, pending, apps, M, reload } = useData();
  const { toast } = useUi();
  const [local, setLocal] = useState({}); // optimistic resolve/snooze: key → 'resolved' | 'open' | snoozeUntil
  const [busy, setBusy] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const now = Date.now();
  const resolvedMap = M?.resolved || {};
  const isResolved = (k) => (local[k] === 'open' ? false : local[k] === 'resolved' || Boolean(resolvedMap[k]));
  const open = attention.filter((r) => !isResolved(keyOf(r)));
  const done = attention.filter((r) => isResolved(keyOf(r)));
  const limitH = M?.stuckHours || 24;
  const snoozedUntil = (k) => Math.max(Number(M?.snoozed?.[k]) || 0, typeof local[k] === 'number' ? local[k] : 0);
  const stuck = pending.filter((r) => r.stuck && snoozedUntil(keyOf(r)) < now).sort((a, b) => b.elapsedMs - a.elapsedMs)[0];
  const stuckCount = pending.filter((r) => r.stuck).length;
  const resolvedList = useResolvedList(apps, resolvedMap);

  // Deep links from the Google Chat buttons: ?email=<id> opens the original email, ?resolve=<key> marks it resolved.
  const [params, setParams] = useSearchParams();
  const { openEmail } = useUi();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !M) return;
    const email = params.get('email');
    const resolve = params.get('resolve');
    if (!email && !resolve) return;
    handled.current = true;
    if (email) {
      const r = attention.find((x) => x.messageId === email);
      openEmail({ id: email, appName: r?.appName, store: r?.store, version: r?.version, emailUrl: r?.emailUrl });
    }
    if (resolve) {
      const r = attention.find((x) => keyOf(x) === resolve);
      if (r && !isResolved(resolve)) act(r, 'resolve');
      else if (!r) toast({ tone: 'info', title: 'Already up to date', body: 'That rejection is no longer open.' });
    }
    setParams({}, { replace: true });
  }, [M]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (r, kind) => {
    const k = keyOf(r);
    setBusy(`${kind}:${k}`);
    try {
      if (kind === 'resolve') {
        setLocal((l) => ({ ...l, [k]: 'resolved' }));
        await post('/api/ui/resolve', { key: k });
        toast({ title: `${r.appName} marked resolved`, body: 'Moved to Recently resolved' });
      } else if (kind === 'reopen') {
        setLocal((l) => ({ ...l, [k]: 'open' }));
        await api(`/api/ui/resolve?key=${encodeURIComponent(k)}`, { method: 'DELETE' });
        toast({ title: `${r.appName} reopened` });
      } else {
        setLocal((l) => ({ ...l, [k]: now + 12 * 3_600_000 }));
        await post('/api/ui/snooze', { key: k, hours: 12 });
        toast({ title: `Alert snoozed for 12h`, body: `${r.appName} · ${r.version}` });
      }
      reload();
    } catch (e) {
      setLocal((l) => { const n = { ...l }; delete n[k]; return n; });
      toast({ title: kind === 'snooze' ? 'Could not snooze' : 'Could not update', body: e.message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const sub = [
    `${open.length} ${open.length === 1 ? 'rejection' : 'rejections'} to fix`,
    stuckCount ? `${stuckCount} build${stuckCount === 1 ? '' : 's'} stuck over the ${limitH}h review limit` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <PageHead
        title="Needs attention"
        sub={sub}
        actions={<Button variant="outline" icon={History} onClick={() => setShowResolved((s) => !s)}>{showResolved ? 'Hide resolved' : `Resolved (${done.length + resolvedList.length})`}</Button>}
      />
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          {open.map((r) => (
            <RejectionCard key={r.id || keyOf(r)} r={r} busy={busy === `resolve:${keyOf(r)}`} onResolve={() => act(r, 'resolve')} />
          ))}
          {!open.length && (
            <div className="bg-surface rounded-[20px]">
              <Empty icon={PartyPopper} title="Nothing needs attention 🎉">No rejections or policy actions right now. We’ll post to Google Chat — and list it here — the moment a store pushes back.</Empty>
            </div>
          )}
          {showResolved && done.map((r) => (
            <RejectionCard key={`done-${keyOf(r)}`} r={r} resolved busy={busy === `reopen:${keyOf(r)}`} onReopen={() => act(r, 'reopen')} />
          ))}
        </div>
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
          {stuck && <StuckCard r={stuck} limitH={limitH} busy={busy === `snooze:${keyOf(stuck)}`} onSnooze={() => act(stuck, 'snooze')} />}
          <section className="flex flex-col gap-1 p-6 bg-surface rounded-[20px]">
            <h2 className="text-[15px] font-extrabold text-ink">Recently resolved</h2>
            {resolvedList.length === 0 && <p className="pt-2 text-[12.5px] font-medium text-ink-3">Fixed rejections from the last 30 days show up here.</p>}
            {resolvedList.slice(0, showResolved ? 20 : 4).map((x) => (
              <div key={x.id} className="flex items-center gap-3 pt-3">
                <AppIcon name={x.app.name} iconUrl={x.app.iconUrl} size={32} radius={9} />
                <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                  <div className="text-[13px] font-bold text-ink truncate">{x.title}</div>
                  <div className="text-[12px] font-medium text-ink-3 truncate">{x.desc}</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[12px] font-bold text-ink-2 whitespace-nowrap"><CircleCheck size={14} className="text-green" />{date(x.at)}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
