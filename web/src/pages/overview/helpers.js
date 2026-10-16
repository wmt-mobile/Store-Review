// Overview-only helpers: label fixes for activity rows, per-store approval rates, CSV export.
import { isAttention, isPending, statusLabel } from '../../lib/model.js';

/** Activity rows carry the server label only; map it to the design wording. */
const LABEL_FIX = {
  apple: { 'Sent for review': 'Waiting for review', 'Ready for review': 'Ready for review', 'Approved – pending your release': 'Approved · ready to publish', 'Approved – Apple releasing': 'Approved · Apple releasing', 'Metadata rejected': 'Rejected · Metadata', 'Invalid binary': 'Rejected · Invalid binary' },
  google: { 'Release sent to Google': 'Sent for review', 'Ready to publish (managed publishing)': 'Approved · ready to publish', 'Policy action required': 'Rejected · Policy action', 'Removed / suspended': 'Removed' },
};
export const fixLabel = (store, label) => (label ? LABEL_FIX[store]?.[label] || label : '');
export function eventTo(store, e) {
  if (e.to) return statusLabel(store, e.to, e.label);
  return fixLabel(store, e.label);
}

/** Approval rate over the last 30 days from release history (approved/live vs rejected after a review). */
export function approvalRates(apps, now = Date.now()) {
  const acc = { apple: { ok: 0, bad: 0 }, google: { ok: 0, bad: 0 } };
  for (const a of apps || []) {
    const hist = [...(a.history || [])].sort((x, y) => x.at - y.at);
    let inReview = false;
    for (const h of hist) {
      if (isPending(h.category)) { inReview = true; continue; }
      if (!inReview || now - h.at > 30 * 86_400_000) { inReview = false; continue; }
      if (h.category === 'approved' || h.category === 'live') acc[a.store].ok++;
      else if (isAttention(h.category)) acc[a.store].bad++;
      inReview = false;
    }
  }
  const r = (x) => (x.ok + x.bad ? x.ok / (x.ok + x.bad) : null);
  const all = { ok: acc.apple.ok + acc.google.ok, bad: acc.apple.bad + acc.google.bad };
  return { apple: r(acc.apple), google: r(acc.google), all: r(all) };
}

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
