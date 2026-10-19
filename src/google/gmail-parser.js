// Pure: Play Console email → { packageName, status, reason, track }.
// If Google changes wording, add a sample to test/core.test.js and adjust the rules below.

const RULES = [
  // order matters – most specific first
  { status: 'REMOVED', re: /\b(has been|was) (removed|suspended|terminated)\b|\bapp (removal|suspension)\b|\bremoved from google play\b/i },
  { status: 'REJECTED', re: /\b(rejected|was not approved|wasn'?t approved|could not be approved|did not pass review|isn'?t compliant)\b/i },
  { status: 'POLICY_ACTION', re: /\b(action required|policy (warning|violation|declaration|status)|enforcement|deadline to (comply|fix)|issue found)\b/i },
  { status: 'READY_TO_PUBLISH', re: /\b(ready to publish|changes are ready|managed publishing)\b/i },
  { status: 'LIVE', re: /\b(is now (live|available)|now available on google play|has been published|is live on google play|published on google play)\b/i },
  { status: 'APPROVED', re: /\b(approved|review (is )?complete|passed review|has been reviewed)\b/i },
  { status: 'IN_REVIEW', re: /\b(in review|under review|being reviewed)\b/i },
];

const SUPPORT_RE = /\[\d-\d{6,}\]|developer support|support survey|your message about|^\s*(re|fwd?):/i;

const TRACKS = [
  { track: 'internal', re: /\binternal (testing|test track)\b/i },
  { track: 'alpha', re: /\bclosed (testing|test track)\b|\balpha\b/i },
  { track: 'beta', re: /\bopen (testing|test track)\b|\bbeta\b/i },
  { track: 'production', re: /\bproduction\b/i },
];

const REASON_MARKERS = [
  /issue found:?/i,
  /policy issue:?/i,
  /reason(s)? for (rejection|removal):?/i,
  /issue details:?/i,
  /violation:?/i,
  /we found (an|the following) issue/i,
  /about the issue:?/i,
];

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function extractReason(text) {
  for (const m of REASON_MARKERS) {
    const idx = text.search(m);
    if (idx === -1) continue;
    const after = text.slice(idx).split('\n').map((l) => l.trim());
    const lines = [];
    for (const l of after) {
      if (!l && lines.length > 1) break;
      if (l) lines.push(l);
      if (lines.join(' ').length > 900) break;
    }
    const r = lines.join('\n').trim();
    if (r.length > 8) return r.slice(0, 1200);
  }
  return null;
}

/**
 * @param {{subject:string, body:string, from?:string}} email
 * @param {{packages: string[], names?: Record<string,string>}} known  known package names (+ display names → package)
 */
export function parsePlayEmail(email, known = { packages: [] }) {
  const subject = email.subject || '';
  const body = email.body?.includes('<') && /<\w+[^>]*>/.test(email.body) ? htmlToText(email.body) : email.body || '';
  const text = `${subject}\n${body}`;

  // package name: prefer a known one, else anything that looks like one in brackets
  let packageName = known.packages.find((p) => new RegExp(`(^|[^\\w.])${p.replace(/\./g, '\\.')}($|[^\\w.])`).test(text)) || null;
  if (!packageName && known.names) {
    const hit = Object.entries(known.names)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([name]) => name && text.toLowerCase().includes(name.toLowerCase()));
    if (hit) packageName = hit[1];
  }
  if (!packageName) {
    const m = text.match(/\(([a-z][a-z0-9_]*(?:\.[a-z0-9_]+){1,})\)/i);
    if (m) packageName = m[1];
  }

  // status: subject is the strongest signal, then body
  let status = null;
  // Support-ticket threads ("[5-7491…] Google Play Developer Support", surveys, "Your message about…") are
  // conversations with Google, not review results, even when they mention "under review".
  const conversation = SUPPORT_RE.test(subject);
  for (const src of conversation ? [] : [subject, body]) {
    const r = RULES.find((rule) => rule.re.test(src));
    if (r) { status = r.status; break; }
  }

  const track = (TRACKS.find((t) => t.re.test(subject)) || TRACKS.find((t) => t.re.test(body)))?.track || null;
  const reason = ['REJECTED', 'REMOVED', 'POLICY_ACTION'].includes(status) ? extractReason(body) || subject : null;

  return { packageName, status, reason, track };
}
