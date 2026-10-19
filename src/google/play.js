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

/** Pure: version name of a Play release ("193 (1.3.80)" → "1.3.80", "1.0.0" → "1.0.0"). */
export function releaseVersionName(name) {
  const v = String(name || '').trim();
  const m = v.match(/^\d+\s*\((.+)\)$/);
  if (m) return m[1].trim();
  return /^\d+$/.test(v) ? '' : v;
}

/** Pure: the "Current version" shown on the public Play Store page. */
export function parseListingVersion(html) {
  const m = String(html || '').match(/\[\[\["(\d+(?:\.\d+)+[^"]{0,40})"\]\]/);
  return m ? m[1] : null;
}

/**
 * Fallback only: once the public store page shows the new version, the release is published.
 * Used when the release lifecycle endpoint below is unavailable.
 */
export async function publicPlayVersion(packageName) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}&hl=en&gl=IN`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'en' },
    });
    return res.ok ? parseListingVersion(await res.text()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Review state of each release in a track (applications.tracks.releases.list).
 * The edits/tracks API shows a release as "completed" from submission until it's live;
 * only this endpoint tells in review / approved (ready to publish) / rejected / published.
 * Not in the googleapis client yet, so it's called directly.
 */
export async function fetchReleaseStates(account, packageName, track) {
  const { publisher } = apisFor(account);
  const client = await publisher.context._options.auth.getClient();
  const { data } = await client.request({
    url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/tracks/${encodeURIComponent(track)}/releases`,
  });
  return data.releases || [];
}

const LIFECYCLE = {
  RELEASE_LIFECYCLE_STATE_IN_REVIEW: 'IN_REVIEW',
  RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED: 'READY_TO_PUBLISH',
  RELEASE_LIFECYCLE_STATE_NOT_APPROVED: 'REJECTED',
  RELEASE_LIFECYCLE_STATE_PUBLISHED: 'LIVE',
};

/** Pure: status for our current release from the lifecycle list, or null to keep the derived one. */
export function lifecycleStatus(releases, next) {
  const codes = String(next.extra?.versionCodes || '').split(',').filter(Boolean);
  const rel = (releases || []).find(
    (r) => r.releaseName === next.version || (codes.length && (r.activeArtifacts || []).some((a) => codes.includes(String(a.versionCode))))
  );
  const st = rel && LIFECYCLE[rel.releaseLifecycleState];
  if (!st) return null;
  if (st === 'LIVE') {
    if (next.status === 'HALTED') return 'HALTED';
    return next.extra?.releaseStatus === 'inProgress' ? 'ROLLOUT' : 'LIVE';
  }
  return st;
}

/** Mirror the release lifecycle into the listing state while no new build is pending. */
export async function listingFromLifecycle(tracker, key, st) {
  const cur = tracker.d.channels[key]?.production?.extra?.listing;
  if (['IN_REVIEW', 'READY_TO_PUBLISH', 'REJECTED'].includes(st)) return tracker.updateListing(key, { status: st });
  // published again after a listing review → "changes published"
  if (['LIVE', 'ROLLOUT'].includes(st) && cur && ['submitted', 'in_review', 'approved'].includes(cur.category)) return tracker.updateListing(key, { status: 'LIVE' });
}

export async function pollPlayApp(account, tracker, packageName) {
  const key = appKeyOf('google', account.id, packageName);
  const tracks = await fetchTracks(account, packageName);
  const initialized = tracker.isInitialized(account.id);
  for (const t of tracks) {
    const prev = tracker.d.channels[key]?.[t.track];
    const next = deriveTrackState(t, prev, { initialized });
    if (!next) continue;
    if (t.track === 'production' && next.status !== 'DRAFT') {
      let releases = null;
      try {
        releases = await fetchReleaseStates(account, packageName, t.track);
      } catch (e) {
        console.warn(`[play] release states for ${packageName}:`, e.message);
      }
      const st = releases && lifecycleStatus(releases, next);
      if (!tracker.playBuildPending(key, next.extra?.versionCodes)) {
        // Same build, already fully live: a review now is a store-listing / app-content change. Keep the build status.
        await listingFromLifecycle(tracker, key, st);
      } else if (st) next.status = st;
      else if (!releases && ['submitted', 'in_review', 'approved'].includes(describe('google', t.track, next.status).category)) {
        const name = releaseVersionName(next.version);
        const onStore = name ? await publicPlayVersion(packageName) : null;
        if (onStore === name) next.status = next.extra.releaseStatus === 'inProgress' ? 'ROLLOUT' : 'LIVE';
      }
    }
    await tracker.update(key, t.track, next);
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
