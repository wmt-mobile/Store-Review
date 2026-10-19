// Google Play: build releases vs store-listing / app-content changes reviewed without a new build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../src/store.js';
import { Tracker } from '../src/tracker.js';
import { buildDashboard } from '../src/dashboard/view.js';
import { listingFromLifecycle } from '../src/google/play.js';
import { config } from '../src/config.js';

function setup() {
  const sent = [];
  const events = [];
  const store = memoryStore();
  const tracker = new Tracker({
    store,
    accountById: (id) => ({ id, name: `Acc ${id}` }),
    config: { silentFirstRun: false, chatWebhook: 'https://example.invalid', apps: [] },
    send: async (msg) => sent.push(msg),
    onEvent: (type, e) => type === 'status' && events.push(e),
  });
  const key = tracker.registerApp({ store: 'google', accountId: 'p', appId: 'com.wmt.telfon', name: 'Telfon' });
  tracker.registerApp({ store: 'google', accountId: 'p', appId: 'com.wmt.other', name: 'Other' }); // not a brand-new account
  const build = (codes, status, name = `${codes} (1.3.${codes})`) => tracker.update(key, 'production', { version: name, status, extra: { versionCodes: String(codes), releaseStatus: 'completed' } });
  const texts = () => sent.map((m) => m.chatText);
  return { tracker, store, key, build, sent, events, texts };
}

test('play listing: a new build posts its whole flow and closes the cycle when live', async () => {
  const { tracker, key, build, sent } = setup();
  await build(193, 'SENT_FOR_REVIEW');
  assert.equal(tracker.playBuildPending(key, '193'), true);
  await build(193, 'IN_REVIEW');
  await build(193, 'READY_TO_PUBLISH');
  await build(193, 'LIVE');
  assert.equal(sent.length, 4);
  assert.equal(tracker.playBuildPending(key, '193'), false);
  assert.equal(tracker.playBuildPending(key, '194'), true, 'new codes = a new build');
});

test('play listing: approval email for the live build posts as a store-listing update, build stays live, no fake "Live" afterwards', async () => {
  const { tracker, key, build, sent, events, texts, store } = setup();
  await build(193, 'SENT_FOR_REVIEW');
  await build(193, 'LIVE');
  sent.length = 0;
  events.length = 0;

  assert.equal(tracker.playBuildPending(key, '193'), false);
  await tracker.updateListing(key, { status: 'READY_TO_PUBLISH', eventId: 'gmail:1', extra: { emailUrl: 'https://mail/x' } });
  const ch = store.data.channels[key].production;
  assert.equal(ch.status, 'LIVE');
  assert.equal(ch.version, '193 (1.3.193)');
  assert.equal(ch.extra.listing.status, 'READY_TO_PUBLISH');
  assert.equal(sent.length, 1);
  assert.match(texts()[0], /^☑️ {2}\*Approved · ready to publish\*\nTelfon · Google Play\n/);
  assert.match(texts()[0], /🗂️ {2}\*Changes\*\nStore listing \/ app content \(no new build\)/);
  assert.match(texts()[0], /📦 {2}\*Version\*/);
  assert.equal(events[0].listing, true);
  assert.equal(events[0].notify, true);

  // the API reports the same approval → no second post
  await listingFromLifecycle(tracker, key, 'READY_TO_PUBLISH');
  assert.equal(sent.length, 1);
  // published → "changes published" once, and never a build "Live" post
  await listingFromLifecycle(tracker, key, 'LIVE');
  await listingFromLifecycle(tracker, key, 'LIVE');
  assert.equal(sent.length, 2);
  assert.match(texts()[1], /^🚀 {2}\*Live\*/);
  assert.match(texts()[1], /Store listing \/ app content/);
  assert.equal(store.data.channels[key].production.status, 'LIVE');
  // history marks listing entries
  const hist = store.data.history[key].filter((h) => h.kind === 'listing').map((h) => h.to);
  assert.deepEqual(hist, ['LIVE', 'READY_TO_PUBLISH']);
});

