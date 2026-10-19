// Pure: builds the dashboard model from store data.
import { describe, channelLabel, isPending, CATEGORY_ORDER, RELEASE_CHANNELS } from '../status-map.js';
import { primaryConsoleUrl, consoleLinks } from '../links.js';
import { displayVersion } from '../util.js';

const CH_ORDER = ['appstore', 'production'];
const isRelease = (ch) => RELEASE_CHANNELS.has(ch);

const tail = (v, n = 4) => (v ? String(v).slice(-n) : null);
const CHECK_TEXT = (c) => (c.ok ? `${c.apps ?? 0} apps · ${c.changes ? `${c.changes} change${c.changes === 1 ? '' : 's'}` : 'no changes'}` : c.error || 'Check failed');

export function buildDashboard(data, accounts, { now = Date.now(), stuckHours = 48, intervals = {} } = {}) {
  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const apps = [];
  const pending = [];
  const attention = [];
  const summary = { inReview: 0, waiting: 0, attention: 0, approved: 0, live: 0, stuck: 0, apps: 0, accounts: accounts.length };

  for (const app of Object.values(data.apps || {})) {
    if (app.hidden) continue;
    const account = accById[app.accountId];
    const chState = data.channels?.[app.key] || {};
    const channels = {};
    const order = Object.keys(chState).filter(isRelease).sort((a, b) => (CH_ORDER.indexOf(a) + 1 || 99) - (CH_ORDER.indexOf(b) + 1 || 99));
    let best = 'none';
    for (const ch of order) {
      const s = chState[ch];
      const d = describe(app.store, ch, s.status);
      const elapsed = s.submittedAt && isPending(d.category) ? now - s.submittedAt : null;
      const c = {
        channel: ch,
        channelLabel: channelLabel(ch),
        version: s.version ? displayVersion(app.store, s.version, s.extra) : '',
        rawVersion: s.version || '',
        status: s.status,
        label: d.label,
        emoji: d.emoji,
        category: d.category,
        since: s.since,
        submittedAt: s.submittedAt || null,
        elapsedMs: elapsed,
        reviewMs: s.reviewMs || null,
        stuck: elapsed != null && elapsed > stuckHours * 3_600_000,
        reason: s.reason || null,
        liveVersion: s.extra?.liveVersion || null,
        userFraction: s.extra?.userFraction ?? null,
        emailUrl: s.extra?.emailUrl || null,
        ...(['rejected', 'action', 'removed'].includes(d.category)
          ? { ai: s.extra?.ai || null, messageId: s.extra?.messageId || null, mailSubject: s.extra?.mailSubject || null }
          : {}),
        url: consoleLinks(app, account, ch)[0]?.url,
      };
      // Google Play store-listing / app-content review (no new build), shown next to the build status
      const L = s.extra?.listing;
      if (L && !(L.category === 'live' && now - L.since > 7 * 86_400_000)) {
        const ld = describe(app.store, ch, L.status);
        const lElapsed = L.submittedAt && isPending(ld.category) ? now - L.submittedAt : null;
        c.listing = {
          status: L.status,
          label: ld.category === 'live' ? 'Changes published' : ld.label,
          category: ld.category,
          since: L.since,
          submittedAt: L.submittedAt || null,
          elapsedMs: lElapsed,
          reviewMs: L.reviewMs || null,
          reason: L.reason || null,
          note: L.note || null,
          emailUrl: L.emailUrl || null,
          ...(['rejected', 'action', 'removed'].includes(ld.category) ? { ai: L.ai || null, messageId: L.messageId || null, mailSubject: L.mailSubject || null } : {}),
        };
        const lrow = {
          appKey: app.key, appName: app.name, iconUrl: app.iconUrl, store: app.store, accountId: app.accountId, accountName: account?.name || app.accountId,
          channel: ch, channelLabel: 'Store listing', version: 'Store listing', rawVersion: 'listing', liveBuild: c.version, listing: true,
          status: L.status, label: c.listing.label, emoji: ld.emoji, category: ld.category, since: L.since, submittedAt: c.listing.submittedAt,
          elapsedMs: lElapsed, reviewMs: c.listing.reviewMs, stuck: lElapsed != null && lElapsed > stuckHours * 3_600_000,
          reason: c.listing.reason, emailUrl: c.listing.emailUrl, ai: c.listing.ai || null, messageId: c.listing.messageId || null, mailSubject: c.listing.mailSubject || null,
          url: c.url,
        };
        if (isPending(ld.category)) {
          pending.push(lrow);
          if (ld.category === 'in_review') summary.inReview++;
          else summary.waiting++;
        } else if (['rejected', 'action', 'removed'].includes(ld.category)) {
          attention.push(lrow);
          summary.attention++;
        }
      }
      channels[ch] = c;
      if (CATEGORY_ORDER.indexOf(d.category) < CATEGORY_ORDER.indexOf(best)) best = d.category;

      const row = { appKey: app.key, appName: app.name, iconUrl: app.iconUrl, store: app.store, accountId: app.accountId, accountName: account?.name || app.accountId, ...c };
      if (isPending(d.category)) {
        pending.push(row);
        if (d.category === 'in_review') summary.inReview++;
        else summary.waiting++;
        if (c.stuck) summary.stuck++;
      } else if (['rejected', 'action', 'removed'].includes(d.category)) {
        attention.push(row);
        summary.attention++;
      } else if (d.category === 'approved') summary.approved++;
    }
    // "live" = public store listing is live (TestFlight / test tracks don't count)
    const pub = channels.appstore || channels.production;
    if (pub && (pub.category === 'live' || pub.liveVersion)) summary.live++;
    summary.apps++;
    apps.push({
      key: app.key,
      name: app.name,
      store: app.store,
      bundleOrPackage: app.bundleOrPackage,
      accountId: app.accountId,
      iconUrl: app.iconUrl || null,
      consoleUrl: primaryConsoleUrl(app, account),
      topCategory: best,
      channels,
      history: (data.history?.[app.key] || []).filter((h) => isRelease(h.channel)).slice(0, 20).map((h) => {
        const to = describe(app.store, h.channel, h.to);
        const from = h.from ? describe(app.store, h.channel, h.from) : null;
        return { ...h, ...(h.kind === 'listing' ? { version: 'Store listing' } : {}), listing: h.kind === 'listing', channelLabel: h.kind === 'listing' ? 'Store listing' : channelLabel(h.channel), toLabel: `${to.emoji} ${to.label}`, fromLabel: from ? `${from.emoji} ${from.label}` : null, category: to.category };
      }),
    });
  }

  pending.sort((a, b) => (b.elapsedMs || 0) - (a.elapsedMs || 0));
  attention.sort((a, b) => (b.since || 0) - (a.since || 0));
  apps.sort((a, b) => CATEGORY_ORDER.indexOf(a.topCategory) - CATEGORY_ORDER.indexOf(b.topCategory) || a.name.localeCompare(b.name));

  return {
    generatedAt: now,
    stuckHours,
    summary,
    accounts: accounts.map((a) => {
      const st = data.accounts?.[a.id] || {};
      const intervalMin = Math.round((a.store === 'apple' ? intervals.apple : intervals.play) / 60_000) || null;
      return {
        id: a.id,
        name: a.name || a.id,
        store: a.store,
        appCount: apps.filter((x) => x.accountId === a.id).length,
        lastPollAt: st.lastPollAt || null,
        lastDiscoveryAt: st.lastDiscoveryAt || null,
        error: st.error || null,
        errorAt: st.errorAt || null,
        warning: st.discoveryWarning || null,
        // safe hints only (never the key itself)
        keyHint: tail(a.keyId),
        issuerHint: tail(a.issuerId),
        clientEmail: a.clientEmail || a.serviceAccount?.client_email || null,
        developerId: a.developerId || null,
        createdAt: a.createdAt ? Date.parse(a.createdAt) || a.createdAt : null,
        intervalMin,
        nextCheckAt: st.lastPollAt && intervalMin ? st.lastPollAt + intervalMin * 60_000 : null,
        checks: (data.meta?.checks?.[a.id] || []).slice(0, 24),
      };
    }),
    recentChecks: accounts
      .flatMap((a) => (data.meta?.checks?.[a.id] || []).slice(0, 12).map((c) => ({ ...c, accountId: a.id, accountName: a.name || a.id, store: a.store, text: CHECK_TEXT(c) })))
      .sort((x, y) => y.at - x.at)
      .slice(0, 12),
    resolved: data.meta?.resolved || {},
    snoozed: Object.fromEntries(Object.entries(data.meta?.snoozed || {}).filter(([, until]) => until > now)),
    pending,
    attention,
    apps,
    activity: buildActivity(data, accById, now),
    stats: buildStats(data, now),
  };
}

