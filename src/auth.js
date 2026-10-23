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

// ── password reset (Supabase Auth recovery flow) ──
// 1. requestPasswordReset → Supabase emails a one-time link (POST /auth/v1/recover).
// 2. The link verifies the token and lands on /reset-password#access_token=…&type=recovery.
// 3. resetPassword sets the new password with that short-lived token (PUT /auth/v1/user).
const resets = new Map();
function resetLimited(key, max, windowMs) {
  const a = resets.get(key);
  if (!a || Date.now() - a.first > windowMs) {
    resets.set(key, { count: 1, first: Date.now() });
    return false;
  }
  return ++a.count > max;
}
const sbBase = () => process.env.SUPABASE_URL.replace(/\/$/, '');
const sbKey = () => process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
export const MIN_PASSWORD = 8;

/**
 * Always answers { ok:true } for a well-formed email (never reveals whether an account exists),
 * unless the caller is rate-limited or Supabase can't be reached.
 */
export async function requestPasswordReset(email, ip, redirectTo) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address' };
  if (resetLimited(`ip:${ip}`, 5, 15 * 60_000)) return { ok: false, error: 'Too many requests — try again in 15 minutes' };
  // only allow-listed people can sign in, so only they get an email
  if (allowed().length && !allowed().includes(email)) return { ok: true, sent: false };
  if (resetLimited(`email:${email}`, 3, 60 * 60_000)) return { ok: true, sent: false };
  const res = await fetch(`${sbBase()}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    headers: { apikey: sbKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }).catch(() => null);
  if (!res) return { ok: false, error: 'Could not reach Supabase — check the internet connection' };
  if (res.status === 429) return { ok: false, error: 'Too many reset emails were sent recently — wait a few minutes and try again' };
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    console.warn('[auth] recover failed', res.status, j.error_code || j.msg || '');
    // unknown users etc. still look like success
    if (res.status >= 500) return { ok: false, error: 'Supabase could not send the email right now — try again later' };
  }
  return { ok: true, sent: res.ok };
}

/** Sets a new password using the recovery access token. Returns { ok, email } or { ok:false, error, expired? }. */
export async function resetPassword(accessToken, password, ip) {
  accessToken = String(accessToken || '');
  password = String(password || '');
  if (!accessToken || accessToken.length > 4096) return { ok: false, expired: true, error: 'This reset link is invalid — request a new one' };
  if (password.length < MIN_PASSWORD) return { ok: false, error: `Use at least ${MIN_PASSWORD} characters` };
  if (password.length > 72) return { ok: false, error: 'Use 72 characters or fewer' };
  if (resetLimited(`set:${ip}`, 10, 15 * 60_000)) return { ok: false, error: 'Too many attempts — try again in 15 minutes' };
  const headers = { apikey: sbKey(), Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const who = await fetch(`${sbBase()}/auth/v1/user`, { headers }).catch(() => null);
  if (!who) return { ok: false, error: 'Could not reach Supabase — check the internet connection' };
  if (!who.ok) return { ok: false, expired: true, error: 'This reset link has expired or was already used — request a new one' };
  const user = await who.json().catch(() => ({}));
  const email = String(user.email || '').toLowerCase();
  if (!email || (allowed().length && !allowed().includes(email))) return { ok: false, expired: true, error: 'This account can’t sign in to Review Radar' };
  const res = await fetch(`${sbBase()}/auth/v1/user`, { method: 'PUT', headers, body: JSON.stringify({ password }) }).catch(() => null);
  if (!res) return { ok: false, error: 'Could not reach Supabase — check the internet connection' };
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const code = j.error_code || '';
    const msg = j.msg || j.message || j.error_description || '';
    if (code === 'same_password' || /different from the old/i.test(msg)) return { ok: false, error: 'Choose a password different from your current one' };
    if (code === 'weak_password' || /weak|at least/i.test(msg)) return { ok: false, error: msg || 'That password is too weak — try a longer one' };
    if (res.status === 401 || res.status === 403) return { ok: false, expired: true, error: 'This reset link has expired — request a new one' };
    if (code === 'reauthentication_needed') return { ok: false, error: 'Supabase asks for re-authentication — turn off “Secure password change” in Supabase Auth settings' };
    return { ok: false, error: msg || 'Could not update the password' };
  }
  attempts.delete(ip);
  return { ok: true, email };
}
