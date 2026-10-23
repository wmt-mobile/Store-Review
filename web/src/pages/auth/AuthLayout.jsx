// Shared shell for the sign-in, forgot-password and reset-password screens (pen.dev frame "Login").
import { TriangleAlert } from 'lucide-react';
import { RocketLaunch } from '@phosphor-icons/react';
import { LogoTile, cx } from '../../components/ui.jsx';

const HATCH = 'repeating-linear-gradient(-60deg, rgba(255,255,255,.18) 0 1.5px, transparent 1.5px 6px)';
// [height px at 1440×1024, kind] — kind: h = hatched outline, s = solid dim, l = lime
const BARS = [[120, 'h'], [190, 'h'], [150, 's'], [260, 'h'], [210, 'h'], [330, 'l'], [240, 'h'], [300, 'h'], [180, 's'], [360, 'l']];

function BrandArt() {
  return (
    <div className="relative w-full h-[380px] flex items-end gap-[14px]" aria-hidden>
      {BARS.map(([h, k], i) => (
        <div key={i} className={cx('flex-1 rounded-[10px_10px_4px_4px]', k === 'l' && 'bg-accent', k === 's' && 'bg-white/[.08]', k === 'h' && 'border border-white/[.14]')}
          style={{ height: `${(h / 380) * 100}%`, backgroundImage: k === 'h' ? HATCH : undefined }} />
      ))}
      <div className="absolute left-[35%] top-5 flex items-center gap-[10px] py-[10px] pl-[10px] pr-[14px] bg-white rounded-[14px] shadow-[0_12px_32px_rgba(0,0,0,.4)]">
        <span className="size-8 rounded-[9px] inline-flex items-center justify-center text-white" style={{ background: 'linear-gradient(180deg,#4F8BFF,#1D4ED8)' }}><RocketLaunch size={18} weight="regular" /></span>
        <span className="flex flex-col gap-[3px]">
          <span className="text-[12.5px] font-extrabold text-[#0F110C] whitespace-nowrap">Orbit Notes · 2.4.0 (128)</span>
          <span className="flex items-center gap-[5px] text-[11.5px] font-bold text-[#15803D] whitespace-nowrap"><span className="size-[6px] rounded-full bg-[#15803D]" />Approved · ready to publish</span>
        </span>
      </div>
    </div>
  );
}

export function AuthLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-bg text-ink">
      <aside className="relative lg:w-1/2 lg:min-h-screen flex flex-col p-6 lg:p-12 bg-[#0F110C] overflow-hidden dark:border-r dark:border-b lg:dark:border-b-0 dark:border-line">
        <a href="/login" className="flex items-center gap-[10px] w-fit">
          <LogoTile size={36} mark={24} />
          <span className="text-[18px] font-extrabold tracking-[-0.3px] text-white">Review Radar</span>
        </a>
        <div className="hidden lg:block flex-1 min-h-8" />
        <div className="hidden lg:block"><BrandArt /></div>
        <h1 className="hidden lg:block mt-12 text-[44px] xl:text-[52px] leading-[1.06] font-extrabold tracking-[-1.8px] text-white">Every app review,<br />in one place.</h1>
        <p className="hidden lg:block mt-4 max-w-[520px] text-[16px] leading-6 font-medium text-white/60">Live App Store &amp; Google Play review status for the whole team — the same updates app_review_bot posts to Google Chat.</p>
        <p className="lg:hidden mt-4 text-[15px] leading-[22px] font-medium text-white/60">Every app review, in one place.</p>
      </aside>
      <main className="flex-1 flex items-start lg:items-center justify-center px-5 py-10 lg:p-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}

export function AuthHead({ title, sub }) {
  return (
    <div className="flex flex-col gap-2 pb-2">
      <h2 className="text-[30px] sm:text-[34px] font-extrabold tracking-[-1px]">{title}</h2>
      {sub && <p className="text-[15px] font-medium text-ink-2">{sub}</p>}
    </div>
  );
}

export function AuthError({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 px-[14px] py-3 rounded-[14px] bg-red-soft text-red text-[13px] font-semibold">
      <TriangleAlert size={16} className="shrink-0 mt-px" />{children}
    </div>
  );
}

export const fieldCls = 'w-full h-[50px] flex items-center gap-[10px] px-4 bg-surface rounded-[14px] ring-[1.5px] ring-inset ring-transparent focus-within:ring-ink transition';
export const inputCls = 'flex-1 min-w-0 bg-transparent outline-none text-[15px] font-semibold placeholder:text-ink-3 placeholder:font-medium';
export const primaryBtn = 'w-full h-[50px] flex items-center justify-center gap-2 px-4 bg-primary text-on-primary rounded-[14px] text-[15px] font-bold hover:opacity-90 disabled:opacity-70';

/** Supabase puts recovery results in the URL hash: #access_token=…&type=recovery or #error=…&error_code=otp_expired. */
export function readAuthHash(hash = location.hash) {
  const p = new URLSearchParams(String(hash).replace(/^#/, ''));
  return { accessToken: p.get('access_token'), type: p.get('type'), error: p.get('error'), errorCode: p.get('error_code'), errorDescription: p.get('error_description') };
}
