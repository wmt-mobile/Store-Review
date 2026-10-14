// One-time OAuth for the shared mailbox → prints GMAIL_REFRESH_TOKEN.
import http from 'node:http';
import { google } from 'googleapis';
import { config } from '../src/config.js';

const { clientId, clientSecret } = config.gmail;
if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first (OAuth client type: Desktop app).');
  process.exit(1);
}
const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}/callback`;
const oauth = new google.auth.OAuth2(clientId, clientSecret, redirect);
const url = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/gmail.readonly'] });

console.log('\nOpen this URL and sign in as the SHARED mailbox:\n\n' + url + '\n');
http
  .createServer(async (req, res) => {
    const u = new URL(req.url, redirect);
    if (u.pathname !== '/callback') return res.end();
    try {
      const { tokens } = await oauth.getToken(u.searchParams.get('code'));
      res.end('Done. You can close this tab.');
      console.log(`\nAdd to .env:\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      process.exit(0);
    } catch (e) {
      res.end('Failed: ' + e.message);
      console.error(e.message);
      process.exit(1);
    }
  })
  .listen(PORT, '127.0.0.1');