/** Latest status changes across every app (newest first). */
function buildActivity(data, accById, now, limit = 120) {
  const out = [];
  for (const app of Object.values(data.apps || {})) {
    if (app.hidden) continue;
    for (const h of data.history?.[app.key] || []) {
      if (now - h.at > 30 * 86_400_000 || !isRelease(h.channel)) continue;
      const to = describe(app.store, h.channel, h.to);
      const from = h.from ? describe(app.store, h.channel, h.from) : null;
      out.push({
        id: `${app.key}|${h.channel}|${h.at}|${h.to}${h.kind === 'listing' ? '|listing' : ''}`,
        at: h.at,
        appKey: app.key,
        appName: app.name,
        iconUrl: app.iconUrl || null,
        store: app.store,
        accountId: app.accountId,
        accountName: accById[app.accountId]?.name || app.accountId,
        channel: h.channel,
        channelLabel: channelLabel(h.channel),
        version: h.kind === 'listing' ? 'Store listing' : h.version ? displayVersion(app.store, h.version, h.version === data.channels?.[app.key]?.[h.channel]?.version ? data.channels[app.key][h.channel].extra : {}) : '',
        rawVersion: h.kind === 'listing' ? 'listing' : h.version || '',
        userFraction: h.to === 'ROLLOUT' && h.version === data.channels?.[app.key]?.[h.channel]?.version ? data.channels[app.key][h.channel].extra?.userFraction ?? null : null,
        status: h.to,
        fromStatus: h.from || null,
        category: to.category,
        label: to.label,
        emoji: to.emoji,
        fromLabel: from?.label || null,
        reason: h.reason || null,
        listing: h.kind === 'listing',
      });
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Review durations (submission → result) and outcomes over the last 90 days. */
function buildStats(data, now) {
  const durations = { appstore: [], testflight: [], play: [] };
  let approved30 = 0;
  let rejected30 = 0;
  let submitted7 = 0;
  for (const app of Object.values(data.apps || {})) {
    if (app.hidden) continue;
    const hist = (data.history?.[app.key] || []).filter((h) => isRelease(h.channel) && h.kind !== 'listing').sort((a, b) => a.at - b.at);
    const start = {};
    for (const h of hist) {
      const cat = describe(app.store, h.channel, h.to).category;
      const group = app.store === 'google' ? 'play' : h.channel === 'testflight' ? 'testflight' : 'appstore';
      if (isPending(cat)) {
        start[h.channel] ??= h.at;
        if (cat === 'submitted' && now - h.at < 7 * 86_400_000) submitted7++;
      } else if (['approved', 'live', 'rejected'].includes(cat)) {
        if (start[h.channel] != null && now - h.at < 90 * 86_400_000) durations[group].push(h.at - start[h.channel]);
        if (start[h.channel] != null && now - h.at < 30 * 86_400_000) cat === 'rejected' ? rejected30++ : approved30++;
        delete start[h.channel];
      }
    }
  }
  const decided = approved30 + rejected30;
  return {
    medianReviewMs: { appstore: median(durations.appstore), testflight: median(durations.testflight), play: median(durations.play) },
    samples: { appstore: durations.appstore.length, testflight: durations.testflight.length, play: durations.play.length },
    approved30,
    rejected30,
    approvalRate30: decided ? approved30 / decided : null,
    submitted7,
  };
}
