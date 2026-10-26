// Setup — polling, Gmail reader, Google Chat, developer accounts (pen.dev frame J11un5).
// Prefs are edited locally and saved with "Save changes"; connection flows act immediately.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, Check, Copy, Inbox, Lock, MessageSquare, Plus, RotateCcw, Send, Timer, Wallet, Search, KeyRound, LogOut, RefreshCw } from 'lucide-react';
import { Button, Card, Pill, Skeleton, Toggle, cx } from '../components/ui.jsx';
import { useData, useUi } from '../lib/store.jsx';
import { api, del, post, put } from '../lib/api.js';
import { ago, time, dayKey } from '../lib/format.js';
import { oauthResult } from './admin/common.jsx';

const PREFS = ['applePollMinutes', 'playPollMinutes', 'gmailPollMinutes', 'stuckHours', 'quietHours', 'mentionAll', 'digestEnabled', 'silentFirstRun'];
const DEFAULTS = { applePollMinutes: 5, playPollMinutes: 5, gmailPollMinutes: 5, stuckHours: 48, quietHours: { enabled: false, start: '22:00', end: '08:00' }, mentionAll: false, digestEnabled: false, silentFirstRun: true };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const storeTitle = (s) => (s === 'apple' ? 'App Store Connect' : 'Google Play Console');
const tzShort = (tz) => (tz === 'Asia/Kolkata' ? 'IST' : tz || '');

