import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe } from '../src/status-map.js';
import { parsePlayEmail } from '../src/google/gmail-parser.js';
import { memoryStore } from '../src/store.js';
import { Tracker } from '../src/tracker.js';
import { buildDashboard } from '../src/dashboard/view.js';
import { verifySignature } from '../src/apple/webhook.js';
import { pickAppStoreState, pickTestflightState } from '../src/apple/poller.js';
import { deriveTrackState } from '../src/google/play.js';
import { digestDue } from '../src/digest.js';

const mkTracker = (silent = true) => {
  const sent = [];
  const store = memoryStore();
  const tracker = new Tracker({
    store,
    accountById: (id) => ({ id, name: `Acc ${id}` }),
    config: { silentFirstRun: silent, chatWebhook: 'https://example.invalid', apps: [] },
    send: async (msg, opts) => sent.push({ msg, opts }),
  });
  return { tracker, store, sent };
};

// ── status map ──
test('status map categories', () => {
  assert.equal(describe('apple', 'appstore', 'IN_REVIEW').category, 'in_review');
  assert.equal(describe('apple', 'appstore', 'METADATA_REJECTED').category, 'rejected');
  assert.equal(describe('apple', 'testflight', 'WAITING_FOR_REVIEW').category, 'submitted');
  assert.equal(describe('google', 'production', 'READY_TO_PUBLISH').category, 'approved');
  assert.equal(describe('google', 'production', undefined).label, 'No submission');
  assert.equal(describe('apple', 'appstore', 'SOMETHING_NEW').category, 'none');
});

// ── gmail parser ──
const known = { packages: ['com.wmt.troopool', 'com.clientx.shop'], names: { Troopool: 'com.wmt.troopool', ShopEase: 'com.clientx.shop' } };

test('gmail: rejection with policy reason', () => {
  const r = parsePlayEmail(
    {
      subject: 'Action Required: Your app Troopool (com.wmt.troopool) has been rejected',
      body: 'Hi Developers at WebMob,\n\nAfter review, Troopool, com.wmt.troopool, has been rejected for production.\n\nIssue found: Violation of Data safety policy\nYour Data safety form is inaccurate.\n\nAbout the Data safety policy\n...',
    },
    known
  );
  assert.equal(r.packageName, 'com.wmt.troopool');
  assert.equal(r.status, 'REJECTED');
  assert.equal(r.track, 'production');
  assert.match(r.reason, /Data safety/);
});

test('gmail: update live', () => {
  const r = parsePlayEmail({ subject: 'Your update to ShopEase is now live on Google Play', body: '<p>ShopEase (com.clientx.shop) version 5.2.1 is now available.</p>' }, known);
  assert.equal(r.packageName, 'com.clientx.shop');
  assert.equal(r.status, 'LIVE');
});

test('gmail: managed publishing ready', () => {
  const r = parsePlayEmail({ subject: 'Your changes are ready to publish', body: 'Changes to Troopool in closed testing have been reviewed and are ready to publish.' }, known);
  assert.equal(r.status, 'READY_TO_PUBLISH');
  assert.equal(r.track, 'alpha');
  assert.equal(r.packageName, 'com.wmt.troopool');
});

test('gmail: app removed', () => {
  const r = parsePlayEmail({ subject: 'Your app has been removed from Google Play', body: 'App: com.wmt.troopool\nReason for removal: Deceptive behavior policy' }, known);
  assert.equal(r.status, 'REMOVED');
  assert.match(r.reason, /Deceptive/);
});

test('gmail: unknown package from parentheses', () => {
  const r = parsePlayEmail({ subject: 'Update approved for New App (com.other.app)', body: '' }, known);
  assert.equal(r.packageName, 'com.other.app');
  assert.equal(r.status, 'APPROVED');
});

// ── tracker ──
test('tracker: silent first run, then notifies, dedupes and threads', async () => {
  const { tracker, sent } = mkTracker();
  const key = tracker.registerApp({ store: 'apple', accountId: 'a1', appId: '1', name: 'App' });
  await tracker.update(key, 'appstore', { version: '1.0', status: 'READY_FOR_DISTRIBUTION' });
  assert.equal(sent.length, 0, 'first run is silent');
  tracker.markInitialized('a1');

  await tracker.update(key, 'appstore', { version: '1.1', status: 'WAITING_FOR_REVIEW', at: 1000 });
  await tracker.update(key, 'appstore', { version: '1.1', status: 'WAITING_FOR_REVIEW', at: 2000 });
  assert.equal(sent.length, 1, 'same state is de-duped');

  await tracker.update(key, 'appstore', { version: '1.1', status: 'IN_REVIEW', at: 5000 });
  await tracker.update(key, 'appstore', { version: '1.1', status: 'PENDING_DEVELOPER_RELEASE', at: 9000 });
  assert.equal(sent.length, 3);
  assert.equal(sent[0].opts.threadKey, sent[2].opts.threadKey, 'same version → same thread');
  const ch = tracker.d.channels[key].appstore;
  assert.equal(ch.submittedAt, 1000);
  assert.equal(ch.reviewMs, 8000);
});

