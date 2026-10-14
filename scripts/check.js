// Verifies every key/account/app and prints current statuses. Sends nothing unless --send-test.
import { config, gmailEnabled } from '../src/config.js';
import { memoryStore } from '../src/store.js';
import { Tracker } from '../src/tracker.js';
import { discoverAccount } from '../src/discovery.js';
import { pollAppleAccount } from '../src/apple/poller.js';
import { pollPlayAccount } from '../src/google/play.js';
import { pollGmail } from '../src/google/gmail.js';
import { describe, channelLabel } from '../src/status-map.js';
import { statusCard, sendToChat } from '../src/chat.js';
import { errText } from '../src/util.js';

const sendTest = process.argv.includes('--send-test');
const store = memoryStore();
const accountById = (id) => [...config.accounts.apple, ...config.accounts.google].find((a) => a.id === id);
const tracker = new Tracker({ store, accountById, config: { ...config, silentFirstRun: true }, send: async () => ({}) });

let failures = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { failures++; console.log(`  ❌ ${m}`); };

console.log(`Config: ${config.file}${config.missing ? '  (MISSING – copy config/apps.example.json)' : ''}`);
if (config.missing) failures++;
if (!config.chatWebhook) failures++;
console.log(`Chat webhook: ${config.chatWebhook ? 'set' : 'NOT SET'}   Gmail: ${gmailEnabled() ? 'configured' : 'not configured'}\n`);

for (const account of [...config.accounts.apple, ...config.accounts.google]) {
  console.log(`▸ ${account.store === 'apple' ? 'Apple' : 'Play'} · ${account.name || account.id}`);
  try {
    const n = await discoverAccount(account, tracker, config);
    const warn = store.data.accounts[account.id]?.discoveryWarning;
    if (warn) bad(warn); else ok(`discovered ${n} apps`);
    const r = account.store === 'apple' ? await pollAppleAccount(account, tracker) : await pollPlayAccount(account, tracker);
    r.failed ? bad(`${r.failed}/${r.apps} apps failed to poll`) : ok(`polled ${r.apps} apps`);
  } catch (e) {
    bad(errText(e));
  }
  for (const app of Object.values(store.data.apps).filter((a) => a.accountId === account.id)) {
    const chans = store.data.channels[app.key] || {};
    const parts = Object.entries(chans).map(([ch, s]) => {
      const d = describe(app.store, ch, s.status);
      return `${channelLabel(ch)}: ${d.emoji} ${d.label} ${s.version}`;
    });
    console.log(`     · ${app.name} (${app.bundleOrPackage})  ${parts.join('  |  ') || 'no submissions'}`);
  }
  console.log();
}

if (gmailEnabled()) {
  console.log('▸ Gmail');
  try {
    const r = await pollGmail(tracker);
    ok(`query matched ${r.scanned} emails, ${r.processed} mapped to known apps`);
  } catch (e) {
    bad(errText(e));
  }
}

if (sendTest) {
  const card = statusCard({
    app: { name: 'Sample App', store: 'apple', appId: '0', accountId: 'test' },
    account: { name: 'Test account' },
    channel: 'appstore',
    version: '1.0.0',
    from: describe('apple', 'appstore', 'WAITING_FOR_REVIEW'),
    to: describe('apple', 'appstore', 'IN_REVIEW'),
    at: Date.now(),
    submittedAt: Date.now() - 5 * 3_600_000,
    links: [{ text: 'Open dashboard', url: config.publicBaseUrl ? `${config.publicBaseUrl}/dashboard` : 'https://appstoreconnect.apple.com' }],
  });
  try {
    await sendToChat(card, { threadKey: 'store-review-notifier-test' });
    ok('test card posted to Google Chat');
  } catch (e) {
    bad(`Chat: ${errText(e)}`);
  }
}

console.log(failures ? `\n${failures} problem(s) found.` : '\nAll good.');
process.exit(failures ? 1 : 0);
