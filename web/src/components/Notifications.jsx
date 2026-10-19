// Notification centre (bell panel, design "Notification Center — open").
// Feed = latest status changes + builds over the review limit; read state is stored per user on the server.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Timer, X, Hourglass, Send, Rocket, Settings, ArrowRight, BellOff } from 'lucide-react';
import { useData, useUi } from '../lib/store.jsx';
import { api, post } from '../lib/api.js';
import { ago, dayKey, dur } from '../lib/format.js';
import { storeName, statusLabel } from '../lib/model.js';
import { AppIcon, cx } from './ui.jsx';

// ── tiny shared store (prefs + read marker) ──
const state = { prefs: null, loaded: false, lastReadAt: 0 };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const subscribe = (f) => (subs.add(f), () => subs.delete(f));
let version = 0;
const snap = () => version;
const bump = () => { version++; emit(); };

export async function loadNotifyPrefs(force) {
  if (state.loaded && !force) return state.prefs;
  try {
    const r = await api('/api/ui/notify');
    state.prefs = r.prefs;
    state.push = r.push;
    state.subscriptions = r.subscriptions || [];
    // first visit: only the last 24 hours count as unread
    state.lastReadAt = r.prefs?.lastReadAt || Date.now() - 86_400_000;
  } catch {
    state.prefs = null;
  }
  state.loaded = true;
  bump();
  return state.prefs;
}
export function setNotifyState(patch) {
  Object.assign(state, patch);
  bump();
}
export const notifyState = () => state;

const short = (name) => String(name || '').split(/\s[-–]\s/)[0];
const EVENT = { submitted: 'sent', in_review: 'in_review', approved: 'approved', live: 'live', rejected: 'rejected', action: 'rejected', removed: 'rejected' };
const BADGE = {
  approved: { icon: Check, cls: 'bg-green text-white' },
  live: { icon: Rocket, cls: 'bg-accent text-accent-ink' },
  in_review: { icon: Hourglass, cls: 'bg-amber text-white' },
  submitted: { icon: Send, cls: 'bg-blue text-white' },
  rejected: { icon: X, cls: 'bg-red text-white' },
  stuck: { icon: Timer, cls: 'bg-amber text-white' },
};

function toItem(a, M) {
  const cat = ['action', 'removed'].includes(a.category) ? 'rejected' : a.category;
  const app = M?.apps?.find((x) => x.key === a.appKey);
  const ch = app?.channels?.[a.channel];
  const current = ch && ch.status && ch.version === a.version;
  const sName = storeName(a.store);
  let title;
  let body;
  if (a.listing) {
    // Google Play store-listing / app-content review (no new build)
    const what = { approved: 'approved · ready to publish', in_review: 'in review', submitted: 'sent for review', live: 'changes published', rejected: 'rejected' }[cat];
    if (!what) return null;
    title = `${short(a.appName)} store listing ${what}`;
    body = `${sName} · listing / app content · no new build${cat === 'rejected' && a.reason ? ` · ${a.reason}` : ''}`;
    return { id: a.id, at: a.at, cat, event: EVENT[a.category], title, body, appName: a.appName, iconUrl: a.iconUrl, appKey: a.appKey, store: a.store };
  }
  if (cat === 'approved') {
    title = `${short(a.appName)} approved · ready to publish`;
    body = `${sName} · ${a.version}${current && ch.reviewMs ? ` · review took ${dur(ch.reviewMs)}` : ''}`;
  } else if (cat === 'in_review') {
    title = `${short(a.appName)} is in review`;
    body = `${sName} · ${a.version}`;
  } else if (cat === 'submitted') {
    title = `${short(a.appName)} sent for review`;
    body = `${sName} · ${a.version}`;
  } else if (cat === 'live') {
    title = `${short(a.appName)} is live`;
    body = `${sName} · ${a.version}`;
  } else if (cat === 'rejected') {
    title = `${short(a.appName)} rejected`;
    body = `${sName} · ${statusLabel(a.store, null, a.label).replace(/^Rejected · /, '')}${current && ch.ai ? ' · AI summary ready' : ''}`;
  } else return null;
  return { id: a.id, at: a.at, cat, event: EVENT[a.category], title, body, appName: a.appName, iconUrl: a.iconUrl, appKey: a.appKey, store: a.store };
}

