// App Store Connect API client (JWT ES256, one per Apple team key).
import fs from 'node:fs';
import { SignJWT, importPKCS8 } from 'jose';

const BASE = 'https://api.appstoreconnect.apple.com';

export class AppleClient {
  constructor(account) {
    this.account = account;
    this._token = null;
    this._tokenExp = 0;
    this._key = null;
  }

  async token() {
    const now = Math.floor(Date.now() / 1000);
    if (this._token && this._tokenExp - now > 60) return this._token;
    if (!this._key) {
      const pem = this.account.privateKey || fs.readFileSync(this.account.keyPath, 'utf8');
      this._key = await importPKCS8(pem, 'ES256');
    }
    const exp = now + 15 * 60;
    this._token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.account.keyId, typ: 'JWT' })
      .setIssuer(this.account.issuerId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setAudience('appstoreconnect-v1')
      .sign(this._key);
    this._tokenExp = exp;
    return this._token;
  }

  async request(method, pathOrUrl, body) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) {
        const e = new Error(json?.errors?.[0]?.detail || json?.errors?.[0]?.title || `HTTP ${res.status}`);
        e.status = res.status;
        e.body = json;
        throw e;
      }
      return json;
    }
  }

  get(path) {
    return this.request('GET', path);
  }

  /** GET every page; returns { data:[], included:[] } */
  async getAll(path, maxPages = 20) {
    const data = [];
    const included = [];
    let next = path;
    for (let i = 0; next && i < maxPages; i++) {
      const page = await this.get(next);
      data.push(...(page.data || []));
      included.push(...(page.included || []));
      next = page.links?.next;
    }
    return { data, included };
  }

  listApps() {
    return this.getAll('/v1/apps?limit=200&fields[apps]=name,bundleId,sku,primaryLocale');
  }

  appStoreVersions(appId) {
    return this.get(
      `/v1/apps/${appId}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState,appVersionState,platform,createdDate,releaseType,build&include=build&fields[builds]=version`
    );
  }

  reviewSubmissions(appId) {
    return this.get(
      `/v1/reviewSubmissions?filter[app]=${appId}&limit=10&filter[state]=WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES,READY_FOR_REVIEW` +
        `&fields[reviewSubmissions]=submittedDate,state,platform,appStoreVersionForReview&include=appStoreVersionForReview`
    );
  }

  latestBuilds(appId, limit = 3) {
    return this.get(
      `/v1/builds?filter[app]=${appId}&sort=-uploadedDate&limit=${limit}` +
        `&fields[builds]=version,uploadedDate,processingState,iconAssetToken,expired,betaAppReviewSubmission,preReleaseVersion,buildBetaDetail` +
        `&include=betaAppReviewSubmission,preReleaseVersion,buildBetaDetail` +
        `&fields[betaAppReviewSubmissions]=betaReviewState,submittedDate` +
        `&fields[preReleaseVersions]=version,platform` +
        `&fields[buildBetaDetails]=externalBuildState,internalBuildState`
    );
  }

  // ── Webhooks API ──
  listWebhooks(appId) {
    return this.get(`/v1/apps/${appId}/webhooks?limit=50`);
  }

  createWebhook(appId, { name, url, secret, eventTypes }) {
    return this.request('POST', '/v1/webhooks', {
      data: {
        type: 'webhooks',
        attributes: { name, url, secret, enabled: true, eventTypes },
        relationships: { app: { data: { type: 'apps', id: appId } } },
      },
    });
  }

  updateWebhook(id, { name, url, secret, eventTypes }) {
    return this.request('PATCH', `/v1/webhooks/${id}`, {
      data: { type: 'webhooks', id, attributes: { name, url, secret, enabled: true, eventTypes } },
    });
  }

  pingWebhook(id) {
    return this.request('POST', '/v1/webhookPings', {
      data: { type: 'webhookPings', relationships: { webhook: { data: { type: 'webhooks', id } } } },
    });
  }
}

const clients = new Map();
export const appleClient = (account) => {
  if (!clients.has(account.id)) clients.set(account.id, new AppleClient(account));
  return clients.get(account.id);
};

export const resetAppleClient = (id) => clients.delete(id);

export const iconFromToken = (t, size = 128) =>
  t?.templateUrl ? t.templateUrl.replace('{w}', size).replace('{h}', size).replace('{f}', 'png') : undefined;