test('tracker: eventId de-dupe', async () => {
  const { tracker } = mkTracker(false);
  const key = tracker.registerApp({ store: 'google', accountId: 'g', appId: 'com.x' });
  const a = await tracker.update(key, 'production', { version: '1', status: 'SENT_FOR_REVIEW', eventId: 'gmail:1' });
  const b = await tracker.update(key, 'production', { version: '1', status: 'REJECTED', eventId: 'gmail:1' });
  assert.equal(a.changed, true);
  assert.equal(b.duplicate, true);
});

test('tracker: newly seen live app is not announced, new submission is', async () => {
  const { tracker, sent } = mkTracker();
  tracker.markInitialized('a1');
  const k1 = tracker.registerApp({ store: 'apple', accountId: 'a1', appId: '9' });
  await tracker.update(k1, 'appstore', { version: '1', status: 'READY_FOR_DISTRIBUTION' });
  assert.equal(sent.length, 0);
  await tracker.update(k1, 'appstore', { version: '2', status: 'WAITING_FOR_REVIEW' });
  assert.equal(sent.length, 1);
});

// ── dashboard view ──
test('dashboard groups pending / attention / summary', async () => {
  const { tracker, store } = mkTracker(false);
  const a = tracker.registerApp({ store: 'apple', accountId: 'a1', appId: '1', name: 'A' });
  const b = tracker.registerApp({ store: 'google', accountId: 'g1', appId: 'com.b', name: 'B' });
  tracker.registerApp({ store: 'google', accountId: 'g1', appId: 'com.c', name: 'C' });
  const now = Date.now();
  await tracker.update(a, 'appstore', { version: '2', status: 'IN_REVIEW', submittedAt: now - 50 * 3_600_000 });
  await tracker.update(b, 'production', { version: '3', status: 'REJECTED', reason: 'Policy' });
  await tracker.update(b, 'beta', { version: '3', status: 'LIVE' });
  const m = buildDashboard(store.data, [{ id: 'a1', name: 'Apple', store: 'apple' }, { id: 'g1', name: 'Play', store: 'google' }], { now, stuckHours: 48 });
  assert.equal(m.summary.apps, 3);
  assert.equal(m.summary.inReview, 1);
  assert.equal(m.summary.stuck, 1);
  assert.equal(m.summary.attention, 1);
  assert.equal(m.summary.live, 0, 'beta track is not "live in store"');
  assert.deepEqual(Object.keys(m.apps.find((x) => x.name === 'B').channels), ['production'], 'testing tracks hidden');
  assert.equal(m.pending[0].appName, 'A');
  assert.equal(m.attention[0].reason, 'Policy');
  assert.equal(m.accounts.find((x) => x.id === 'g1').appCount, 2);
});

// ── apple mapping ──
test('apple: picks newest iOS version and live version', () => {
  const r = pickAppStoreState(
    {
      data: [
        { id: 'v1', attributes: { versionString: '1.0', platform: 'IOS', appVersionState: 'READY_FOR_DISTRIBUTION', createdDate: '2026-01-01T00:00:00Z' } },
        { id: 'v2', attributes: { versionString: '1.1', platform: 'IOS', appVersionState: 'WAITING_FOR_REVIEW', createdDate: '2026-02-01T00:00:00Z' } },
      ],
    },
    { data: [{ attributes: { submittedDate: '2026-02-02T00:00:00Z' }, relationships: { appStoreVersionForReview: { data: { id: 'v2' } } } }] }
  );
  assert.equal(r.version, '1.1');
  assert.equal(r.status, 'WAITING_FOR_REVIEW');
  assert.equal(r.extra.liveVersion, '1.0');
  assert.equal(r.submittedAt, Date.parse('2026-02-02T00:00:00Z'));
});

test('apple: testflight state', () => {
  const r = pickTestflightState({
    data: [{ attributes: { version: '42', processingState: 'VALID' }, relationships: { preReleaseVersion: { data: { type: 'preReleaseVersions', id: 'p' } }, betaAppReviewSubmission: { data: { type: 'betaAppReviewSubmissions', id: 's' } } } }],
    included: [
      { type: 'preReleaseVersions', id: 'p', attributes: { version: '2.0' } },
      { type: 'betaAppReviewSubmissions', id: 's', attributes: { betaReviewState: 'IN_REVIEW' } },
    ],
  });
  assert.equal(r.version, '2.0 (42)');
  assert.equal(r.status, 'IN_REVIEW');
});

