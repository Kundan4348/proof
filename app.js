'use strict';
// Proof: one tiny task a day, catch "I can't" thoughts, see the evidence pile up.
// All data lives in localStorage on this device.

const KEY = 'proof.v1';
const STEPS = [2, 5, 10, 20];           // minute sizes, smallest first
const now = () => (window.PROOF_NOW ? new Date(window.PROOF_NOW) : new Date());
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const nice = (k) => fromKey(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') return { tasks: s.tasks || {}, reframes: s.reframes || [], size: s.size || 2, nudgeOff: s.nudgeOff || '' };
  } catch (e) { /* corrupt data: start fresh but keep the raw copy */ localStorage.setItem(KEY + '.broken', localStorage.getItem(KEY) || ''); }
  return { tasks: {}, reframes: [], size: 2, nudgeOff: '' };
}
let S = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 1800);
}

/* ---------- streak + nudge logic ---------- */
// Consecutive done days ending yesterday (or today if today is done).
function doneRun() {
  let d = now(); let n = 0;
  if (!S.tasks[dkey(d)]?.done) d = addDays(d, -1);
  while (S.tasks[dkey(d)]?.done) { n++; d = addDays(d, -1); }
  return n;
}
function nextSize() { const i = STEPS.indexOf(S.size); return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null; }

/* ---------- TODAY ---------- */
let pickMins = null;
function renderToday() {
  const k = dkey(now()); const t = S.tasks[k]; const el = $('#today-card');
  const h = now().getHours();
  $('#hello').textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('#date').textContent = now().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  if (!t) {
    const m = pickMins ?? S.size;
    const y = S.tasks[dkey(addDays(now(), -1))];
    const missed = y && !y.done;
    el.className = 'card hero';
    el.innerHTML = `
      <span class="tag">Today’s one thing</span>
      <p class="sub">${missed ? 'Yesterday didn’t land. That tells you the size was off, it says nothing about you. Go a bit smaller today.' : 'Pick something small enough that you’ll almost surely finish it.'}</p>
      <input type="text" id="t-in" maxlength="120" placeholder="e.g. Solve one LeetCode easy" autocomplete="off">
      <div class="mins">${STEPS.map((s) => `<button class="btn ${s === m ? 'sel' : ''}" data-m="${s}">${s} min</button>`).join('')}</div>
      <button class="btn primary wide" id="t-set">Set today’s task</button>`;
    el.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { pickMins = +b.dataset.m; const v = $('#t-in').value; renderToday(); $('#t-in').value = v; });
    $('#t-set').onclick = () => {
      const text = $('#t-in').value.trim();
      if (!text) { $('#t-in').focus(); toast('Write the task first'); return; }
      S.tasks[k] = { text, mins: pickMins ?? S.size, done: false, at: now().toISOString() };
      pickMins = null; save(); renderAll();
    };
    $('#t-in').onkeydown = (e) => { if (e.key === 'Enter') $('#t-set').click(); };
  } else if (!t.done) {
    el.className = 'card hero';
    el.innerHTML = `
      <span class="tag">${t.mins} min</span>
      <p class="task">${esc(t.text)}</p>
      <p class="meta">Do it, then tick it here.</p>
      <button class="btn primary wide" id="t-done">I did it</button>
      <div class="row" style="margin-top:8px"><button class="btn ghost" id="t-edit">Change task</button></div>`;
    $('#t-done').onclick = () => { t.done = true; t.doneAt = now().toISOString(); save(); renderAll(); toast('Added to your wall'); };
    $('#t-edit').onclick = () => { delete S.tasks[k]; pickMins = t.mins; save(); renderAll(); $('#t-in').value = t.text; };
  } else {
    const wins = Object.values(S.tasks).filter((x) => x.done).length;
    el.className = 'card hero done';
    el.innerHTML = `
      <span class="tag">Done ✓</span>
      <p class="task">${esc(t.text)}</p>
      <p class="meta">You said you’d do it, and you did. That’s win number ${wins} on your wall.</p>
      <button class="btn ghost" id="t-undo">Undo</button>`;
    $('#t-undo').onclick = () => { t.done = false; delete t.doneAt; save(); renderAll(); };
  }

  // Step-up nudge: 5 done days in a row, bigger size available, not dismissed today.
  const nz = $('#nudge'); const nx = nextSize();
  if (doneRun() >= 5 && nx && S.nudgeOff !== dkey(now())) {
    nz.hidden = false;
    nz.innerHTML = `<b>${doneRun()} days in a row.</b> Your tasks have been fitting well. Want to try ${nx}-minute tasks from now on?
      <div class="row"><button class="btn primary" id="n-yes">Try ${nx} min</button><button class="btn" id="n-no">Not yet</button></div>`;
    $('#n-yes').onclick = () => { S.size = nx; S.nudgeOff = dkey(now()); save(); renderAll(); toast(`New size: ${nx} min`); };
    $('#n-no').onclick = () => { S.nudgeOff = dkey(now()); save(); renderAll(); };
  } else nz.hidden = true;

  // Week dots (Mon..Sun) + ring
  const mon = monday(now()); let done = 0; const today = dkey(now());
  $('#dots').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mon, i); const kk = dkey(d); const tt = S.tasks[kk];
    if (tt?.done) done++;
    const cls = ['dot', tt ? (tt.done ? 'done' : 'tried') : '', kk === today ? 'today' : ''].join(' ');
    return `<div class="${cls}"><i></i>${d.toLocaleDateString(undefined, { weekday: 'narrow' })}</div>`;
  }).join('');
  $('#ring-n').textContent = done;
  $('#ring-fg').style.strokeDashoffset = String(97.4 * (1 - done / 7));
}

