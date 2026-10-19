// Reads Play Console emails from the shared mailbox.
import { google } from 'googleapis';
import { config } from '../config.js';
import { parsePlayEmail, htmlToText } from './gmail-parser.js';
import { summarizeRejection } from '../ai.js';
import { describe, isPending } from '../status-map.js';

let gmailApi = null;
export const resetGmail = () => { gmailApi = null; };
function gmail() {
  if (gmailApi) return gmailApi;
  let auth;
  if (config.gmail.clientId && config.gmail.refreshToken) {
    auth = new google.auth.OAuth2(config.gmail.clientId, config.gmail.clientSecret);
    auth.setCredentials({ refresh_token: config.gmail.refreshToken });
  } else {
    auth = new google.auth.JWT({
      keyFile: config.gmail.serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      subject: config.gmail.impersonate,
    });
  }
  gmailApi = google.gmail({ version: 'v1', auth });
  return gmailApi;
}

function decode(data) {
  return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/** Readable text of the whole email (plain part, else the HTML part converted). */
function textOf(payload) {
  let plain = '';
  let html = '';
  const walk = (p) => {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data) plain += decode(p.body.data);
    else if (p.mimeType === 'text/html' && p.body?.data) html += decode(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return (plain.trim() ? plain : htmlToText(html)).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Raw HTML of an email (for the dashboard's "View email"). */
export function htmlOf(payload) {
  let html = '';
  let plain = '';
  const walk = (p) => {
    if (!p) return;
    if (p.mimeType === 'text/html' && p.body?.data) html += decode(p.body.data);
    else if (p.mimeType === 'text/plain' && p.body?.data) plain += decode(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return { html, plain };
}

/** Full message for the dashboard. */
export async function getEmail(id) {
  const { data: msg } = await gmail().users.messages.get({ userId: 'me', id, format: 'full' });
  const { html, plain } = htmlOf(msg.payload);
  return { id, subject: header(msg, 'subject'), from: header(msg, 'from'), to: header(msg, 'to'), at: Number(msg.internalDate) || null, html, text: plain || htmlToText(html) };
}

function bodyOf(payload) {
  let plain = '';
  let html = '';
  const walk = (p) => {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data) plain += decode(p.body.data);
    else if (p.mimeType === 'text/html' && p.body?.data) html += decode(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return plain || html;
}

const header = (msg, name) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value || '';

export async function pollGmail(tracker) {
  const meta = tracker.d.meta;
  const api = gmail();
  // Look back 2 days on first run; afterwards from last processed message (minus 1h slack)
  const after = Math.floor(((meta.gmailAfter || Date.now() - 2 * 86_400_000) - 3_600_000) / 1000);
  const q = `${config.gmail.query} after:${after}`;
  const ids = [];
  let pageToken;
  do {
    const { data } = await api.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken });
    ids.push(...(data.messages || []));
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < 500);

  const googleApps = Object.values(tracker.d.apps).filter((a) => a.store === 'google');
  const known = {
    packages: googleApps.map((a) => a.appId),
    names: Object.fromEntries(googleApps.map((a) => [a.name, a.appId])),
  };

  let processed = 0;
  let newest = meta.gmailAfter || 0;
  for (const { id, threadId } of ids.reverse()) {
    const eventId = `gmail:${id}`;
    if (tracker.d.seen[eventId]) continue;
    const { data: msg } = await api.users.messages.get({ userId: 'me', id, format: 'full' });
    const at = Number(msg.internalDate) || Date.now();
    newest = Math.max(newest, at);
    const parsed = parsePlayEmail({ subject: header(msg, 'subject'), from: header(msg, 'from'), body: bodyOf(msg.payload) }, known);
    const mailbox = config.gmail.impersonate || '0';
    const emailUrl = `https://mail.google.com/mail/u/${encodeURIComponent(mailbox)}/#all/${threadId}`;
    const app = parsed.packageName ? tracker.findAppByPackage(parsed.packageName) : null;
    if (!parsed.status || !app) {
      // Not a recognised review result (or an app we don't track yet) – still tell the team.
      tracker.d.seen[eventId] = Date.now();
      if (!parsed.packageName || !app || !app.hidden) {
        await tracker.notifyStoreMessage({ app, subject: header(msg, 'subject'), from: header(msg, 'from'), snippet: msg.snippet, emailUrl, at });
        processed++;
      }
      continue;
    }
    const chans = tracker.d.channels[app.key] || {};
    const subject = header(msg, 'subject');
    let mail = {};
    if (['REJECTED', 'REMOVED', 'POLICY_ACTION'].includes(parsed.status)) {
      const text = textOf(msg.payload);
      const ai = await summarizeRejection({ subject, text, appName: app.name, store: 'google' });
      mail = { messageId: id, mailSubject: subject, mailText: text.slice(0, 8000), ai: ai || null };
    }
    const track =
      parsed.track ||
      Object.entries(chans).find(([ch, s]) => isPending(describe('google', ch, s.status).category))?.[0] ||
      'production';
    // No new build on its way: the email is about a store-listing / app-content change (app removals stay on the build).
    if (track === 'production' && chans.production && parsed.status !== 'REMOVED' && !tracker.playBuildPending(app.key, chans.production.extra?.versionCodes)) {
      await tracker.updateListing(app.key, { status: parsed.status, reason: parsed.reason, at, eventId, extra: { emailUrl, ...mail } });
      processed++;
      continue;
    }
    await tracker.update(app.key, track, {
      version: chans[track]?.version || '',
      status: parsed.status,
      reason: parsed.reason,
      at,
      eventId,
      extra: { ...(chans[track]?.extra || {}), emailUrl, ...mail },
    });
    processed++;
  }
  meta.gmailAfter = newest || Date.now();
  meta.gmailInitialized = true;
  tracker.store.save();
  return { scanned: ids.length, processed };
}

/** For the Setup page: what the bot would read right now, and how it understood each email. */
export async function previewGmail(tracker, limit = 8) {
  const api = gmail();
  const { data } = await api.users.messages.list({ userId: 'me', q: config.gmail.query, maxResults: limit });
  const googleApps = Object.values(tracker.d.apps).filter((a) => a.store === 'google');
  const known = { packages: googleApps.map((a) => a.appId), names: Object.fromEntries(googleApps.map((a) => [a.name, a.appId])) };
  const out = [];
  for (const { id } of data.messages || []) {
    const { data: msg } = await api.users.messages.get({ userId: 'me', id, format: 'full' });
    const parsed = parsePlayEmail({ subject: header(msg, 'subject'), from: header(msg, 'from'), body: bodyOf(msg.payload) }, known);
    const app = parsed.packageName ? tracker.findAppByPackage(parsed.packageName) : null;
    out.push({
      at: Number(msg.internalDate) || null,
      subject: header(msg, 'subject'),
      from: header(msg, 'from'),
      packageName: parsed.packageName,
      appName: app?.name || null,
      status: parsed.status,
      track: parsed.track,
      reason: parsed.reason,
    });
  }
  return { total: data.resultSizeEstimate || out.length, emails: out };
}
