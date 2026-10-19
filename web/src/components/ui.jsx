// Design-system primitives from the pen.dev "Review Radar — Components" board.
import { forwardRef } from 'react';
import { AppleLogo, GooglePlayLogo } from '@phosphor-icons/react';
import { Loader2, FileText } from 'lucide-react';
import { MARK_SVG } from './logo-paths.js';
import { gradFor, listingText, TONE } from '../lib/model.js';

export const cx = (...a) => a.filter(Boolean).join(' ');

/* ── Logo ─────────────────────────────────────────── */
export function Mark({ size = 23, className = 'text-[#0F110C]' }) {
  return <svg viewBox="0 0 171.46 171.46" width={size} height={size} className={className} fill="currentColor" aria-hidden dangerouslySetInnerHTML={{ __html: MARK_SVG }} />;
}
export function LogoTile({ size = 34, radius = 10, mark = 23 }) {
  return (
    <span className="inline-flex items-center justify-center bg-accent shrink-0" style={{ width: size, height: size, borderRadius: radius }}>
      <Mark size={mark} />
    </span>
  );
}
export function Logo({ dark = false }) {
  return (
    <span className="inline-flex items-center gap-[10px]">
      <LogoTile />
      <span className={cx('text-[17px] font-extrabold tracking-[-0.3px] whitespace-nowrap', dark ? 'text-white' : 'text-ink')}>Review Radar</span>
    </span>
  );
}

/* ── Status pill ──────────────────────────────────── */
const PILL = {
  blue: 'bg-blue-soft text-blue',
  amber: 'bg-amber-soft text-amber',
  approved: 'text-green ring-[1.5px] ring-inset ring-green',
  live: 'bg-accent text-accent-ink',
  red: 'bg-red-soft text-red',
  grey: 'bg-grey-soft text-grey',
  green: 'bg-green-soft text-green',
};
export function Pill({ tone = 'grey', children, className, dot = true, small }) {
  return (
    <span className={cx('inline-flex items-center gap-[6px] rounded-full font-bold whitespace-nowrap', small ? 'h-[22px] px-2 text-[11px]' : 'h-[26px] px-[10px] text-[12px]', PILL[tone] || PILL.grey, className)}>
      {dot && <span className="size-[6px] rounded-full bg-current shrink-0" />}
      {children}
    </span>
  );
}

/** Google Play store-listing / app-content review shown next to a build's status (no new build). */
export function ListingStrip({ listing, className }) {
  if (!listing) return null;
  return (
    <span className={cx('inline-flex items-center gap-1.5 min-w-0 text-[12px] font-semibold text-ink-2 whitespace-nowrap', className)} title="Store listing / app content change · no new build">
      <FileText size={13} className="shrink-0" />Store listing
      <Pill small tone={TONE[listing.category] || 'grey'} className="min-w-0"><span className="truncate">{listingText(listing)}</span></Pill>
    </span>
  );
}

/* ── Store badge ──────────────────────────────────── */
export function StoreIcon({ store, size = 13, className }) {
  const I = store === 'apple' ? AppleLogo : GooglePlayLogo;
  return <I size={size} className={cx('shrink-0', className)} />;
}
export function StoreBadge({ store, className }) {
  return (
    <span className={cx('inline-flex items-center gap-[5px] bg-surface-2 rounded-[8px] px-2 py-1 text-[11.5px] font-semibold text-ink-2 whitespace-nowrap', className)}>
      <StoreIcon store={store} className="text-ink" />
      {store === 'apple' ? 'App Store' : 'Google Play'}
    </span>
  );
}

/* ── App icon ─────────────────────────────────────── */
export function AppIcon({ name, iconUrl, size = 40, radius, className, badge }) {
  const r = radius ?? Math.round(size * 0.275);
  const [a, b] = gradFor(name);
  return (
    <span className={cx('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {iconUrl ? (
        <img src={iconUrl} alt="" width={size} height={size} loading="lazy" className="object-cover" style={{ width: size, height: size, borderRadius: r }} />
      ) : (
        <span className="inline-flex items-center justify-center text-white font-extrabold" style={{ width: size, height: size, borderRadius: r, background: `linear-gradient(180deg, ${a}, ${b})`, fontSize: size * 0.42 }}>
          {String(name || '?').trim().charAt(0).toUpperCase()}
        </span>
      )}
      {badge && <span className="absolute -right-1 -bottom-1">{badge}</span>}
    </span>
  );
}

/* ── Buttons ──────────────────────────────────────── */
const BTN = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3',
  outline: 'ring-[1.5px] ring-inset ring-line text-ink hover:bg-surface-2',
  surface: 'bg-surface text-ink hover:bg-surface-2',
  accent: 'bg-accent text-accent-ink hover:brightness-95',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-red text-white hover:opacity-90',
};
export const Button = forwardRef(function Button({ variant = 'primary', icon: Icon, children, className, loading, size = 'md', as: As = 'button', ...rest }, ref) {
  const sz = size === 'sm' ? 'h-8 px-3 text-[13px] rounded-[10px] gap-1.5' : size === 'lg' ? 'h-[50px] px-5 text-[15px] rounded-[14px] gap-2' : 'h-10 px-4 text-[14px] rounded-[12px] gap-2';
  return (
    <As ref={ref} type={As === 'button' ? 'button' : undefined} className={cx('inline-flex items-center justify-center font-bold whitespace-nowrap transition disabled:opacity-50', sz, BTN[variant], className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2} /> : null}
      {children}
    </As>
  );
});

