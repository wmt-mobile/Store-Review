// Building blocks for the onboarding wizard (pen.dev frames "Onboarding 1–4").
import { Check, X, ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { Spinner, cx } from '../../components/ui.jsx';

export const STEPS = [
  { t: 'Connect developer account', s: 'Apple .p8 key or Play JSON' },
  { t: 'Choose apps to watch', s: 'Pick what the bot tracks' },
  { t: 'Connect Google Chat', s: 'Where alerts are posted' },
  { t: 'You’re all set', s: 'Start monitoring' },
];

/** fetch /api/admin… → { ok, status, ...json }, never throws on HTTP errors (the old wizard's contract). */
export async function adm(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(`/api/admin${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      location.href = '/login?next=/onboarding';
      return { ok: false, status: 401 };
    }
    const json = await res.json().catch(() => ({}));
    return Array.isArray(json) ? { ok: res.ok, status: res.status, list: json } : { ok: res.ok, status: res.status, ...json };
  } catch (e) {
    return { ok: false, status: 0, error: e.message || 'Network error' };
  }
}

export function Stepper({ step, done, reachable, onGo }) {
  return (
    <nav className="w-full lg:w-[300px] shrink-0 flex flex-col gap-[6px] p-6 bg-surface rounded-[20px]" aria-label="Setup steps">
      <div className="text-[15px] font-extrabold">Set up your workspace</div>
      <div className="text-[12.5px] font-medium text-ink-3">About 4 minutes</div>
      <div className="h-[14px]" />
      {STEPS.map((x, i) => {
        const on = i === step;
        const ok = done(i) && !on;
        return (
          <button key={i} type="button" disabled={!reachable(i)} onClick={() => onGo(i)}
            className={cx('w-full flex items-center gap-3 p-3 rounded-[14px] text-left transition disabled:cursor-default', on ? 'bg-surface-2' : 'hover:enabled:bg-surface-2/60')}>
            <span className={cx('size-[30px] shrink-0 rounded-full inline-flex items-center justify-center text-[12.5px] font-extrabold',
              on ? 'bg-[#0F110C] text-accent dark:bg-accent dark:text-accent-ink' : ok ? 'bg-accent text-accent-ink' : 'ring-[1.5px] ring-inset ring-line text-ink-3')}>
              {ok ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className={cx('text-[13.5px] font-bold truncate', on || ok ? 'text-ink' : 'text-ink-2')}>{x.t}</span>
              <span className="text-[12px] font-medium text-ink-3 truncate">{x.s}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function StepHead({ n, title, lede }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11.5px] font-extrabold tracking-[1.2px] text-accent-text">STEP {n} OF 4</div>
      <h1 className="text-[24px] sm:text-[26px] font-extrabold tracking-[-0.6px]">{title}</h1>
      {lede && <p className="text-[14px] leading-[21px] font-medium text-ink-2">{lede}</p>}
    </div>
  );
}

export function Footer({ onBack, backLabel = 'Back', primary, onPrimary, busy, disabled, primaryIcon: PI = ArrowRight, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      {onBack && (
        <button type="button" onClick={onBack} className="h-10 inline-flex items-center gap-2 px-4 rounded-[12px] ring-[1.5px] ring-inset ring-line text-[14px] font-bold hover:bg-surface-2">
          <ArrowLeft size={16} />{backLabel}
        </button>
      )}
      <div className="flex-1" />
      {children}
      <span className="hidden sm:inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3"><ShieldCheck size={14} />Encrypted at rest · read-only</span>
      {primary && (
        <button type="button" onClick={onPrimary} disabled={busy || disabled} className="h-10 inline-flex items-center gap-2 px-4 rounded-[12px] bg-primary text-on-primary text-[14px] font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? <Spinner size={16} /> : <PI size={16} />}{primary}
        </button>
      )}
    </div>
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className="text-[13px] font-bold">{label}</div>
      {children}
      {hint && <div className="text-[12px] font-medium text-ink-3">{hint}</div>}
    </div>
  );
}

export function TextInput({ mono, className, ...rest }) {
  return (
    <input {...rest} className={cx('w-full h-[46px] px-[14px] rounded-[12px] bg-surface-2 outline-none text-[14px] font-semibold text-ink placeholder:text-ink-3 placeholder:font-medium focus:ring-[1.5px] focus:ring-ink', mono && 'font-mono', className)} />
  );
}

/** Live verification results returned by POST /api/admin/accounts. */
export function Checks({ checks }) {
  if (!checks) return null;
  return (
    <div className="flex flex-col gap-2 p-4 rounded-[16px] bg-surface-2">
      <div className="flex items-center gap-2 text-[13.5px] font-bold">
        {checks.running ? <><Spinner size={15} className="text-accent-text" />Checking your credentials…</>
          : checks.ok ? <><Check size={16} className="text-green" />Connected</>
            : <><X size={16} className="text-red" />Couldn’t connect — fix the item below and retry</>}
      </div>
      {checks.items.map((s, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className={cx('mt-0.5 size-[18px] shrink-0 rounded-full inline-flex items-center justify-center', s.ok === null ? 'text-ink-3' : s.ok ? 'bg-green-soft text-green' : 'bg-red-soft text-red')}>
            {s.ok === null ? <Spinner size={12} /> : s.ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">{s.label}</div>
            {s.detail && <div className="text-[12px] text-ink-2 break-words">{s.detail}</div>}
            {s.hint && <div className="text-[12px] font-semibold text-amber break-words">{s.hint}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
