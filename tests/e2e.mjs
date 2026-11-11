// End-to-end test for Proof. Run: node proof/tests/e2e.mjs  (from the workspace root)
// Uses file:// so no server or open port is needed. Fake time via window.PROOF_NOW.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + path.join(dir, 'index.html');
const out = process.env.SHOTS || path.join(os.tmpdir(), 'proof-shots');
fs.mkdirSync(out, { recursive: true });

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// Icons: render the SVG to the PNG sizes iOS and Android need.
for (const s of [180, 512]) {
  const p = await browser.newPage({ viewport: { width: s, height: s } });
  await p.goto('file://' + path.join(dir, 'icon.svg'));
  await p.screenshot({ path: path.join(dir, `icon-${s}.png`), omitBackground: true });
  await p.close();
}

async function fresh(scheme, nowIso, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.addInitScript(([n, s]) => {
    window.PROOF_NOW = n;
    if (s !== undefined && !sessionStorage.getItem('seeded')) { localStorage.setItem('proof.v1', s); sessionStorage.setItem('seeded', '1'); }
  }, [nowIso, seed === undefined ? undefined : JSON.stringify(seed)]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(url);
  return { ctx, page, errs };
}
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('proof.v1') || 'null'));

// 1. Empty start, set a task, validation, complete, undo.
console.log('Flow 1: first day');
{
  const { ctx, page, errs } = await fresh('light', '2026-11-11T08:30:00');
  ok(await page.textContent('#hello') === 'Good morning', 'greeting follows the clock');
  await page.click('#t-set');
  ok(await page.textContent('#toast') === 'Write the task first', 'empty task is refused');
  await page.fill('#t-in', 'Solve one LeetCode easy');
  await page.click('[data-m="5"]');
  ok(await page.inputValue('#t-in') === 'Solve one LeetCode easy', 'picking a size keeps typed text');
  await page.click('#t-set');
  let s = await state(page);
  ok(s.tasks['2026-11-11']?.mins === 5 && s.tasks['2026-11-11'].done === false, 'task saved with 5 min');
  await page.waitForTimeout(2000); await page.screenshot({ path: `${out}/light-today-set.png` });
  await page.click('#t-done');
  s = await state(page);
  ok(s.tasks['2026-11-11'].done === true, 'tick marks it done');
  ok((await page.textContent('#ring-n')) === '1', 'week ring shows 1');
  ok((await page.locator('.dot.done').count()) === 1, 'one green dot this week');
  ok((await page.textContent('.hero .meta')).includes('win number 1'), 'win count shown');
  await page.waitForTimeout(2000); await page.screenshot({ path: `${out}/light-today-done.png` });
  await page.click('#t-undo');
  ok((await state(page)).tasks['2026-11-11'].done === false, 'undo works');
  await page.click('#t-edit');
  ok(await page.inputValue('#t-in') === 'Solve one LeetCode easy', 'change task refills the text');
  ok(!(await state(page)).tasks['2026-11-11'], 'change task clears the saved one');
  ok(errs.length === 0, 'no JS errors: ' + errs.join(' | '));
  await ctx.close();
}

// 2. Catch a thought, wall filters, HTML escaping.
console.log('Flow 2: catch + wall');
{
  const { ctx, page, errs } = await fresh('light', '2026-11-11T21:00:00');
  ok(await page.textContent('#hello') === 'Good evening', 'evening greeting');
  await page.click('.tabs [data-v="catch"]');
  await page.fill('#c-thought', 'I am bad at <b>system design</b>');
  await page.click('#c-save');
  ok(await page.textContent('#toast') === 'Add the fairer version', 'needs a fairer version');
  await page.fill('#c-p', 'Only 2 days of prep');
  await page.fill('#c-new', 'System design is new to me and I am learning it');
  await page.click('#c-save');
  ok((await state(page)).reframes.length === 1, 'reframe saved');
  ok(await page.inputValue('#c-thought') === '', 'form cleared');
  await page.click('.tabs [data-v="wall"]');
  ok((await page.locator('#wall li.ref').count()) === 1, 'reframe on the wall');
  ok((await page.locator('#wall b').count()) === 0, 'user text is escaped, not rendered as HTML');
  await page.click('#wall-seg [data-f="win"]');
  ok((await page.locator('#wall li.ref').count()) === 0, 'Wins filter hides reframes');
  ok(errs.length === 0, 'no JS errors: ' + errs.join(' | '));
  await ctx.close();
}

