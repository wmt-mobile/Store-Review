// Accounts — wallet card per developer account, last 24 checks, recent check log (pen.dev frame SfgVU).
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, KeyRound, Upload, PackagePlus, BadgeCheck, CircleAlert, MoreHorizontal, Pencil, Trash2, FileKey } from 'lucide-react';
import { AppleLogo, GooglePlayLogo } from '@phosphor-icons/react';
import { AppIcon, Button, Card, PageHead, Pill, Skeleton, cx } from '../components/ui.jsx';
import { useData, useUi } from '../lib/store.jsx';
import { ago, dateYear, inFuture, time } from '../lib/format.js';
import { patch, del, post, put } from '../lib/api.js';
import { CheckStrip, Dialog } from './admin/common.jsx';

const DECO = "path('M120 0C186.274 0 240 53.726 240 120C240 186.274 186.274 240 120 240C53.726 240 0 186.274 0 120C0 53.726 53.726 0 120 0ZM120 21.6C65.655 21.6 21.6 65.655 21.6 120C21.6 174.345 65.655 218.4 120 218.4C174.345 218.4 218.4 174.345 218.4 120C218.4 65.655 174.345 21.6 120 21.6Z')";

const storeTitle = (s) => (s === 'apple' ? 'App Store Connect' : 'Google Play Console');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function keyLine(a) {
  if (a.store === 'apple') {
    const k = a.keyHint ? `KEY ••••${a.keyHint}` : 'KEY ••••';
    return a.issuerHint ? `${k} · ISSUER ••••${a.issuerHint}` : k;
  }
  const e = (a.clientEmail || '').replace(/\.gserviceaccount\.com$/, '');
  return e || 'SERVICE ACCOUNT';
}

function failedStreak(a) {
  let n = 0;
  for (const c of a.checks || []) {
    if (c.ok) break;
    n++;
  }
  return n || (a.error ? 1 : 0);
}

