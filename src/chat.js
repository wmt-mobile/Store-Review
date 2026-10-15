// Google Chat sender (cardsV2, threaded per app + version).
// Target is either an incoming-webhook URL or a space name ("spaces/AAAA…") posted to as a Chat app.
import { google } from 'googleapis';
import { config } from './config.js';
import { fmtDuration, fmtTime, errText, displayVersion } from './util.js';

export { displayVersion };
import { channelLabel } from './status-map.js';

const STORE_NAME = { apple: 'App Store Connect', google: 'Google Play' };

const CHAT_BOT_SCOPE = ['https://www.googleapis.com/auth/chat.bot'];
let chatApp = null;
const chatApiFor = (sa) => google.chat({ version: 'v1', auth: new google.auth.GoogleAuth({ credentials: sa, scopes: CHAT_BOT_SCOPE }) });

/** Service account that authenticates as the Chat app (must be in the GCP project where the Chat app is configured). */
export function setChatAppCredentials(sa) {
  chatApp = sa ? { api: chatApiFor(sa), email: sa.client_email } : null;
}
export const chatAppEmail = () => chatApp?.email || null;

// "Post as me": user-authenticated Chat API (no Chat app install needed). Cards aren't allowed
// for user auth, so cards are converted to formatted text.
let chatUser = null;
let delivery = 'app';
export function setChatUserAuth(oauth, email) {
  chatUser = oauth ? { api: google.chat({ version: 'v1', auth: oauth }), email } : null;
}
export const chatUserEmail = () => chatUser?.email || null;
export function setChatDelivery(mode) { delivery = mode === 'user' ? 'user' : 'app'; }
export const chatDelivery = () => delivery;

const htmlToChat = (t) => String(t ?? '')
  .replace(/<b>([\s\S]*?)<\/b>/g, '*$1*').replace(/<i>([\s\S]*?)<\/i>/g, '_$1_')
  .replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function cardToText(message) {
  const card = message.cardsV2?.[0]?.card;
  if (!card) return `🤖 *app_review_bot*\n${htmlToChat(message.text)}`;
  const lines = ['🤖 *app_review_bot*'];
  if (card.header?.title) lines.push(`*${htmlToChat(card.header.title)}*${card.header.subtitle ? `  ·  _${htmlToChat(card.header.subtitle)}_` : ''}`);
  for (const sec of card.sections || []) {
    if (sec.header) lines.push(`\n*${htmlToChat(sec.header)}*`);
    for (const w of sec.widgets || []) {
      if (w.decoratedText) lines.push(`${w.decoratedText.topLabel ? `${htmlToChat(w.decoratedText.topLabel)}: ` : ''}${htmlToChat(w.decoratedText.text)}`);
      else if (w.textParagraph) lines.push(htmlToChat(w.textParagraph.text));
      else if (w.buttonList) lines.push(w.buttonList.buttons.filter((b) => b.onClick?.openLink?.url).map((b) => `<${b.onClick.openLink.url}|${htmlToChat(b.text)}>`).join('   '));
    }
  }
  return lines.filter(Boolean).join('\n');
}

async function sendViaUser(space, message, threadKey) {
  if (!chatUser) throw new Error('Not signed in to Google Chat (Setup → Google Chat → Post as me)');
  for (let attempt = 0; ; attempt++) {
    try {
      const { data } = await chatUser.api.spaces.messages.create({
        parent: space,
        messageReplyOption: threadKey ? 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD' : undefined,
        requestBody: { text: message.chatText || cardToText(message), ...(threadKey ? { thread: { threadKey } } : {}) },
      });
      return data;
    } catch (e) {
      const st = e?.response?.status || e?.code;
      if ((st === 429 || st >= 500) && attempt < 2) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      throw e;
    }
  }
}
export const isSpaceTarget = (t) => /^spaces\/[A-Za-z0-9_-]+$/.test(String(t || ''));