// ── play tracks ──
test('play: new release = sent for review, gmail state kept', () => {
  const t = (codes, status = 'completed') => ({ track: 'production', releases: [{ name: 'v', versionCodes: codes, status }] });
  assert.equal(deriveTrackState(t(['10']), null, { initialized: false }).status, 'LIVE');
  assert.equal(deriveTrackState(t(['11']), { status: 'LIVE', extra: { versionCodes: '10' } }, { initialized: true }).status, 'SENT_FOR_REVIEW');
  assert.equal(deriveTrackState(t(['11']), { status: 'REJECTED', version: 'v', extra: { versionCodes: '11' } }, { initialized: true }).status, 'REJECTED');
  assert.equal(deriveTrackState(t(['11'], 'halted'), { status: 'ROLLOUT', extra: { versionCodes: '11' } }, { initialized: true }).status, 'HALTED');
});

// ── webhook signature ──
test('apple webhook signature', () => {
  const body = Buffer.from('{"data":{"type":"webhookPingCreated"}}');
  const hex = crypto.createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.equal(verifySignature(body, `hmacsha256=${hex}`, 's3cret'), true);
  assert.equal(verifySignature(body, hex, 's3cret'), true);
  assert.equal(verifySignature(body, hex, 'wrong'), false);
  assert.equal(verifySignature(body, undefined, 's3cret'), false);
});

test('digest due once per day after time', () => {
  const meta = {};
  const at = (iso) => new Date(iso);
  assert.equal(digestDue(meta, { tz: 'Asia/Kolkata', digestTime: '10:00', now: at('2026-10-13T04:00:00Z') }), null); // 09:30 IST
  assert.equal(digestDue(meta, { tz: 'Asia/Kolkata', digestTime: '10:00', now: at('2026-10-13T04:31:00Z') }), '2026-10-13');
  meta.lastDigestDate = '2026-10-13';
  assert.equal(digestDue(meta, { tz: 'Asia/Kolkata', digestTime: '10:00', now: at('2026-10-13T10:00:00Z') }), null);
});

// ── encryption + admin overrides ──
test('secrets round-trip with AES-256-GCM and reject tampering', async () => {
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  const { encrypt, decrypt } = await import('../src/crypto.js');
  const blob = encrypt('-----BEGIN PRIVATE KEY-----abc');
  assert.notEqual(blob, '-----BEGIN PRIVATE KEY-----abc');
  assert.equal(decrypt(blob), '-----BEGIN PRIVATE KEY-----abc');
  const parts = blob.split(':');
  parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decrypt(parts.join(':')));
});

test('tracker keeps admin rename / mute / hide across re-discovery', async () => {
  const { tracker, sent } = mkTracker(false);
  const k = tracker.registerApp({ store: 'apple', accountId: 'a1', appId: '7', name: 'Store Name' });
  Object.assign(tracker.d.apps[k], { displayName: 'Nice Name', name: 'Nice Name', muted: true });
  tracker.registerApp({ store: 'apple', accountId: 'a1', appId: '7', name: 'Store Name' });
  assert.equal(tracker.d.apps[k].name, 'Nice Name');
  assert.equal(tracker.d.apps[k].storeName, 'Store Name');
  assert.equal(tracker.d.apps[k].muted, true);
  await tracker.update(k, 'appstore', { version: '2', status: 'IN_REVIEW' });
  assert.equal(sent.length, 0, 'muted apps never post to Chat');
});

test('only release channels post: App Store + Play production; TestFlight, testing tracks and drafts stay silent', async () => {
  const { tracker, sent } = mkTracker();
  tracker.markInitialized('a1');
  tracker.markInitialized('g1');
  const ios = tracker.registerApp({ store: 'apple', accountId: 'a1', appId: '42', name: 'New' });
  await tracker.update(ios, 'appstore', { version: '1.0', status: 'PREPARE_FOR_SUBMISSION' }); // draft → silent
  await tracker.update(ios, 'testflight', { version: '1.0 (1)', status: 'READY_FOR_BETA_SUBMISSION' }); // silent
  await tracker.update(ios, 'testflight', { version: '1.0 (1)', status: 'APPROVED' }); // silent
  await tracker.update(ios, 'appstore', { version: '1.0', status: 'WAITING_FOR_REVIEW' }); // posted
  await tracker.update(ios, 'appstore', { version: '1.0', status: 'IN_REVIEW' }); // posted
  const play = tracker.registerApp({ store: 'google', accountId: 'g1', appId: 'com.x', name: 'X' });
  await tracker.update(play, 'internal', { version: '2 (20)', status: 'SENT_FOR_REVIEW' }); // silent
  await tracker.update(play, 'alpha', { version: '2 (20)', status: 'SENT_FOR_REVIEW' }); // silent
  await tracker.update(play, 'beta', { version: '2 (20)', status: 'APPROVED' }); // silent
  await tracker.update(play, 'production', { version: '2 (20)', status: 'SENT_FOR_REVIEW' }); // posted
  await tracker.update(play, 'production', { version: '2 (20)', status: 'LIVE' }); // posted
  assert.equal(sent.length, 4);
  assert.ok(tracker.d.channels[ios].testflight, 'TestFlight is still tracked for the dashboard');
  assert.ok(tracker.d.channels[play].alpha, 'testing tracks are still tracked for the dashboard');
});

