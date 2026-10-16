// App-wide state: dashboard data (polled), global filters, toasts, drawer + command palette.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, post } from './api.js';
import { setTz } from './format.js';
import { groupApps } from './model.js';

const DataCtx = createContext(null);
const UiCtx = createContext(null);

const LS = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export { LS };

const POLL_MS = 30_000;

export function DataProvider({ children }) {
  const [M, setM] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFiltersState] = useState(() => ({ store: LS.get('rr-store', ''), account: LS.get('rr-account', ''), q: '' }));
  const [checking, setChecking] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/dashboard');
      setTz(d.tz);
      setM(d);
      setError(null);
      return d;
    } catch (e) {
      if (e.status !== 401) setError(e);
      return null;
    }
  }, []);

  useEffect(() => {
    load();
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    timer.current = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', tick); };
  }, [load]);

  const setFilters = useCallback((patch) => {
    setFiltersState((f) => {
      const n = { ...f, ...patch };
      LS.set('rr-store', n.store);
      LS.set('rr-account', n.account);
      return n;
    });
  }, []);

  /** "Check stores now": ask the server to poll, then refresh a few times while it runs. */
  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      await post('/api/refresh');
      for (const ms of [2500, 6000, 12000]) {
        await new Promise((r) => setTimeout(r, ms));
        await load();
      }
    } finally {
      setChecking(false);
    }
  }, [load]);

  const value = useMemo(() => {
    const passes = (a) => (!filters.store || a.store === filters.store) && (!filters.account || a.accountId === filters.account);
    const apps = (M?.apps || []).filter(passes);
    const rowPass = (r) => passes(r);
    return {
      M,
      error,
      loading: !M && !error,
      reload: load,
      checkNow,
      checking,
      filters,
      setFilters,
      apps,
      groups: groupApps(apps),
      allGroups: groupApps(M?.apps || []),
      pending: (M?.pending || []).filter(rowPass),
      attention: (M?.attention || []).filter(rowPass),
      activity: (M?.activity || []).filter(rowPass),
      accounts: (M?.accounts || []).filter((a) => !filters.store || a.store === filters.store),
    };
  }, [M, error, load, checkNow, checking, filters, setFilters]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);

let toastId = 0;
export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [drawer, setDrawer] = useState(null); // { groupId, store }
  const [palette, setPalette] = useState(false);
  const [email, setEmail] = useState(null); // { id, appName, store, version }

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((t) => {
    const id = ++toastId;
    const item = typeof t === 'string' ? { id, title: t } : { id, ...t };
    setToasts((xs) => [...xs.slice(-3), item]);
    setTimeout(() => dismiss(id), item.duration || 5000);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ toasts, toast, dismiss, drawer, openApp: (groupId, store) => setDrawer({ groupId, store }), closeApp: () => setDrawer(null), palette, setPalette, email, openEmail: setEmail, closeEmail: () => setEmail(null) }), [toasts, toast, dismiss, drawer, palette, email]);
  return <UiCtx.Provider value={value}>{children}</UiCtx.Provider>;
}
export const useUi = () => useContext(UiCtx);

/** Theme toggle shared by every page (light / dark, remembered per browser). */
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const set = useCallback((t) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('rr-theme', t); } catch { /* ignore */ }
    setTheme(t);
  }, []);
  return [theme, set];
}
