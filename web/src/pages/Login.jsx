// Sign-in page (pen.dev frame "Login"): dark brand panel with hatched bar art + email/password form.
import { useEffect, useRef, useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Check, TriangleAlert } from 'lucide-react';
import { PhoneCall } from '@phosphor-icons/react';
import { LogoTile, Spinner, cx } from '../components/ui.jsx';
import { api } from '../lib/api.js';

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
        <span className="size-8 rounded-[9px] inline-flex items-center justify-center text-white" style={{ background: 'linear-gradient(180deg,#4F8BFF,#1D4ED8)' }}><PhoneCall size={18} weight="regular" /></span>
        <span className="flex flex-col gap-[3px]">
          <span className="text-[12.5px] font-extrabold text-[#0F110C] whitespace-nowrap">Telfon · 1.3.80 (193)</span>
          <span className="flex items-center gap-[5px] text-[11.5px] font-bold text-[#15803D] whitespace-nowrap"><span className="size-[6px] rounded-full bg-[#15803D]" />Approved · ready to publish</span>
        </span>
      </div>
    </div>
  );
}

export default function Login() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/dashboard';
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('rr-last-email') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('error') || '');
  const [forgot, setForgot] = useState(false);
  const pwRef = useRef(null);

  useEffect(() => {
    document.title = 'Sign in · Review Radar';
    if (email) pwRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password');
    setBusy(true);
    setError('');
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { email: email.trim(), password, next, remember } });
      if (!r?.ok) throw new Error(r?.error || 'Sign-in failed');
      try { remember ? localStorage.setItem('rr-last-email', email.trim()) : localStorage.removeItem('rr-last-email'); } catch { /* ignore */ }
      location.href = r.next || '/dashboard';
    } catch (err) {
      setError(err.message || 'Sign-in failed');
      setBusy(false);
      pwRef.current?.select();
    }
  };

  const field = 'w-full h-[50px] flex items-center gap-[10px] px-4 bg-surface rounded-[14px] ring-[1.5px] ring-inset ring-transparent focus-within:ring-ink transition';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-bg text-ink">
      <aside className="relative lg:w-1/2 lg:min-h-screen flex flex-col p-6 lg:p-12 bg-[#0F110C] overflow-hidden dark:border-r dark:border-b lg:dark:border-b-0 dark:border-line">
        <div className="flex items-center gap-[10px]">
          <LogoTile size={36} mark={24} />
          <span className="text-[18px] font-extrabold tracking-[-0.3px] text-white">Review Radar</span>
        </div>
        <div className="hidden lg:block flex-1 min-h-8" />
        <div className="hidden lg:block"><BrandArt /></div>
        <h1 className="hidden lg:block mt-12 text-[44px] xl:text-[52px] leading-[1.06] font-extrabold tracking-[-1.8px] text-white">Every app review,<br />in one place.</h1>
        <p className="hidden lg:block mt-4 max-w-[520px] text-[16px] leading-6 font-medium text-white/60">Live App Store &amp; Google Play review status for the whole team — the same updates app_review_bot posts to Google Chat.</p>
        <p className="lg:hidden mt-4 text-[15px] leading-[22px] font-medium text-white/60">Every app review, in one place.</p>
      </aside>

      <main className="flex-1 flex items-start lg:items-center justify-center px-5 py-10 lg:p-12">
        <form onSubmit={submit} noValidate className="w-full max-w-[400px] flex flex-col gap-5">
          <div className="flex flex-col gap-2 pb-2">
            <h2 className="text-[30px] sm:text-[34px] font-extrabold tracking-[-1px]">Welcome back</h2>
            <p className="text-[15px] font-medium text-ink-2">Sign in with your WebMobTechnologies account.</p>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 px-[14px] py-3 rounded-[14px] bg-red-soft text-red text-[13px] font-semibold">
              <TriangleAlert size={16} className="shrink-0 mt-px" />{error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-[13px] font-bold">Work email</label>
            <div className={field}>
              <Mail size={18} className="text-ink-2 shrink-0" />
              <input id="email" type="email" autoComplete="username" autoFocus={!email} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@webmobtechnologies.com"
                className="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-semibold placeholder:text-ink-3 placeholder:font-medium" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center">
              <label htmlFor="password" className="flex-1 text-[13px] font-bold">Password</label>
              <button type="button" onClick={() => setForgot((f) => !f)} className="text-[13px] font-bold text-accent-text">Forgot password?</button>
            </div>
            <div className={field}>
              <Lock size={18} className="text-ink-2 shrink-0" />
              <input id="password" ref={pwRef} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className={cx('flex-1 min-w-0 bg-transparent outline-none text-[15px] font-semibold placeholder:text-ink-3', !show && password && 'tracking-[2px]')} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="text-ink-3 hover:text-ink">
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {forgot && <p className="text-[12.5px] font-medium text-ink-2">Ask an admin to reset it in Supabase Auth.</p>}
          </div>

          <label className="flex items-center gap-[10px] w-fit cursor-pointer select-none">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="sr-only peer" />
            <span className={cx('size-5 rounded-[6px] inline-flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text', remember ? 'bg-primary text-accent dark:text-on-primary' : 'ring-[1.5px] ring-inset ring-line bg-surface')}>
              {remember && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="text-[13.5px] font-semibold text-ink-2">Keep me signed in on this device</span>
          </label>

          <button type="submit" disabled={busy} className="w-full h-[50px] flex items-center justify-center gap-2 px-4 bg-primary text-on-primary rounded-[14px] text-[15px] font-bold hover:opacity-90 disabled:opacity-70">
            {busy ? <Spinner size={16} /> : <ArrowRight size={16} />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-center text-[12.5px] font-medium text-ink-3">Internal tool · access is limited to @webmobtechnologies.com</p>
        </form>
      </main>
    </div>
  );
}