test('unclassified Play emails are forwarded, but not on the first read', async () => {
  const { tracker, sent } = mkTracker();
  const app = tracker.d.apps[tracker.registerApp({ store: 'google', accountId: 'g1', appId: 'com.x', name: 'X' })];
  assert.equal(await tracker.notifyStoreMessage({ app, subject: 'Hello' }), false);
  tracker.d.meta.gmailInitialized = true;
  assert.equal(await tracker.notifyStoreMessage({ app, subject: 'Your app has a new policy notice' }), true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].msg.text, /policy notice/);
});

test('cards become readable Chat text for "post as me"', async () => {
  const { cardToText, statusCard } = await import('../src/chat.js');
  const { describe: d } = await import('../src/status-map.js');
  const t = cardToText(statusCard({ app: { name: 'Telfon', store: 'apple', accountId: 'a' }, account: { name: 'WebMob' }, channel: 'appstore', version: '2.0', from: d('apple', 'appstore', 'WAITING_FOR_REVIEW'), to: d('apple', 'appstore', 'IN_REVIEW'), at: Date.now(), links: [{ text: 'Open App Store Connect', url: 'https://appstoreconnect.apple.com' }] }));
  assert.match(t, /^🤖 \*app_review_bot\*/);
  assert.match(t, /\*🔍 In review\*/);
  assert.match(t, /<https:\/\/appstoreconnect\.apple\.com\|Open App Store Connect>/);
  assert.doesNotMatch(t, /<b>|<\/b>/);
});

test('versions read as "name (build)" in Chat', async () => {
  const { displayVersion, statusCard } = await import('../src/chat.js');
  assert.equal(displayVersion('google', '193 (1.3.80)'), '1.3.80 (193)');
  assert.equal(displayVersion('google', '1.3.80', { versionCodes: '193' }), '1.3.80 (193)');
  assert.equal(displayVersion('apple', '1.0.55', { build: '12' }), '1.0.55 (12)');
  assert.equal(displayVersion('apple', '1.0.55'), '1.0.55');
  const c = statusCard({ app: { name: 'Telfon', store: 'google', accountId: 'a' }, channel: 'production', version: '193 (1.3.80)', to: { emoji: '📤', label: 'Sent to Google', category: 'submitted' }, at: Date.now() });
  assert.match(c.chatText, /^📤 {2}\*SENT TO GOOGLE\*\n\n\*Telfon\*\n\n/);
  assert.match(c.chatText, /Version:\*  1\.3\.80 \(193\)/);
});

test('AI rejection summary is parsed into title / issues / fixes / deadline', async () => {
  const { parseSummary } = await import('../src/ai.js');
  const s = parseSummary('TITLE: READ_CALL_LOG permission violation\nISSUE:\n- Requests READ_CALL_LOG without need\nFIX:\n- Remove the permission\n- Or submit the declaration form\nDEADLINE: 30 November 2026');
  assert.equal(s.title, 'READ_CALL_LOG permission violation');
  assert.deepEqual(s.issues, ['Requests READ_CALL_LOG without need']);
  assert.equal(s.fixes.length, 2);
  assert.equal(s.deadline, '30 November 2026');
  assert.equal(parseSummary('TITLE: X\nDEADLINE: None').deadline, '');
  assert.equal(parseSummary(''), null);
});

test('rejection Chat message carries the AI summary and the full email', async () => {
  const { statusCard } = await import('../src/chat.js');
  const { describe } = await import('../src/status-map.js');
  const c = statusCard({ app: { name: 'Telfon', store: 'google', accountId: 'a' }, channel: 'production', version: '193 (1.3.80)', at: Date.now(),
    from: describe('google', 'production', 'SENT_FOR_REVIEW'), to: describe('google', 'production', 'REJECTED'),
    extra: { ai: { title: 'Permission issue', issues: ['A'], fixes: ['B'], deadline: '' }, mailText: 'x'.repeat(9000), mailSubject: 'Rejected' } });
  assert.match(c.chatText, /🚫 {2}\*Permission issue\*/);
  assert.match(c.chatText, /📧 {2}\*Full email\*/);
  assert.ok(c.chatText.length <= 4096, `fits one Chat message (${c.chatText.length})`);
});
