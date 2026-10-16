// Manage apps — watch / mute / rename, one row per product across both stores (pen.dev frame lTOmj).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Info, MessageSquare, Pencil, RefreshCw, Search, X, Wallet, ListChecks } from 'lucide-react';
import { AppleLogo, GooglePlayLogo } from '@phosphor-icons/react';
import { AppIcon, Button, Card, Empty, PageHead, Skeleton, Toggle, cx } from '../components/ui.jsx';
import { useData, useUi } from '../lib/store.jsx';
import { api, patch, post } from '../lib/api.js';
import { Dialog, Dropdown } from './admin/common.jsx';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function groupRows(apps) {
  const by = new Map();
  for (const a of apps) {
    const k = norm(a.storeName || a.name);
    if (!by.has(k)) by.set(k, { id: k, items: [] });
    by.get(k).items.push(a);
  }
  return [...by.values()].map((g) => {
    const items = g.items.sort((x, y) => (x.store === 'apple' ? -1 : 1) - (y.store === 'apple' ? -1 : 1));
    const watched = items.filter((x) => x.tracked);
    return {
      ...g,
      items,
      name: items.find((x) => x.displayName)?.displayName || items[0].name,
      storeName: items[0].storeName || items[0].name,
      renamed: items.some((x) => x.displayName),
      iconUrl: items.find((x) => x.iconUrl)?.iconUrl || null,
      bundles: [...new Set(items.map((x) => x.bundleOrPackage).filter(Boolean))],
      stores: [...new Set(items.map((x) => x.store))],
      tracked: watched.length > 0,
      muted: watched.length > 0 && watched.every((x) => !x.notify),
      ownSpace: items.some((x) => x.hasWebhook),
      accountIds: [...new Set(items.map((x) => x.accountId))],
    };
  }).sort((a, b) => Number(b.tracked) - Number(a.tracked) || a.name.localeCompare(b.name));
}