/** Spaces (rooms, group chats and DMs) the Chat app has been added to. */
export async function listChatSpaces(sa, { asUser = false } = {}) {
  const api = asUser ? chatUser?.api : sa ? chatApiFor(sa) : chatApp?.api;
  if (!api) throw new Error(asUser ? 'Sign in with Google first' : 'No service account selected for the Chat app');
  const out = [];
  let pageToken;
  do {
    const { data } = await api.spaces.list({ pageSize: 100, pageToken });
    for (const s of data.spaces || []) out.push({ name: s.name, displayName: s.displayName || (s.spaceType === 'DIRECT_MESSAGE' ? 'Direct message with you' : s.name), type: s.spaceType || s.type });
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

async function sendViaApp(space, message, threadKey, sa) {
  const api = sa ? chatApiFor(sa) : chatApp?.api;
  if (!api) throw new Error('Chat app is not configured (no service account)');
  for (let attempt = 0; ; attempt++) {
    try {
      const { data } = await api.spaces.messages.create({
        parent: space,
        messageReplyOption: threadKey ? 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD' : undefined,
        requestBody: threadKey ? { ...message, thread: { threadKey } } : message,
      });
      return data;
    } catch (e) {
      const st = e?.response?.status || e?.code;
      if ((st === 429 || st >= 500) && attempt < 2) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      throw e;
    }
  }
}

export async function sendToChat(message, { webhook = config.chatWebhook, sa } = {}) {
  // Every update is posted as its own new message (no threads), by request.
  const threadKey = undefined;
  const { chatText, ...payload } = message;
  message = payload;
  if (!webhook) {
    console.warn('[chat] no Chat target configured; message dropped');
    return { skipped: true };
  }
  if (isSpaceTarget(webhook)) return !sa && delivery === 'user' ? sendViaUser(webhook, { ...message, chatText }, threadKey) : sendViaApp(webhook, message, threadKey, sa);
  const url = new URL(webhook);
  if (threadKey) url.searchParams.set('messageReplyOption', 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
  const body = threadKey ? { ...message, thread: { threadKey } } : message;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json().catch(() => ({}));
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`Chat ${res.status}: ${await res.text()}`);
  }
  throw new Error('Chat: retries exhausted');
}

// ── Google Chat text layout (used when posting as a user; cards aren't allowed there) ──
const clean = (t) => String(t ?? '').replace(/[*_~`]/g, (c) => c); // keep text as-is (Chat only formats paired markers)
const box = (t, max = 900) => '```\n' + String(t).trim().slice(0, max).replace(/```/g, "'''") + '\n```';
const NEXT_STEP = {
  submitted: '⏳ Waiting for the review to start',
  in_review: '👀 Review in progress',
  approved: '👉 Approved — ready for you to release',
  live: '🎉 Live — available to users now',
  rejected: '👉 Action needed — fix the issue and resubmit',
  action: '👉 Action needed in the console',
  removed: '👉 Action needed — the app is no longer available',
  draft: '📝 Not submitted yet',
  testing: '🧪 Available to internal testers',
};

const kv = (label, text) => ({ decoratedText: { topLabel: label, text: String(text), wrapText: true } });

/** Card for one status change. */
export function statusCard({ app, account, channel, version, extra, from, to, at, submittedAt, reason, links = [] }) {
  const ver = displayVersion(app.store, version, extra);
  const widgets = [
    kv('Status', from ? `${from.emoji} ${from.label}  →  <b>${to.emoji} ${to.label}</b>` : `<b>${to.emoji} ${to.label}</b>`),
    kv('Version', ver),
  ];
  widgets.push(kv('Account', account?.name || app.accountId));
  widgets.push(kv('Time', fmtTime(at)));
  if (reason) widgets.push({ textParagraph: { text: `<b>Reason</b><br>${escapeHtml(reason).slice(0, 3500)}` } });

  const buttons = links.filter((l) => l?.url).map((l) => ({ text: l.text, onClick: { openLink: { url: l.url } } }));
  const sections = [{ widgets }];
  if (buttons.length) sections.push({ widgets: [{ buttonList: { buttons } }] });

  const store = app.store === 'google' ? `Google Play · ${channelLabel(channel)}` : channelLabel(channel);
  const lines = [
    `${to.emoji}  *${to.label.toUpperCase()}*`,
    '',
    `*${clean(app.name)}*`,
    '',
    `📱  *Store:*  ${store}`,
    `🏷️  *Version:*  ${clean(ver)}`,
  ];
  if (from && from.label !== to.label) lines.push(`🔄  *Status:*  ${from.label}  →  *${to.label}*`);
  else lines.push(`🔄  *Status:*  *${to.label}*`);
  if (reason) lines.push('', '📝  *Reason*', box(reason));
  if (NEXT_STEP[to.category]) lines.push('', NEXT_STEP[to.category]);
  lines.push('', `🏢  ${clean(account?.name || app.accountId)}`, `🕒  ${fmtTime(at)}`);
  const lk = links.filter((l) => l?.url).map((l) => `<${l.url}|${l.text} ↗>`);
  if (lk.length) lines.push('', `🔗  ${lk.join('   ·   ')}`);
  return {
    text: `${to.emoji} ${app.name} ${ver} – ${to.label}`,
    chatText: lines.join('\n'),
    cardsV2: [
      {
        cardId: `status-${Date.now()}`,
        card: {
          header: {
            title: `${to.emoji} ${app.name}`,
            subtitle: `${STORE_NAME[app.store]} · ${channelLabel(channel)}`,
            imageUrl: app.iconUrl || undefined,
            imageType: 'SQUARE',
          },
          sections,
        },
      },
    ],
  };
}

export function storeMessageCard({ app, subject, from, snippet, emailUrl, at }) {
  const widgets = [kv('Subject', escapeHtml(subject || '(no subject)'))];
  if (snippet) widgets.push({ textParagraph: { text: escapeHtml(snippet).slice(0, 1200) } });
  widgets.push(kv('From', escapeHtml(from || 'Google Play Console')));
  widgets.push(kv('Time', fmtTime(at || Date.now())));
  const sections = [{ widgets }];
  if (emailUrl) sections.push({ widgets: [{ buttonList: { buttons: [{ text: 'Open email', onClick: { openLink: { url: emailUrl } } }] } }] });
  const t = ['📩  *NEW MESSAGE FROM GOOGLE PLAY*', '', `*${clean(app ? app.name : 'Google Play Console')}*`, '', `✉️  *${clean(subject || '(no subject)')}*`];
  if (snippet) t.push(box(snippet, 700));
  t.push('', '👉 Open the email for the full details', '', `🕒  ${fmtTime(at || Date.now())}`);
  if (emailUrl) t.push(`🔗  <${emailUrl}|Open email ↗>`);
  return {
    text: `📩 ${app ? app.name + ' – ' : ''}${subject || 'Google Play Console message'}`,
    chatText: t.join('\n'),
    cardsV2: [{ cardId: `mail-${Date.now()}`, card: { header: { title: `📩 ${app ? app.name : 'Google Play Console'}`, subtitle: 'New message from Google Play', imageUrl: app?.iconUrl || undefined, imageType: 'SQUARE' }, sections } }],
  };
}

export function alertCard(title, text, { error, hint } = {}) {
  const chatText = error
    ? ['⚠️  *SYNC PROBLEM*', `*${clean(title)}*`, '', box(error, 600), '', `👉 ${hint || 'Check the account access in Review Radar → Setup.'}`, '', `🕒  ${fmtTime(Date.now())}`].join('\n')
    : ['⚠️  *' + clean(title) + '*', '', String(text)].join('\n');
  return {
    text: `⚠️ ${title}`,
    chatText,
    cardsV2: [{ cardId: `alert-${Date.now()}`, card: { header: { title: `⚠️ ${title}` }, sections: [{ widgets: [{ textParagraph: { text: escapeHtml(text) } }] }] } }],
  };
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function safeSend(message, opts) {
  try {
    return await sendToChat(message, opts);
  } catch (e) {
    console.error('[chat] send failed:', errText(e));
    return { error: e };
  }
}