test('play listing: Data safety rejection posts with AI summary and shows in Needs attention', async () => {
  const { tracker, key, build, sent, texts, store } = setup();
  await build(193, 'SENT_FOR_REVIEW');
  await build(193, 'LIVE');
  sent.length = 0;
  const base = config.publicBaseUrl;
  config.publicBaseUrl = 'https://radar.test';
  const ai = { title: 'Data safety form mismatch', issues: ['Location data not declared'], fixes: ['Update the Data safety form'], deadline: null };
  await tracker.updateListing(key, { status: 'REJECTED', reason: 'Data safety', eventId: 'gmail:2', extra: { ai, messageId: 'm2', mailSubject: 'Action required', mailText: 'Full email text' } });
  assert.equal(sent.length, 1);
  assert.match(texts()[0], /^🚫 {2}\*Rejected\*\nTelfon · Google Play · /);
  assert.match(texts()[0], /🗂️ {2}\*Changes\*/);
  assert.match(texts()[0], /Data safety form mismatch/);
  assert.match(texts()[0], /Full email text/);
  assert.match(texts()[0], /resolve=google%3Ap%3Acom\.wmt\.telfon%7Cproduction%7Clisting/);
  config.publicBaseUrl = base;

  const dash = buildDashboard(store.data, [{ id: 'p', name: 'Play', store: 'google' }]);
  const row = dash.attention.find((r) => r.listing);
  assert.ok(row);
  assert.equal(row.rawVersion, 'listing');
  assert.equal(row.version, 'Store listing');
  assert.equal(row.ai.title, 'Data safety form mismatch');
  assert.equal(row.liveBuild, '1.3.193 (193)');
  const app = dash.apps.find((a) => a.key === key);
  assert.equal(app.channels.production.category, 'live');
  assert.equal(app.channels.production.listing.category, 'rejected');
  assert.ok(dash.activity.some((a) => a.listing && a.status === 'REJECTED'));
  // the same email again is ignored
  await tracker.updateListing(key, { status: 'REJECTED', eventId: 'gmail:2' });
  assert.equal(sent.length, 1);
});

test('play listing: in review from the API posts once; review stats ignore listing reviews', async () => {
  const { tracker, key, build, sent, store } = setup();
  await build(193, 'SENT_FOR_REVIEW');
  await build(193, 'LIVE');
  sent.length = 0;
  await listingFromLifecycle(tracker, key, 'IN_REVIEW');
  await listingFromLifecycle(tracker, key, 'IN_REVIEW');
  assert.equal(sent.length, 1);
  assert.match(sent[0].chatText, /^🔎 {2}\*In review\*/);
  assert.match(sent[0].chatText, /🗂️ {2}\*Changes\*/);
  const dash = buildDashboard(store.data, [{ id: 'p', name: 'Play', store: 'google' }]);
  assert.ok(dash.pending.some((r) => r.listing && r.category === 'in_review'));
  // nothing happens when the release is simply published and no listing review is active
  const fresh = setup();
  await fresh.build(5, 'SENT_FOR_REVIEW');
  await fresh.build(5, 'LIVE');
  fresh.sent.length = 0;
  await listingFromLifecycle(fresh.tracker, fresh.key, 'LIVE');
  assert.equal(fresh.sent.length, 0);
});

