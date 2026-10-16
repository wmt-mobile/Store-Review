// App frame from the pen.dev screens: 248px sidebar (desktop), 76px icon rail (tablet), bottom tabs (phone) + top bar.
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Hourglass, TriangleAlert, LayoutGrid, Wallet, Activity, SlidersHorizontal, ListChecks, ScrollText, Search, ChevronDown, Bell, Bot, Moon, Sun, LogOut, Check, Settings } from 'lucide-react';
import { AppleLogo, GooglePlayLogo } from '@phosphor-icons/react';
import { Logo, LogoTile, Kbd, cx } from '../components/ui.jsx';
import { useData, useTheme, useUi } from '../lib/store.jsx';
import { ago, inFuture } from '../lib/format.js';
import { post } from '../lib/api.js';
import { NotificationPanel, useNotifications, useLiveToasts } from '../components/Notifications.jsx';
import { Toasts } from '../components/Toasts.jsx';
import { CommandPalette } from '../components/CommandPalette.jsx';
import { AppDrawer } from '../components/AppDrawer.jsx';
import { EmailModal } from '../components/EmailModal.jsx';
import { EnableNotificationsCard } from '../components/Push.jsx';

export const NAV = [
  { group: 'MONITOR', items: [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/dashboard/review', label: 'In review', icon: Hourglass, count: 'review' },
    { to: '/dashboard/attention', label: 'Needs attention', icon: TriangleAlert, count: 'attention' },
  ] },
  { group: 'CATALOG', items: [
    { to: '/dashboard/apps', label: 'Apps', icon: LayoutGrid },
    { to: '/dashboard/accounts', label: 'Accounts', icon: Wallet },
    { to: '/dashboard/activity', label: 'Activity', icon: Activity },
  ] },
  { group: 'ADMIN', admin: true, items: [
    { to: '/dashboard/setup', label: 'Setup', icon: SlidersHorizontal },
    { to: '/dashboard/manage', label: 'Manage apps', icon: ListChecks },
    { to: '/dashboard/audit', label: 'Audit log', icon: ScrollText },
  ] },
];

function useCounts() {
  const { pending, attention } = useData();
  return { review: pending.filter((r) => r.category === 'in_review').length || pending.length, attention: attention.length };
}

