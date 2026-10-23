import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'pk_test';
process.env.AUTH_ALLOWED_EMAILS = 'ok@example.com';
const { requestPasswordReset, resetPassword } = await import('../src/auth.js');

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), ...opts });
    const [status, body] = handler(String(url), opts);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

test('reset: request sends Supabase recover with redirect_to', async () => {
  const calls = mockFetch(() => [200, {}]);
  const r = await requestPasswordReset('OK@example.com', '1.1.1.1', 'https://radar.test/reset-password');
  assert.deepEqual(r, { ok: true, sent: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/recover\?redirect_to=https%3A%2F%2Fradar\.test%2Freset-password$/);
  assert.equal(JSON.parse(calls[0].body).email, 'ok@example.com');
});

test('reset: unknown / not allowed email looks like success but sends nothing', async () => {
  const calls = mockFetch(() => [200, {}]);
  const r = await requestPasswordReset('stranger@example.com', '1.1.1.2', 'https://radar.test/reset-password');
  assert.equal(r.ok, true);
  assert.equal(calls.length, 0);
  assert.equal((await requestPasswordReset('nope', '1.1.1.2', 'x')).ok, false);
});

test('reset: per-IP limit', async () => {
  mockFetch(() => [200, {}]);
  let last;
  for (let i = 0; i < 6; i++) last = await requestPasswordReset('x@example.com', '9.9.9.9', 'x');
  assert.equal(last.ok, false);
  assert.match(last.error, /Too many/);
});

test('reset: set new password with recovery token', async () => {
  const calls = mockFetch((url, o) => (o.method === 'PUT' ? [200, { email: 'ok@example.com' }] : [200, { email: 'ok@example.com' }]));
  const r = await resetPassword('tok123', 'newpassword1', '2.2.2.2');
  assert.deepEqual(r, { ok: true, email: 'ok@example.com' });
  assert.equal(calls[1].method, 'PUT');
  assert.equal(calls[1].headers.Authorization, 'Bearer tok123');
  assert.equal(JSON.parse(calls[1].body).password, 'newpassword1');
});

test('reset: expired token, short password, same password', async () => {
  mockFetch(() => [401, { msg: 'invalid JWT' }]);
  const r1 = await resetPassword('old', 'newpassword1', '3.3.3.3');
  assert.equal(r1.ok, false);
  assert.equal(r1.expired, true);
  assert.equal((await resetPassword('tok', 'short', '3.3.3.3')).ok, false);
  mockFetch((url, o) => (o.method === 'PUT' ? [422, { error_code: 'same_password', msg: 'New password should be different from the old password.' }] : [200, { email: 'ok@example.com' }]));
  const r3 = await resetPassword('tok', 'samepassword1', '3.3.3.3');
  assert.match(r3.error, /different/);
  mockFetch(() => [200, { email: 'other@example.com' }]);
  assert.equal((await resetPassword('tok', 'newpassword1', '3.3.3.4')).expired, true);
});
