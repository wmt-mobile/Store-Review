// Dashboard login: email + password checked against Supabase Auth, then a signed, HttpOnly
// session cookie (HMAC-SHA256, 7 days). Only emails in AUTH_ALLOWED_EMAILS may sign in.
import crypto from 'node:crypto';

const COOKIE = 'rr_session';
const MAX_AGE_S = 7 * 86400;

export const authEnabled = () => Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY));

function secret() {
  return crypto.createHmac('sha256', process.env.ENCRYPTION_KEY || 'dev-only').update('review-radar-session-v1').digest();
}
const allowed = () =>
  String(process.env.AUTH_ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

/** Signed, expiring payload without the email allow-list check (OAuth state etc.). */
export function verifyData(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp && p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Date.now()) return null;
    if (allowed().length && !allowed().includes(String(p.email).toLowerCase())) return null;
    return p;
  } catch {
    return null;
  }
}

export function sessionFrom(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return raw ? verify(decodeURIComponent(raw.slice(COOKIE.length + 1))) : null;
}

export function setSession(res, req, email) {
  const token = sign({ email, iat: Date.now(), exp: Date.now() + MAX_AGE_S * 1000 });
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}${req.secure ? '; Secure' : ''}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// simple brute-force guard: 8 failed attempts per IP per 15 minutes
const attempts = new Map();
export function tooManyAttempts(ip) {
  const a = attempts.get(ip);
  return a && a.count >= 8 && Date.now() - a.first < 15 * 60_000;
}
function recordFailure(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > 15 * 60_000) attempts.set(ip, { count: 1, first: Date.now() });
  else a.count++;
}

/** Returns { ok, email } or { ok:false, error }. */
export async function passwordLogin(email, password, ip) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !password) return { ok: false, error: 'Enter your email and password' };
  if (tooManyAttempts(ip)) return { ok: false, error: 'Too many attempts — try again in 15 minutes' };
  if (allowed().length && !allowed().includes(email)) {
    recordFailure(ip);
    return { ok: false, error: 'Wrong email or password' };
  }
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const res = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: String(password) }),
  }).catch(() => null);
  if (!res) return { ok: false, error: 'Could not reach Supabase — check the internet connection' };
  if (!res.ok) {
    recordFailure(ip);
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: /not confirmed/i.test(j.error_description || j.msg || '') ? 'This account’s email is not confirmed yet' : 'Wrong email or password' };
  }
  attempts.delete(ip);
  return { ok: true, email };
}