/* ---------- CATCH ---------- */
$('#c-save').onclick = () => {
  const v = (id) => $(id).value.trim();
  const r = { id: Date.now().toString(36), at: now().toISOString(), thought: v('#c-thought'), p: v('#c-p'), t: v('#c-t'), a: v('#c-a'), fair: v('#c-new') };
  if (!r.thought) { $('#c-thought').focus(); toast('Write the thought first'); return; }
  if (!r.fair) { $('#c-new').focus(); toast('Add the fairer version'); return; }
  S.reframes.push(r); save();
  ['#c-thought', '#c-p', '#c-t', '#c-a', '#c-new'].forEach((id) => { $(id).value = ''; });
  toast('Saved to your wall'); renderAll();
};

/* ---------- WALL ---------- */
let wallF = 'all';
function wallItems() {
  const wins = Object.entries(S.tasks).filter(([, t]) => t.done).map(([k, t]) => ({ kind: 'win', when: t.doneAt || k, day: k, t }));
  const refs = S.reframes.map((r) => ({ kind: 'ref', when: r.at, day: dkey(new Date(r.at)), r }));
  return [...wins, ...refs].sort((a, b) => (a.when < b.when ? 1 : -1));
}
function renderWall() {
  const all = wallItems();
  const nW = all.filter((x) => x.kind === 'win').length; const nR = all.length - nW;
  $('#wall-sum').textContent = all.length ? `${nW} ${nW === 1 ? 'win' : 'wins'} and ${nR} ${nR === 1 ? 'reframe' : 'reframes'}. Read this on a bad day.` : '';
  const list = all.filter((x) => wallF === 'all' || x.kind === wallF);
  $('#wall').innerHTML = list.length ? list.map((x) => x.kind === 'win'
    ? `<li><div class="wt">${esc(x.t.text)}</div><div class="wm">Done · ${nice(x.day)} · ${x.t.mins} min</div></li>`
    : `<li class="ref"><div class="old">${esc(x.r.thought)}</div><div class="wt">${esc(x.r.fair)}</div><div class="wm">Reframed · ${nice(x.day)}</div></li>`
  ).join('') : `<li class="empty" style="border:0;background:none">Nothing here yet. Finish today’s task and it shows up here.</li>`;
}
document.querySelectorAll('#wall-seg button').forEach((b) => b.onclick = () => {
  wallF = b.dataset.f; document.querySelectorAll('#wall-seg button').forEach((x) => x.classList.toggle('on', x === b)); renderWall();
});

/* ---------- WEEK ---------- */
function renderWeek() {
  const mon = monday(now()); const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const start = addDays(mon, -7 * w); let tried = 0; let done = 0;
    for (let i = 0; i < 7; i++) { const t = S.tasks[dkey(addDays(start, i))]; if (t) { tried++; if (t.done) done++; } }
    weeks.push({ start, tried, done });
  }
  $('#chart').innerHTML = weeks.map((w) => `<div class="wk" title="${w.done} of ${w.tried} done">
      <div class="bars"><i class="t" style="height:${(w.tried / 7) * 100}%"></i><i class="d" style="height:${(w.done / 7) * 100}%"></i></div>
      <span>${w.start.getDate()}/${w.start.getMonth() + 1}</span></div>`).join('');

  let t28 = 0; let d28 = 0;
  for (let i = 0; i < 28; i++) { const t = S.tasks[dkey(addDays(now(), -i))]; if (t) { t28++; if (t.done) d28++; } }
  const wins = Object.values(S.tasks).filter((x) => x.done).length;
  $('#stats').innerHTML = `
    <div class="stat"><b>${wins}</b><span>wins so far</span></div>
    <div class="stat"><b>${t28 ? Math.round((100 * d28) / t28) + '%' : '–'}</b><span>done, last 28 days</span></div>
    <div class="stat"><b>${S.reframes.length}</b><span>thoughts reframed</span></div>`;
}

/* ---------- backup ---------- */
$('#exp').onclick = () => {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `proof-backup-${dkey(now())}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#imp').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || typeof d.tasks !== 'object' || !Array.isArray(d.reframes)) throw new Error('bad');
    if (!confirm('Replace the data on this device with this backup?')) return;
    S = { tasks: d.tasks, reframes: d.reframes, size: STEPS.includes(d.size) ? d.size : 2, nudgeOff: '' };
    save(); renderAll(); toast('Backup restored');
  } catch (err) { toast('That file is not a Proof backup'); }
  e.target.value = '';
};

/* ---------- tabs ---------- */
document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === 'v-' + b.dataset.v));
  window.scrollTo(0, 0);
});

function renderAll() { renderToday(); renderWall(); renderWeek(); }
renderAll();
// Re-render when the app comes back to the front (date may have changed overnight).
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
