// Finds every app each account can see, plus manual entries from apps.json.
import { discoverAppleApps } from './apple/poller.js';
import { discoverPlayApps } from './google/play.js';
import { errText } from './util.js';

function registerManual(account, tracker, overrides) {
  for (const o of overrides) {
    if (o.store !== account.store || (o.account && o.account !== account.id)) continue;
    const appId = o.store === 'apple' ? o.appId : o.packageName;
    if (!appId) continue;
    tracker.registerApp({
      store: o.store,
      accountId: account.id,
      appId: String(appId),
      bundleOrPackage: o.bundleId || o.packageName,
      name: o.name,
      platform: o.store === 'apple' ? 'ios' : 'android',
    });
  }
}

export async function discoverAccount(account, tracker, cfg) {
  const st = tracker.store.account(account.id);
  let found = 0;
  if (cfg.autoDiscover) {
    try {
      const keys = account.store === 'apple' ? await discoverAppleApps(account, tracker) : await discoverPlayApps(account, tracker);
      found = keys.length;
      st.discoveryWarning = null;
    } catch (e) {
      st.discoveryWarning = `discovery: ${errText(e)}`;
      if (account.store === 'apple') throw e; // Apple discovery failing = key broken
      console.warn(`[discovery:${account.id}] ${st.discoveryWarning} — falling back to apps.json`);
    }
  }
  registerManual(account, tracker, cfg.apps || []);
  st.lastDiscoveryAt = Date.now();
  tracker.store.save();
  return found;
}