// 3. Five done days in a row -> step-up nudge; a missed day -> gentle message; chart + stats.
console.log('Flow 3: history, nudge, missed day');
const hist = (days, doneFn) => {
  const tasks = {};
  for (let i = 1; i <= days; i++) {
    const d = new Date(2026, 10, 11 - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    tasks[k] = { text: `Task ${i}`, mins: 2, done: doneFn(i), at: d.toISOString(), doneAt: d.toISOString() };
  }
  return { tasks, reframes: [], size: 2, nudgeOff: '' };
};
{
  const { ctx, page, errs } = await fresh('dark', '2026-11-11T09:00:00', hist(30, (i) => i <= 5 || (i > 6 && i % 3 === 0)));
  ok(await page.isVisible('#nudge'), 'nudge shows after 5 done days in a row');
  ok((await page.textContent('#nudge')).includes('5 days in a row'), 'nudge states the run');
  await page.waitForTimeout(2000); await page.screenshot({ path: `${out}/dark-today-nudge.png` });
  await page.click('#n-yes');
  ok((await state(page)).size === 5, 'accepting moves the default to 5 min');
  ok(!(await page.isVisible('#nudge')), 'nudge goes away after answering');
  ok((await page.locator('[data-m="5"].sel').count()) === 1, 'new default size preselected');
  await page.click('.tabs [data-v="week"]');
  ok((await page.locator('.wk').count()) === 8, 'chart has 8 weeks');
  const st = await page.textContent('#stats');
  ok(/\d+%/.test(st), 'done rate shown: ' + st.replace(/\s+/g, ' ').trim());
  await page.waitForTimeout(2000); await page.screenshot({ path: `${out}/dark-week.png` });
  await page.click('.tabs [data-v="wall"]');
  ok((await page.locator('#wall li').count()) > 5, 'wins listed on wall');
  await page.waitForTimeout(2000); await page.screenshot({ path: `${out}/dark-wall.png` });
  ok(errs.length === 0, 'no JS errors: ' + errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, page } = await fresh('light', '2026-11-11T09:00:00', hist(3, (i) => i !== 1));
  ok((await page.textContent('#today-card')).includes('Yesterday didn’t land'), 'missed yesterday -> gentle message, no shaming');
  ok(!(await page.isVisible('#nudge')), 'no nudge without a 5-day run');
  await ctx.close();
}

// 4. Day rollover + persistence across reloads.
console.log('Flow 4: persistence + new day');
{
  const seed = { tasks: { '2026-11-11': { text: 'Walk 10 min', mins: 10, done: true, at: '', doneAt: '2026-11-11T10:00:00' } }, reframes: [], size: 2, nudgeOff: '' };
  const { ctx, page } = await fresh('light', '2026-11-12T07:00:00', seed);
  ok((await page.locator('#t-in').count()) === 1, 'next day starts with an empty task');
  ok((await page.textContent('#ring-n')) === '1', 'yesterday still counts this week');
  await page.reload();
  ok((await state(page)).tasks['2026-11-11'].text === 'Walk 10 min', 'data survives reload');
  await ctx.close();
}

// 5. Corrupt storage does not crash the app.
console.log('Flow 5: bad data');
{
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('x')) { localStorage.setItem('proof.v1', '{not json'); sessionStorage.setItem('x', 1); } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url);
  ok(errs.length === 0 && (await page.locator('#t-in').count()) === 1, 'corrupt data -> fresh start, no crash');
  ok((await page.evaluate(() => localStorage.getItem('proof.v1.broken'))) === '{not json', 'broken copy kept aside');
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed. Screenshots: ${out}`);
process.exit(fail ? 1 : 0);