function AccountCard({ a, apps, onChanged }) {
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(null);
  const apple = a.store === 'apple';
  const failing = Boolean(a.error);
  const streak = failedStreak(a);
  const lastOk = (a.checks || []).find((c) => c.ok)?.at || (!failing ? a.lastPollAt : null);
  const next = a.nextCheckAt || (a.lastPollAt ? a.lastPollAt + (a.intervalMin || 5) * 60_000 : null);

  const reverify = async () => {
    setBusy(true);
    try {
      await post(`/api/admin/accounts/${encodeURIComponent(a.id)}/poll`);
      toast({ title: 'Re-verify started', body: `${storeTitle(a.store)} · ${a.name}`, tone: 'ok' });
      setTimeout(onChanged, 2500);
      setTimeout(onChanged, 7000);
    } catch (e) {
      toast({ title: 'Re-verify failed', body: e.message, tone: 'error' });
    } finally {
      setTimeout(() => setBusy(false), 1500);
    }
  };
  const [claiming, setClaiming] = useState(false);
  const claim = async () => {
    setClaiming(true);
    try {
      const r = await post(`/api/admin/accounts/${encodeURIComponent(a.id)}/claim`);
      toast({ title: `${r.apps?.length || 0} new app${r.apps?.length === 1 ? '' : 's'} added`, body: (r.apps || []).map((x) => x.name).join(', ') || a.name, tone: 'ok' });
      onChanged();
    } catch (e) {
      toast({ title: 'No new apps found', body: e.message, tone: 'error' });
    } finally {
      setClaiming(false);
    }
  };
  const remove = async () => {
    setMenu(false);
    if (!confirm(`Remove ${a.name} (${storeTitle(a.store)})? Its apps, statuses and history will be deleted. This can't be undone.`)) return;
    try {
      await del(`/api/admin/accounts/${encodeURIComponent(a.id)}`);
      toast({ title: 'Account removed', body: a.name });
      onChanged();
    } catch (e) {
      toast({ title: 'Could not remove account', body: e.message, tone: 'error' });
    }
  };
  const saveName = async () => {
    const name = String(rename || '').trim();
    if (!name || name === a.name) return setRename(null);
    try {
      await patch(`/api/admin/accounts/${encodeURIComponent(a.id)}`, { name });
      toast({ title: 'Account renamed', body: name, tone: 'ok' });
      setRename(null);
      onChanged();
    } catch (e) {
      toast({ title: 'Rename failed', body: e.message, tone: 'error' });
    }
  };

  const ink = apple ? 'text-white' : 'text-[#0F110C]';
  return (
    <Card className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="relative overflow-hidden flex flex-col gap-7 p-[22px]" style={{ background: apple ? 'linear-gradient(-110deg, #2A2D24 15%, #0B0C09 85%)' : 'linear-gradient(-110deg, #D4FA5A 15%, #B2E61E 85%)' }}>
        <div className={cx('absolute size-[240px] left-[260px] -top-[90px] pointer-events-none', apple ? 'bg-white/[0.07]' : 'bg-[#0F110C]/[0.08]')} style={{ clipPath: DECO }} />
        <div className="relative flex items-center gap-2">
          {apple ? <AppleLogo size={20} className={ink} /> : <GooglePlayLogo size={20} className={ink} />}
          <div className={cx('flex-1 text-[13.5px] font-bold opacity-80', ink)}>{storeTitle(a.store)}</div>
          {failing ? (
            <span className="inline-flex items-center gap-[5px] px-[9px] py-1 rounded-full bg-white/85 text-red text-[11.5px] font-extrabold"><CircleAlert size={12} />Error</span>
          ) : (
            <span className={cx('inline-flex items-center gap-[5px] px-[9px] py-1 rounded-full text-[11.5px] font-extrabold', apple ? 'bg-accent/15 text-accent' : 'bg-[#0F110C]/10 text-[#0F110C]')}><BadgeCheck size={12} />Verified</span>
          )}
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-label="Account options" className={cx('size-7 rounded-full inline-flex items-center justify-center', apple ? 'text-white/70 hover:bg-white/10' : 'text-[#0F110C]/70 hover:bg-[#0F110C]/10')}><MoreHorizontal size={16} /></button>
            {menu && (
              <div className="absolute right-0 top-8 z-20 w-[170px] bg-surface rounded-[14px] shadow-[0_12px_40px_rgba(15,17,12,.2)] p-1.5" onMouseLeave={() => setMenu(false)}>
                <button onClick={() => { setMenu(false); setRename(a.name); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] hover:bg-surface-2 text-[13px] font-semibold text-ink"><Pencil size={14} />Rename</button>
                <button onClick={remove} className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] hover:bg-surface-2 text-[13px] font-semibold text-red"><Trash2 size={14} />Remove account</button>
              </div>
            )}
          </div>
        </div>
        <div className="relative flex flex-col gap-1 min-w-0">
          {rename != null ? (
            <div className="flex gap-2">
              <input autoFocus value={rename} onChange={(e) => setRename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRename(null); }} className="flex-1 min-w-0 h-9 px-3 rounded-[10px] bg-white text-[#0F110C] text-[15px] font-bold outline-none" />
              <Button size="sm" variant={apple ? 'accent' : 'primary'} onClick={saveName}>Save</Button>
            </div>
          ) : (
            <div className={cx('text-[22px] font-extrabold tracking-[-0.5px] truncate', ink)}>{a.name}</div>
          )}
          <div className={cx('font-mono text-[12px] font-semibold tracking-[1px] opacity-60 truncate', ink)}>{keyLine(a)}</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-[14px] p-[22px]">
        {failing && (
          <div className="flex gap-[10px] p-3 rounded-[12px] bg-red-soft">
            <CircleAlert size={16} className="text-red shrink-0 mt-[1px]" />
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <div className="text-[13px] font-extrabold text-red">{streak > 1 ? `Last ${streak} checks failed` : 'Last check failed'}</div>
              <div className="text-[12.5px] leading-[18px] font-medium text-ink break-words">{String(a.error).replace(/^poll:\s*/, '')}</div>
            </div>
          </div>
        )}
        {a.warning && !failing && <div className="p-3 rounded-[12px] bg-amber-soft text-[12.5px] leading-[18px] font-medium text-ink">{a.warning}</div>}
        {failing ? (
          <>
            <Row k="Last successful" v={lastOk ? ago(lastOk) : 'never'} red />
            <Row k="Next retry" v={next ? inFuture(next) : 'soon'} />
          </>
        ) : (
          <>
            <Row k="Last check" v={a.lastPollAt ? ago(a.lastPollAt) : 'never'} />
            <Row k="Next check" v={next ? inFuture(next) : 'soon'} />
            <Row k="Added" v={a.createdAt ? dateYear(Date.parse(a.createdAt) || a.createdAt) : '—'} />
          </>
        )}
        <div className="flex items-center">
          <div className="flex-1 text-[13px] font-semibold text-ink-3">Apps</div>
          {apps.length ? (
            <div className="flex">
              {apps.slice(0, 6).map((x, i) => (
                <span key={x.key} title={x.name} className={cx('rounded-[8px] ring-2 ring-surface', i && '-ml-2')}>
                  <AppIcon name={x.name} iconUrl={x.iconUrl} size={26} radius={8} />
                </span>
              ))}
              {apps.length > 6 && <span className="-ml-2 size-[26px] rounded-[8px] ring-2 ring-surface bg-surface-2 text-[10.5px] font-extrabold text-ink-2 inline-flex items-center justify-center">+{apps.length - 6}</span>}
            </div>
          ) : <span className="text-[13px] font-bold text-ink">{a.appCount || 0}</span>}
        </div>
        <div className="text-[10.5px] font-extrabold tracking-[1px] text-ink-3">LAST 24 CHECKS</div>
        <CheckStrip checks={a.checks?.length ? a.checks : a.lastPollAt ? [{ at: a.lastPollAt, ok: !a.error, error: a.error }] : []} />
        <div className="flex-1" />
        <div className="flex flex-wrap gap-[10px] pt-1.5">
          <Button variant={failing ? 'primary' : 'secondary'} icon={RefreshCw} className="flex-1 min-w-[140px]" loading={busy} onClick={reverify}>{failing ? 'Re-verify now' : 'Re-verify'}</Button>
          {a.shared
            ? <Button variant="outline" icon={PackagePlus} className="flex-1 min-w-[150px]" loading={claiming} onClick={claim}>Check for new apps</Button>
            : <Button variant="outline" icon={apple ? KeyRound : Upload} className="flex-1 min-w-[150px]" onClick={() => setRotate(true)}>{apple ? 'Rotate key' : 'Upload new JSON'}</Button>}
        </div>
      </div>
      <RotateDialog open={rotate} account={a} onClose={() => setRotate(false)} onDone={onChanged} />
    </Card>
  );
}

