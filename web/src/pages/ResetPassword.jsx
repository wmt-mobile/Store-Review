// /reset-password — landing page of the Supabase recovery email.
// Supabase verifies the one-time link and redirects here with #access_token=…&type=recovery
// (or #error=…&error_code=otp_expired). The token is moved out of the URL straight away.
import { useEffect, useRef, useState } from 'react';
import { Lock, Eye, EyeOff, Check, KeyRound, LinkIcon, ArrowLeft, X, ClipboardPaste } from 'lucide-react';
import { Spinner, cx } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { AuthLayout, AuthHead, AuthError, fieldCls, inputCls, primaryBtn, readAuthHash } from './auth/AuthLayout.jsx';

const MIN = 8;

function rules(pw) {
  return [
    { ok: pw.length >= MIN, label: `At least ${MIN} characters` },
    { ok: /[a-z]/i.test(pw) && /\d/.test(pw), label: 'Letters and numbers' },
    { ok: pw.length >= 12 || /[^a-z0-9]/i.test(pw), label: '12+ characters or a symbol' },
  ];
}

function PasswordField({ id, label, value, onChange, show, onToggle, autoFocus, inputRef }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-bold">{label}</label>
      <div className={fieldCls}>
        <Lock size={18} className="text-ink-2 shrink-0" />
        <input id={id} ref={inputRef} type={show ? 'text' : 'password'} autoComplete="new-password" autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder="••••••••"
          className={cx(inputCls, !show && value && 'tracking-[2px]')} />
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'} className="text-ink-3 hover:text-ink">
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Fallback: the email link went to the wrong site — paste it here and the server redeems it with Supabase. */
function PasteLink({ onToken }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!link.trim()) return setError('Paste the link from the email');
    setBusy(true);
    setError('');
    try {
      const r = await api('/api/auth/recovery-link', { method: 'POST', body: { link: link.trim() } });
      onToken(r.accessToken);
    } catch (err) {
      setError(err.message || 'That link didn’t work');
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-4 rounded-[16px] bg-surface">
      <div className="text-[14px] font-bold">Email link opened the wrong page?</div>
      <p className="text-[12.5px] font-medium text-ink-2 leading-[1.5]">In the email, <b className="text-ink">right-click “Reset Password” → Copy link address</b> (don’t open it) and paste it here. You can also paste the address of the page it opened.</p>
      <AuthError>{error}</AuthError>
      <div className={cx(fieldCls, 'bg-surface-2')}>
        <ClipboardPaste size={18} className="text-ink-2 shrink-0" />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…supabase.co/auth/v1/verify?token=…" className={cx(inputCls, 'text-[13px] font-mono')} />
      </div>
      <button type="submit" disabled={busy} className={primaryBtn}>{busy ? <Spinner size={16} /> : <Check size={16} />}{busy ? 'Checking…' : 'Use this link'}</button>
    </form>
  );
}

function LinkProblem({ message, onToken }) {
  return (
    <div className="flex flex-col gap-5">
      <span className="size-[56px] rounded-full bg-red-soft text-red inline-flex items-center justify-center"><LinkIcon size={24} /></span>
      <AuthHead title={message ? 'This link can’t be used' : 'Reset your password'} sub={message || 'Open the link from the reset email, or paste it below.'} />
      <PasteLink onToken={onToken} />
      <a href="/login?forgot=1" className="w-full h-[50px] flex items-center justify-center px-4 rounded-[14px] text-[15px] font-bold ring-[1.5px] ring-inset ring-line text-ink hover:bg-surface">Send a new reset link</a>
      <a href="/login" className="inline-flex items-center justify-center gap-1.5 text-[13.5px] font-bold text-ink-2 hover:text-ink"><ArrowLeft size={15} />Back to sign in</a>
    </div>
  );
}

export default function ResetPassword() {
  const [link] = useState(() => readAuthHash());
  const [pasted, setPasted] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState('');
  const [done, setDone] = useState(false);
  const confirmRef = useRef(null);

  useEffect(() => {
    document.title = 'Choose a new password · Review Radar';
    // keep the one-time token out of history, bookmarks and screenshots
    if (location.hash) history.replaceState(null, '', location.pathname);
  }, []);

  const token = pasted || (link.type === 'recovery' ? link.accessToken : null);
  const usePasted = (t) => { setExpired(''); setError(''); setPasted(t); };
  if (expired) return <AuthLayout><LinkProblem message={expired} onToken={usePasted} /></AuthLayout>;
  if (!token) {
    const msg = link.errorCode === 'otp_expired' ? 'This reset link has expired or was already used. Request a new one — it works once, for 1 hour.' : link.errorDescription?.replace(/\+/g, ' ');
    return <AuthLayout><LinkProblem message={msg} onToken={usePasted} /></AuthLayout>;
  }

  const checks = rules(password);
  const mismatch = confirm && confirm !== password;

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < MIN) return setError(`Use at least ${MIN} characters`);
    if (password !== confirm) {
      confirmRef.current?.focus();
      return setError('The two passwords don’t match');
    }
    setBusy(true);
    setError('');
    try {
      const r = await api('/api/auth/reset', { method: 'POST', body: { accessToken: token, password } });
      setDone(true);
      setTimeout(() => { location.href = r?.next || '/dashboard'; }, 1500);
    } catch (err) {
      if (err.status === 401) setExpired(err.message);
      else setError(err.message || 'Could not update the password');
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-5">
          <span className="size-[56px] rounded-full bg-green-soft text-green inline-flex items-center justify-center"><Check size={26} strokeWidth={3} /></span>
          <AuthHead title="Password updated" sub="You’re signed in. Taking you to the dashboard…" />
          <a href="/dashboard" className={primaryBtn}>Open dashboard</a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <span className="size-[56px] rounded-full bg-accent-soft text-ink inline-flex items-center justify-center"><KeyRound size={24} /></span>
        <AuthHead title="Choose a new password" sub="Pick something you don’t use anywhere else." />
        <AuthError>{error}</AuthError>

        <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} show={show} onToggle={() => setShow((s) => !s)} autoFocus />
        {password && (
          <ul className="-mt-2 flex flex-col gap-1.5">
            {checks.map((c) => (
              <li key={c.label} className={cx('flex items-center gap-2 text-[12.5px] font-semibold', c.ok ? 'text-green' : 'text-ink-3')}>
                {c.ok ? <Check size={14} strokeWidth={3} /> : <span className="size-[14px] inline-flex items-center justify-center"><span className="size-[5px] rounded-full bg-current" /></span>}
                {c.label}
              </li>
            ))}
          </ul>
        )}

        <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} show={show} inputRef={confirmRef} />
        {mismatch && <p className="-mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-red"><X size={14} strokeWidth={3} />Passwords don’t match</p>}

        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? <Spinner size={16} /> : <Check size={16} />}
          {busy ? 'Updating…' : 'Update password'}
        </button>
        <a href="/login" className="inline-flex items-center justify-center gap-1.5 text-[13.5px] font-bold text-ink-2 hover:text-ink"><ArrowLeft size={15} />Back to sign in</a>
      </form>
    </AuthLayout>
  );
}
