// Setup wizard (pen.dev "Onboarding 1–4"): connect accounts → choose apps → Google Chat → done.
// Same server flow as the old src/dashboard/onboarding.html, on /api/admin.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, FileKey, Upload, Search, Check, Bot, Hash, ChevronsUpDown, Send, Trash2, Plus, Wallet, LayoutGrid, MessageSquare, Timer, ArrowRight, PartyPopper, Box, X } from 'lucide-react';
import { AppleLogo, GooglePlayLogo } from '@phosphor-icons/react';
import { Logo, AppIcon, Pill, Toggle, Spinner, cx } from '../components/ui.jsx';
import { adm, Stepper, StepHead, Footer, Field, TextInput, Checks } from './onboarding/parts.jsx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fmtBytes = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

function useToast() {
  const [msg, setMsg] = useState(null);
  const t = useRef(null);
  const show = useCallback((m) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 2800); }, []);
  const el = msg ? <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-[14px] bg-[#0F110C] text-white text-[13.5px] font-semibold shadow-lg max-w-[90vw]">{msg}</div> : null;
  return [show, el];
}

/* ── Step 1: developer account ───────────────────────────── */
const HELP = {
  apple: [
    <>Open App Store Connect → Users and Access → Integrations.</>,
    <>Generate a key with the “Developer” role. Download the .p8 — Apple only lets you do this once.</>,
    <>Copy the Issuer ID and Key ID shown above the keys table.</>,
  ],
  google: [
    <>In Google Cloud, enable the Play Android Developer API and Play Developer Reporting API.</>,
    <>IAM → Service accounts → Create → Keys → Add key → JSON.</>,
    <>In Play Console → Users and permissions, invite that email with “View app information”.</>,
  ],
};
const GUIDE = {
  apple: 'https://appstoreconnect.apple.com/access/integrations/api',
  google: 'https://play.google.com/console/u/0/developers/users-and-permissions',
};