function Row({ k, v, red }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 text-[13px] font-semibold text-ink-3">{k}</div>
      <div className={cx('text-[13px] font-bold whitespace-nowrap', red ? 'text-red' : 'text-ink')}>{v}</div>
    </div>
  );
}

function RotateDialog({ open, account: a, onClose, onDone }) {
  const { toast } = useUi();
  const apple = a.store === 'apple';
  const [keyId, setKeyId] = useState('');
  const [issuerId, setIssuerId] = useState('');
  const [secret, setSecret] = useState('');
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const reset = () => { setKeyId(''); setIssuerId(''); setSecret(''); setFile(null); setErr(null); };
  const pick = async (f) => {
    if (!f) return;
    const text = await f.text();
    setSecret(text);
    setFile({ name: f.name, size: f.size });
    if (apple) {
      const m = f.name.match(/AuthKey_([A-Z0-9]{8,12})\.p8$/i);
      if (m && !keyId) setKeyId(m[1].toUpperCase());
    }
  };
  const valid = apple ? /BEGIN PRIVATE KEY/.test(secret) : /"client_email"/.test(secret) && /"private_key"/.test(secret);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = apple ? { privateKey: secret.trim(), ...(keyId.trim() && { keyId: keyId.trim() }), ...(issuerId.trim() && { issuerId: issuerId.trim() }) } : { serviceAccountJson: secret.trim() };
      await put(`/api/admin/accounts/${encodeURIComponent(a.id)}/secret`, body);
      toast({ title: apple ? 'Key rotated' : 'Service account updated', body: `${a.name} · verified`, tone: 'ok' });
      reset();
      onClose();
      onDone();
    } catch (e) {
      const steps = e.body?.steps?.filter((s) => !s.ok).map((s) => `${s.label}${s.detail ? ` — ${s.detail}` : ''}`).join('\n');
      setErr(e.status === 404 && !e.body?.steps ? 'This server doesn’t support replacing keys yet.' : steps || e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={apple ? 'Rotate App Store Connect key' : 'Upload a new service-account JSON'}
      sub={`${a.name} · the new key is verified before the old one is replaced. Stored encrypted, read-only.`}
      footer={<><Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button><Button icon={BadgeCheck} loading={busy} disabled={!valid} onClick={submit}>Verify &amp; replace</Button></>}
    >
      <div className="flex flex-col gap-4">
        {apple && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Key ID"><input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder={a.keyHint ? `current ••••${a.keyHint}` : '7KQ2X9LM4P'} className="w-full h-[46px] px-[14px] rounded-[12px] bg-surface-2 font-mono text-[13.5px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink" /></Field>
            <Field label="Issuer ID (optional)"><input value={issuerId} onChange={(e) => setIssuerId(e.target.value)} placeholder="keep current" className="w-full h-[46px] px-[14px] rounded-[12px] bg-surface-2 font-mono text-[13.5px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink" /></Field>
          </div>
        )}
        <Field label={apple ? 'Private key (.p8)' : 'Service-account JSON key'}>
          <button type="button" onClick={() => input.current?.click()} className={cx('w-full flex items-center gap-3 p-[14px] rounded-[14px] text-left transition', file && valid ? 'bg-green-soft ring-[1.5px] ring-inset ring-green' : 'border-[1.5px] border-dashed border-line hover:bg-surface-2')}>
            <span className="size-9 rounded-[10px] bg-surface inline-flex items-center justify-center text-ink shrink-0"><FileKey size={18} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-bold text-ink truncate">{file ? file.name : apple ? 'Choose AuthKey_XXXXXXXXXX.p8' : 'Choose the .json key file'}</span>
              <span className={cx('block text-[12px] font-semibold', file && valid ? 'text-green' : 'text-ink-3')}>{file ? `${file.size} B · ${valid ? 'key looks valid' : 'doesn’t look like the right file'}` : 'or paste it below'}</span>
            </span>
            {file && <span className="text-[13px] font-bold text-ink-2">Replace</span>}
          </button>
          <input ref={input} type="file" accept={apple ? '.p8,text/plain' : '.json,application/json'} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </Field>
        <textarea value={secret} onChange={(e) => { setSecret(e.target.value); setFile(null); }} rows={4} spellCheck={false} placeholder={apple ? '-----BEGIN PRIVATE KEY-----\n…' : '{ "type": "service_account", … }'} className="w-full px-[14px] py-3 rounded-[12px] bg-surface-2 font-mono text-[12px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink resize-none" />
        {err && <div className="p-3 rounded-[12px] bg-red-soft text-[12.5px] leading-[18px] font-semibold text-red whitespace-pre-line">{err}</div>}
      </div>
    </Dialog>
  );
}

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-2">
    <span className="text-[13px] font-bold text-ink">{label}</span>
    {children}
  </label>
);

