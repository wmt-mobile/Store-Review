// Rejection summaries with an LLM (Groq, OpenAI-compatible API).
// Optional: without GROQ_API_KEY, or if the call fails, messages go out without a summary.

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const aiEnabled = () => Boolean(process.env.GROQ_API_KEY);

const PROMPT = `You summarise app store review emails (Google Play Console / App Store Connect) for a mobile dev team.
Read the email and answer in EXACTLY this format, plain text, no markdown, no extra lines:

TITLE: <short rejection title, max 10 words, e.g. "Data safety form doesn't match app data">
ISSUE:
- <what is wrong, one short line each, max 4 lines; quote policy names and versions exactly>
FIX:
- <concrete step the team should take, one short line each, max 4 lines>
DEADLINE: <date or time limit mentioned in the email, or "None">

Only use facts from the email. Never invent policy names, dates or steps.`;

/** Pure: parse the model's reply into { title, issues[], fixes[], deadline }. */
export function parseSummary(text) {
  const out = { title: '', issues: [], fixes: [], deadline: '' };
  let section = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^title\s*:\s*(.*)$/i))) { out.title = m[1].trim(); section = null; }
    else if (/^issues?\s*:/i.test(line)) section = 'issues';
    else if (/^fix(es)?\s*:/i.test(line)) section = 'fixes';
    else if ((m = line.match(/^deadline\s*:\s*(.*)$/i))) { out.deadline = m[1].trim(); section = null; }
    else if (section && (m = line.match(/^[-•*\d.)\s]+(.+)$/))) out[section].push(m[1].trim());
  }
  if (/^none\b/i.test(out.deadline)) out.deadline = '';
  out.issues = out.issues.slice(0, 4);
  out.fixes = out.fixes.slice(0, 4);
  return out.title || out.issues.length ? out : null;
}

/**
 * @param {{subject:string, text:string, appName?:string, store?:string}} email
 * @returns {Promise<{title:string, issues:string[], fixes:string[], deadline:string}|null>}
 */
export async function summarizeRejection({ subject, text, appName, store = 'google' }) {
  if (!aiEnabled() || !text) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: `Store: ${store === 'apple' ? 'App Store' : 'Google Play'}\nApp: ${appName || 'unknown'}\nSubject: ${subject || ''}\n\n${String(text).slice(0, 12_000)}` },
        ],
        temperature: 0.2,
        max_completion_tokens: 1500,
        reasoning_effort: 'low',
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return parseSummary(data.choices?.[0]?.message?.content);
  } catch (e) {
    console.warn('[ai] summary failed:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