export default function Manage() {
  const { M, reload } = useData();
  const { toast } = useUi();
  const [apps, setApps] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [acc, setAcc] = useState('');
  const [editing, setEditing] = useState(null); // { id, value }
  const [busy, setBusy] = useState({});
  const [syncing, setSyncing] = useState(false);
  const [space, setSpace] = useState(null); // group for the Chat-space dialog

  const load = useCallback(async () => {
    try {
      setApps(await api('/api/admin/apps'));
      setErr(null);
    } catch (e) {
      setErr(e.message);
      setApps([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const accounts = M?.accounts || [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groupRows((apps || []).filter((a) => !acc || a.accountId === acc)).filter((g) => !s || `${g.name} ${g.storeName} ${g.bundles.join(' ')}`.toLowerCase().includes(s));
  }, [apps, q, acc]);

  const patchGroup = async (g, body, msg) => {
    setBusy((b) => ({ ...b, [g.id]: true }));
    try {
      const updated = await Promise.all(g.items.map((a) => patch(`/api/admin/apps/${encodeURIComponent(a.uuid)}`, body)));
      setApps((list) => list.map((a) => updated.find((u) => u.uuid === a.uuid) || a));
      if (msg) toast({ title: msg, body: g.name, tone: 'ok' });
      reload();
      return true;
    } catch (e) {
      toast({ title: 'Could not save', body: e.message, tone: 'error' });
      return false;
    } finally {
      setBusy((b) => ({ ...b, [g.id]: false }));
    }
  };

  const saveName = async (g) => {
    const v = editing.value.trim();
    const dn = v === g.storeName ? '' : v;
    if (await patchGroup(g, { displayName: dn }, dn ? 'Renamed' : 'Using the store name')) setEditing(null);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const ids = accounts.filter((a) => !acc || a.id === acc).map((a) => a.id);
      const r = await Promise.allSettled(ids.map((id) => post(`/api/admin/accounts/${encodeURIComponent(id)}/discover`)));
      const failed = r.filter((x) => x.status === 'rejected');
      const found = r.reduce((n, x) => n + (x.value?.count || 0), 0);
      toast(failed.length ? { title: 'Sync finished with errors', body: failed[0].reason?.message, tone: 'error' } : { title: 'App list synced', body: `${found} app${found === 1 ? '' : 's'} found across ${ids.length} account${ids.length === 1 ? '' : 's'}`, tone: 'ok' });
      await load();
      reload();
    } finally {
      setSyncing(false);
    }
  };

  const bulk = async (tracked) => {
    const uuids = rows.flatMap((g) => g.items.map((a) => a.uuid));
    try {
      await post('/api/admin/apps/bulk', { uuids, tracked });
      toast({ title: tracked ? 'Watching all shown apps' : 'Stopped watching all shown apps', body: `${rows.length} apps`, tone: 'ok' });
      await load();
      reload();
    } catch (e) {
      toast({ title: 'Bulk update failed', body: e.message, tone: 'error' });
    }
  };

  const total = apps ? groupRows(apps).length : 0;
  return (
    <>
      <PageHead
        title="Manage apps"
        sub="Admin · choose what the bot watches, mute noisy apps, and set display names"
        actions={<Button variant="secondary" icon={RefreshCw} loading={syncing} onClick={sync}>Sync app list</Button>}
      />

      {total > 6 || q || acc ? (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <label className="w-full sm:w-[280px] h-10 flex items-center gap-2 px-3 bg-surface rounded-[12px]">
            <Search size={15} className="text-ink-3 shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps or bundle IDs…" className="flex-1 min-w-0 bg-transparent outline-none text-[13px] font-medium text-ink placeholder:text-ink-3" />
          </label>
          {accounts.length > 1 && <Dropdown icon={Wallet} value={acc} onChange={setAcc} options={[{ value: '', label: 'All accounts' }, ...accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.store === 'apple' ? 'App Store' : 'Play'}` }))]} />}
          <div className="flex-1" />
          <Button size="sm" variant="surface" icon={ListChecks} onClick={() => bulk(true)} disabled={!rows.length}>Watch all shown</Button>
          <Button size="sm" variant="surface" onClick={() => bulk(false)} disabled={!rows.length}>Unwatch all shown</Button>
        </div>
      ) : null}

      <Card className="p-2">
        {apps === null ? (
          <div className="flex flex-col gap-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : err ? (
          <Empty icon={ListChecks} title="Couldn’t load apps" tone="red" action={<Button icon={RefreshCw} onClick={load}>Retry</Button>}>{err}</Empty>
        ) : !rows.length ? (
          <Empty icon={ListChecks} title={apps.length ? 'No apps match' : 'No apps yet'} action={!apps.length && <Button icon={RefreshCw} onClick={sync} loading={syncing}>Sync app list</Button>}>{apps.length ? 'Try another search or account.' : 'Connect a developer account, then sync the app list.'}</Empty>
        ) : (
          <div>
            <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_220px_80px_80px_100px_110px] gap-4 items-center px-4 py-3 text-[11px] font-bold tracking-[0.8px] text-ink-3">
              <span>DISPLAY NAME</span><span>BUNDLE / PACKAGE</span><span>STORES</span><span>WATCH</span><span>MUTE ALERTS</span><span />
            </div>
            {rows.map((g) => {
              const isEdit = editing?.id === g.id;
              return (
                <div key={g.id} className={cx('grid grid-cols-[auto_auto_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_220px_80px_80px_100px_110px] gap-x-4 gap-y-3 items-center px-3 md:px-4 py-3 border-t border-line rounded-[14px]', isEdit && 'bg-surface-2', !g.tracked && 'opacity-60')}>
                  <div className="col-span-3 md:col-span-1 flex items-center gap-3 min-w-0">
                    <AppIcon name={g.name} iconUrl={g.iconUrl} size={36} radius={10} className={cx(!g.tracked && 'grayscale')} />
                    {isEdit ? (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <input autoFocus value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveName(g); if (e.key === 'Escape') setEditing(null); }}
                          placeholder={g.storeName} className="w-full max-w-[260px] h-[38px] px-3 rounded-[10px] bg-surface ring-[1.5px] ring-inset ring-ink text-[13.5px] font-bold text-ink outline-none" />
                        <button onClick={() => saveName(g)} disabled={busy[g.id]} aria-label="Save name" className="size-[34px] shrink-0 rounded-[10px] bg-primary text-accent inline-flex items-center justify-center"><Check size={16} /></button>
                        <button onClick={() => setEditing(null)} aria-label="Cancel" className="size-[34px] shrink-0 rounded-[10px] bg-surface text-ink-2 inline-flex items-center justify-center"><X size={16} /></button>
                      </div>
                    ) : (
                      <div className="min-w-0 flex flex-col gap-[2px]">
                        <span className="text-[14px] font-bold text-ink truncate">{g.name}</span>
                        {!g.tracked ? <span className="text-[12px] font-semibold text-ink-3">Not watched</span>
                          : g.muted ? <span className="text-[12px] font-semibold text-amber">Muted · status still tracked, no Chat posts</span>
                          : g.renamed ? <span className="text-[12px] font-medium text-ink-3 truncate">Store name: {g.storeName}</span>
                          : g.ownSpace ? <span className="text-[12px] font-medium text-ink-3">Posts to its own Chat space</span> : null}
                      </div>
                    )}
                  </div>
                  <div className="hidden md:block font-mono text-[12.5px] font-medium text-ink-2 min-w-0">
                    {g.bundles.map((b) => <div key={b} className="truncate" title={b}>{b}</div>)}
                  </div>
                  <div className="hidden md:flex items-center gap-1.5 text-ink">
                    {g.stores.includes('apple') && <AppleLogo size={16} aria-label="App Store" />}
                    {g.stores.includes('google') && <GooglePlayLogo size={16} aria-label="Google Play" />}
                  </div>
                  <div className="flex items-center gap-2"><span className="md:hidden text-[12.5px] font-bold text-ink-2">Watch</span><Toggle label={`Watch ${g.name}`} checked={g.tracked} disabled={busy[g.id]} onChange={(v) => patchGroup(g, { tracked: v }, v ? 'Watching' : 'Stopped watching')} /></div>
                  <div className="flex items-center gap-2"><span className="md:hidden text-[12.5px] font-bold text-ink-2">Mute</span><Toggle label={`Mute ${g.name}`} checked={g.muted} disabled={busy[g.id] || !g.tracked} onChange={(v) => patchGroup(g, { notify: !v }, v ? 'Alerts muted' : 'Alerts on')} /></div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => setSpace(g)} title={g.ownSpace ? 'Posts to its own Chat space' : 'Chat space: default'} aria-label="Chat space" className={cx('size-8 rounded-[9px] inline-flex items-center justify-center', g.ownSpace ? 'bg-accent-soft text-accent-text' : 'text-ink-3 hover:bg-surface-2 hover:text-ink')}><MessageSquare size={14} /></button>
                    <button onClick={() => setEditing({ id: g.id, value: g.name })} className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-[9px] bg-surface-2 text-[12.5px] font-bold text-ink hover:bg-surface-3"><Pencil size={13} />Rename</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="mt-5 inline-flex items-start gap-[10px] px-4 py-3 rounded-[14px] bg-accent-soft">
        <Info size={16} className="text-ink shrink-0 mt-[1px]" />
        <span className="text-[13px] font-semibold text-ink">Renaming only changes how the app appears in Review Radar and Google Chat — store listings are untouched.</span>
      </div>

      <SpaceDialog group={space} onClose={() => setSpace(null)} onSave={async (url) => { if (await patchGroup(space, { chatWebhook: url }, url ? 'Own Chat space set' : 'Using the default space')) setSpace(null); }} />
    </>
  );
}

function SpaceDialog({ group, onClose, onSave }) {
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(''), [group]);
  if (!group) return null;
  return (
    <Dialog open onClose={onClose} title="Chat space for this app" sub={`${group.name} posts to the default space unless you set its own. Paste a Google Chat webhook URL or a space name (spaces/AAAA…).`}
      footer={<>
        {group.ownSpace && <Button variant="outline" onClick={() => onSave('')}>Use default space</Button>}
        <Button disabled={url.trim().length < 8} onClick={() => onSave(url.trim())}>Save</Button>
      </>}>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={group.ownSpace ? 'Currently its own space — paste a new one to replace it' : 'https://chat.googleapis.com/v1/spaces/…/messages?key=…'} className="w-full h-[46px] px-[14px] rounded-[12px] bg-surface-2 font-mono text-[12.5px] text-ink outline-none focus:ring-[1.5px] focus:ring-ink" />
    </Dialog>
  );
}