/** Feed items, newest first. */
export function useNotifications() {
  useSyncExternalStore(subscribe, snap);
  const { M, activity, pending } = useData();
  useEffect(() => { loadNotifyPrefs(); }, []);
  const items = useMemo(() => {
    const prefs = state.prefs?.events;
    const list = activity.map((a) => toItem(a, M)).filter(Boolean);
    for (const r of pending.filter((p) => p.stuck)) {
      list.push({ id: `stuck|${r.appKey}|${r.channel}|${r.version}`, at: (r.submittedAt || 0) + (M?.stuckHours || 24) * 3_600_000, cat: 'stuck', event: 'stuck', title: `${short(r.appName)} is over the ${M?.stuckHours || 24}h limit`, body: `${storeName(r.store)} · ${r.version} · in review ${dur(r.elapsedMs)}`, appName: r.appName, iconUrl: r.iconUrl, appKey: r.appKey, store: r.store });
    }
    return list.filter((i) => !prefs || prefs[i.event]?.inapp !== false).sort((a, b) => b.at - a.at).slice(0, 60);
  }, [activity, pending, M, state.prefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const unread = state.loaded ? items.filter((i) => i.at > state.lastReadAt).length : 0;
  return { items, unread, lastReadAt: state.lastReadAt, loaded: state.loaded };
}

/** Toast when a new status change arrives while the dashboard is open. Mount once (TopBar does). */
export function useLiveToasts(items) {
  const { toast, openApp } = useUi();
  const seen = useRef(null);
  useEffect(() => {
    if (!items.length) return;
    if (!seen.current) { seen.current = new Set(items.map((i) => i.id)); return; }
    const fresh = items.filter((i) => !seen.current.has(i.id) && Date.now() - i.at < 30 * 60_000);
    for (const i of items) seen.current.add(i.id);
    for (const i of fresh.slice(0, 3)) {
      toast({ tone: i.cat === 'approved' || i.cat === 'live' ? 'success' : i.cat === 'rejected' ? 'error' : i.cat === 'stuck' ? 'warn' : 'info', title: i.title, body: i.body, action: { label: 'View', onClick: () => openApp(groupIdOf(i.appName), i.store) }, duration: 8000 });
    }
  }, [items, toast, openApp]);
}

export const groupIdOf = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'rejected', label: 'Rejections' },
  { id: 'stuck', label: 'Over limit' },
];

export function NotificationPanel({ onClose }) {
  const { items, unread, lastReadAt } = useNotifications();
  const { openApp } = useUi();
  const nav = useNavigate();
  const [tab, setTab] = useState('all');
  const list = items.filter((i) => (tab === 'unread' ? i.at > lastReadAt : tab === 'all' ? true : i.cat === tab));
  const markAll = async () => {
    const at = Date.now();
    setNotifyState({ lastReadAt: at });
    await post('/api/ui/notify/read', { at }).catch(() => {});
  };
  const groups = [];
  for (const i of list.slice(0, 30)) {
    const k = dayKey(i.at);
    const label = k === dayKey(Date.now()) ? 'TODAY' : k === dayKey(Date.now() - 86_400_000) ? 'YESTERDAY' : 'EARLIER';
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(i);
  }
  return (
    <div className="absolute right-[-60px] sm:right-0 top-[56px] z-50 w-[min(420px,calc(100vw-24px))] bg-surface rounded-[20px] shadow-[0_24px_60px_rgba(15,17,12,.18)] flex flex-col overflow-hidden" role="dialog" aria-label="Notifications">
      <span className="absolute -top-[7px] right-[76px] sm:right-[16px] size-[14px] rotate-45 bg-surface" aria-hidden />
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <h2 className="text-[17px] font-extrabold text-ink">Notifications</h2>
        {unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-red text-white text-[11px] font-extrabold inline-flex items-center justify-center">{unread}</span>}
        <div className="flex-1" />
        <button onClick={markAll} disabled={!unread} className="text-[13px] font-bold text-accent-text disabled:opacity-40">Mark all read</button>
      </div>
      <div className="flex gap-5 px-5 border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cx('pb-2.5 -mb-px text-[13px] font-semibold border-b-2 transition', tab === t.id ? 'text-ink font-bold border-ink' : 'text-ink-3 border-transparent hover:text-ink-2')}>
            {t.label}{t.id === 'unread' && unread ? ` · ${unread}` : ''}
          </button>
        ))}
      </div>
      <div className="max-h-[min(520px,60vh)] overflow-y-auto scroll-thin px-[10px] pb-2">
        {!list.length && (
          <div className="flex flex-col items-center text-center py-10 text-ink-3">
            <BellOff size={22} />
            <div className="mt-2 text-[13px] font-semibold">Nothing here yet</div>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-[10px] pt-4 pb-2 text-[10.5px] font-extrabold tracking-[1px] text-ink-3">{g.label}</div>
            <div className="flex flex-col gap-[6px]">
              {g.items.map((i) => {
                const B = BADGE[i.cat] || BADGE.submitted;
                const isUnread = i.at > lastReadAt;
                return (
                  <button key={i.id} onClick={() => { onClose?.(); openApp(groupIdOf(i.appName), i.store); }}
                    className={cx('w-full flex gap-3 p-[10px] rounded-[14px] text-left transition', isUnread ? 'bg-surface-2 hover:bg-surface-3' : 'hover:bg-surface-2')}>
                    <AppIcon name={i.appName} iconUrl={i.iconUrl} size={36} badge={<span className={cx('size-[18px] rounded-full inline-flex items-center justify-center ring-2 ring-surface', B.cls)}><B.icon size={10} strokeWidth={3} /></span>} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] font-bold text-ink">{i.title}</span>
                      <span className="block text-[12.5px] text-ink-2 mt-0.5">{i.body}</span>
                      <span className="block text-[11.5px] text-ink-3 mt-1">{ago(i.at)}</span>
                    </span>
                    {isUnread && <span className="size-2 mt-1 rounded-full bg-blue shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-5 py-3.5 border-t border-line">
        <button onClick={() => { onClose?.(); nav('/dashboard/notifications'); }} className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-2 hover:text-ink"><Settings size={15} /> Notification settings</button>
        <button onClick={() => { onClose?.(); nav('/dashboard/activity'); }} className="inline-flex items-center gap-1 text-[13px] font-bold text-ink">View all <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}
