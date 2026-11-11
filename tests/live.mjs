// Checks the deployed site: loads, service worker installs, a task can be set and ticked,
// and the app still opens with the network cut off. Run: node tests/live.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://kundan4348.github.io/proof/';
let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));

await page.goto(url, { waitUntil: 'networkidle' });
ok((await page.title()) === 'Proof', 'page loads over HTTPS');
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
ok(sw, 'service worker active');
const man = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
ok(man.display === 'standalone' && man.icons.length === 3, 'manifest ok for home-screen install');

await page.fill('#t-in', 'Live check task');
await page.click('#t-set');
await page.click('#t-done');
ok((await page.textContent('#ring-n')) === '1', 'set + tick works on the live site');

await page.reload({ waitUntil: 'networkidle' }); // let the SW cache everything
await ctx.setOffline(true);
await page.reload();
ok((await page.title()) === 'Proof' && (await page.textContent('.hero .task')) === 'Live check task', 'opens offline with data intact');
ok(errs.length === 0, 'no JS errors: ' + errs.join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