function checkText(c) {
  if (!c.ok) return c.error ? String(c.error).replace(/^poll:\s*/, '') : 'Check failed';
  const parts = [plural(c.apps ?? 0, 'app')];
  parts.push(c.changes ? (c.changeText ? `${plural(c.changes, 'change')} (${c.changeText})` : plural(c.changes, 'change')) : 'no changes');
  return parts.join(' · ');
}

export default function Accounts() {
  const { M, accounts, reload, loading } = useData();
  const apps = M?.apps || [];
  const checks = (M?.recentChecks || []).filter((c) => accounts.some((a) => a.id === c.accountId)).slice(0, 6);
  const every = Math.min(...accounts.map((a) => a.intervalMin || 5).filter(Boolean), 5) || 5;
  return (
    <>
      <PageHead
        title="Accounts"
        sub={`Developer accounts the bot reads from · checked every ${every} minute${every === 1 ? '' : 's'}`}
        actions={<Button as={Link} to="/onboarding" icon={Plus}>Connect account</Button>}
      />
      {loading ? (
        <div className="flex flex-col lg:flex-row gap-5"><Skeleton className="h-[480px] flex-1 rounded-[20px]" /><Skeleton className="h-[480px] flex-1 rounded-[20px]" /></div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5 lg:items-stretch">
          {accounts.map((a) => <AccountCard key={a.id} a={a} apps={apps.filter((x) => x.accountId === a.id)} onChanged={reload} />)}
          <Link to="/onboarding" className="lg:w-[300px] shrink-0 min-h-[220px] flex flex-col gap-3 p-6 items-center justify-center text-center rounded-[20px] ring-[1.5px] ring-inset ring-ink-3 hover:bg-surface/60 transition">
            <span className="size-[52px] rounded-full bg-surface inline-flex items-center justify-center text-ink"><Plus size={22} /></span>
            <span className="text-[15px] font-extrabold text-ink">Connect another account</span>
            <span className="w-[220px] text-[13px] leading-[19px] font-medium text-ink-3">Apple .p8 API key, or invite the Play bot email in a client’s Play Console</span>
          </Link>
        </div>
      )}

      <Card className="mt-5 px-6 py-5">
        <div className="flex items-center pb-2.5">
          <h2 className="flex-1 text-[15px] font-extrabold text-ink">Recent checks</h2>
          <Link to="/dashboard/audit" className="text-[13px] font-bold text-ink-2 hover:text-ink">View audit log →</Link>
        </div>
        {checks.length ? (
          <div className="flex flex-col">
            {checks.map((c, i) => (
              <div key={`${c.accountId}-${c.at}-${i}`} className="flex flex-wrap sm:flex-nowrap items-center gap-x-[14px] gap-y-1 py-[11px] border-t border-line">
                <span className="font-mono text-[12.5px] text-ink-2 w-[44px] shrink-0">{time(c.at)}</span>
                {c.store === 'apple' ? <AppleLogo size={16} className="text-ink shrink-0" /> : <GooglePlayLogo size={16} className="text-ink shrink-0" />}
                <span className="text-[13.5px] font-bold text-ink flex-1 sm:flex-none sm:w-[170px] min-w-0 truncate">{storeTitle(c.store)}</span>
                <span className={cx('text-[13.5px] flex-1 min-w-0 basis-full sm:basis-auto order-last sm:order-none truncate', c.ok ? 'text-ink-2' : 'text-red font-medium')} title={checkText(c)}>{checkText(c)}</span>
                <span className="text-[12.5px] text-ink-3 w-10 text-right shrink-0">{c.ms != null ? `${(c.ms / 1000).toFixed(1)}s` : ''}</span>
                <span className="w-[70px] shrink-0 flex justify-end">{c.ok ? <Pill tone="approved">OK</Pill> : <Pill tone="red">Failed</Pill>}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-[13.5px] text-ink-3 border-t border-line">No checks recorded yet — the first one runs within a few minutes.</div>
        )}
      </Card>
    </>
  );
}
