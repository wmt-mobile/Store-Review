// Shared bits for the admin / catalog screens: dialog, dropdown, CSV export, actor avatar, check strip.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, ChevronDown, Check, Inbox, X } from 'lucide-react';
import { cx } from '../../components/ui.jsx';

export function Dialog({ open, onClose, title, sub, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose?.();
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" className="w-full bg-surface rounded-[24px] shadow-[0_24px_80px_rgba(15,17,12,.25)] max-h-[90vh] flex flex-col" style={{ maxWidth: width }}>
        <div className="flex items-start gap-3 px-6 pt-6 pb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-[18px] font-extrabold tracking-[-0.2px] text-ink">{title}</h3>
            {sub && <p className="mt-1 text-[13px] text-ink-2">{sub}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="size-9 shrink-0 rounded-[12px] bg-surface-2 inline-flex items-center justify-center text-ink hover:bg-surface-3"><X size={16} /></button>
        </div>
        <div className="px-6 pb-2 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-5">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Pill-shaped dropdown (design: "Last 7 days ▾", "All apps ▾"). */
export function Dropdown({ icon: Icon, value, options, onChange, className, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const cur = options.find((o) => o.value === value) || options[0];
  return (
    <div ref={ref} className={cx('relative', className)}>
      <button onClick={() => setOpen((o) => !o)} className="h-10 inline-flex items-center gap-2 pl-3 pr-2.5 bg-surface rounded-[12px] text-[13.5px] font-bold text-ink whitespace-nowrap max-w-[220px]">
        {Icon && <Icon size={15} className="shrink-0" />}
        <span className="truncate">{cur?.label}</span>
        <ChevronDown size={15} className="text-ink-2 shrink-0" />
      </button>
      {open && (
        <div className={cx('absolute top-[46px] z-40 min-w-[200px] max-h-[320px] overflow-y-auto bg-surface rounded-[14px] shadow-[0_12px_40px_rgba(15,17,12,.16)] p-1.5', align === 'right' ? 'right-0' : 'left-0')}>
          {options.map((o) => (
            <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] hover:bg-surface-2 text-left text-[13px] font-semibold text-ink">
              <span className="flex-1 truncate">{o.label}</span>
              {o.value === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Download rows as CSV (Excel-friendly, UTF-8 BOM). */
export function downloadCsv(filename, header, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const BOTS = new Set(['system', 'app_review_bot', 'bot', 'cron']);
export const isBot = (actor) => BOTS.has(String(actor || '').toLowerCase());
export function actorName(actor) {
  const a = String(actor || 'system');
  if (isBot(a)) return 'app_review_bot';
  if (a === 'gmail_reader') return 'gmail_reader';
  if (a === 'unknown' || a === 'admin') return a === 'admin' ? 'Admin' : 'Unknown';
  if (!a.includes('@')) return a;
  const parts = a.split('@')[0].split(/[._-]+/).filter(Boolean);
  if (!parts.length) return a;
  const first = parts[0][0].toUpperCase() + parts[0].slice(1);
  return parts[1] ? `${first} ${parts[1][0].toUpperCase()}.` : first;
}
export function ActorAvatar({ actor, size = 24 }) {
  const a = String(actor || 'system');
  const box = 'shrink-0 rounded-full inline-flex items-center justify-center';
  if (isBot(a)) return <span className={cx(box, 'bg-accent text-accent-ink')} style={{ width: size, height: size }}><Bot size={size * 0.55} /></span>;
  if (a === 'gmail_reader') return <span className={cx(box, 'bg-accent text-accent-ink')} style={{ width: size, height: size }}><Inbox size={size * 0.55} /></span>;
  const n = actorName(a);
  const ini = n.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
  return <span className={cx(box, 'bg-surface-2 text-ink text-[9.5px] font-extrabold')} style={{ width: size, height: size }}>{ini}</span>;
}

/** 24 small bars: green ok, red failed (oldest → newest, left → right). */
export function CheckStrip({ checks }) {
  const list = [...(checks || [])].slice(0, 24).reverse();
  const pad = Math.max(0, 24 - list.length);
  return (
    <div className="w-full h-6 flex gap-[3px] items-end" aria-label="Last 24 checks">
      {Array.from({ length: pad }).map((_, i) => <span key={`p${i}`} className="flex-1 h-6 rounded-[3px] bg-surface-2" />)}
      {list.map((c, i) => <span key={i} title={`${new Date(c.at).toLocaleString()} · ${c.ok ? 'OK' : c.error || 'Failed'}`} className={cx('flex-1 h-6 rounded-[3px]', c.ok ? 'bg-green opacity-75' : 'bg-red')} />)}
    </div>
  );
}

/** Read ?gmail=… / ?chat=… results from OAuth redirects (query or legacy hash). */
export function oauthResult() {
  const src = `${location.search}&${location.hash}`;
  const m = src.match(/[?&#](gmail|chat)=([^&]+)/);
  return m ? { kind: m[1], value: decodeURIComponent(m[2]) } : null;
}