function NavItem({ item, counts, rail }) {
  const n = item.count ? counts[item.count] : 0;
  return (
    <NavLink to={item.to} end={item.end} title={rail ? item.label : undefined}
      className={({ isActive }) => cx('relative flex items-center rounded-[12px] transition', rail ? 'justify-center size-[44px] rounded-[13px]' : 'w-full gap-3 px-3 py-[9px]',
        isActive ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-surface/70 hover:text-ink')}>
      {({ isActive }) => (
        <>
          <item.icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
          {!rail && <span className={cx('flex-1 text-[14px] leading-[19px]', isActive ? 'font-bold' : 'font-semibold')}>{item.label}</span>}
          {n > 0 && (rail
            ? <span className={cx('absolute left-[26px] top-1 px-[5px] py-px rounded-full text-[9.5px] leading-[13px] font-extrabold text-white outline-2 outline-bg', item.count === 'review' ? 'bg-amber' : 'bg-red')}>{n}</span>
            : <span className={cx('rounded-full px-[7px] py-[2px] text-[11px] font-extrabold text-white', item.count === 'review' ? 'bg-amber' : 'bg-red')}>{n}</span>)}
        </>
      )}
    </NavLink>
  );
}

function BotCard() {
  const { M } = useData();
  const accounts = M?.accounts || [];
  const last = Math.max(0, ...accounts.map((a) => a.lastPollAt || 0)) || null;
  const errors = accounts.filter((a) => a.error).length;
  const interval = 5 * 60_000;
  return (
    <div className="w-full flex flex-col gap-[10px] p-4 bg-surface rounded-[16px]">
      <div className="flex items-center gap-[10px]">
        <span className="size-8 rounded-full bg-accent-soft inline-flex items-center justify-center text-ink"><Bot size={16} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-ink">app_review_bot</div>
          <div className="flex items-center gap-[5px]">
            <span className={cx('size-[6px] rounded-full', errors ? 'bg-amber' : 'bg-green')} />
            <span className="text-[11.5px] font-medium text-ink-2 truncate">{errors ? `${errors} account check failing` : 'Posting to Google Chat'}</span>
          </div>
        </div>
      </div>
      <div className="text-[12px] font-medium text-ink-3 whitespace-nowrap">Last poll {last ? ago(last).replace(' min', 'm') : '—'} · next {last ? inFuture(last + interval).replace(' min', 'm') : 'soon'}</div>
    </div>
  );
}

function Sidebar({ admin, counts }) {
  return (
    <aside className="hidden xl:flex sticky top-0 h-screen w-[248px] shrink-0 flex-col gap-7 px-4 py-6 overflow-y-auto scroll-thin">
      <NavLink to="/dashboard" className="px-2"><Logo /></NavLink>
      {NAV.filter((g) => !g.admin || admin).map((g) => (
        <nav key={g.group} className="flex flex-col gap-[2px]">
          <div className="px-3 pb-2 text-[11px] font-bold tracking-[1.2px] text-ink-3">{g.group}</div>
          {g.items.map((it) => <NavItem key={it.to} item={it} counts={counts} />)}
        </nav>
      ))}
      <div className="flex-1" />
      <BotCard />
    </aside>
  );
}

function Rail({ admin, counts }) {
  return (
    <aside className="hidden md:flex xl:hidden sticky top-0 h-screen w-[76px] shrink-0 flex-col items-center gap-[6px] py-5 overflow-y-auto scroll-thin">
      <NavLink to="/dashboard" className="mb-[18px]"><LogoTile size={40} radius={12} mark={25} /></NavLink>
      {NAV.filter((g) => !g.admin || admin).map((g, i) => (
        <div key={g.group} className="flex flex-col items-center gap-[6px]">
          {g.group === 'ADMIN' && <span className="w-7 h-px bg-line my-[3px]" />}
          {g.items.map((it) => <NavItem key={it.to} item={it} counts={counts} rail />)}
        </div>
      ))}
    </aside>
  );
}

function BottomTabs({ counts }) {
  const items = [NAV[0].items[0], NAV[0].items[1], NAV[0].items[2], NAV[1].items[0]];
  const short = { Overview: 'Overview', 'In review': 'In review', 'Needs attention': 'Attention', Apps: 'Apps' };
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line flex justify-around px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      {items.map((it) => {
        const n = it.count ? counts[it.count] : 0;
        return (
          <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cx('relative flex flex-col items-center gap-1 px-3 py-1 rounded-[12px] text-[11px] font-bold', isActive ? 'text-ink' : 'text-ink-3')}>
            {({ isActive }) => (
              <>
                <span className={cx('inline-flex items-center justify-center w-12 h-7 rounded-full', isActive && 'bg-accent text-accent-ink')}><it.icon size={18} /></span>
                {short[it.label]}
                {n > 0 && <span className={cx('absolute top-0 right-2 min-w-4 h-4 px-1 rounded-full text-[10px] text-white inline-flex items-center justify-center', it.count === 'review' ? 'bg-amber' : 'bg-red')}>{n}</span>}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function StoreFilter() {
  const { filters, setFilters } = useData();
  const opts = [
    { value: '', label: 'All' },
    { value: 'apple', label: 'App Store', icon: AppleLogo },
    { value: 'google', label: 'Play', icon: GooglePlayLogo },
  ];
  return (
    <div className="flex gap-[2px] p-1 bg-surface rounded-[14px]" role="tablist" aria-label="Store">
      {opts.map((o) => {
        const on = filters.store === o.value;
        return (
          <button key={o.value} role="tab" aria-selected={on} onClick={() => setFilters({ store: o.value })} title={o.label}
            className={cx('h-9 inline-flex items-center gap-1.5 rounded-[10px] text-[13px] font-bold transition', o.icon ? 'px-3 lg:px-[14px]' : 'px-[14px]', on ? 'bg-primary text-on-primary' : 'text-ink-2 hover:text-ink')}>
            {o.icon && <o.icon size={15} />}
            <span className={cx(o.icon && 'hidden lg:inline')}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function useClickAway(ref, onAway) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onAway(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onAway]);
}

function AccountSelector() {
  const { M, filters, setFilters } = useData();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickAway(ref, () => setOpen(false));
  const accounts = M?.accounts || [];
  // Accounts are per store; group by name so "WebMobTechnologies" covers both its Apple team and Play account.
  const names = [...new Set(accounts.map((a) => a.name))];
  const current = filters.account ? accounts.find((a) => a.id === filters.account) : null;
  const label = current ? `${current.name} · ${current.store === 'apple' ? 'App Store' : 'Play'}` : names.length === 1 ? names[0] : 'All accounts';
  return (
    <div ref={ref} className="relative hidden xl:block">
      <button onClick={() => setOpen((o) => !o)} className="h-11 flex items-center gap-2 pl-2 pr-3 bg-surface rounded-[14px] max-w-[260px]">
        <span className="size-7 shrink-0 rounded-[8px] bg-[#0F110C] text-accent inline-flex items-center justify-center text-[13px] font-extrabold">{(label || 'A').charAt(0)}</span>
        <span className="text-[13px] font-bold text-ink truncate hidden lg:inline">{label}</span>
        <ChevronDown size={16} className="text-ink-2 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-[52px] z-40 w-[280px] bg-surface rounded-[16px] shadow-[0_12px_40px_rgba(15,17,12,.16)] p-2">
          {[{ id: '', name: 'All accounts', store: null }, ...accounts].map((a) => (
            <button key={a.id || 'all'} onClick={() => { setFilters({ account: a.id }); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] hover:bg-surface-2 text-left">
              <span className="size-7 shrink-0 rounded-[8px] bg-[#0F110C] text-accent inline-flex items-center justify-center text-[12px] font-extrabold">{a.store === 'apple' ? <AppleLogo size={14} /> : a.store === 'google' ? <GooglePlayLogo size={14} /> : 'A'}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-bold text-ink truncate">{a.name}</span>
                {a.store && <span className="block text-[11.5px] text-ink-3">{a.store === 'apple' ? 'App Store Connect' : 'Google Play Console'} · {a.appCount} apps</span>}
              </span>
              {filters.account === a.id && <Check size={16} className="text-ink" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { M } = useData();
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useClickAway(ref, () => setOpen(false));
  const email = M?.user || '';
  const initials = (email.split('@')[0].split(/[._-]/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('') || 'RR').toUpperCase();
  const logout = async () => { await post('/api/auth/logout').catch(() => {}); location.href = '/login'; };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Account menu" className="size-[42px] xl:size-11 rounded-full bg-accent text-accent-ink inline-flex items-center justify-center text-[14px] font-extrabold">{initials}</button>
      {open && (
        <div className="absolute right-0 top-[52px] z-40 w-[240px] bg-surface rounded-[16px] shadow-[0_12px_40px_rgba(15,17,12,.16)] p-2">
          {email && <div className="px-3 py-2 text-[12px] text-ink-3 truncate">{email}</div>}
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] hover:bg-surface-2 text-[13.5px] font-semibold text-ink">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button onClick={() => { setOpen(false); nav('/dashboard/notifications'); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] hover:bg-surface-2 text-[13.5px] font-semibold text-ink"><Settings size={16} /> Notification settings</button>
          {M?.mode === 'supabase' && <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] hover:bg-surface-2 text-[13.5px] font-semibold text-red"><LogOut size={16} /> Sign out</button>}
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const { setPalette } = useUi();
  const notif = useNotifications();
  useLiveToasts(notif.items);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickAway(ref, () => setOpen(false));
  return (
    <header className="flex items-center gap-[10px] xl:gap-3 px-4 md:pl-2 md:pr-6 xl:px-8 pt-4 md:pt-5 pb-4 xl:pb-5">
      <NavLink to="/dashboard" className="md:hidden"><LogoTile size={40} radius={12} mark={26} /></NavLink>
      <button onClick={() => setPalette(true)} className="h-[42px] xl:h-11 flex-1 xl:flex-none xl:w-[380px] flex items-center gap-[10px] pl-[14px] pr-2 bg-surface rounded-[13px] xl:rounded-[14px] text-left min-w-0">
        <Search size={18} className="text-ink-3 shrink-0" />
        <span className="flex-1 text-[14px] font-medium text-ink-3 truncate"><span className="xl:hidden">Search…</span><span className="hidden xl:inline">Search apps, versions, accounts…</span></span>
        <span className="hidden sm:inline-flex p-[4px_8px] bg-surface-2 rounded-[8px] text-[11px] font-bold text-ink-2">Ctrl K</span>
      </button>
      <div className="flex-1 hidden xl:block" />
      <div className="hidden sm:block"><StoreFilter /></div>
      <AccountSelector />
      <div ref={ref} className="relative">
        <button onClick={() => setOpen((o) => !o)} aria-label="Notifications" className="relative size-[42px] xl:size-11 bg-surface rounded-[13px] xl:rounded-[14px] inline-flex items-center justify-center text-ink">
          <Bell size={19} />
          {notif.unread > 0 && <span className="absolute left-[25px] top-[11px] size-2 rounded-full bg-red outline-2 outline-surface" />}
        </button>
        {open && <NotificationPanel onClose={() => setOpen(false)} />}
      </div>
      <UserMenu />
    </header>
  );
}

export function Shell() {
  const { M } = useData();
  const counts = useCounts();
  const loc = useLocation();
  const { setPalette } = useUi();
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [setPalette]);
  useEffect(() => { scrollTo({ top: 0 }); }, [loc.pathname]);
  const admin = M ? M.admin : true;
  return (
    <div className="min-h-screen flex bg-bg text-ink">
      <Sidebar admin={admin} counts={counts} />
      <Rail admin={admin} counts={counts} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <main className="flex-1 min-w-0 px-4 md:pl-2 md:pr-6 xl:px-8 pb-28 md:pb-8 pt-0 xl:pt-2">
          <Outlet />
        </main>
      </div>
      <BottomTabs counts={counts} />
      <AppDrawer />
      <EmailModal />
      <CommandPalette />
      <Toasts />
      <EnableNotificationsCard />
    </div>
  );
}
