// Settings · Notifications (design vtPZb): per-user browser push + in-app choices, devices, quiet hours, muted apps.
import { useEffect, useState } from 'react';
import { Send, MonitorCheck, Monitor, Laptop, Bell, MessageSquare, Mail, BellOff } from 'lucide-react';
import { Button, Card, PageHead, Pill, Toggle, AppIcon, cx } from '../components/ui.jsx';
import { api, patch, post, put } from '../lib/api.js';
import { useData, useUi } from '../lib/store.jsx';
import { dateYear } from '../lib/format.js';
import { loadNotifyPrefs, notifyState, setNotifyState } from '../components/Notifications.jsx';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../components/Push.jsx';

const ROWS = [
  { ev: 'sent', tone: 'blue', label: 'Sent for review', desc: 'When a build is submitted', chat: true },
  { ev: 'in_review', tone: 'amber', label: 'In review', desc: 'A reviewer picked it up', chat: true },
  { ev: 'approved', tone: 'approved', label: 'Approved · ready to publish', desc: 'Passed review, ready to release', chat: true },
  { ev: 'live', tone: 'live', label: 'Live / staged rollout', desc: 'Released to users', chat: true },
  { ev: 'rejected', tone: 'red', label: 'Rejected / policy action', desc: 'Includes AI summary + email link', chat: true },
  { ev: 'stuck', tone: 'red', label: 'Over review time limit', desc: 'Stuck longer than the limit', chat: false },
];

