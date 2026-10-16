// Developer accounts stored in Supabase (secrets encrypted). Verification returns a
// step-by-step checklist that the onboarding UI shows live.
import { importPKCS8 } from 'jose';
import { google } from 'googleapis';
import { db } from './supabase.js';
import { encrypt, decrypt, randomSecret } from './crypto.js';
import { AppleClient, resetAppleClient } from './apple/client.js';
import { resetPlayClient } from './google/play.js';
import { errText } from './util.js';

const step = (label, ok, detail, hint) => ({ label, ok, detail: detail || null, hint: hint || null });

function hintFor(store, e) {
  const m = errText(e);
  if (store === 'apple') {
    if (/401|NOT_AUTHORIZED|unauthor/i.test(m)) return 'Apple rejected the key. Check that Key ID and Issuer ID belong to this .p8 file and that the key is not revoked.';
    if (/403|FORBIDDEN/i.test(m)) return 'The key role is too low. Create the Team Key with App Manager (or Admin) access.';
  } else {
    if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(m))
      return 'Enable this API for the service account’s Google Cloud project, wait a minute, then retry.';
    if (/403|permission|PERMISSION_DENIED/i.test(m)) return 'Invite the service-account email in Play Console → Users and permissions with “View app information”.';
    if (/invalid_grant|invalid JWT/i.test(m)) return 'The JSON key is invalid or was deleted. Create a new key for the service account.';
  }
  return null;
}

export async function verifyApple({ keyId, issuerId, privateKey }) {
  const steps = [];
  let apps = [];
  if (!keyId || !issuerId || !privateKey) {
    steps.push(step('Key details provided', false, 'Key ID, Issuer ID and the .p8 file are all required'));
    return { ok: false, steps, apps };
  }
  try {
    await importPKCS8(privateKey.trim(), 'ES256');
    steps.push(step('Private key (.p8) is valid', true));
  } catch (e) {
    steps.push(step('Private key (.p8) is valid', false, 'Not a valid App Store Connect .p8 key', 'Upload the AuthKey_XXXX.p8 file exactly as downloaded.'));
    return { ok: false, steps, apps };
  }
  const client = new AppleClient({ id: 'verify', keyId: keyId.trim(), issuerId: issuerId.trim(), privateKey: privateKey.trim() });
  try {
    await client.token();
    steps.push(step('Signed API token (ES256)', true));
    const res = await client.listApps();
    apps = res.data.map((a) => ({ id: a.id, name: a.attributes.name, bundleId: a.attributes.bundleId }));
    steps.push(step('Connected to App Store Connect', true));
    steps.push(step(`Found ${apps.length} app${apps.length === 1 ? '' : 's'}`, apps.length > 0, apps.slice(0, 6).map((a) => a.name).join(', '), apps.length ? null : 'The key works but this team has no apps visible to it.'));
  } catch (e) {
    steps.push(step('Connected to App Store Connect', false, errText(e), hintFor('apple', e)));
    return { ok: false, steps, apps };
  }
  return { ok: apps.length > 0, steps, apps };
}

export async function verifyGoogle({ serviceAccountJson }) {
  const steps = [];
  let apps = [];
  let sa;
  try {
    sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
    if (sa?.type !== 'service_account' || !sa.client_email || !sa.private_key) throw new Error('bad');
    steps.push(step('Service-account JSON is valid', true, sa.client_email));
  } catch {
    steps.push(step('Service-account JSON is valid', false, 'Not a Google service-account key file', 'In Google Cloud → IAM → Service accounts → Keys → Add key → JSON.'));
    return { ok: false, steps, apps, sa: null };
  }
  const auth = new google.auth.GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/androidpublisher', 'https://www.googleapis.com/auth/playdeveloperreporting'],
  });
  try {
    await auth.getAccessToken();
    steps.push(step('Signed in to Google', true));
  } catch (e) {
    steps.push(step('Signed in to Google', false, errText(e), hintFor('google', e)));
    return { ok: false, steps, apps, sa };
  }
  try {
    const reporting = google.playdeveloperreporting({ version: 'v1beta1', auth });
    let pageToken;
    do {
      const { data } = await reporting.apps.search({ pageSize: 1000, pageToken });
      apps.push(...(data.apps || []).map((a) => ({ id: a.packageName, name: a.displayName || a.packageName, bundleId: a.packageName })));
      pageToken = data.nextPageToken;
    } while (pageToken);
    steps.push(step('Play Developer Reporting API reachable', true));
  } catch (e) {
    steps.push(step('Play Developer Reporting API reachable', false, errText(e), hintFor('google', e)));
    return { ok: false, steps, apps, sa };
  }
  steps.push(
    step(`Found ${apps.length} app${apps.length === 1 ? '' : 's'}`, apps.length > 0, apps.slice(0, 6).map((a) => a.name).join(', '),
      apps.length ? null : `Invite ${sa.client_email} in Play Console → Users and permissions, give it access to all apps, then retry.`)
  );
  if (apps.length) {
    try {
      const publisher = google.androidpublisher({ version: 'v3', auth });
      const edit = await publisher.edits.insert({ packageName: apps[0].id, requestBody: {} });
      await publisher.edits.delete({ packageName: apps[0].id, editId: edit.data.id }).catch(() => {});
      steps.push(step('Can read release tracks', true, 'Opened and discarded a read-only edit'));
    } catch (e) {
      steps.push(step('Can read release tracks', false, errText(e), 'Grant the service account “Release apps to testing tracks” (read access to tracks) in Play Console.'));
      return { ok: false, steps, apps, sa };
    }
  }
  return { ok: apps.length > 0, steps, apps, sa };
}

