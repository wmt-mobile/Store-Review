// Apple: App Store versions + TestFlight builds for every app in every team.
import { appleClient, iconFromToken } from './client.js';
import { appKeyOf, mapLimit } from '../util.js';

const REMOVED = new Set(['DEVELOPER_REMOVED_FROM_SALE', 'REMOVED_FROM_SALE']);
const LIVE = new Set(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION']);

/** Pure: pick the current App Store state from an appStoreVersions response. */
export function pickAppStoreState(versionsResp, submissionsResp) {
  const versions = (versionsResp?.data || []).map((v) => ({
    id: v.id,
    version: v.attributes.versionString,
    platform: v.attributes.platform,
    build: (versionsResp.included || []).find((i) => i.type === 'builds' && i.id === v.relationships?.build?.data?.id)?.attributes?.version,
    created: Date.parse(v.attributes.createdDate || 0) || 0,
    state: REMOVED.has(v.attributes.appStoreState)
      ? v.attributes.appStoreState
      : v.attributes.appVersionState || v.attributes.appStoreState,
  }));
  if (!versions.length) return null;
  const platform = versions.some((v) => v.platform === 'IOS') ? 'IOS' : versions[0].platform;
  const mine = versions.filter((v) => v.platform === platform).sort((a, b) => b.created - a.created);
  const current = mine[0];
  const live = mine.find((v) => LIVE.has(v.state));

  let submittedAt = null;
  for (const s of submissionsResp?.data || []) {
    const vid = s.relationships?.appStoreVersionForReview?.data?.id;
    if (vid === current.id && s.attributes?.submittedDate) submittedAt = Date.parse(s.attributes.submittedDate);
  }
  return {
    version: current.version,
    status: current.state,
    submittedAt,
    extra: { platform, build: current.build, liveVersion: live && live.id !== current.id ? live.version : undefined },
  };
}

/** Pure: TestFlight state from the latest builds response. */
export function pickTestflightState(buildsResp) {
  const b = buildsResp?.data?.[0];
  if (!b) return null;
  const inc = buildsResp.included || [];
  const find = (rel) => {
    const ref = b.relationships?.[rel]?.data;
    return ref ? inc.find((i) => i.type === ref.type && i.id === ref.id) : null;
  };
  const pre = find('preReleaseVersion');
  const review = find('betaAppReviewSubmission');
  const detail = find('buildBetaDetail');
  const ps = b.attributes.processingState;
  let status;
  if (ps === 'FAILED' || ps === 'INVALID') status = 'PROCESSING_FAILED';
  else if (ps === 'PROCESSING') status = 'PROCESSING';
  else if (review?.attributes?.betaReviewState) status = review.attributes.betaReviewState;
  else if (detail?.attributes?.externalBuildState === 'READY_FOR_BETA_SUBMISSION') status = 'READY_FOR_BETA_SUBMISSION';
  else status = 'INTERNAL_ONLY';
  return {
    version: pre ? `${pre.attributes.version} (${b.attributes.version})` : b.attributes.version,
    status,
    submittedAt: review?.attributes?.submittedDate ? Date.parse(review.attributes.submittedDate) : null,
    iconUrl: iconFromToken(b.attributes.iconAssetToken),
  };
}

export async function discoverAppleApps(account, tracker) {
  const res = await appleClient(account).listApps();
  return res.data.map((a) =>
    tracker.registerApp({
      store: 'apple',
      accountId: account.id,
      appId: a.id,
      bundleOrPackage: a.attributes.bundleId,
      name: a.attributes.name,
      platform: 'ios',
    })
  );
}

export async function pollAppleApp(account, tracker, appId) {
  const client = appleClient(account);
  const key = appKeyOf('apple', account.id, appId);
  const [versions, builds] = await Promise.all([client.appStoreVersions(appId), client.latestBuilds(appId).catch(() => null)]);

  let as = pickAppStoreState(versions, null);
  if (as && ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'READY_FOR_REVIEW'].includes(as.status)) {
    const subs = await client.reviewSubmissions(appId).catch(() => null);
    as = pickAppStoreState(versions, subs);
  }
  if (as) await tracker.update(key, 'appstore', as);

  const tf = pickTestflightState(builds);
  if (tf) {
    if (tf.iconUrl && !tracker.d.apps[key].iconUrl) tracker.d.apps[key].iconUrl = tf.iconUrl;
    await tracker.update(key, 'testflight', { version: tf.version, status: tf.status, submittedAt: tf.submittedAt });
  }
}

export async function pollAppleAccount(account, tracker) {
  const keys = Object.values(tracker.d.apps).filter((a) => a.store === 'apple' && a.accountId === account.id && !a.hidden);
  const results = await mapLimit(keys, 4, (a) => pollAppleApp(account, tracker, a.appId));
  const failed = results.filter((r) => r?.error);
  if (failed.length && failed.length === keys.length) throw failed[0].error;
  for (const f of failed) console.warn(`[apple:${account.id}] app poll failed:`, f.error.message);
  return { apps: keys.length, failed: failed.length };
}
