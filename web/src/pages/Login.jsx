// Sign-in page (pen.dev frame "Login"): dark brand panel with hatched bar art + email/password form.
// "Forgot password?" switches the form to the Supabase recovery flow (email link → /reset-password).
import { useEffect, useRef, useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, Check, MailCheck, Send } from 'lucide-react';
import { Spinner, cx } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { AuthLayout, AuthHead, AuthError, fieldCls, inputCls, primaryBtn, readAuthHash } from './auth/AuthLayout.jsx';

const lastEmail = () => { try { return localStorage.getItem('rr-last-email') || ''; } catch { return ''; } };

function ForgotForm({ initialEmail, onBack }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  useEffect(() => { document.title = 'Reset password · Review Radar'; }, []);

  const submit = async (e) => {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setError('Enter a valid email address');
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/forgot', { method: 'POST', body: { email: v } });
      setSentTo(v);
    } catch (err) {
      setError(err.message || 'Could not send the reset email');
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="flex flex-col gap-5">
        <span className="size-[56px] rounded-full bg-accent-soft text-ink inline-flex items-center justify-center"><MailCheck size={26} /></span>
        <AuthHead title="Check your inbox" sub={<>If <b className="text-ink">{sentTo}</b> has a Review Radar account, we’ve sent a link to reset the password.</>} />
        <ul className="flex flex-col gap-2 text-[13.5px] font-medium text-ink-2">
          <li className="flex gap-2"><Check size={16} className="shrink-0 mt-0.5 text-green" />The email comes from Supabase Auth — check spam if it isn’t there in a minute.</li>
          <li className="flex gap-2"><Check size={16} className="shrink-0 mt-0.5 text-green" />The link works once and expires after 1 hour.</li>
          <li className="flex gap-2"><Check size={16} className="shrink-0 mt-0.5 text-green" />Open it on this device to choose a new password.</li>
        </ul>
        <button type="button" onClick={onBack} className={primaryBtn}><ArrowLeft size={16} />Back to sign in</button>
        <button type="button" onClick={() => setSentTo('')} className="text-[13px] font-bold text-accent-text">Didn’t get it? Send again</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <AuthHead title="Forgot your password?" sub="Enter your work email and we’ll send you a link to choose a new one." />
      <AuthError>{error}</AuthError>
      <div className="flex flex-col gap-2">
        <label htmlFor="reset-email" className="text-[13px] font-bold">Work email</label>
        <div className={fieldCls}>
          <Mail size={18} className="text-ink-2 shrink-0" />
          <input id="reset-email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@webmobtechnologies.com" className={inputCls} />
        </div>
      </div>
      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy ? <Spinner size={16} /> : <Send size={16} />}
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      <button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-1.5 text-[13.5px] font-bold text-ink-2 hover:text-ink"><ArrowLeft size={15} />Back to sign in</button>
    </form>
  );
}

export default function Login() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/dashboard';
  const [email, setEmail] = useState(lastEmail);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('error') || '');
  const [notice] = useState(params.get('reset') === 'done' ? 'Password updated — sign in with your new password.' : '');
  const [forgot, setForgot] = useState(params.get('forgot') === '1');
  const pwRef = useRef(null);

  useEffect(() => {
    // A Supabase recovery link that fell back to the Site URL still carries its token in the hash.
    const h = readAuthHash();
    if (h.type === 'recovery' || h.errorCode) {
      location.replace(`/reset-password${location.hash}`);
      return;
    }
    if (!forgot) document.title = 'Sign in · Review Radar';
    if (email && !forgot) pwRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forgot]);

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

  if (forgot) return <AuthLayout><ForgotForm initialEmail={email} onBack={() => setForgot(false)} /></AuthLayout>;

  return (
    <AuthLayout>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <AuthHead title="Welcome back" sub="Sign in with your WebMobTechnologies account." />

        {notice && !error && (
          <div role="status" className="flex items-start gap-2 px-[14px] py-3 rounded-[14px] bg-green-soft text-green text-[13px] font-semibold">
            <Check size={16} className="shrink-0 mt-px" />{notice}
          </div>
        )}
        <AuthError>{error}</AuthError>

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-[13px] font-bold">Work email</label>
          <div className={fieldCls}>
            <Mail size={18} className="text-ink-2 shrink-0" />
            <input id="email" type="email" autoComplete="username" autoFocus={!email} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@webmobtechnologies.com" className={inputCls} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center">
            <label htmlFor="password" className="flex-1 text-[13px] font-bold">Password</label>
            <button type="button" onClick={() => { setError(''); setForgot(true); }} className="text-[13px] font-bold text-accent-text">Forgot password?</button>
          </div>
          <div className={fieldCls}>
            <Lock size={18} className="text-ink-2 shrink-0" />
            <input id="password" ref={pwRef} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              className={cx(inputCls, !show && password && 'tracking-[2px]')} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="text-ink-3 hover:text-ink">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-[10px] w-fit cursor-pointer select-none">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="sr-only peer" />
          <span className={cx('size-5 rounded-[6px] inline-flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text', remember ? 'bg-primary text-accent dark:text-on-primary' : 'ring-[1.5px] ring-inset ring-line bg-surface')}>
            {remember && <Check size={13} strokeWidth={3} />}
          </span>
          <span className="text-[13.5px] font-semibold text-ink-2">Keep me signed in on this device</span>
        </label>

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? <Spinner size={16} /> : <ArrowRight size={16} />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