test('play listing: existing apps seed the cycle — a build awaiting publish keeps posting, a live one is settled', async () => {
  const { tracker, key, store, sent } = setup();
  // state saved before this feature existed: no meta.playCycle
  store.data.channels[key] = { production: { version: '193 (1.3.80)', status: 'READY_TO_PUBLISH', since: 1, extra: { versionCodes: '193', releaseStatus: 'completed' } } };
  assert.equal(tracker.playBuildPending(key, '193'), true);
  await tracker.update(key, 'production', { version: '193 (1.3.80)', status: 'LIVE', extra: { versionCodes: '193', releaseStatus: 'completed' } });
  assert.equal(sent.length, 1);
  assert.match(sent[0].chatText, /Live/);
  assert.equal(tracker.playBuildPending(key, '193'), false);

  const other = setup();
  other.store.data.channels[other.key] = { production: { version: '50 (2.0)', status: 'LIVE', since: 1, extra: { versionCodes: '50', releaseStatus: 'completed' } } };
  assert.equal(other.tracker.playBuildPending(other.key, '50'), false);
  // a completed release that an old listing email had marked "rejected" is settled too
  const old = setup();
  old.store.data.channels[old.key] = { production: { version: '7 (1.0)', status: 'REJECTED', since: 1, extra: { versionCodes: '7', releaseStatus: 'completed' } } };
  assert.equal(old.tracker.playBuildPending(old.key, '7'), false);
});

test('play listing: a new build after listing changes posts the build flow again', async () => {
  const { tracker, key, build, sent } = setup();
  await build(193, 'SENT_FOR_REVIEW');
  await build(193, 'LIVE');
  await tracker.updateListing(key, { status: 'IN_REVIEW' });
  sent.length = 0;
  await build(194, 'SENT_FOR_REVIEW');
  assert.equal(tracker.playBuildPending(key, '194'), true);
  await build(194, 'IN_REVIEW');
  assert.equal(sent.length, 2);
  assert.doesNotMatch(sent[0].chatText, /Changes\*/);
});

test('play listing: push text says store listing, not a build', async () => {
  const { pushMessage } = await import('../src/push.js');
  const app = { name: 'Telfon', store: 'google' };
  const m = pushMessage({ app, channel: 'production', version: '193 (1.3.80)', to: 'READY_TO_PUBLISH', extra: {}, listing: true });
  assert.equal(m.title, 'Telfon approved');
  assert.match(m.body, /App content changes$/);
  const r = pushMessage({ app, channel: 'production', version: '193', to: 'REJECTED', extra: { ai: {} }, listing: true });
  assert.equal(r.title, 'Telfon rejected');
});

test('play listing: marked in review from the dashboard with a note; the email result keeps the note', async () => {
  const { tracker, key, build, sent, store } = setup();
  await build(11, 'SENT_FOR_REVIEW');
  await build(11, 'LIVE');
  sent.length = 0;
  await tracker.updateListing(key, { status: 'IN_REVIEW', extra: { note: 'Ads declaration', by: 'mobile@webmobtech.com' } });
  assert.match(sent[0].chatText, /^🔎 {2}\*In review\*/);
  assert.match(sent[0].chatText, /App content · Ads declaration/);
  await tracker.updateListing(key, { status: 'READY_TO_PUBLISH', eventId: 'gmail:9' });
  assert.equal(store.data.channels[key].production.extra.listing.note, 'Ads declaration');
  assert.match(sent[1].chatText, /^☑️ {2}\*Approved · ready to publish\*[\s\S]*App content · Ads declaration/);
  assert.equal(tracker.clearListing(key), true);
  assert.equal(store.data.channels[key].production.extra.listing, undefined);
  assert.equal(store.data.channels[key].production.status, 'LIVE');
});

test('gmail: support-ticket replies are not review results', async () => {
  const { parsePlayEmail } = await import('../src/google/gmail-parser.js');
  const known = { packages: ['com.wmt.arkiq.android'] };
  const r = parsePlayEmail({ subject: 'Re: [5-7491000042269] - Google Play Developer Support [com.wmt.arkiq.android]', body: 'Your app is currently under review. We will get back to you.' }, known);
  assert.equal(r.packageName, 'com.wmt.arkiq.android');
  assert.equal(r.status, null);
  assert.equal(parsePlayEmail({ subject: 'Re: [5-7491000042269] Google Play Developer Support Survey', body: 'approved' }, known).status, null);
  assert.equal(parsePlayEmail({ subject: 'Your changes are ready to publish', body: 'arkIQ (com.wmt.arkiq.android)' }, known).status, 'READY_TO_PUBLISH');
});
