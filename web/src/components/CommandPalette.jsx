// Ctrl/⌘ K command palette (design "Command palette · Ctrl + K"): apps, actions, go-to pages.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, RefreshCw, Moon, Sun, Bell } from 'lucide-react';
import { useData, useTheme, useUi } from '../lib/store.jsx';
import { statusLabel, TONE } from '../lib/model.js';
import { AppIcon, Pill, StoreBadge, cx } from './ui.jsx';
import { NAV } from '../layout/Shell.jsx';

const Key = ({ children }) => <kbd className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-[6px] ring-1 ring-inset ring-line text-[11px] font-semibold text-ink-2 font-sans">{children}</kbd>;
const GO_KEYS = { Overview: 'O', 'In review': 'I', 'Needs attention': 'A', Apps: 'P', Accounts: 'C', Activity: 'Y', Setup: 'S', 'Manage apps': 'M', 'Audit log': 'L' };

export function CommandPalette() {
  const { palette, setPalette, openApp, toast } = useUi();
  const { M, allGroups, checkNow, filters, setFilters } = useData();
  const [theme, setTheme] = useTheme();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);

  useEffect(() => {
    if (palette) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 10); }
  }, [palette]);

  // "g" then a letter jumps to a page, outside inputs
  useEffect(() => {
    let g = 0;
    const h = (e) => {
      if (e.target.closest?.('input,textarea,select,[contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'g') { g = Date.now(); return; }
      if (Date.now() - g < 1200) {
        const item = NAV.flatMap((x) => x.items).find((i) => GO_KEYS[i.label]?.toLowerCase() === e.key.toLowerCase());
        if (item) { e.preventDefault(); nav(item.to); }
        g = 0;
      }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [nav]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const apps = [];
    for (const g of allGroups) {
      for (const [store, ch] of [['apple', g.iosCh], ['google', g.androidCh]]) {
        if (!ch || (filters.store && filters.store !== store)) continue;
        const hay = `${g.name} ${g.bundle || ''} ${ch.version} ${store === 'apple' ? 'ios app store' : 'android play'}`.toLowerCase();
        if (s && !hay.includes(s)) continue;
        apps.push({ kind: 'app', id: `${g.id}|${store}`, g, store, ch });
      }
    }
    const actions = [
      { kind: 'action', id: 'check', label: 'Check stores now', icon: RefreshCw, run: async () => { toast({ tone: 'info', title: 'Checking App Store & Google Play…' }); await checkNow(); toast({ tone: 'success', title: 'Stores checked' }); } },
      { kind: 'action', id: 'theme', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: theme === 'dark' ? Sun : Moon, run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
      { kind: 'action', id: 'notif', label: 'Notification settings', icon: Bell, run: () => nav('/dashboard/notifications') },
    ].filter((a) => !s || a.label.toLowerCase().includes(s));
    const go = NAV.filter((x) => !x.admin || M?.admin).flatMap((x) => x.items).filter((i) => !s || i.label.toLowerCase().includes(s)).map((i) => ({ kind: 'go', id: i.to, label: i.label, icon: i.icon, run: () => nav(i.to) }));
    return { apps: apps.slice(0, s ? 8 : 5), actions, go: go.slice(0, s ? 9 : 3) };
  }, [q, allGroups, filters.store, theme, M?.admin, checkNow, nav, setTheme, toast]);

  const flat = [...results.apps, ...results.actions, ...results.go];
  useEffect(() => { if (sel >= flat.length) setSel(Math.max(0, flat.length - 1)); }, [flat.length, sel]);

  if (!palette) return null;
  const close = () => setPalette(false);
  const run = (it) => {
    close();
    if (!it) return;
    if (it.kind === 'app') openApp(it.g.id, it.store);
    else it.run();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(flat[sel]); }
    else if (e.key === 'Tab') { e.preventDefault(); const order = ['', 'apple', 'google']; setFilters({ store: order[(order.indexOf(filters.store) + 1) % 3] }); }
  };

  let idx = -1;
  const row = (it, content) => {
    idx++;
    const i = idx;
    return (
      <button key={it.id} onMouseMove={() => setSel(i)} onClick={() => run(it)} className={cx('w-full flex items-center gap-3 p-[10px] rounded-[12px] text-left', sel === i ? 'bg-surface-2' : '')}>
        {content}
        {sel === i && <CornerDownLeft size={15} className="text-ink-3 shrink-0" />}
      </button>
    );
  };
  const Group = ({ label, children }) => (children.length ? <><div className="px-[10px] pt-[10px] pb-[6px] text-[10.5px] font-extrabold tracking-[1px] text-ink-3">{label}</div>{children}</> : null);

  return (
    <div className="fixed inset-0 z-[80] bg-scrim flex items-start justify-center pt-[12vh] px-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-[640px] bg-surface rounded-[20px] shadow-[0_24px_60px_rgba(15,17,12,.3)] overflow-hidden" role="dialog" aria-label="Command palette" onKeyDown={onKey}>
        <div className="flex items-center gap-3 px-5 py-[18px] border-b border-line">
          <Search size={19} className="text-ink-2 shrink-0" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Search apps, versions, accounts…" className="flex-1 min-w-0 bg-transparent outline-none text-[17px] font-semibold text-ink placeholder:text-ink-3 placeholder:font-medium" />
          <span className="p-[3px_7px] bg-surface-2 rounded-[7px] text-[11px] font-bold text-ink-2">Esc</span>
        </div>
        <div className="max-h-[min(460px,60vh)] overflow-y-auto scroll-thin p-[10px] flex flex-col gap-[2px]">
          <Group label="APPS">
            {results.apps.map((it) => row(it, (
              <>
                <AppIcon name={it.g.name} iconUrl={it.g.iconUrl} size={30} radius={9} />
                <span className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-[14px] font-bold text-ink truncate">{it.g.name}</span>
                  <StoreBadge store={it.store} className="hidden sm:inline-flex" />
                  <span className="text-[12.5px] font-semibold text-ink-3 whitespace-nowrap hidden sm:inline">{it.ch.version}</span>
                </span>
                <Pill tone={TONE[it.ch.category]}>{statusLabel(it.store, it.ch.status, it.ch.label, it.ch).replace(/^Waiting for review$/, 'Waiting').replace(/^Approved · ready to publish$/, 'Ready')}</Pill>
              </>
            )))}
          </Group>
          <Group label="ACTIONS">
            {results.actions.map((it) => row(it, (
              <>
                <span className="size-[30px] rounded-[9px] bg-surface-2 inline-flex items-center justify-center text-ink"><it.icon size={15} /></span>
                <span className="flex-1 text-[14px] font-bold text-ink">{it.label}</span>
                {it.keys && <span className="flex gap-1">{it.keys.map((k) => <Key key={k}>{k}</Key>)}</span>}
              </>
            )))}
          </Group>
          <Group label="GO TO">
            {results.go.map((it) => row(it, (
              <>
                <span className="size-[30px] rounded-[9px] bg-surface-2 inline-flex items-center justify-center text-ink"><it.icon size={15} /></span>
                <span className="flex-1 text-[14px] font-bold text-ink">{it.label}</span>
                {GO_KEYS[it.label] && <span className="flex gap-1"><Key>G</Key><Key>{GO_KEYS[it.label]}</Key></span>}
              </>
            )))}
          </Group>
          {!flat.length && <div className="py-10 text-center text-[13.5px] text-ink-3">No matches for “{q}”</div>}
        </div>
        <div className="flex items-center gap-4 px-5 py-3 bg-surface-2 text-[12px] font-semibold text-ink-3">
          <span className="flex items-center gap-1.5"><Key>↑↓</Key> Navigate</span>
          <span className="flex items-center gap-1.5"><Key>↵</Key> Open</span>
          <span className="flex items-center gap-1.5"><Key>Tab</Key> Filter by store{filters.store ? ` · ${filters.store === 'apple' ? 'App Store' : 'Play'}` : ''}</span>
        </div>
      </div>
    </div>
  );
}
