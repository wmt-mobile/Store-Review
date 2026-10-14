// Tiny JSON persistence for state + de-dupe. One instance only.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const EMPTY = () => ({
  version: 1,
  initialized: {}, // { [channelKey]: true } — first observation done (silent)
  apps: {}, // { [appKey]: { key, store, accountId, appId, bundleOrPackage, name, iconUrl, discoveredAt } }
  channels: {}, // { [appKey]: { [channel]: { version, status, since, submittedAt, reason, extra } } }
  history: {}, // { [appKey]: [ { at, channel, version, from, to, reason } ] }
  seen: {}, // de-dupe { [eventId]: ts }
  accounts: {}, // { [accountId]: { lastPollAt, lastDiscoveryAt, error, errorAt, lastAlertAt } }
  threads: {}, // { [appKey:version]: threadKey }
  meta: {}, // gmail cursor, digest date, etc
});

export class Store {
  constructor(file = path.join(config.dataDir, 'state.json')) {
    this.file = file;
    this.data = EMPTY();
    this._timer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) this.data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch (e) {
      console.error('[store] could not read state, starting fresh:', e.message);
      const bak = `${this.file}.corrupt-${Date.now()}`;
      try { fs.renameSync(this.file, bak); } catch {}
    }
  }

  saveNow() {
    if (!this.file) return; // in-memory (tests)
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  /** Debounced save so a poll of 50 apps writes once. */
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 250);
  }

  flush() {
    clearTimeout(this._timer);
    this.saveNow();
  }

  account(id) {
    return (this.data.accounts[id] ||= {});
  }

  pruneSeen(maxAgeMs = 60 * 86_400_000) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [k, ts] of Object.entries(this.data.seen)) if (ts < cutoff) delete this.data.seen[k];
  }
}

export const memoryStore = () => {
  const s = Object.create(Store.prototype);
  s.file = null;
  s.data = EMPTY();
  s._timer = null;
  return s;
};