export class AccountRegistry {
  constructor() {
    this.items = [];
  }

  async load() {
    const rows = await db.select('accounts', { order: 'created_at.asc' });
    this.items = rows.map((r) => this.fromRow(r));
    return this.items;
  }

  fromRow(r) {
    const a = { id: r.id, store: r.store, name: r.name, status: r.status, developerId: r.config?.developerId || undefined, createdAt: r.created_at };
    try {
      if (r.store === 'apple') {
        a.keyId = r.config?.keyId;
        a.issuerId = r.config?.issuerId;
        a.privateKey = decrypt(r.secret_enc);
      } else {
        a.serviceAccount = JSON.parse(decrypt(r.secret_enc) || 'null');
        a.clientEmail = r.config?.clientEmail;
      }
      a.webhookSecret = decrypt(r.webhook_secret_enc) || '';
    } catch (e) {
      a.status = 'error';
      a.decryptError = 'Cannot decrypt stored key (ENCRYPTION_KEY changed?)';
    }
    return a;
  }

  list() {
    return this.items;
  }

  active() {
    return this.items.filter((a) => a.status === 'verified' && !a.decryptError);
  }

  get(id) {
    return this.items.find((a) => a.id === id);
  }

  publicView(a) {
    return {
      id: a.id,
      store: a.store,
      name: a.name,
      status: a.status,
      keyId: a.keyId,
      issuerId: a.issuerId,
      clientEmail: a.clientEmail,
      developerId: a.developerId,
      createdAt: a.createdAt,
      decryptError: a.decryptError || null,
    };
  }

  /** Verify credentials and save. Returns { account, verification }. */
  async add(input) {
    const store = input.store === 'google' ? 'google' : 'apple';
    const name = String(input.name || '').trim() || (store === 'apple' ? 'Apple account' : 'Play account');
    let verification;
    let config;
    let secret;
    if (store === 'apple') {
      verification = await verifyApple(input);
      config = { keyId: input.keyId?.trim(), issuerId: input.issuerId?.trim() };
      secret = input.privateKey?.trim();
    } else {
      verification = await verifyGoogle(input);
      config = { clientEmail: verification.sa?.client_email, developerId: input.developerId?.trim() || undefined };
      secret = verification.sa ? JSON.stringify(verification.sa) : null;
    }
    if (!verification.ok) return { account: null, verification };
    const [row] = await db.insert('accounts', [
      { store, name, status: 'verified', config, secret_enc: encrypt(secret), webhook_secret_enc: encrypt(randomSecret()) },
    ]);
    const account = this.fromRow(row);
    this.items.push(account);
    return { account, verification };
  }

  async rename(id, { name, developerId }) {
    const a = this.get(id);
    if (!a) return null;
    const patch = {};
    if (name) patch.name = String(name).trim();
    const [row] = await db.select('accounts', { id: `eq.${id}` });
    if (developerId !== undefined) patch.config = { ...row.config, developerId: String(developerId).trim() || undefined };
    const [updated] = await db.update('accounts', { id: `eq.${id}` }, patch);
    Object.assign(a, this.fromRow(updated));
    return a;
  }

  /** Rotate the key (Apple .p8 + ids) or service-account JSON. Verifies first; keeps the old key on failure. */
  async replaceSecret(id, input) {
    const a = this.get(id);
    if (!a) return { account: null, verification: { ok: false, steps: [{ label: 'Find account', ok: false, detail: 'not found' }] } };
    const [row] = await db.select('accounts', { id: `eq.${id}` });
    let verification;
    let config;
    let secret;
    if (a.store === 'apple') {
      const merged = { keyId: input.keyId?.trim() || a.keyId, issuerId: input.issuerId?.trim() || a.issuerId, privateKey: input.privateKey };
      verification = await verifyApple(merged);
      config = { ...row.config, keyId: merged.keyId, issuerId: merged.issuerId };
      secret = merged.privateKey?.trim();
    } else {
      verification = await verifyGoogle(input);
      config = { ...row.config, clientEmail: verification.sa?.client_email };
      secret = verification.sa ? JSON.stringify(verification.sa) : null;
    }
    if (!verification.ok) return { account: null, verification };
    const [updated] = await db.update('accounts', { id: `eq.${id}` }, { config, secret_enc: encrypt(secret), status: 'verified', error: null, error_at: null });
    Object.assign(a, this.fromRow(updated));
    resetAppleClient(id);
    resetPlayClient(id);
    return { account: a, verification };
  }

  async remove(id) {
    await db.delete('accounts', { id: `eq.${id}` });
    this.items = this.items.filter((a) => a.id !== id);
    resetAppleClient(id);
    resetPlayClient(id);
  }
}
