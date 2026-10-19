// Google Chat sender (cardsV2, threaded per app + version).
// Target is either an incoming-webhook URL or a space name ("spaces/AAAA…") posted to as a Chat app.
import { google } from 'googleapis';
import { config } from './config.js';
import { fmtDuration, fmtTime, errText, displayVersion } from './util.js';

export { displayVersion };
import { channelLabel } from './status-map.js';


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

const CHAT_LIMIT = 4000;

const kv = (label, text, icon) => ({ decoratedText: { topLabel: label, text: String(text), wrapText: true, ...(icon ? { startIcon: { materialIcon: { name: icon } } } : {}) } });

// Headline per status, matching the "Google Chat card kit" in the design.
const HEADLINE = {
  submitted: { emoji: '📨', title: () => 'Sent for review' },
  in_review: { emoji: '🔎', title: () => 'In review' },
  approved: { emoji: '☑️', title: (to) => (/release|publish|pending/i.test(to.label) || to.label === 'Approved' ? 'Approved · ready to publish' : to.label) },
  live: { emoji: '🚀', title: (to, extra) => (extra?.userFraction != null && extra.userFraction < 1 ? `Live · staged rollout ${Math.round(extra.userFraction * 100)}%` : 'Live') },
  rejected: { emoji: '🚫', title: (to) => (to.label === 'Rejected' ? 'Rejected' : `Rejected · ${to.label.replace(/ rejected$/i, '')}`) },
  action: { emoji: '🚫', title: (to) => (/policy/i.test(to.label) ? 'Rejected · Policy action' : to.label) },
  removed: { emoji: '⛔', title: (to) => to.label },
};

const normName = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Deep link into the dashboard (drawer for this app). */
export function radarLink(app, path = '/dashboard/apps', params = {}) {
  const base = config.publicBaseUrl;
  if (!base) return null;
  const q = new URLSearchParams({ app: normName(app.name), store: app.store, ...params });
  return `${base}${path}?${q}`;
}

/** "Oct 23, 2026 · 7 days left" when the deadline parses as a date. */
function deadlineText(d, now = Date.now()) {
  const t = Date.parse(String(d || '').replace(/(\d+)(st|nd|rd|th)/, '$1'));
  if (!isFinite(t)) return d;
  const days = Math.ceil((t - now) / 86_400_000);
  return days >= 0 ? `${d} · ${days} day${days === 1 ? '' : 's'} left` : `${d} · overdue`;
}