/* ── Cards, headings ──────────────────────────────── */
export function Card({ className, children, ...rest }) {
  return <section className={cx('bg-surface rounded-[20px]', className)} {...rest}>{children}</section>;
}
export function CardHead({ title, sub, right, count, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[18px] font-bold tracking-[-0.2px] text-ink">
          {title}
          {count != null && <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-soft text-amber text-[11px] font-extrabold">{count}</span>}
        </h2>
        {sub && <p className="mt-1 text-[13px] text-ink-3">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
export function PageHead({ title, sub, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-[32px] sm:text-[34px] leading-[1.1] font-extrabold tracking-[-0.8px] text-ink">{title}</h1>
        {sub && <p className="mt-2 text-[14px] text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
export const Label = ({ children, className }) => <div className={cx('text-[11px] font-bold tracking-[1.2px] uppercase text-ink-3', className)}>{children}</div>;
export const Count = ({ n, tone = 'red' }) => (n ? <span className={cx('inline-flex items-center rounded-full px-[7px] py-[2px] text-[11px] font-extrabold text-white', tone === 'amber' ? 'bg-amber' : 'bg-red')}>{n}</span> : null);

/* ── Inputs ───────────────────────────────────────── */
export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled} onClick={() => onChange?.(!checked)}
      className={cx('relative inline-flex w-[38px] h-[22px] rounded-full transition shrink-0 disabled:opacity-40', checked ? 'bg-[#0F110C] dark:bg-[#3A3D33]' : 'bg-surface-3')}>
      <span className={cx('absolute top-[3px] size-4 rounded-full transition-all', checked ? 'left-[19px] bg-accent' : 'left-[3px] bg-surface shadow-sm')} />
    </button>
  );
}

/** Segmented control. style "soft" = white thumb on grey (7d/14d/30d), "ink" = black thumb (All/App Store/Play, Board/List). */
export function Segmented({ options, value, onChange, variant = 'soft', className, size = 'md' }) {
  return (
    <div className={cx('inline-flex items-center p-1 gap-0.5', variant === 'soft' ? 'bg-surface-2 rounded-[12px]' : 'bg-surface rounded-[14px]', className)} role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button key={o.value} role="tab" aria-selected={on} onClick={() => onChange(o.value)}
            className={cx('inline-flex items-center gap-1.5 font-semibold whitespace-nowrap transition', size === 'sm' ? 'h-7 px-2.5 text-[12.5px] rounded-[8px]' : 'h-8 px-3 text-[13.5px] rounded-[10px]',
              on ? (variant === 'soft' ? 'bg-surface text-ink font-bold shadow-[0_1px_2px_rgba(15,17,12,.08)]' : 'bg-primary text-on-primary font-bold') : 'text-ink-2 hover:text-ink')}>
            {Icon && <Icon size={14} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, icon: Icon, mono, ...rest }, ref) {
  return (
    <label className={cx('flex items-center gap-2.5 h-[46px] px-[14px] rounded-[12px] bg-surface-2 focus-within:ring-[1.5px] focus-within:ring-ink transition', className)}>
      {Icon && <Icon size={16} className="text-ink-3 shrink-0" />}
      <input ref={ref} className={cx('flex-1 min-w-0 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-3', mono && 'font-mono')} {...rest} />
    </label>
  );
});

export function Spinner({ size = 16, className }) {
  return <Loader2 size={size} className={cx('animate-spin', className)} />;
}

export function Skeleton({ className }) {
  return <div className={cx('skeleton rounded-[10px]', className)} />;
}

export function Empty({ icon: Icon, title, children, action, tone = 'accent' }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      {Icon && (
        <span className={cx('size-[72px] rounded-full inline-flex items-center justify-center mb-5', tone === 'red' ? 'bg-red-soft text-red' : 'bg-accent-soft text-ink')}>
          <Icon size={30} />
        </span>
      )}
      <h3 className="text-[18px] font-bold text-ink">{title}</h3>
      {children && <p className="mt-2 max-w-[300px] text-[13.5px] leading-[1.5] text-ink-2">{children}</p>}
      {action && <div className="mt-5 flex gap-3">{action}</div>}
    </div>
  );
}

/** Small mono key cap: Ctrl K */
export const Kbd = ({ children }) => <kbd className="inline-flex items-center h-5 px-1.5 rounded-[6px] bg-surface-2 ring-1 ring-inset ring-line text-[11px] font-semibold text-ink-2 font-sans">{children}</kbd>;