function AccountStep({ setup, refresh, onNext, toast, initialStore }) {
  const [store, setStore] = useState(initialStore || 'apple');
  const [name, setName] = useState('WebMobTechnologies');
  const [issuer, setIssuer] = useState('');
  const [keyId, setKeyId] = useState('');
  const [dev, setDev] = useState('');
  const [file, setFile] = useState(null); // { text, name, size, meta, valid }
  const [checks, setChecks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const inp = useRef(null);
  const apple = store === 'apple';
  const accounts = setup.accounts || [];

  const pick = (s) => { if (s !== store) { setStore(s); setFile(null); setChecks(null); } };

  const read = (f) => {
    if (!f) return;
    if (f.size > 200_000) return toast('That file is too large to be a key');
    const rd = new FileReader();
    rd.onload = () => {
      const text = String(rd.result);
      if (apple) {
        const valid = /BEGIN PRIVATE KEY/.test(text);
        const m = f.name.match(/AuthKey_([A-Z0-9]{8,12})\.p8/i);
        if (m && !keyId) setKeyId(m[1].toUpperCase());
        setFile({ text, name: f.name, size: f.size, valid, meta: valid ? 'key looks valid' : 'doesn’t look like a .p8 key' });
      } else {
        try {
          const j = JSON.parse(text);
          const valid = Boolean(j.client_email && j.private_key);
          setFile({ text, name: f.name, size: f.size, valid, meta: valid ? j.client_email : 'missing client_email / private_key' });
        } catch {
          toast('That is not a JSON file');
        }
      }
    };
    rd.readAsText(f);
  };

  const verify = async () => {
    const body = { store, name: name.trim() };
    if (apple) {
      Object.assign(body, { issuerId: issuer.trim(), keyId: keyId.trim(), privateKey: file?.text });
      if (!body.issuerId || !body.keyId || !body.privateKey) return toast('Add the Issuer ID, Key ID and the .p8 file');
    } else {
      Object.assign(body, { serviceAccountJson: file?.text, developerId: dev.trim() });
      if (!body.serviceAccountJson) return toast('Add the service-account JSON file');
    }
    setBusy(true);
    const pending = apple ? ['Private key (.p8) is valid', 'Signed API token (ES256)', 'Connected to App Store Connect', 'Listing apps']
      : ['Service-account JSON is valid', 'Signed in to Google', 'Play Developer Reporting API reachable', 'Listing apps', 'Can read release tracks'];
    let i = 1;
    setChecks({ running: true, items: [{ label: pending[0], ok: null }] });
    const tick = setInterval(() => { if (i < pending.length) { i++; setChecks({ running: true, items: pending.slice(0, i).map((l, k) => ({ label: l, ok: k < i - 1 ? true : null })) }); } }, 700);
    const r = await adm('/accounts', { method: 'POST', body });
    clearInterval(tick);
    const items = [];
    for (const s of r.steps || [{ label: 'Connect', ok: false, detail: r.error || `HTTP ${r.status}` }]) {
      items.push(s);
      setChecks({ running: true, items: [...items] });
      await sleep(160);
    }
    setChecks({ running: false, ok: r.ok, items });
    setBusy(false);
    if (r.ok) {
      setFile(null);
      toast(`${r.account?.name || 'Account'} connected — ${r.apps?.length ?? 0} apps found`);
      await refresh();
      onNext();
    }
  };

  const remove = async (a) => {
    if (!confirm(`Remove ${a.name}? Its apps and history will be deleted.`)) return;
    await adm(`/accounts/${a.id}`, { method: 'DELETE' });
    await refresh();
  };

  return (
    <>
      <StepHead n={1} title="Connect a developer account" lede="Review Radar reads review status straight from the stores. Keys are encrypted and only used for read-only checks." />

      {accounts.length > 0 && (
        <div className="flex flex-col gap-2">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-[14px] bg-surface-2">
              <span className="size-9 rounded-[10px] bg-surface inline-flex items-center justify-center">{a.store === 'apple' ? <AppleLogo size={18} /> : <GooglePlayLogo size={18} />}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold truncate">{a.name}</div>
                <div className="text-[12px] text-ink-3 truncate">{a.store === 'apple' ? `App Store Connect · key ${a.keyId || ''}` : `Google Play · ${a.clientEmail || ''}`} · {a.appCount ? `${a.appCount} apps` : 'apps not fetched yet'}</div>
              </div>
              {a.error ? <Pill tone="red" small>Error</Pill> : a.polling ? <Pill tone="amber" small>Syncing</Pill> : <Pill tone="approved" small>Verified</Pill>}
              <button type="button" onClick={() => remove(a)} aria-label={`Remove ${a.name}`} className="size-8 rounded-[10px] inline-flex items-center justify-center text-ink-3 hover:text-red hover:bg-surface"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3" role="radiogroup" aria-label="Store">
        {[
          { id: 'apple', title: 'App Store Connect', desc: 'API key (.p8) + Issuer ID', I: AppleLogo },
          { id: 'google', title: 'Google Play Console', desc: 'Service-account JSON key', I: GooglePlayLogo },
        ].map((o) => {
          const on = store === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => pick(o.id)}
              className={cx('flex-1 flex items-center gap-3 p-4 rounded-[16px] text-left transition', on ? 'bg-surface ring-2 ring-inset ring-ink' : 'bg-surface-2 hover:bg-surface-3')}>
              <span className={cx('size-10 rounded-[12px] inline-flex items-center justify-center', on ? 'bg-[#0F110C] text-white' : 'bg-surface text-ink')}><o.I size={20} weight="fill" /></span>
              <span className="flex-1 min-w-0 flex flex-col gap-[3px]">
                <span className="text-[14px] font-extrabold">{o.title}</span>
                <span className="text-[12.5px] font-medium text-ink-3">{o.desc}</span>
              </span>
              <span className={cx('size-5 rounded-full inline-flex items-center justify-center', on ? 'bg-[#0F110C] dark:bg-accent' : 'ring-[1.5px] ring-inset ring-line')}>{on && <span className="size-2 rounded-full bg-accent dark:bg-[#0F110C]" />}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <Field label="Account name">
            <TextInput mono value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. WebMobTechnologies" />
          </Field>
          {apple ? (
            <>
              <Field label="Issuer ID" hint="Users and Access → Integrations → App Store Connect API">
                <TextInput mono value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="69a6de7e-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" />
              </Field>
              <Field label="Key ID">
                <TextInput mono value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="ABC123XYZ9" autoComplete="off" />
              </Field>
            </>
          ) : null}
          <Field label={apple ? 'Private key (.p8)' : 'Service-account key (JSON)'}>
            <input ref={inp} type="file" accept={apple ? '.p8' : '.json,application/json'} hidden onChange={(e) => { read(e.target.files[0]); e.target.value = ''; }} />
            {file ? (
              <div className={cx('w-full flex items-center gap-3 p-[14px] rounded-[12px] ring-[1.5px] ring-inset', file.valid ? 'bg-green-soft ring-green' : 'bg-red-soft ring-red')}>
                <span className="size-9 rounded-[10px] bg-surface inline-flex items-center justify-center"><FileKey size={18} className={file.valid ? 'text-green' : 'text-red'} /></span>
                <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
                  <span className="text-[13.5px] font-bold truncate">{file.name}</span>
                  <span className={cx('text-[12px] font-semibold truncate', file.valid ? 'text-green' : 'text-red')}>{fmtBytes(file.size)} · {file.meta}</span>
                </span>
                <button type="button" onClick={() => inp.current?.click()} className="text-[12.5px] font-bold text-ink-2 hover:text-ink">Replace</button>
              </div>
            ) : (
              <button type="button" onClick={() => inp.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files[0]); }}
                className={cx('w-full flex items-center gap-3 p-[14px] rounded-[12px] border-[1.5px] border-dashed text-left transition', over ? 'border-ink bg-surface-2' : 'border-line hover:bg-surface-2')}>
                <span className="size-9 rounded-[10px] bg-surface-2 inline-flex items-center justify-center"><Upload size={17} /></span>
                <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
                  <span className="text-[13.5px] font-bold">{apple ? 'Drop AuthKey_XXXXXXXXXX.p8 or click to choose' : 'Drop the service-account .json or click to choose'}</span>
                  <span className="text-[12px] font-medium text-ink-3">{apple ? 'Downloaded once when you created the key' : 'Google Cloud → IAM → Service accounts → Keys'}</span>
                </span>
              </button>
            )}
          </Field>
          {!apple && (
            <Field label="Play developer ID (optional)" hint="From the Play Console URL (…/developers/this-number/…). Used for direct links.">
              <TextInput mono value={dev} onChange={(e) => setDev(e.target.value)} placeholder="1234567890123456789" autoComplete="off" />
            </Field>
          )}
        </div>

        <aside className="w-full lg:w-[320px] h-fit flex flex-col gap-[14px] p-5 rounded-[16px] bg-accent-soft">
          <div className="flex items-center gap-2 text-[14px] font-extrabold"><Lightbulb size={17} />Where do I find these?</div>
          {HELP[store].map((t, i) => (
            <div key={i} className="flex items-start gap-[10px]">
              <span className="size-[22px] shrink-0 rounded-full bg-accent text-accent-ink inline-flex items-center justify-center text-[11px] font-extrabold">{i + 1}</span>
              <span className="text-[13.5px] leading-5 font-medium">{t}</span>
            </div>
          ))}
          <a href={GUIDE[store]} target="_blank" rel="noopener" className="text-[13px] font-bold text-accent-text hover:underline">Read the full guide →</a>
        </aside>
      </div>

      <Checks checks={checks} />

      <Footer onBack={accounts.length ? onNext : undefined} backLabel="Skip — use connected accounts" primary={busy ? 'Verifying…' : 'Verify & continue'} onPrimary={verify} busy={busy} />
    </>
  );
}

/* ── Step 2: choose apps ─────────────────────────────────── */
function AppsStep({ setup, refresh, onBack, onNext, toast }) {
  const [apps, setApps] = useState([]);
  const [q, setQ] = useState('');
  const [discovering, setDiscovering] = useState(0);
  const discovered = useRef(new Set());

  const load = useCallback(async () => {
    const r = await adm('/apps');
    if (r.list) setApps(r.list);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      for (const a of setup.accounts || []) {
        if (discovered.current.has(a.id) || a.error) continue;
        discovered.current.add(a.id);
        setDiscovering((n) => n + 1);
        const r = await adm(`/accounts/${a.id}/discover`, { method: 'POST' });
        setDiscovering((n) => n - 1);
        if (!r.ok && alive) toast(`${a.name}: ${r.error || 'could not fetch apps'}`);
        await load();
      }
    })();
    let n = 0;
    const t = setInterval(() => { if (++n > 40) return clearInterval(t); load(); refresh(); }, 3000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One card per product: the App Store and Play entries with the same name.
  const groups = useMemo(() => {
    const m = new Map();
    for (const a of apps) {
      const k = norm(a.name);
      if (!m.has(k)) m.set(k, { k, name: a.name, iconUrl: a.iconUrl, items: [] });
      const g = m.get(k);
      g.items.push(a);
      g.iconUrl ||= a.iconUrl;
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [apps]);
  const shown = groups.filter((g) => !q || `${g.name} ${g.items.map((i) => i.bundleOrPackage).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const isOn = (g) => g.items.some((i) => i.tracked);
  const selected = groups.filter(isOn).length;

  const setTracked = async (uuids, tracked) => {
    setApps((xs) => xs.map((a) => (uuids.includes(a.uuid) ? { ...a, tracked } : a)));
    const r = await adm('/apps/bulk', { method: 'POST', body: { uuids, tracked } });
    if (!r.ok) toast(r.error || 'Could not save');
  };
  const allOn = groups.length > 0 && selected === groups.length;
  const accNames = [...new Set((setup.accounts || []).map((a) => a.name))].join(', ') || 'your accounts';

  return (
    <>
      <StepHead n={2} title="Choose the apps to watch" lede={`We found ${groups.length} app${groups.length === 1 ? '' : 's'} on ${accNames}. The bot will post every status change for the ones you select.`} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="w-full sm:w-[320px] h-[42px] flex items-center gap-2.5 px-[14px] rounded-[12px] bg-surface-2 focus-within:ring-[1.5px] focus-within:ring-ink">
          <Search size={16} className="text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter apps…" className="flex-1 min-w-0 bg-transparent outline-none text-[14px] placeholder:text-ink-3" />
        </label>
        <div className="flex-1" />
        <span className="text-[13px] font-semibold text-ink-2">{selected} of {groups.length} selected</span>
        <button type="button" onClick={() => setTracked(apps.map((a) => a.uuid), !allOn)} className="text-[13px] font-bold text-accent-text hover:underline">{allOn ? 'Select none' : 'Select all'}</button>
      </div>

      {discovering > 0 && <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-2"><Spinner size={14} />Fetching apps from your accounts…</div>}

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((g) => {
          const on = isOn(g);
          const plats = [g.items.some((i) => i.store === 'apple') && 'iOS', g.items.some((i) => i.store === 'google') && 'Android'].filter(Boolean);
          return (
            <button key={g.k} type="button" role="checkbox" aria-checked={on} onClick={() => setTracked(g.items.map((i) => i.uuid), !on)}
              className={cx('relative flex flex-col items-start gap-3 p-4 rounded-[16px] text-left transition', on ? 'bg-surface ring-[1.5px] ring-inset ring-ink' : 'bg-surface-2 opacity-80 hover:opacity-100')}>
              {on || g.iconUrl ? <AppIcon name={g.name} iconUrl={g.iconUrl} size={40} /> : <span className="size-10 rounded-[11px] bg-surface-3 inline-flex items-center justify-center text-ink-3"><Box size={20} /></span>}
              <span className={cx('absolute top-4 right-4 size-[22px] rounded-[7px] inline-flex items-center justify-center', on ? 'bg-[#0F110C] text-accent' : 'bg-surface ring-[1.5px] ring-inset ring-line')}>{on && <Check size={13} strokeWidth={3} />}</span>
              <span className="flex flex-col gap-[3px] min-w-0 w-full">
                <span className={cx('text-[14px] font-bold truncate', !on && 'text-ink-2')}>{g.name}</span>
                <span className="text-[12px] font-medium text-ink-3">{plats.length === 1 ? `${plats[0]} only` : plats.join(' · ')}</span>
              </span>
            </button>
          );
        })}
        {!shown.length && (discovering > 0
          ? [0, 1, 2].map((i) => <div key={i} className="h-[120px] rounded-[16px] skeleton" />)
          : <div className="col-span-full py-8 text-center text-[13.5px] text-ink-3">{q ? 'No apps match your filter.' : 'No apps found in your accounts yet.'}</div>)}
      </div>

      <Footer onBack={onBack} primary={`Watch ${selected} app${selected === 1 ? '' : 's'}`} onPrimary={onNext} disabled={!selected} />
    </>
  );
}

/* ── Step 3: Google Chat ─────────────────────────────────── */
const EVENTS = [
  { k: 'submitted', label: 'Sent / waiting for review', dot: 'bg-blue' },
  { k: 'in_review', label: 'In review', dot: 'bg-amber' },
  { k: 'approved', label: 'Approved · ready to publish', dot: 'bg-green' },
  { k: 'rejected', label: 'Rejected · removed · policy action', dot: 'bg-red' },
  { k: 'live', label: 'Live / staged rollout', dot: 'bg-ink' },
];

function ChatStep({ setup, refresh, onBack, onNext, toast }) {
  const c = setup.chat || {};
  const [url, setUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [events, setEvents] = useState(() => ({ submitted: true, in_review: true, approved: true, rejected: true, live: true, ...(setup.prefs?.chatEvents || {}) }));
  const [first, setFirst] = useState(null);

  useEffect(() => { adm('/apps').then((r) => setFirst((r.list || []).find((a) => a.tracked) || null)); }, []);

  const space = c.locked ? (c.spaceName || c.masked || 'Fixed space') : (c.spaceName || c.masked || '');
  const connected = Boolean(c.configured && (c.mode !== 'user' || c.userEmail));
  const sender = c.mode === 'user' || c.locked ? c.userEmail : null;

  const toggle = async (k, v) => {
    const next = { ...events, [k]: v };
    setEvents(next);
    await adm('/settings/prefs', { method: 'PUT', body: { chatEvents: next } });
  };

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    if (!c.locked && url.trim()) {
      const r = await adm('/settings/chat', { method: 'PUT', body: { webhookUrl: url.trim() } });
      if (!r.ok) { setResult({ ok: false, msg: r.error || 'Could not save the space' }); setSending(false); return; }
    }
    const t = await adm('/settings/chat/test', { method: 'POST', body: {} });
    setResult(t.ok ? { ok: true, msg: 'Test message sent — check the Chat space for app_review_bot’s hello.' } : { ok: false, msg: t.error || 'Google Chat rejected the message' });
    setSending(false);
    await refresh();
  };

  const appName = first?.name || 'Telfon - Calls & Chats';

  return (
    <>
      <StepHead n={3} title="Connect Google Chat" lede="app_review_bot posts every status change to one fixed space, so the whole team sees reviews move in real time." />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div className="flex items-center gap-3 p-4 rounded-[16px] bg-surface-2">
            <span className="size-9 shrink-0 rounded-full bg-accent inline-flex items-center justify-center text-accent-ink"><Bot size={18} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-extrabold">app_review_bot</div>
              <div className="text-[12.5px] font-medium text-ink-3 truncate">{sender ? `Posts as ${sender}` : c.mode === 'webhook' ? 'Incoming webhook' : 'Google Chat · not signed in yet'}</div>
            </div>
            {connected ? <Pill tone="approved" small>Connected</Pill>
              : <a href="/api/admin/chat/user/connect" className="h-8 inline-flex items-center px-3 rounded-[10px] bg-primary text-on-primary text-[12.5px] font-bold">Sign in with Google</a>}
          </div>
          {connected && sender && <a href="/api/admin/chat/user/connect" className="-mt-2 text-[12.5px] font-bold text-accent-text hover:underline w-fit">Switch account</a>}

          <Field label="Post to space" hint={c.locked ? 'Fixed by the server (GOOGLE_CHAT_SPACE) — not editable here.' : undefined}>
            {c.locked ? (
              <div className="w-full h-[46px] flex items-center gap-2.5 px-[14px] rounded-[12px] bg-surface-2" aria-readonly>
                <Hash size={16} className="text-ink-3" />
                <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">{space || 'Not set'}</span>
                <ChevronsUpDown size={16} className="text-ink-3" />
              </div>
            ) : null}
            {!c.locked && (
              <TextInput mono value={url} onChange={(e) => setUrl(e.target.value)} placeholder={c.configured ? c.masked : 'spaces/AAAA… or https://chat.googleapis.com/v1/spaces/…'} autoComplete="off" />
            )}
          </Field>

          <Field label="Post these events">
            <div className="rounded-[14px] ring-1 ring-inset ring-line divide-y divide-line overflow-hidden">
              {EVENTS.map((e) => (
                <div key={e.k} className="flex items-center gap-3 px-[14px] h-[46px]">
                  <span className={cx('size-[7px] rounded-full', e.dot)} />
                  <span className="flex-1 text-[13.5px] font-semibold">{e.label}</span>
                  <Toggle checked={events[e.k]} onChange={(v) => toggle(e.k, v)} label={e.label} />
                </div>
              ))}
            </div>
          </Field>
        </div>

        <aside className="w-full lg:w-[360px] h-fit flex flex-col gap-3 p-5 rounded-[16px] bg-surface-2">
          <div className="text-[11.5px] font-extrabold tracking-[1.2px] text-ink-3">PREVIEW</div>
          <div className="flex gap-3">
            <span className="size-8 shrink-0 rounded-full bg-accent inline-flex items-center justify-center text-accent-ink"><Bot size={16} /></span>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[13px]"><b>app_review_bot</b><span className="px-1.5 rounded-[5px] bg-surface-3 text-[10.5px] font-bold text-ink-2">App</span><span className="text-ink-3 text-[12px]">10:42</span></div>
              <div className="flex flex-col gap-2 p-[14px] rounded-[12px] bg-surface">
                <div className="text-[14px] font-extrabold">☑️ Approved · ready to publish</div>
                <div className="text-[12.5px] font-semibold text-ink-2">{appName} · Google Play</div>
                <div className="text-[12px] text-ink-3">Production 193 (1.3.80) · from In review · review took 6h 40m</div>
                <span className="w-fit px-2.5 py-1 rounded-[8px] ring-1 ring-inset ring-line text-[12px] font-bold text-blue">Open in Review Radar</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={sendTest} disabled={sending || (!connected && !url.trim())}
            className="h-10 inline-flex items-center justify-center gap-2 rounded-[12px] bg-surface ring-1 ring-inset ring-line text-[14px] font-bold hover:bg-surface-3 disabled:opacity-50">
            {sending ? <Spinner size={16} /> : <Send size={16} />}Send test message
          </button>
          {result && (
            <div className={cx('flex items-start gap-2 p-3 rounded-[12px] text-[12.5px] font-semibold', result.ok ? 'bg-green-soft text-green' : 'bg-red-soft text-red')}>
              {result.ok ? <Check size={15} className="shrink-0" /> : <X size={15} className="shrink-0" />}{result.msg}
            </div>
          )}
        </aside>
      </div>

      <Footer onBack={onBack} primary="Connect & continue" onPrimary={onNext}>
        {!connected && <button type="button" onClick={onNext} className="text-[13px] font-bold text-ink-2 hover:text-ink">Skip for now</button>}
      </Footer>
    </>
  );
}

/* ── Step 4: done ────────────────────────────────────────── */
function DoneStep({ setup, onAdd }) {
  const [busy, setBusy] = useState(false);
  const accs = setup.accounts || [];
  const p = setup.prefs || {};
  const every = p.applePollMinutes || p.playPollMinutes || 5;
  const space = String(setup.chat?.spaceName || setup.chat?.masked || 'Google Chat').split(' · ')[0];
  const hasPlay = accs.some((a) => a.store === 'google');
  const [counts, setCounts] = useState({ products: setup.apps?.tracked ?? 0, listings: setup.apps?.tracked ?? 0 });
  useEffect(() => {
    adm('/apps').then((r) => {
      const on = (r.list || []).filter((a) => a.tracked);
      if (r.list) setCounts({ products: new Set(on.map((a) => norm(a.name))).size, listings: on.length });
    });
  }, []);
  const tracked = counts.products;
  const finish = async () => {
    setBusy(true);
    await adm('/onboarding/complete', { method: 'POST' });
    location.href = '/dashboard';
  };
  const tiles = [
    { I: Wallet, t: `${accs.length} account${accs.length === 1 ? '' : 's'}`, s: accs.map((a) => `${a.name} · ${a.store === 'apple' ? 'App Store' : 'Google Play'}`).join(', ') || 'None yet' },
    { I: LayoutGrid, t: `${tracked} app${tracked === 1 ? '' : 's'}`, s: `${counts.listings} store listing${counts.listings === 1 ? '' : 's'} watched` },
    { I: MessageSquare, t: String(space).replace(/^spaces\//, ''), s: 'Google Chat space' },
    { I: Timer, t: `Every ${every} min`, s: `${p.stuckHours || 48}h review time limit` },
  ];
  return (
    <div className="flex flex-col items-center text-center gap-6 py-4 sm:py-6">
      <span className="size-24 rounded-full bg-accent inline-flex items-center justify-center text-accent-ink shadow-[0_16px_40px_rgba(198,244,50,.45)]"><Check size={44} strokeWidth={2.5} /></span>
      <div className="flex flex-col items-center gap-3">
        <h1 className="flex items-center gap-2 text-[30px] sm:text-[34px] font-extrabold tracking-[-0.8px]">You’re all set <PartyPopper size={30} /></h1>
        <p className="max-w-[540px] text-[15px] leading-[23px] font-medium text-ink-2">Review Radar is watching your apps. The first full check finishes in about a minute — after that, every status change lands in Google Chat and here.</p>
      </div>
      <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-3 text-left">
        {tiles.map((x, i) => (
          <div key={i} className="flex flex-col gap-2 p-4 rounded-[16px] bg-surface-2 min-w-0">
            <span className="size-8 rounded-[9px] bg-surface inline-flex items-center justify-center"><x.I size={16} /></span>
            <div className="mt-2 text-[15px] font-extrabold truncate">{x.t}</div>
            <div className="text-[12px] font-medium text-ink-3 line-clamp-2">{x.s}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => onAdd(hasPlay ? 'apple' : 'google')} className="h-10 inline-flex items-center gap-2 px-4 rounded-[12px] ring-[1.5px] ring-inset ring-line text-[14px] font-bold hover:bg-surface-2">
          <Plus size={16} />{hasPlay ? 'Add another account' : 'Add Google Play account'}
        </button>
        <button type="button" onClick={finish} disabled={busy} className="h-10 inline-flex items-center gap-2 px-4 rounded-[12px] bg-primary text-on-primary text-[14px] font-bold hover:opacity-90">
          {busy ? <Spinner size={16} /> : <ArrowRight size={16} />}Go to Overview
        </button>
      </div>
    </div>
  );
}

/* ── Wizard ──────────────────────────────────────────────── */
export default function Onboarding() {
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);
  const [addStore, setAddStore] = useState(null);
  const [toast, toastEl] = useToast();

  const refresh = useCallback(async () => {
    const r = await adm('/setup');
    if (r.ok) { setSetup(r); setError(null); } else if (r.status !== 401) setError(r.error || `Setup is unavailable (HTTP ${r.status})`);
    return r;
  }, []);

  useEffect(() => {
    document.title = 'Set up · Review Radar';
    refresh().then((s) => {
      if (!s.ok) return;
      const accounts = s.accounts || [];
      setStep(location.hash === '#add' || !accounts.length ? 0 : !s.apps?.total ? 1 : !s.chat?.configured ? 2 : 3);
    });
  }, [refresh]);

  const done = (i) => {
    if (!setup) return false;
    if (i === 0) return (setup.accounts || []).length > 0;
    if (i === 1) return (setup.apps?.tracked || 0) > 0;
    if (i === 2) return Boolean(setup.chat?.configured);
    return Boolean(setup.bot?.onboarded);
  };
  const reachable = (i) => i === 0 || done(0);
  const go = (i) => { setStep(i); scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="flex items-center gap-3 px-5 sm:px-10 py-6">
        <a href="/dashboard"><Logo /></a>
        <div className="flex-1" />
        <a href="/dashboard" className="text-[13.5px] font-bold text-ink-2 hover:text-ink">Set up later</a>
      </header>
      <div className="flex justify-center px-4 sm:px-10 pb-10 pt-0 sm:pt-4">
        <div className="w-full max-w-[1120px] flex flex-col lg:flex-row lg:items-start gap-6">
          <Stepper step={step} done={done} reachable={reachable} onGo={go} />
          <section className="flex-1 min-w-0 flex flex-col gap-6 p-5 sm:p-8 bg-surface rounded-[20px]">
            {!setup ? (
              error ? <div className="py-10 text-center text-[14px] text-ink-2">{error}<div className="mt-4"><a className="font-bold text-accent-text" href="/dashboard">Back to dashboard</a></div></div>
                : <div className="py-16 flex items-center justify-center gap-2 text-ink-3"><Spinner />Loading…</div>
            ) : step === 0 ? (
              <AccountStep key={addStore || 'apple'} initialStore={addStore} setup={setup} refresh={refresh} toast={toast} onNext={() => go(1)} />
            ) : step === 1 ? (
              <AppsStep setup={setup} refresh={refresh} toast={toast} onBack={() => go(0)} onNext={() => { refresh(); go(2); }} />
            ) : step === 2 ? (
              <ChatStep setup={setup} refresh={refresh} toast={toast} onBack={() => go(1)} onNext={async () => { await refresh(); go(3); }} />
            ) : (
              <DoneStep setup={setup} onAdd={(s) => { setAddStore(s); go(0); }} />
            )}
          </section>
        </div>
      </div>
      {toastEl}
    </div>
  );
}