function SettingsCard({ icon: Icon, title, sub, right, children }) {
  return (
    <Card className="p-6 flex flex-col gap-[18px]">
      <div className="flex items-center gap-3">
        <span className="size-9 rounded-[11px] bg-surface-2 inline-flex items-center justify-center text-ink shrink-0"><Icon size={18} /></span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-extrabold text-ink">{title}</h2>
          <p className="text-[12.5px] font-medium text-ink-3">{sub}</p>
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}
function Row({ title, sub, children, className }) {
  return (
    <div className={cx('flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 pt-[14px] border-t border-line', className)}>
      <div className="flex-1 min-w-[180px] flex flex-col gap-[3px]">
        <div className="text-[13.5px] font-bold text-ink">{title}</div>
        {sub && <div className="text-[12px] leading-[17px] font-medium text-ink-3">{sub}</div>}
      </div>
      {children}
    </div>
  );
}
function MinSeg({ value, onChange, options }) {
  const opts = [...new Set([...options, Number(value)].filter(Boolean))].sort((a, b) => a - b);
  return (
    <div className="inline-flex gap-[2px] p-[3px] bg-surface-2 rounded-[10px]" role="radiogroup">
      {opts.map((m) => (
        <button key={m} role="radio" aria-checked={Number(value) === m} onClick={() => onChange(m)}
          className={cx('px-[10px] py-[6px] rounded-[8px] text-[12.5px] font-bold transition', Number(value) === m ? 'bg-primary text-on-primary' : 'text-ink-2 hover:text-ink')}>{m}m</button>
      ))}
    </div>
  );
}
const Note = ({ ok, children }) => <div className={cx('px-3 py-2.5 rounded-[12px] text-[12.5px] leading-[18px] font-semibold', ok ? 'bg-green-soft text-green' : 'bg-red-soft text-red')}>{children}</div>;

export default function Setup() {
  const { M, reload } = useData();
  const { toast } = useUi();
  const nav = useNavigate();
  const [setup, setSetup] = useState(null);
  const [gmail, setGmail] = useState(null);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([api('/api/admin/setup'), api('/api/admin/gmail').catch(() => null)]);
      setSetup(s);
      setGmail(g);
      const p = { ...DEFAULTS, ...(s.prefs || {}) };
      setDraft(Object.fromEntries(PREFS.map((k) => [k, p[k]])));
      setQuery(g?.query || '');
      setErr(null);
      return { s, g };
    } catch (e) {
      setErr(e.message);
      return null;
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Result of a Google sign-in redirect (?gmail=ok, ?chat=error:…)
  useEffect(() => {
    const r = oauthResult();
    if (!r) return;
    const okMsg = r.kind === 'gmail' ? 'Gmail connected' : r.value === 'ok-sent' ? 'Signed in — a test message was posted to Chat' : 'Signed in to Google Chat';
    if (r.value.startsWith('error:')) toast({ title: r.kind === 'gmail' ? 'Gmail sign-in failed' : 'Google Chat sign-in failed', body: r.value.slice(6), tone: 'error', duration: 9000 });
    else toast({ title: okMsg, tone: 'ok' });
    nav('/dashboard/setup', { replace: true });
  }, [nav, toast]);

  const saved = useMemo(() => (setup ? Object.fromEntries(PREFS.map((k) => [k, { ...DEFAULTS, ...(setup.prefs || {}) }[k]])) : null), [setup]);
  const prefsDirty = draft && saved && PREFS.some((k) => !same(draft[k], saved[k]));
  const queryDirty = gmail && query.trim() !== (gmail.query || '');
  const dirty = prefsDirty || queryDirty;
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      if (prefsDirty) {
        const body = Object.fromEntries(PREFS.filter((k) => !same(draft[k], saved[k])).map((k) => [k, draft[k]]));
        if (body.stuckHours != null) body.stuckHours = Math.max(1, Math.min(720, Number(body.stuckHours) || 24));
        await put('/api/admin/settings/prefs', body);
      }
      if (queryDirty) await put('/api/admin/gmail/query', { query: query.trim() });
      toast({ title: 'Changes saved', tone: 'ok' });
      await load();
      reload();
    } catch (e) {
      toast({ title: 'Could not save', body: e.message, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const discard = () => { setDraft(saved); setQuery(gmail?.query || ''); };

  if (err) return <><Head /><Card className="p-8"><Note>{err}</Note><div className="mt-4"><Button icon={RefreshCw} onClick={load}>Retry</Button></div></Card></>;
  if (!setup || !draft) return <><Head /><div className="grid lg:grid-cols-2 gap-5"><Skeleton className="h-[360px] rounded-[20px]" /><Skeleton className="h-[360px] rounded-[20px]" /><Skeleton className="h-[420px] rounded-[20px]" /><Skeleton className="h-[260px] rounded-[20px]" /></div></>;

  const tz = tzShort(M?.tz);
  const qh = draft.quietHours || DEFAULTS.quietHours;
  return (
    <>
      <Head actions={<>
        <Button variant="outline" icon={RotateCcw} onClick={discard} disabled={!dirty || saving}>Discard</Button>
        <Button icon={Check} onClick={save} loading={saving} disabled={!dirty}>Save changes</Button>
      </>} />
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="w-full lg:flex-1 min-w-0 flex flex-col gap-5">
          <SettingsCard icon={Timer} title="Polling" sub="How often each store is checked for status changes">
            <Row title="App Store Connect" sub="Apple API rate limit allows ~3,600 calls/hour"><MinSeg value={draft.applePollMinutes} options={[1, 5, 15, 30]} onChange={(v) => set('applePollMinutes', v)} /></Row>
            <Row title="Google Play Console" sub="Publishing API · edits.tracks"><MinSeg value={draft.playPollMinutes} options={[1, 5, 15, 30]} onChange={(v) => set('playPollMinutes', v)} /></Row>
            <Row title="Review time limit (“stuck”)" sub="Flag a build that stays In review longer than this">
              <label className="h-[38px] inline-flex items-center gap-2 px-3 rounded-[10px] bg-surface-2 focus-within:ring-[1.5px] focus-within:ring-ink">
                <input type="number" min={1} max={720} value={draft.stuckHours} onChange={(e) => set('stuckHours', e.target.value === '' ? '' : Number(e.target.value))} className="w-10 bg-transparent outline-none text-[14px] font-extrabold text-ink text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" aria-label="Hours" />
                <span className="text-[12.5px] font-semibold text-ink-3">hours</span>
              </label>
            </Row>
            <Row title="Quiet hours" sub={`Hold non-critical posts ${qh.start} – ${qh.end} ${tz}`.trim()}>
              <Toggle label="Quiet hours" checked={!!qh.enabled} onChange={(v) => set('quietHours', { ...qh, enabled: v })} />
            </Row>
            <Row title="Quiet first sync" sub="Record current statuses silently when an account is added">
              <Toggle label="Quiet first sync" checked={draft.silentFirstRun !== false} onChange={(v) => set('silentFirstRun', v)} />
            </Row>
          </SettingsCard>
          <GmailCard gmail={gmail} setup={setup} query={query} setQuery={setQuery} minutes={draft.gmailPollMinutes} setMinutes={(v) => set('gmailPollMinutes', v)} onChanged={load} />
        </div>
        <div className="w-full lg:w-[554px] lg:shrink-0 flex flex-col gap-5">
          <ChatCard setup={setup} draft={draft} set={set} onChanged={load} />
          <SettingsCard icon={Wallet} title="Developer accounts" sub="Credentials used for read-only store checks">
            {(setup.accounts || []).map((a) => (
              <Row key={a.id} title={storeTitle(a.store)} sub={`${a.name} · ${a.store === 'apple' ? `key ••••${String(a.keyId || '').slice(-4)}` : String(a.clientEmail || 'service account').replace(/\.iam\.gserviceaccount\.com$/, '')}`}>
                <div className="flex items-center gap-3">
                  {a.error ? <Pill tone="red">Error</Pill> : a.polling ? <Pill tone="amber">Syncing</Pill> : <Pill tone="approved">Verified</Pill>}
                  <Link to="/dashboard/accounts" className="text-[13px] font-bold text-accent-text hover:underline">Manage</Link>
                </div>
              </Row>
            ))}
            {!setup.accounts?.length && <div className="pt-[14px] border-t border-line text-[13px] text-ink-3">No accounts yet.</div>}
            <div><Button as={Link} to="/onboarding#add" variant="secondary" icon={Plus}>Connect account</Button></div>
          </SettingsCard>
        </div>
      </div>
    </>
  );
}

function Head({ actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-[32px] sm:text-[34px] leading-[1.1] font-extrabold tracking-[-0.8px] text-ink">Setup</h1>
        <p className="mt-2 text-[14px] text-ink-2">Admin · how often the bot checks, where it posts and which mailbox it reads</p>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

function senderName(from) {
  const n = String(from || '').replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  if (/google/i.test(from) && /play/i.test(from)) return 'Google Play Console';
  if (/apple\.com/i.test(from)) return 'App Store Connect';
  return n || from || '—';
}
const STATUS_TONE = { REJECTED: 'red', REMOVED: 'red', POLICY_ACTION: 'red', LIVE: 'live', APPROVED: 'approved', READY_TO_PUBLISH: 'approved', IN_REVIEW: 'amber' };

function GmailCard({ gmail: g, setup, query, setQuery, minutes, setMinutes, onChanged }) {
  const { toast } = useUi();
  const [preview, setPreview] = useState(null);
  const [editClient, setEditClient] = useState(false);
  const [cid, setCid] = useState('');
  const [csec, setCsec] = useState('');
  const [busy, setBusy] = useState(false);
  const failing = setup.gmail?.error || g?.error;

  const runPreview = useCallback(async () => {
    setPreview({ loading: true });
    try { setPreview(await post('/api/admin/gmail/test')); } catch (e) { setPreview({ error: e.message }); }
  }, []);
  useEffect(() => { if (g?.connected) runPreview(); }, [g?.connected, runPreview]);

  if (!g) return <SettingsCard icon={Inbox} title="Gmail reader" sub="Reads rejection emails so the AI summary and “View email” work"><Note>Couldn’t load the Gmail settings.</Note></SettingsCard>;

  const saveClient = async () => {
    setBusy(true);
    try {
      await put('/api/admin/gmail/client', { clientId: cid.trim(), clientSecret: csec.trim() });
      toast({ title: 'OAuth client saved', body: 'Now sign in with the shared mailbox', tone: 'ok' });
      setEditClient(false); setCid(''); setCsec('');
      onChanged();
    } catch (e) {
      toast({ title: 'Could not save client', body: e.message, tone: 'error' });
    } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!confirm('Disconnect Gmail? Play approvals and rejections will stop being detected.')) return;
    try { await del('/api/admin/gmail'); setPreview(null); toast({ title: 'Gmail disconnected' }); onChanged(); }
    catch (e) { toast({ title: 'Could not disconnect', body: e.message, tone: 'error' }); }
  };
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast({ title: 'Copied', body: t }));
  const showClient = !g.hasClient || editClient;
  const emails = preview?.emails || [];
  const now = Date.now();

  return (
    <SettingsCard icon={Inbox} title="Gmail reader" sub="Reads rejection emails so the AI summary and “View email” work">
      {showClient && (
        <div className="flex flex-col gap-3 pt-[14px] border-t border-line">
          <div className="text-[13.5px] font-bold text-ink">Google OAuth client</div>
          <p className="text-[12px] leading-[17px] font-medium text-ink-3">Google Cloud → Google Auth Platform → Clients → <b>Web application</b>. Add this redirect URI, then paste the client ID and secret.</p>
          <div className="flex items-center gap-2 min-w-0">
            <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-[10px] bg-surface-2 font-mono text-[12px] text-ink">{g.redirectUri}</code>
            <Button size="sm" variant="secondary" icon={Copy} onClick={() => copy(g.redirectUri)}>Copy</Button>
          </div>
          <input value={cid} onChange={(e) => setCid(e.target.value)} autoComplete="off" placeholder="Client ID — 1234-abc.apps.googleusercontent.com" className="h-[42px] px-3 rounded-[10px] bg-surface-2 font-mono text-[12.5px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink" />
          <input value={csec} onChange={(e) => setCsec(e.target.value)} type="password" autoComplete="off" placeholder="Client secret — GOCSPX-…" className="h-[42px] px-3 rounded-[10px] bg-surface-2 font-mono text-[12.5px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink" />
          <div className="flex gap-2"><Button size="sm" icon={Check} loading={busy} onClick={saveClient}>Save client</Button>{g.hasClient && <Button size="sm" variant="outline" onClick={() => setEditClient(false)}>Cancel</Button>}</div>
        </div>
      )}
      <Row title="Connected mailbox" sub={g.connected ? null : g.hasClient ? 'Sign in with the shared mailbox that receives Play Console emails (read-only)' : 'Save the OAuth client first'}>
        {g.connected ? (
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            {failing ? <Pill tone="red">Failing</Pill> : <Pill tone="approved">Connected</Pill>}
            <span className="text-[13px] font-bold text-ink truncate max-w-[280px]" title={g.email}>{g.email}</span>
          </div>
        ) : (
          <Button size="sm" disabled={!g.hasClient} onClick={() => { location.href = '/api/admin/gmail/connect'; }}>Sign in with Google</Button>
        )}
      </Row>
      {failing && <Note>{failing}</Note>}
      {g.connected && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 -mt-2">
          <span className="text-[12px] font-medium text-ink-3">Last read {ago(g.lastPollAt)}</span>
          <button onClick={() => { location.href = '/api/admin/gmail/connect'; }} className="text-[12.5px] font-bold text-ink-2 hover:text-ink">Switch account</button>
          {!showClient && <button onClick={() => setEditClient(true)} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-ink-2 hover:text-ink"><KeyRound size={13} />OAuth client</button>}
          <button onClick={disconnect} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-red"><LogOut size={13} />Disconnect</button>
        </div>
      )}
      <Row title="Check Play Console emails" sub="Approvals, rejections with the reason, policy notices"><MinSeg value={minutes} options={[1, 5, 15]} onChange={setMinutes} /></Row>
      <div className="flex flex-col gap-2">
        <div className="text-[13.5px] font-bold text-ink">Search filter</div>
        <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={2} spellCheck={false} className="w-full p-[14px] rounded-[12px] bg-surface-2 font-mono text-[12.5px] leading-[19px] font-medium text-ink outline-none focus:ring-[1.5px] focus:ring-ink resize-y" />
        <span className="text-[11.5px] font-medium text-ink-3">Gmail search syntax · saved with “Save changes”.</span>
      </div>
      {g.connected && (
        <div className="flex flex-col rounded-[14px] ring-1 ring-inset ring-line overflow-hidden">
          <div className="flex items-center px-[14px] py-[10px] bg-surface-2">
            <span className="flex-1 text-[12px] font-bold text-ink-2">{preview?.loading ? 'Preview · reading inbox…' : preview?.error ? 'Preview' : `Preview · ${emails.length} matching email${emails.length === 1 ? '' : 's'}`}</span>
            <button onClick={runPreview} className="inline-flex items-center gap-1 text-[12px] font-bold text-ink-2 hover:text-ink"><Search size={12} />Check inbox now</button>
          </div>
          {preview?.loading ? (
            <div className="p-[14px] flex flex-col gap-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : preview?.error ? (
            <div className="p-[14px]"><Note>{preview.error}</Note></div>
          ) : emails.length ? emails.map((m, i) => (
            <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 px-[14px] py-[10px] border-t border-line">
              <span className="w-[150px] shrink-0 text-[12.5px] font-extrabold text-ink truncate" title={m.from}>{senderName(m.from)}</span>
              <span className="flex-1 min-w-0 text-[12.5px] font-medium text-ink-2" title={m.appName ? `${m.appName}${m.status ? ` · ${m.status}` : ''}` : m.packageName ? `${m.packageName} (not tracked)` : 'no app found'}>{m.subject || '(no subject)'}</span>
              {m.status && <Pill small tone={STATUS_TONE[m.status] || 'grey'}>{m.status.replace(/_/g, ' ').toLowerCase()}</Pill>}
              <span className="text-[12px] font-semibold text-ink-3 whitespace-nowrap">{m.at ? (dayKey(m.at) === dayKey(now) ? time(m.at) : ago(m.at)) : ''}</span>
            </div>
          )) : (
            <div className="px-[14px] py-4 border-t border-line text-[12.5px] text-ink-3">No emails match the search yet — normal until the stores send the first one.</div>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

function ChatCard({ setup, draft, set, onChanged }) {
  const { toast } = useUi();
  const c = setup.chat || {};
  const [msg, setMsg] = useState(null);
  const [testing, setTesting] = useState(false);
  const [spaceId, setSpaceId] = useState('');
  const [spaces, setSpaces] = useState(null);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setTesting(true); setMsg(null);
    try {
      await post('/api/admin/settings/chat/test', {});
      setMsg({ ok: true, text: 'Test message sent — check the Chat space.' });
      toast({ title: 'Test message sent', body: c.spaceName || c.masked, tone: 'ok' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setTesting(false); }
  };
  const saveSpace = async (space, spaceName) => {
    setBusy(true); setMsg(null);
    try {
      await put('/api/admin/settings/chat', { mode: 'user', space, spaceName: spaceName || space });
      await post('/api/admin/settings/chat/test', {});
      setMsg({ ok: true, text: `Connected — a test message was posted to ${spaceName || space}.` });
      setSpaces(null);
      onChanged();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const fromInput = () => {
    const m = spaceId.trim().match(/(?:spaces\/|\/room\/|chat\/space\/|^)([A-Za-z0-9_-]{8,})(?:[/?#]|$)/);
    if (!m) return setMsg({ ok: false, text: 'Paste the space ID (AAAA…) or the space link' });
    saveSpace(`spaces/${m[1]}`);
  };
  const findSpaces = async () => {
    setBusy(true); setMsg(null);
    try {
      const j = await api('/api/admin/settings/chat/spaces?mode=user');
      setSpaces(j.spaces || []);
      setSel((j.spaces || []).find((x) => /review/i.test(x.displayName))?.name || null);
    } catch (e) { setMsg({ ok: false, text: e.body?.hint ? `${e.message} — ${e.body.hint}` : e.message }); } finally { setBusy(false); }
  };
  const signIn = () => { location.href = '/api/admin/chat/user/connect'; };
  const sender = c.mode === 'app' ? `Google Chat app${c.appEmail ? ` · ${c.appEmail.replace(/\.iam\.gserviceaccount\.com$/, '')}` : ''}` : c.userEmail ? `Posts as ${c.userEmail}, labelled 🤖 app_review_bot` : 'Nobody yet — sign in so messages can be sent';
  const spaceLabel = c.spaceName || c.masked || 'Not set';

  return (
    <SettingsCard icon={MessageSquare} title="Google Chat" sub="Every status change is posted by one bot to one fixed space">
      <Row title="Connected sender" sub={sender}>
        <div className="flex items-center gap-2">
          <span className="size-[26px] rounded-full bg-accent inline-flex items-center justify-center text-accent-ink"><Bot size={14} /></span>
          <span className="text-[13px] font-bold text-ink">app_review_bot</span>
        </div>
      </Row>
      {c.mode !== 'app' && (
        <div className="-mt-2 flex gap-4">
          <button onClick={signIn} disabled={!c.hasOauthClient} className="text-[12.5px] font-bold text-ink-2 hover:text-ink disabled:opacity-50">{c.userEmail ? 'Switch account' : 'Sign in with Google'}</button>
          {!c.hasOauthClient && <span className="text-[12px] text-ink-3">Save the Google OAuth client in Gmail reader first</span>}
        </div>
      )}
      <Row title="Fixed space" sub={c.locked ? 'Fixed in the server config · not editable here' : c.configured ? 'Messages go to this space' : 'Not connected — nothing is posted to Chat yet'}>
        <span className="inline-flex items-center gap-2 h-[38px] px-3 rounded-[10px] bg-surface-2 max-w-full min-w-0">
          {c.locked ? <Lock size={14} className="text-ink-2 shrink-0" /> : <MessageSquare size={14} className="text-ink-2 shrink-0" />}
          <span className="text-[13px] font-bold text-ink truncate">{spaceLabel}</span>
        </span>
      </Row>
      {!c.locked && c.userEmail && (
        <div className="flex flex-col gap-2 -mt-1">
          <div className="flex gap-2">
            <input value={spaceId} onChange={(e) => setSpaceId(e.target.value)} placeholder="Space ID, spaces/AAAA… or the space link" className="flex-1 min-w-0 h-10 px-3 rounded-[10px] bg-surface-2 font-mono text-[12.5px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink" />
            <Button size="sm" className="h-10" icon={Send} loading={busy} onClick={fromInput}>Save &amp; test</Button>
          </div>
          <button onClick={findSpaces} className="self-start text-[12.5px] font-bold text-ink-2 hover:text-ink">Find my spaces</button>
          {spaces && (spaces.length ? (
            <div className="flex flex-col gap-1">
              {spaces.map((sp) => (
                <label key={sp.name} className={cx('flex items-center gap-2 px-3 py-2 rounded-[10px] cursor-pointer', sel === sp.name ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                  <input type="radio" name="space" checked={sel === sp.name} onChange={() => setSel(sp.name)} />
                  <span className="flex-1 text-[13px] font-bold text-ink">{sp.displayName}</span>
                  <span className="font-mono text-[11px] text-ink-3">{sp.name}</span>
                </label>
              ))}
              <div><Button size="sm" disabled={!sel} loading={busy} onClick={() => saveSpace(sel, spaces.find((x) => x.name === sel)?.displayName)}>Use selected space</Button></div>
            </div>
          ) : <Note>No spaces found for this account.</Note>)}
        </div>
      )}
      <Row title="Mention @all on rejections" sub="Rejections and policy actions ping the whole space">
        <Toggle label="Mention @all on rejections" checked={!!draft.mentionAll} onChange={(v) => set('mentionAll', v)} />
      </Row>
      <Row title={`Daily digest at ${setup.prefs?.digestTime || '09:30'}`} sub="One summary of what’s in review · off keeps Chat real-time only">
        <Toggle label="Daily digest" checked={!!draft.digestEnabled} onChange={(v) => set('digestEnabled', v)} />
      </Row>
      {msg && <Note ok={msg.ok}>{msg.text}</Note>}
      <div><Button variant="outline" icon={Send} loading={testing} onClick={test} disabled={!c.configured}>Send test message</Button></div>
    </SettingsCard>
  );
}
