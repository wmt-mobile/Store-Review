// Browser push: the in-app "Get approvals on your desktop" card (design "Enable browser notifications")
// and helpers to subscribe this browser. The native permission prompt is only triggered by "Turn on".
import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { api, post } from '../lib/api.js';
import { LS, useUi } from '../lib/store.jsx';
import { loadNotifyPrefs, notifyState } from './Notifications.jsx';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission (must be called from a click), subscribe and register with the server. */
export async function enablePush() {
  if (!pushSupported()) throw new Error('This browser does not support notifications');
  const { push } = await api('/api/ui/notify');
  if (!push?.enabled || !push.publicKey) throw new Error('Browser push is not set up on the server yet');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site — allow them in the browser’s site settings' : 'Permission was not granted');
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(push.publicKey) });
  await post('/api/ui/push/subscribe', { subscription: sub.toJSON() });
  await loadNotifyPrefs(true);
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await post('/api/ui/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  await loadNotifyPrefs(true);
}

/** Bottom-right dark card offering desktop alerts; hidden once dismissed, granted or unsupported. */
export function EnableNotificationsCard() {
  const { toast } = useUi();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!pushSupported() || LS.get('rr-push-card', '') === 'dismissed' || Notification.permission === 'denied') return;
      await loadNotifyPrefs();
      const st = notifyState();
      if (!st.push?.enabled) return;
      const sub = await currentSubscription().catch(() => null);
      if (!cancel && !(Notification.permission === 'granted' && sub)) setTimeout(() => !cancel && setShow(true), 2500);
    })();
    return () => { cancel = true; };
  }, []);
  if (!show) return null;
  const dismiss = () => { LS.set('rr-push-card', 'dismissed'); setShow(false); };
  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
      toast({ tone: 'success', title: 'Desktop alerts are on', body: 'You’ll get approvals, rejections and stuck builds on this device.' });
      dismiss();
    } catch (e) {
      toast({ tone: 'error', title: 'Couldn’t turn on alerts', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed z-[60] right-4 bottom-24 md:bottom-6 md:right-6 w-[min(420px,calc(100vw-32px))] flex items-center gap-4 p-[18px] rounded-[20px] bg-[#0F110C] text-white shadow-[0_16px_40px_rgba(15,17,12,.3)]" role="dialog" aria-label="Turn on desktop alerts">
      <span className="size-11 shrink-0 rounded-[12px] bg-accent text-accent-ink inline-flex items-center justify-center"><BellRing size={20} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-extrabold">Get approvals on your desktop</div>
        <div className="text-[12.5px] leading-[18px] text-[#999D92] mt-0.5">Browser alerts for approvals, rejections and stuck builds.</div>
      </div>
      <button onClick={turnOn} disabled={busy} className="h-9 px-3.5 rounded-[10px] bg-accent text-accent-ink text-[13px] font-extrabold whitespace-nowrap disabled:opacity-60">{busy ? 'Turning on…' : 'Turn on'}</button>
      <button onClick={dismiss} aria-label="Not now" className="absolute top-2 right-2 text-[#999D92] hover:text-white"><X size={14} /></button>
    </div>
  );
}