/** "Chrome 141 · macOS" from a user-agent string. */
export function deviceLabel(ua = navigator.userAgent) {
  const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${RegExp.$1}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${RegExp.$1}` : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${RegExp.$1}` : /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${RegExp.$1}` : 'Browser';
  const os = /Windows NT 10/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? (/iPhone|iPad/.test(ua) ? 'iOS' : 'macOS') : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? (/Ubuntu/.test(ua) ? 'Ubuntu' : 'Linux') : 'Unknown OS';
  return `${b} · ${os}`;
}

function Head({ icon: Icon, children }) {
  return (
    <div className="w-[96px] sm:w-[130px] shrink-0 flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.8px] text-ink-3 uppercase">
      <Icon size={13} className="hidden sm:block" /> {children}
    </div>
  );
}

export default function NotificationSettings() {
  const { M, allGroups } = useData();
  const { toast } = useUi();
  const [prefs, setPrefs] = useState(null);
  const [push, setPush] = useState({ enabled: false });
  const [subs, setSubs] = useState([]);
  const [mine, setMine] = useState(null); // this browser's subscription endpoint
  const [perm, setPerm] = useState(pushSupported() ? Notification.permission : 'unsupported');
  const [busy, setBusy] = useState('');
  const [muted, setMuted] = useState([]);
  const [showDevices, setShowDevices] = useState(false);

  const refresh = async () => {
    await loadNotifyPrefs(true);
    const st = notifyState();
    setPrefs(st.prefs);
    setPush(st.push || { enabled: false });
    setSubs(st.subscriptions || []);
    const s = await currentSubscription().catch(() => null);
    setMine(s?.endpoint || null);
    setPerm(pushSupported() ? Notification.permission : 'unsupported');
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!M?.admin) return;
    api('/api/admin/apps').then((apps) => setMuted((apps || []).filter((a) => a.tracked !== false && a.notify === false))).catch(() => setMuted([]));
  }, [M?.admin]);

  const save = async (next) => {
    setPrefs(next);
    try {
      const r = await put('/api/ui/notify', next);
      setNotifyState({ prefs: r.prefs });
    } catch (e) {
      toast({ tone: 'error', title: 'Couldn’t save', body: e.message });
      refresh();
    }
  };
  const setEv = (ev, ch, v) => save({ ...prefs, events: { ...prefs.events, [ev]: { ...prefs.events[ev], [ch]: v } } });

  const on = perm === 'granted' && Boolean(mine);
  const thisSub = subs.find((s) => s.endpoint === mine);
  const others = subs.filter((s) => s.endpoint !== mine);

  const turnOn = async () => {
    setBusy('on');
    try {
      await enablePush();
      toast({ tone: 'success', title: 'Desktop alerts are on', body: 'This browser will get the events you pick below.' });
    } catch (e) {
      toast({ tone: 'error', title: 'Couldn’t turn on alerts', body: e.message });
    }
    setBusy('');
    refresh();
  };
  const turnOff = async () => {
    setBusy('off');
    await disablePush();
    setBusy('');
    refresh();
  };
  const test = async () => {
    setBusy('test');
    try {
      const r = await post('/api/ui/push/test');
      toast({ tone: 'success', title: 'Test notification sent', body: r.sent ? `Sent to ${r.sent} browser${r.sent === 1 ? '' : 's'}.` : 'No browser accepted it — check the site permission.' });
    } catch (e) {
      toast({ tone: 'error', title: 'Test failed', body: e.message });
    }
    setBusy('');
  };
  const removeDevice = async (endpoint) => {
    await post('/api/ui/push/unsubscribe', { endpoint }).catch(() => {});
    refresh();
  };
  const unmute = async (a) => {
    try {
      await patch(`/api/admin/apps/${a.uuid}`, { notify: true });
      setMuted((m) => m.filter((x) => x.uuid !== a.uuid));
      toast({ tone: 'success', title: `${a.displayName || a.name} unmuted` });
    } catch (e) {
      toast({ tone: 'error', title: 'Couldn’t unmute', body: e.message });
    }
  };

  const deviceSub = perm === 'unsupported'
    ? 'This browser can’t show notifications'
    : !push.enabled ? 'Browser push isn’t set up on the server yet'
      : perm === 'denied' ? 'Blocked in this browser — allow notifications in the site settings'
        : `${deviceLabel()}${thisSub?.at ? ` · allowed ${dateYear(thisSub.at)}` : ''}`;

  return (
    <div>
      <PageHead title="Notifications" sub="Choose what reaches you, and where · applies to your account only"
        actions={<Button icon={Send} onClick={test} loading={busy === 'test'} disabled={!on}>Send test notification</Button>} />

      <div className="flex flex-col lg:flex-row gap-5 mb-5">
        <Card className="flex-1 flex items-center gap-[14px] p-5">
          <span className={cx('size-11 shrink-0 rounded-[12px] inline-flex items-center justify-center', on ? 'bg-green-soft text-green' : 'bg-surface-2 text-ink-2')}>{on ? <MonitorCheck size={20} /> : <Monitor size={20} />}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-extrabold text-ink">{on ? 'Browser notifications are on for this device' : 'Browser notifications are off for this device'}</div>
            <div className="text-[12.5px] font-medium text-ink-3 mt-[3px]">{deviceSub}</div>
          </div>
          {on ? (
            <span className="flex items-center gap-3">
              <Pill tone="approved">Allowed</Pill>
              <button onClick={turnOff} disabled={busy === 'off'} className="text-[13px] font-bold text-ink-2 hover:text-ink">Turn off</button>
            </span>
          ) : (
            <Button variant="accent" icon={Bell} onClick={turnOn} loading={busy === 'on'} disabled={!push.enabled || perm === 'denied' || perm === 'unsupported'}>Turn on</Button>
          )}
        </Card>
        <Card className="lg:w-[440px] flex items-center gap-[14px] p-5">
          <span className="size-11 shrink-0 rounded-[12px] bg-surface-2 text-ink inline-flex items-center justify-center"><Laptop size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-extrabold text-ink">{others.length ? `${others.length} other browser${others.length === 1 ? '' : 's'}` : 'No other browsers'}</div>
            <div className="text-[12.5px] font-medium text-ink-3 mt-[3px] truncate">{others.length ? others.map((s) => deviceLabel(s.ua).replace(/ \d+ ·/, ' ·')).join(' · ') : 'Turn on alerts in another browser to see it here'}</div>
          </div>
          {others.length > 0 && <button onClick={() => setShowDevices((v) => !v)} className="text-[13px] font-extrabold text-accent-text">{showDevices ? 'Done' : 'Manage'}</button>}
        </Card>
      </div>

      {showDevices && others.length > 0 && (
        <Card className="mb-5 p-2">
          {others.map((s) => (
            <div key={s.endpoint} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0">
              <Laptop size={16} className="text-ink-2" />
              <div className="flex-1 text-[13.5px] font-semibold text-ink">{deviceLabel(s.ua)}</div>
              <div className="text-[12px] text-ink-3">added {dateYear(s.at)}</div>
              <Button size="sm" variant="secondary" onClick={() => removeDevice(s.endpoint)}>Remove</Button>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-2 mb-5 overflow-x-auto scroll-thin">
        <div className="min-w-[640px]">
          <div className="flex items-center gap-4 px-4 py-[14px]">
            <div className="flex-1 text-[11px] font-bold tracking-[0.8px] text-ink-3">EVENT</div>
            <Head icon={Monitor}>Browser push</Head>
            <Head icon={Bell}>In-app</Head>
            <Head icon={MessageSquare}>Google Chat</Head>
            <Head icon={Mail}>Email digest</Head>
          </div>
          {ROWS.map((r) => (
            <div key={r.ev} className="flex items-center gap-4 px-4 py-[14px] border-t border-line">
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <Pill tone={r.tone}>{r.label}</Pill>
                <span className="text-[12.5px] font-medium text-ink-3 truncate">{r.ev === 'stuck' ? `Stuck longer than ${M?.stuckHours || 24}h` : r.desc}</span>
              </div>
              <div className="w-[96px] sm:w-[130px] flex justify-center">
                <Toggle label={`${r.label} browser push`} checked={Boolean(prefs?.events?.[r.ev]?.push)} disabled={!prefs} onChange={(v) => setEv(r.ev, 'push', v)} />
              </div>
              <div className="w-[96px] sm:w-[130px] flex justify-center">
                <Toggle label={`${r.label} in-app`} checked={prefs?.events?.[r.ev]?.inapp !== false} disabled={!prefs} onChange={(v) => setEv(r.ev, 'inapp', v)} />
              </div>
              <div className="w-[96px] sm:w-[130px] flex justify-center" title="app_review_bot posts every release status to the team space. Change the space in Setup.">
                <Toggle label={`${r.label} Google Chat`} checked={r.chat} disabled />
              </div>
              <div className="w-[96px] sm:w-[130px] flex justify-center" title="Email digests aren’t available yet">
                <Toggle label={`${r.label} email digest`} checked={false} disabled />
              </div>
            </div>
          ))}
          <div className="px-4 pt-3 pb-2 text-[12px] text-ink-3">Google Chat posts go to the whole team space and are set by an admin in Setup. Email digests aren’t available yet.</div>
        </div>
      </Card>

      <div className="flex flex-col lg:flex-row gap-5">
        <Card className="flex-1 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[16px] font-bold text-ink">Quiet hours</h2>
            <Toggle label="Quiet hours" checked={Boolean(prefs?.quiet?.enabled)} disabled={!prefs} onChange={(v) => save({ ...prefs, quiet: { enabled: v } })} />
          </div>
          <p className="mt-3 text-[13.5px] text-ink-2">22:00 – 08:00 IST · rejections and over-limit alerts still come through</p>
        </Card>
        <Card className="flex-1 p-5">
          <h2 className="text-[16px] font-bold text-ink">Muted apps</h2>
          {!muted.length && <p className="mt-3 text-[13.5px] text-ink-3 flex items-center gap-2"><BellOff size={15} /> No muted apps</p>}
          {muted.map((a) => {
            const g = allGroups.find((x) => x.name.toLowerCase() === String(a.name).toLowerCase());
            return (
              <div key={a.uuid} className="mt-3 flex items-center gap-3">
                <AppIcon name={a.displayName || a.name} iconUrl={a.iconUrl || g?.iconUrl} size={28} />
                <span className="flex-1 text-[13.5px] font-semibold text-ink">{a.displayName || a.name} · {a.store === 'apple' ? 'App Store' : 'Google Play'}</span>
                <button onClick={() => unmute(a)} className="text-[13px] font-extrabold text-accent-text">Unmute</button>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
