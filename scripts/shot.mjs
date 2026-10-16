// Dev helper: screenshot a page with headless Chrome. Compare against design/png/<frame>.png.
// node scripts/shot.mjs <url> <out.png> [width=1440] [height=1024] [--dark] [--full] [--click=<css>] [--wait=<ms>]
import { chromium } from 'playwright-core';

const [url, out, w = '1440', h = '1024'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (n) => process.argv.find((a) => a.startsWith(`--${n}`));
const val = (n) => flag(n)?.split('=').slice(1).join('=');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, colorScheme: flag('dark') ? 'dark' : 'light', deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript((dark) => { try { localStorage.setItem('rr-theme', dark ? 'dark' : 'light'); localStorage.setItem('rr-push-card', '"dismissed"'); } catch {} }, Boolean(flag('dark')));
await page.goto(url, { waitUntil: 'networkidle' });
for (const c of (val('click') || '').split('|').filter(Boolean)) { await page.click(c); await page.waitForTimeout(400); }
await page.waitForTimeout(Number(val('wait') || 600));
await page.screenshot({ path: out, fullPage: Boolean(flag('full')) });
await browser.close();
console.log(`saved ${out}`);
if (logs.length) console.log(logs.join('\n'));
