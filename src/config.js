import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env;
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

function resolvePath(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function loadApps() {
  const file = env.APPS_CONFIG ? resolvePath(env.APPS_CONFIG) : path.join(ROOT, 'config/apps.json');
  if (!fs.existsSync(file)) return { accounts: { apple: [], google: [] }, apps: [], autoDiscover: true, file, missing: true };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const accounts = {
    apple: (raw.accounts?.apple || []).map((a) => ({
      ...a,
      store: 'apple',
      keyPath: resolvePath(a.keyPath),
      webhookSecret: a.webhookSecret || env[`APPLE_WEBHOOK_SECRET_${String(a.id).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`] || '',
    })),
    google: (raw.accounts?.google || []).map((a) => ({
      ...a,
      store: 'google',
      serviceAccountPath: resolvePath(a.serviceAccountPath),
    })),
  };
  return { accounts, apps: raw.apps || [], autoDiscover: raw.autoDiscover !== false, file, missing: false };
}

const apps = loadApps();

export const config = {
  port: num(env.PORT, 8080),
  tz: env.TZ_DISPLAY || 'Asia/Kolkata',
  publicBaseUrl: (env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  statusToken: env.STATUS_TOKEN || '',
  dashboardToken: env.DASHBOARD_TOKEN || '',
  // No login → only reachable from this machine unless HOST is set explicitly
  host: env.HOST || (env.DASHBOARD_TOKEN ? '0.0.0.0' : '127.0.0.1'),
  demoData: bool(env.DEMO_DATA, false),
  chatWebhook: env.GOOGLE_CHAT_WEBHOOK_URL || '',
  // Fixed Chat space from .env (e.g. spaces/AAAAxxxxxxx). When set it can't be changed from the UI/API.
  chatSpaceLocked: (() => {
    const m = String(env.GOOGLE_CHAT_SPACE || '').trim().match(/(?:spaces\/|\/room\/|chat\/space\/|^)([A-Za-z0-9_-]{8,})(?:[/?#]|$)/);
    return m ? `spaces/${m[1]}` : '';
  })(),
  silentFirstRun: bool(env.SILENT_FIRST_RUN, true),
  applePollMs: num(env.APPLE_POLL_MINUTES, 5) * 60_000,
  playPollMs: num(env.PLAY_POLL_MINUTES, 15) * 60_000,
  gmailPollMs: num(env.GMAIL_POLL_MINUTES, 5) * 60_000,
  discoveryMs: num(env.DISCOVERY_HOURS, 6) * 3_600_000,
  digestEnabled: bool(env.DIGEST_ENABLED, true),
  digestTime: env.DIGEST_TIME || '10:00',
  stuckHours: num(env.STUCK_HOURS, 48),
  dataDir: resolvePath(env.DATA_DIR || 'data'),
  gmail: {
    clientId: env.GMAIL_CLIENT_ID || '',
    clientSecret: env.GMAIL_CLIENT_SECRET || '',
    refreshToken: env.GMAIL_REFRESH_TOKEN || '',
    serviceAccountPath: resolvePath(env.GMAIL_SERVICE_ACCOUNT_PATH || ''),
    impersonate: env.GMAIL_IMPERSONATE || '',
    query:
      env.GMAIL_QUERY ||
      'from:google.com (subject:"Google Play" OR from:googleplay-noreply@google.com OR from:no-reply-googleplay-developer@google.com) newer_than:14d',
  },
  ...apps,
};

export const allAccounts = () => [...config.accounts.apple, ...config.accounts.google];
export const accountById = (id) => allAccounts().find((a) => a.id === id);
export const gmailEnabled = () =>
  Boolean((config.gmail.clientId && config.gmail.refreshToken) || (config.gmail.serviceAccountPath && config.gmail.impersonate));
