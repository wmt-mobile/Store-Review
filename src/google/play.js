// Google Play: discovery (Reporting API apps:search) + tracks/releases (Publishing API).
// The tool only opens and DISCARDS edits. It never commits anything.
import { google } from 'googleapis';
import { appKeyOf, mapLimit } from '../util.js';
import { describe } from '../status-map.js';

const SCOPES = ['https://www.googleapis.com/auth/androidpublisher', 'https://www.googleapis.com/auth/playdeveloperreporting'];
const apis = new Map();

function apisFor(account) {
  if (!apis.has(account.id)) {
    const auth = new google.auth.GoogleAuth(account.serviceAccount ? { credentials: account.serviceAccount, scopes: SCOPES } : { keyFile: account.serviceAccountPath, scopes: SCOPES });
    apis.set(account.id, {
      publisher: google.androidpublisher({ version: 'v3', auth }),
      reporting: google.playdeveloperreporting({ version: 'v1beta1', auth }),
    });
  }
  return apis.get(account.id);
}

export const resetPlayClient = (id) => apis.delete(id);
export const playApisFor = (account) => apisFor(account);

export async function discoverPlayApps(account, tracker) {
  const { reporting } = apisFor(account);
  const keys = [];
  let pageToken;
  do {
    const { data } = await reporting.apps.search({ pageSize: 1000, pageToken });
    for (const a of data.apps || []) {
      keys.push(
        tracker.registerApp({
          store: 'google',
          accountId: account.id,
          appId: a.packageName,
          bundleOrPackage: a.packageName,
          name: a.displayName || a.packageName,
          platform: 'android',
        })
      );
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return keys;
}

export async function fetchTracks(account, packageName) {
  const { publisher } = apisFor(account);
  const edit = await publisher.edits.insert({ packageName, requestBody: {} });
  const editId = edit.data.id;
  try {
    const { data } = await publisher.edits.tracks.list({ packageName, editId });
    return data.tracks || [];
  } finally {
    publisher.edits.delete({ packageName, editId }).catch(() => {});
  }
}

const ACTIVE = new Set(['completed', 'inProgress', 'halted']);

/** Pure: given a track and the previous channel state, work out what to record. */
export function deriveTrackState(track, prev, { initialized }) {
  const releases = track.releases || [];
  const active = releases.find((r) => ACTIVE.has(r.status));
  const draft = releases.find((r) => r.status === 'draft');
  const rel = active || draft;
  if (!rel) return null;
  const codes = (rel.versionCodes || []).map(String).sort().join(',');
  const version = rel.name || codes;
  const extra = { versionCodes: codes, releaseStatus: rel.status, userFraction: rel.userFraction ?? null };
  const fresh = (st) => ({ version, status: st, extra });

  if (!active) return fresh('DRAFT');
  const prevCodes = prev?.extra?.versionCodes;
  if (!prev) {
    if (!initialized) return fresh(rel.status === 'halted' ? 'HALTED' : rel.status === 'inProgress' ? 'ROLLOUT' : 'LIVE');
    return fresh('SENT_FOR_REVIEW');
  }
  if (prevCodes !== codes || prev.extra?.releaseStatus === 'draft') return fresh('SENT_FOR_REVIEW');
  if (rel.status === 'halted') return fresh('HALTED');
  if (prev.status === 'HALTED') return fresh(rel.status === 'inProgress' ? 'ROLLOUT' : 'LIVE');
  // Rollout reached 100%: completed release that we knew as live/rollout
  if (prev.status === 'ROLLOUT' && rel.status === 'completed') return fresh('LIVE');
  // Approved via email but still in staged rollout
  const cat = describe('google', track.track, prev.status).category;
  if ((cat === 'approved' || prev.status === 'LIVE') && rel.status === 'inProgress' && prev.status !== 'ROLLOUT' && prev.status !== 'READY_TO_PUBLISH')
    return fresh('ROLLOUT');
  // otherwise keep whatever Gmail told us; only refresh extras
  return { version: prev.version, status: prev.status, extra };
}

export async function pollPlayApp(account, tracker, packageName) {
  const key = appKeyOf('google', account.id, packageName);
  const tracks = await fetchTracks(account, packageName);
  const initialized = tracker.isInitialized(account.id);
  for (const t of tracks) {
    const prev = tracker.d.channels[key]?.[t.track];
    const next = deriveTrackState(t, prev, { initialized });
    if (next) await tracker.update(key, t.track, next);
  }
}

export async function pollPlayAccount(account, tracker) {
  const apps = Object.values(tracker.d.apps).filter((a) => a.store === 'google' && a.accountId === account.id && !a.hidden);
  const results = await mapLimit(apps, 3, (a) => pollPlayApp(account, tracker, a.appId));
  const failed = results.filter((r) => r?.error);
  if (failed.length && failed.length === apps.length) throw failed[0].error;
  for (const f of failed) console.warn(`[play:${account.id}] app poll failed:`, f.error.message);
  return { apps: apps.length, failed: failed.length };
}
