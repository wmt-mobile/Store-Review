// Creates/updates one App Store Connect webhook per iOS app. Safe to re-run.
//   PUBLIC_BASE_URL=https://notifier.example.com npm run apple:webhooks -- --ping
import { config } from '../src/config.js';
import { appleClient } from '../src/apple/client.js';
import { errText } from '../src/util.js';

const ping = process.argv.includes('--ping');
const EVENTS = (process.env.APPLE_WEBHOOK_EVENTS ||
  'APP_STORE_VERSION_APP_VERSION_STATE_UPDATED,BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED,BUILD_UPLOAD_STATE_UPDATED')
  .split(',').map((s) => s.trim()).filter(Boolean);
const NAME = 'store-review-notifier';

if (!config.publicBaseUrl.startsWith('https://')) {
  console.error('PUBLIC_BASE_URL must be a public https:// URL.');
  process.exit(1);
}

let failed = 0;
for (const account of config.accounts.apple) {
  if (!account.webhookSecret) {
    console.error(`✗ ${account.id}: set APPLE_WEBHOOK_SECRET_${account.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')} in .env`);
    failed++;
    continue;
  }
  const client = appleClient(account);
  const { data: apps } = await client.listApps();
  console.log(`▸ ${account.name || account.id}: ${apps.length} apps`);
  for (const app of apps) {
    const url = `${config.publicBaseUrl}/apple/webhook/${encodeURIComponent(account.id)}?app=${app.id}`;
    try {
      const existing = (await client.listWebhooks(app.id)).data?.find((w) => w.attributes?.name === NAME);
      const body = { name: NAME, url, secret: account.webhookSecret, eventTypes: EVENTS };
      const res = existing ? await client.updateWebhook(existing.id, body) : await client.createWebhook(app.id, body);
      const id = res.data?.id || existing?.id;
      if (ping && id) await client.pingWebhook(id);
      console.log(`  ✅ ${app.attributes.name} ${existing ? 'updated' : 'created'}${ping ? ' + pinged' : ''}`);
    } catch (e) {
      failed++;
      console.log(`  ❌ ${app.attributes.name}: ${errText(e)}`);
    }
  }
}
process.exit(failed ? 1 : 0);
