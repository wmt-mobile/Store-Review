// "View email" modal (pen.dev frame i9v0hg): the original store email the AI summary was made from.
import { useEffect, useState } from 'react';
import { Mail, X, Copy, ExternalLink, Inbox } from 'lucide-react';
import { Button, Spinner, cx } from './ui.jsx';
import { useData, useUi } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { time, tz } from '../lib/format.js';

const FRAME_CSS = `<style>
  html,body{margin:0;padding:0;background:#fff;color:#0F110C;font:14px/1.6 Roboto,Arial,Helvetica,sans-serif;word-wrap:break-word}
  body{padding:4px 2px}
  img{max-width:100%;height:auto} table{max-width:100%} a{color:#01875f}
</style><base target="_blank">`;

function frameDoc(email) {
  if (email.html) return /<head[^>]*>/i.test(email.html) ? email.html.replace(/<head[^>]*>/i, (m) => m + FRAME_CSS) : FRAME_CSS + email.html;
  const esc = String(email.text || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  return `${FRAME_CSS}<pre style="white-space:pre-wrap;font:inherit;margin:0">${esc}</pre>`;
}

function Meta({ k, children, strong }) {
  return (
    <div className="flex gap-4 text-[13px] leading-[20px]">
      <span className="w-[60px] shrink-0 font-medium text-ink-3">{k}</span>
      <span className={cx('min-w-0 break-words', strong ? 'font-bold text-ink' : 'font-medium text-ink')}>{children}</span>
    </div>
  );
}

export function EmailModal() {
  const { email: target, closeEmail, toast } = useUi();
  const { M } = useData();
  const [state, setState] = useState({ loading: false, data: null, error: null });

  useEffect(() => {
    if (!target?.id) return;
    let live = true;
    setState({ loading: true, data: null, error: null });
    api(`/api/email/${encodeURIComponent(target.id)}`)
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((e) => live && setState({ loading: false, data: null, error: e.message }));
    const h = (e) => e.key === 'Escape' && closeEmail();
    addEventListener('keydown', h);
    return () => { live = false; removeEventListener('keydown', h); };
  }, [target?.id, closeEmail]);

  if (!target) return null;
  const d = state.data;
  const gmailUrl = target.emailUrl || `https://mail.google.com/mail/u/0/#all/${target.id}`;
  const storeName = target.store === 'apple' ? 'App Store' : 'Google Play';
  const query = M?.gmail?.query ? M.gmail.query.slice(0, 48) + (M.gmail.query.length > 48 ? '…' : '') : M?.gmail?.email || 'shared mailbox';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText([d?.subject, '', d?.text || ''].join('\n'));
      toast({ title: 'Email text copied' });
    } catch {
      toast({ title: 'Copy failed', tone: 'error' });
    }
  };
  const zone = tz() === 'Asia/Kolkata' ? 'IST' : tz();

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Original rejection email">
      <div className="absolute inset-0 bg-scrim backdrop-blur-[6px]" onClick={closeEmail} />
      <div className="relative w-full sm:w-[760px] max-h-full sm:max-h-[calc(100vh-48px)] flex flex-col bg-surface sm:rounded-[24px] shadow-[0_24px_60px_rgba(15,17,12,.25)] overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-5">
          <span className="size-9 shrink-0 rounded-[10px] bg-red-soft text-red inline-flex items-center justify-center"><Mail size={18} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-ink">Original rejection email</h2>
            <div className="text-[12.5px] font-medium text-ink-3 truncate">{[target.appName, storeName, target.version].filter(Boolean).join(' · ')}</div>
          </div>
          <button onClick={closeEmail} aria-label="Close" className="size-9 rounded-[10px] bg-surface-2 inline-flex items-center justify-center text-ink"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin bg-surface-2 px-6 py-5 flex flex-col gap-4">
          {state.loading && <div className="flex items-center justify-center gap-2 py-16 text-[13px] font-medium text-ink-2"><Spinner /> Loading the email…</div>}
          {state.error && <div className="py-10 text-center text-[13.5px] font-medium text-red">Couldn’t load the email: {state.error}</div>}
          {d && (
            <>
              <div className="flex flex-col gap-[5px]">
                <Meta k="From">{d.from}</Meta>
                {d.to && <Meta k="To">{d.to}</Meta>}
                {d.at && <Meta k="Date">{new Intl.DateTimeFormat('en-US', { timeZone: tz(), weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(d.at)} · {time(d.at)} {zone}</Meta>}
                <Meta k="Subject" strong>{d.subject}</Meta>
              </div>
              <div className="bg-white rounded-[16px] ring-1 ring-line p-5 sm:px-8 sm:py-6">
                <iframe title="Email" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={frameDoc(d)} className="w-full min-h-[420px] border-0 bg-white"
                  onLoad={(e) => { try { const b = e.currentTarget.contentDocument?.body; if (b) e.currentTarget.style.height = `${Math.min(1400, b.scrollHeight + 16)}px`; } catch { /* cross-origin */ } }} />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-line">
          <span className="flex-1 min-w-0 inline-flex items-center gap-2 text-[12.5px] font-medium text-ink-3 truncate"><Inbox size={15} className="shrink-0" />Read via Gmail reader · {query}</span>
          <Button variant="outline" icon={Copy} onClick={copy} disabled={!d}>Copy text</Button>
          <Button as="a" href={gmailUrl} target="_blank" rel="noreferrer" icon={ExternalLink}>Open in Gmail</Button>
        </div>
      </div>
    </div>
  );
}
