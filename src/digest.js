// Daily summary card + "stuck in review" list.
import { buildDashboard } from './dashboard/view.js';
import { fmtDuration, fmtTime } from './util.js';
import { escapeHtml } from './chat.js';

export function digestCard(model, { dashboardUrl } = {}) {
  const s = model.summary;
  const line = (r) =>
    `${r.emoji} <b>${escapeHtml(r.appName)}</b> ${escapeHtml(r.version || '')} · ${r.channelLabel} · ${escapeHtml(r.label)}` +
    (r.elapsedMs ? ` · ${fmtDuration(r.elapsedMs)}${r.stuck ? ' ⏰' : ''}` : '') +
    ` <font color="#80868b">(${escapeHtml(r.accountName)})</font>`;

  const sections = [
    {
      widgets: [
        {
          textParagraph: {
            text: `🔍 In review: <b>${s.inReview}</b> · 📤 Waiting: <b>${s.waiting}</b> · ❌ Needs attention: <b>${s.attention}</b> · ✅ Approved, unreleased: <b>${s.approved}</b> · 🚀 Live apps: <b>${s.live}</b>/${s.apps}`,
          },
        },
      ],
    },
  ];
  if (model.pending.length) sections.push({ header: 'Currently in review', collapsible: model.pending.length > 8, uncollapsibleWidgetsCount: 8, widgets: model.pending.map((r) => ({ textParagraph: { text: line(r) } })) });
  const stuck = model.pending.filter((r) => r.stuck);
  if (stuck.length) sections.push({ header: `⏰ Stuck > ${model.stuckHours}h`, widgets: stuck.map((r) => ({ textParagraph: { text: line(r) } })) });
  if (model.attention.length) sections.push({ header: 'Needs attention', widgets: model.attention.map((r) => ({ textParagraph: { text: line(r) + (r.reason ? `<br><i>${escapeHtml(r.reason.slice(0, 200))}</i>` : '') } })) });
  const broken = model.accounts.filter((a) => a.error);
  if (broken.length) sections.push({ header: '⚠️ Accounts with errors', widgets: broken.map((a) => ({ textParagraph: { text: `<b>${escapeHtml(a.name)}</b>: ${escapeHtml(a.error)}` } })) });
  if (dashboardUrl) sections.push({ widgets: [{ buttonList: { buttons: [{ text: 'Open dashboard', onClick: { openLink: { url: dashboardUrl } } }] } }] });

  return {
    text: `📊 Store review summary – ${fmtTime(model.generatedAt)}`,
    cardsV2: [{ cardId: `digest-${model.generatedAt}`, card: { header: { title: '📊 Daily store review summary', subtitle: fmtTime(model.generatedAt) }, sections } }],
  };
}

export function buildDigest(store, accounts, cfg) {
  return digestCard(buildDashboard(store.data, accounts, { stuckHours: cfg.stuckHours }), {
    dashboardUrl: cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/dashboard` : undefined,
  });
}

/** True once per day when local time passes DIGEST_TIME. */
export function digestDue(meta, { tz, digestTime, now = new Date() }) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const hhmm = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
  if (meta.lastDigestDate === today || hhmm < digestTime) return null;
  return today;
}