/** Card for one status change (cardsV2 for a Chat app / webhook, `chatText` for "post as me"). */
export function statusCard({ app, account, channel, version, extra, from, to, at, submittedAt, reason, links = [], listing = false }) {
  const ver = displayVersion(app.store, version, extra);
  const storeName = app.store === 'google' ? 'Google Play' : 'App Store';
  const track = app.store === 'google' ? (channel === 'production' ? 'Production track' : channelLabel(channel)) : null;
  const h = HEADLINE[to.category] || { emoji: to.emoji, title: () => to.label };
  const title = h.title(to, extra);
  const bad = ['rejected', 'action', 'removed'].includes(to.category);
  const ai = bad ? extra?.ai : null;
  const mailText = bad ? extra?.mailText : null;
  const took = submittedAt && at ? fmtDuration(at - submittedAt) : null;

  // label/value rows, same order as the design cards
  const rows = [];
  const add = (icon, label, value, material) => value && rows.push({ icon, label, value, material });
  // Play store-listing / app-content change (no new build): same message as a build, plus what changed
  if (listing) add('🗂️', 'Changes', extra?.note ? `App content · ${extra.note}` : 'Store listing / app content (no new build)', 'description');
  if (to.category === 'live') {
    add('📦', 'Version', `${ver}${app.store === 'google' ? ` · ${channel === 'production' ? 'Production' : channelLabel(channel)}` : ''}`, 'inventory_2');
    if (extra?.userFraction != null && extra.userFraction < 1) add('📈', 'Rollout', `${Math.round(extra.userFraction * 100)}% of users · started ${fmtTime(at).split(', ').pop()}`, 'trending_up');
  } else if (to.category === 'approved') {
    add('📦', 'Version', track ? `${ver} · ${track}` : ver, 'inventory_2');
    add('⏱️', 'Review took', took && `${took}${from ? ` · from ${from.label}` : ''}`, 'timer');
    add('💼', 'Account', account?.name || app.accountId, 'account_balance_wallet');
  } else if (to.category === 'in_review') {
    add('📦', 'Version', ver, 'inventory_2');
    add('🕒', 'Waited', took && `${took}${from ? ` · from ${from.label}` : ''}`, 'schedule');
  } else if (to.category === 'submitted') {
    add('📦', 'Version', ver, 'inventory_2');
    add('🔁', 'From', from && from.label !== to.label ? from.label : null, 'swap_horiz');
  } else if (!bad) {
    add('📦', 'Version', ver, 'inventory_2');
    add('🔁', 'Status', from && from.label !== to.label ? `${from.label} → ${to.label}` : to.label, 'swap_horiz');
  }

  // buttons: console action first, then Review Radar
  const consoleLink = links.find((l) => l?.url && /console|connect/i.test(l.text));
  const btns = [];
  if (consoleLink) {
    const text = to.category === 'approved'
      ? (app.store === 'google' ? 'Publish in Play Console' : 'Release in App Store Connect')
      : to.category === 'live' && app.store === 'google' ? 'View in Play Console' : consoleLink.text;
    btns.push({ text, url: consoleLink.url });
  }
  if (bad && extra?.messageId) { const u = radarLink(app, '/dashboard/attention', { email: extra.messageId }); if (u) btns.unshift({ text: 'View email', url: u }); }
  const radar = radarLink(app, bad ? '/dashboard/attention' : '/dashboard/apps');
  if (radar) btns.push({ text: 'Open in Review Radar', url: radar });
  if (bad && radar) btns.push({ text: 'Mark resolved', url: radarLink(app, '/dashboard/attention', { resolve: `${app.key || ''}|${channel}|${listing ? 'listing' : version || ''}` }) });
  for (const l of links) if (l?.url && l !== consoleLink && !btns.some((b) => b.url === l.url)) btns.push({ text: l.text, url: l.url });
  // rejections: View email · Open in Review Radar · Mark resolved (console link only when there's no dashboard URL)
  if (bad && radar) btns.splice(btns.findIndex((b) => b.url === consoleLink?.url) >>> 0, consoleLink ? 1 : 0);

  // ── text version (posting as a user: Chat does not allow cards there) ──
  const lines = [];
  if (bad && config.mentionAll) lines.push(`<users/all> Rejection on ${storeName} — summary below 👇`, '');
  lines.push(`${h.emoji}  *${title}*`, `${clean(app.name)} · ${storeName}${bad ? ` · ${clean(ver)}` : ''}`);
  for (const r of rows) lines.push('', `${r.icon}  *${r.label}*`, clean(r.value));
  if (ai) {
    lines.push('', '✨  *AI summary*');
    if (ai.title) lines.push('', '🚫  *Issue*', clean(ai.title));
    if (ai.issues?.length) lines.push('', "🔍  *What's wrong*", ...ai.issues.map((x) => clean(x)));
    if (ai.fixes?.length) lines.push('', '🛠️  *How to fix*', ...ai.fixes.map((x) => clean(x)));
    if (ai.deadline) lines.push('', '⏰  *Deadline*', clean(deadlineText(ai.deadline)));
  } else if (bad && reason && !mailText) lines.push('', '📝  *Reason*', box(reason));
  const tail = [];
  if (btns.length) tail.push('', btns.map((b) => `<${b.url}|${b.text} ↗>`).join('   ·   '));
  if (mailText) {
    // Full email, trimmed to what fits in one Chat message (4096 chars).
    const head = ['', `📧  *Full email*${extra.mailSubject ? `  —  ${clean(extra.mailSubject)}` : ''}`];
    const room = CHAT_LIMIT - [...lines, ...head, ...tail].join('\n').length - 40;
    if (room > 200) lines.push(...head, box(mailText.length > room ? mailText.slice(0, room).trimEnd() + '\n… (open the email for the rest)' : mailText, room + 60));
  }
  lines.push(...tail);

  // ── card version (Chat app / webhook) ──
  const widgets = rows.map((r) => kv(r.label, escapeHtml(r.value), r.material));
  const sections = [{ widgets }];
  if (ai) {
    const aiw = [];
    if (ai.title) aiw.push(kv('Issue', escapeHtml(ai.title), 'block'));
    if (ai.issues?.length) aiw.push(kv("What's wrong", ai.issues.map(escapeHtml).join('<br>'), 'search'));
    if (ai.fixes?.length) aiw.push(kv('How to fix', ai.fixes.map(escapeHtml).join('<br>'), 'build'));
    if (ai.deadline) aiw.push(kv('Deadline', `<font color="#D92D20">${escapeHtml(deadlineText(ai.deadline))}</font>`, 'alarm'));
    sections.push({ header: 'AI summary', widgets: aiw });
  } else if (bad && reason) sections.push({ widgets: [{ textParagraph: { text: `<b>Reason</b><br>${escapeHtml(reason).slice(0, 3500)}` } }] });
  if (btns.length) sections.push({ widgets: [{ buttonList: { buttons: btns.slice(0, 4).map((b, i) => ({ text: b.text, onClick: { openLink: { url: b.url } }, ...(i === 0 ? { color: { red: 0.04, green: 0.34, blue: 0.82, alpha: 1 } } : {}) })) } }] });
  if (!widgets.length) sections.shift();

  return {
    text: `${h.emoji} ${title} · ${app.name} ${ver}`,
    chatText: lines.join('\n'),
    cardsV2: [
      {
        cardId: `status-${Date.now()}`,
        card: {
          header: {
            title: `${h.emoji} ${title}`,
            subtitle: `${app.name} · ${storeName}${bad ? ` · ${ver}` : ''}`,
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
