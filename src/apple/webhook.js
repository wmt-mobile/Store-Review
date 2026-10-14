// Signed App Store Connect webhook receiver.
// Registered URL: {PUBLIC_BASE_URL}/apple/webhook/{accountId}?app={appId}
import crypto from 'node:crypto';

/** Accepts "hmacsha256=<hex>", plain hex or base64 signatures. */
export function verifySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const sig = String(header).trim().replace(/^hmacsha256=/i, '').replace(/^sha256=/i, '');
  const mac = crypto.createHmac('sha256', secret).update(rawBody);
  const digest = mac.digest();
  for (const enc of ['hex', 'base64']) {
    let given;
    try { given = Buffer.from(sig, enc); } catch { continue; }
    if (given.length === digest.length && crypto.timingSafeEqual(given, digest)) return true;
  }
  return false;
}

export function appleWebhookHandler({ accountById, poke }) {
  return async (req, res) => {
    const account = accountById(req.params.accountId);
    if (!account || account.store !== 'apple') return res.status(404).end();
    const raw = req.body instanceof Buffer ? req.body : Buffer.from('');
    if (!verifySignature(raw, req.get('x-apple-signature'), account.webhookSecret)) return res.status(401).end();
    let payload = {};
    try { payload = JSON.parse(raw.toString('utf8') || '{}'); } catch {}
    const type = payload?.data?.type || 'unknown';
    res.status(200).json({ ok: true });
    if (/ping/i.test(type)) return console.log(`[apple:webhook] ping ok for ${account.id}`);
    const appId = req.query.app;
    console.log(`[apple:webhook] ${type} account=${account.id} app=${appId || '?'}`);
    poke(account, appId).catch((e) => console.error('[apple:webhook] poke failed', e.message));
  };
}
