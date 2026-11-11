// Phase 6 in a real browser: the dashboard never loses a change. Drives the owner dashboard on the local site with Node Playwright
// (Chromium, software 3D) and prints PASS/FAIL lines like the other tests. Takes about three to five minutes.
// Needs: the local site and pretend database with the test accounts and demo catalogue
//   python3 dev/test/mockredis.py 8793 & node dev/test/devserver.js & node dev/test/api3.js && node dev/test/demo.js
// Run: node dev/test/ui/p6ui.js      Screenshots (2x) of every new state go to dev/out/shots/p6/.
// It puts the gallery back as it found it at the end (a new version with the starting catalogue) and leaves no draft behind.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const B = 'http://localhost:8794', U = B + '/api/app', MOCK = 'http://127.0.0.1:8793', IP = '10.9.' + Math.floor(Math.random() * 250) + '.1';
const SHOTS = path.join(__dirname, '..', '..', 'out', 'shots', 'p6'); fs.mkdirSync(SHOTS, { recursive: true });
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
async function P(b, tok) { const h = { 'Content-Type': 'application/json', 'x-forwarded-for': IP }; if (tok) h.Authorization = 'Bearer ' + tok; const r = await fetch(U, { method: 'POST', headers: h, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); j._s = r.status; return j }
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const mock = cmd => fetch(MOCK, { method: 'POST', headers: { Authorization: 'Bearer testtoken', 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) }).then(r => r.json());
const exact = s => new RegExp('^\\s*' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
const ERRS = [], SHOT = [];
let OT = null;

function watch(p, name) {
  p.on('pageerror', e => ERRS.push(name + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) ERRS.push(name + ' console: ' + m.text().slice(0, 300)) });
  p.on('dialog', d => d.accept().catch(() => { }));     // the browser's "leave this page?" question
}
async function newCtx(b, opts) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true }, opts || {}));
  await ctx.addInitScript(t => {
    try { localStorage.setItem('pgTok', t); localStorage.setItem('pgFilm', '1'); localStorage.setItem('georgeIntro', 'done'); localStorage.setItem('georgeAway', '1') } catch (e) { }
    // test speed only: software rendering is slow, so the 3D behind the dashboard is not drawn (window.__freeze, test copy of the page),
    // and the blur behind open windows is left out (it takes tens of seconds per screenshot in software)
    window.__freeze = 1;
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'dialog::backdrop{backdrop-filter:none!important}'; document.head.appendChild(st) });
  }, OT);
  return ctx;
}
const ready = p => p.waitForFunction(() => typeof openDash === 'function' && typeof ME !== 'undefined' && ME && ME.owner, null, { timeout: 600000, polling: 500 });
async function open(ctx, name) { const p = await ctx.newPage(); watch(p, name); await p.goto(B + '/?q=low', { waitUntil: 'commit' }); await ready(p); return p }
async function click(p, sel) { const l = typeof sel === 'string' ? p.locator(sel).first() : sel; try { await l.click({ timeout: 8000 }) } catch (e) { await l.evaluate(x => x.click()) } }
const btn = (p, name, scope) => p.locator((scope || '#dash') + ' button').filter({ hasText: exact(name) }).first();
async function dash(p, tab) {
  await p.evaluate(() => { if (!dashD.open) openDash() });
  await p.waitForFunction(() => DASH && document.querySelector('#dStats .stat') && !EDload, null, { timeout: 60000 }); await p.waitForTimeout(300);
  if (tab) await tabTo(p, tab);
}
async function tabTo(p, t) {
  await click(p, '#dash .dtabs [data-t="' + t + '"]');
  if (/^[agrts]$/.test(t)) await p.waitForFunction(() => !EDload && (document.getElementById('edState') || document.querySelector('#dBody .edoffer') || document.querySelector('#dBody .err')), null, { timeout: 60000 });
}
async function reopen(p, tab) { await p.evaluate(() => { if (dashD.open) dashD.close() }); await dash(p, tab) }   // starts again from the live version when nothing is unpublished
const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent : null }, sel);
async function waitState(p, re, ms) { try { await p.waitForFunction(s => { const e = document.getElementById('edState'); return !!e && new RegExp(s).test(e.textContent) }, re.source, { timeout: ms || 15000 }); return true } catch (e) { return false } }
const until = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 60000 }).then(() => true, () => false);
async function shot(p, name) { await p.screenshot({ path: path.join(SHOTS, name + '.png') }); SHOT.push(name + '.png') }
async function noOverflow(p) {
  return p.evaluate(() => { const d = document.querySelector('#dash .txt'), out = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page ' + document.documentElement.scrollWidth + '>' + innerWidth);
    if (d.scrollWidth > d.clientWidth + 1) out.push('dashboard ' + d.scrollWidth + '>' + d.clientWidth);
    document.querySelectorAll('#dBody .edbar, #dBody .edoffer, #dBody .edask, #dBody .edmsg, #dBody .mailwarn, #dBody .vrow, #dBody .vbox, #dBody .edbar button').forEach(e => {
      const r = e.getBoundingClientRect(), c = d.getBoundingClientRect(); if (r.width && (r.right > c.right + 1 || r.left < c.left - 1)) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '–' + Math.round(r.right) + ' outside ' + Math.round(c.left) + '–' + Math.round(c.right)) });
    return out });
}
const titleBox = (p, i) => p.locator('#dBody .edrow').nth(i).locator('input[placeholder="e.g. Orchid in the Clouds"]');
async function editTitle(p, i, val) {
  const row = p.locator('#dBody .edrow').nth(i);
  if (!(await row.evaluate(r => r.classList.contains('open')))) { await click(p, row.locator('.edacts button').filter({ hasText: exact('Edit') })); await p.waitForTimeout(200) }
  await titleBox(p, i).fill(val);
}
const devKeys = p => p.evaluate(() => Object.keys(localStorage).filter(k => /^pgDashDraft/.test(k)).length);   // copies of unpublished changes kept on this device (one per dashboard session)
const ONLY = (process.env.P6UI_ONLY || '').split(',').filter(Boolean);   // e.g. P6UI_ONLY=x,y runs only steps (x) and (y)
async function step(name, fn) { if (ONLY.length && !ONLY.some(k => name.startsWith('(' + k + ')'))) return; try { await fn() } catch (e) { ok(false, name + ' — stopped: ' + String(e && e.message || e).split('\n')[0].slice(0, 300)) } }

(async () => {
  const t0 = Date.now();
  OT = (await P({ a: 'login', email: 'pts98@hotmail.co.uk', password: 'testpass123' })).token;
  ok(!!OT, 'signed in as the owner (pretend database)'); if (!OT) return;
  await mock(['MOCK.FAILWRITES', '']);
  const cat0 = (await P({ a: 'catGet' }, OT)).cat; const left = (await P({ a: 'draftGet' }, OT)).draft; if (left) await P({ a: 'draftClear', t: left.t }, OT);
  ok(cat0 && cat0.v && cat0.arts.length >= 6, 'a published catalogue to work with (on a fresh database run api3.js && demo.js first)'); if (!cat0 || cat0.arts.length < 6) return;
  const hv = await P({ a: 'catHist' }, OT);
  if (hv.total < 25) { let v = cat0.v; for (let i = hv.total; i < 25; i++) { const x = JSON.parse(JSON.stringify(cat0)); x.site.banner = { on: false, text: 'P6UI page filler ' + i }; const r = await P({ a: 'catSave', cat: x, base: v }, OT); if (r.ok) v = r.cat.v }
    await P({ a: 'catSave', cat: cat0, base: v }, OT) }
  const b = await chromium.launch({ args: ARGS });
  const ctx = await newCtx(b);
  const pA = await open(ctx, 'tab A');
  ok(true, 'the gallery opened in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  let tOld = '', T1 = 'P6UI Morning Orchid', id0 = '', v0 = 0;

  await step('(a) autosave', async () => {
    await dash(pA, 'a');
    ({ t: tOld, id: id0, v: v0 } = await pA.evaluate(() => ({ t: ED.arts[0].t, id: ED.arts[0].id, v: ED.v })));
    ok(/^Everything is published$/.test(await txt(pA, '#edState')), '(a) the bar starts at “Everything is published”');
    const t1 = Date.now(); await editTitle(pA, 0, T1);
    ok(/^Unpublished changes$/.test(await txt(pA, '#edState')), '(a) straight after typing: “Unpublished changes”');
    const saved = await waitState(pA, /^Unpublished changes — saved as a draft$/, 12000), dt = Date.now() - t1;
    ok(saved && dt >= 1500 && dt < 9000, '(a) about two seconds later: “Unpublished changes — saved as a draft” (' + (dt / 1000).toFixed(1) + ' s)');
    const d = (await P({ a: 'draftGet' }, OT)).draft, a = d && d.cat.arts.find(x => x.id === id0);
    ok(!!a && a.t === T1 && d.base === v0, '(a) draftGet on the server has the new title, marked with the version it started from');
    const dev = await pA.evaluate(() => JSON.parse(localStorage.getItem('pgDashDraft:' + EDSID) || 'null'));
    ok(!!dev && dev.ed.arts[0].t === T1 && dev.sid === d.sid && dev.gen > 0 && await devKeys(pA) === 1, '(a) and this device keeps a copy too (this tab’s own)');
    await shot(pA, 'a-saved-as-draft');
  });

  await step('(b) the offer after a reload', async () => {
    await pA.reload({ waitUntil: 'commit' }); await ready(pA);
    await dash(pA);
    ok(await until(pA, () => document.querySelector('#dBody .edoffer'), null, 30000), '(b) after a reload, opening the dashboard offers the unpublished changes (on the first tab)');
    const o = await txt(pA, '#dBody .edoffer') || '';
    ok(/^You have unpublished changes from \d{1,2} [A-Z][a-z]{2,4}( \d{4})?, \d\d:\d\d(:\d\d)?\. They were saved as a draft\./.test(o), '(b) “' + o.slice(0, 90) + '…”');
    ok(await until(pA, () => document.activeElement && document.activeElement.id === 'edOfT' && getComputedStyle(document.activeElement).outlineColor === 'rgb(75, 46, 34)', null, 3000), '(b) the offer takes the focus when the dashboard opens, so it isn’t missed (with a clear outline)');
    ok(o.includes('What they change:') && o.includes('Renamed “' + tOld + '” to “' + T1 + '”'), '(b) it says what they change: Renamed “' + tOld + '” to “' + T1 + '”');
    ok(await btn(pA, 'Continue where I left off', '#dBody .edoffer').count() === 1 && await btn(pA, 'Discard them', '#dBody .edoffer').count() === 1, '(b) with “Continue where I left off” and “Discard them”');
    await shot(pA, 'b-offer');
    await tabTo(pA, 'a');
    ok(/Choose what to do with your unpublished changes above/.test(await txt(pA, '#dBody') || ''), '(b) editing waits until Pam chooses (nothing can overwrite the draft)');
    await click(pA, btn(pA, 'Discard them', '#dBody .edoffer'));
    ok(/^Discard these changes for good\?/.test(await txt(pA, '#dBody .edoffer .edconfirm') || '') && await pA.evaluate(() => document.activeElement && document.activeElement.textContent === 'Yes, discard them'), '(b) “Discard them” asks first, with the focus on “Yes, discard them”');
    const grp = await pA.evaluate(() => { const c = document.querySelector('#dBody .edoffer .edconfirm'), l = c && document.getElementById(c.getAttribute('aria-labelledby') || '-'); return c && c.getAttribute('role') === 'group' && l && c.contains(l) ? l.textContent : '' });
    ok(/^Discard these changes for good\?/.test(grp), '(b) the question is a labelled group, so a screen reader reads it with the button');
    await click(pA, btn(pA, 'Keep them', '#dBody .edoffer'));
    await click(pA, btn(pA, 'Continue where I left off', '#dBody .edoffer'));
    await pA.waitForSelector('#dBody .edrow', { timeout: 30000 });
    const back = await pA.evaluate(() => ({ t: ED.arts[0].t, dirty: EDdirty, tab: dTab, row: document.querySelector('#dBody .edrow .edinfo b').textContent, note: (document.querySelector('#dBody .edmsg') || {}).textContent, open: document.querySelector('#dBody .edrow').classList.contains('open'), foc: document.activeElement && document.activeElement.id }));
    ok(back.t === T1 && back.row === T1 && back.dirty && back.tab === 'a', '(b) “Continue where I left off” brings the edit back (“' + back.row + '”)');
    ok(/^Your unpublished changes are back\./.test(back.note || '') && back.foc === 'edNote', '(b) “' + (back.note || '').slice(0, 100) + '…”, and the focus goes to it');
    ok((back.note || '').includes('They change:Renamed “' + tOld + '” to “' + T1 + '”') && back.open, '(b) it lists what they change, and the painting they change is open to check');
    ok(await waitState(pA, /saved as a draft$/, 10000), '(b) and it is this dashboard’s draft now: “' + await txt(pA, '#edState') + '”');
    await shot(pA, 'b-continued');
  });

  let h1 = null;
  await step('(c) publish', async () => {
    const h0 = await P({ a: 'catHist' }, OT);
    await click(pA, '#edPub');
    await until(pA, () => !EDbusy && (EDmsg || EDfail));
    const m = await txt(pA, '#edMsg') || '';
    ok(/^Published — visitors will see your changes from their next visit\./.test(m) && m.includes('Renamed “' + tOld + '” to “' + T1 + '”'), '(c) “' + m.slice(0, 120) + '”');
    ok(await until(pA, () => document.activeElement && document.activeElement.id === 'edMsg', null, 3000), '(c) the focus goes to that message (not lost on the page)');
    ok(await waitState(pA, /^Everything is published$/, 5000), '(c) the bar says “Everything is published”');
    ok((await P({ a: 'draftGet' }, OT)).draft === null, '(c) publishing cleared the server draft');
    ok(await devKeys(pA) === 0, '(c) and the copy on this device');
    h1 = await P({ a: 'catHist' }, OT);
    ok(h1.total === h0.total + 1 && h1.list[0].v === h1.live && h1.list[0].changes[0] === 'Renamed “' + tOld + '” to “' + T1 + '”', '(c) the server keeps it as a new version with its note');
    await shot(pA, 'c-published');
    await tabTo(pA, 's');
    ok(await until(pA, () => document.querySelector('#edVers .vrow'), null, 30000), '(c) Settings → Earlier versions lists the versions');
    const r0 = await txt(pA, '#edVers .vrow') || '';
    ok(/Live now/.test(r0) && r0.includes('Renamed “' + tOld + '” to “' + T1 + '”'), '(c) the newest is “Live now”, with “Renamed “' + tOld + '” to “' + T1 + '””');
    const cnt = await pA.evaluate(() => { const n = [...document.querySelectorAll('#edVers p.note')].map(x => x.textContent).find(t => /^Showing /.test(t)); return n || '' });
    ok(cnt === 'Showing ' + Math.min(20, h1.total) + ' of ' + h1.total + ' versions.', '(c) “' + cnt + '”');
    const more = btn(pA, 'Show earlier versions', '#edVers');
    if (h1.total > 20) {
      ok(await more.isVisible(), '(c) with more than twenty, “Show earlier versions” is there');
      await click(pA, more); await until(pA, () => document.querySelectorAll('#edVers .vrow').length > 20, null, 20000);
      const cnt2 = await pA.evaluate(() => [...document.querySelectorAll('#edVers p.note')].map(x => x.textContent).find(t => /^Showing /.test(t)) || '');
      const vs = await pA.evaluate(() => [...document.querySelectorAll('#edVers .vrow .vhead b')].length);
      ok(cnt2 === 'Showing ' + Math.min(40, h1.total) + ' of ' + h1.total + ' versions.' && vs === Math.min(40, h1.total) && (h1.total > 40 || !(await more.isVisible())), '(c) it adds the next twenty: “' + cnt2 + '”');
      ok(await pA.evaluate(() => { const a = document.activeElement, r = document.querySelectorAll('#edVers .vrow')[20]; return !!a && !!r && r.contains(a) && a.matches('.vhead b') }), '(c) and the focus moves on to the first of them (not lost when the button goes)');
      const labels = await pA.evaluate(() => [...document.querySelectorAll('#edVers .vrow button')].filter(b => b.textContent === 'Download').map(b => b.getAttribute('aria-label')));
      const vv = (await P({ a: 'catHist' }, OT)).list.concat((await P({ a: 'catHist', from: 20 }, OT)).list).slice(0, labels.length), secs = new Set(vv.map(x => Math.floor(x.v / 1000))).size;   // (this test publishes some versions within the same second, which Pam can't)
      ok(labels.length > 20 && new Set(labels).size === secs, '(c) each version’s buttons have their own name, even for versions from the same minute (' + labels.filter(l => /:\d\d:\d\d$/.test(l)).length + ' of ' + labels.length + ' show the seconds)');
    } else ok(!(await more.isVisible()), '(c) no “Show earlier versions” button when everything is shown');
    await pA.locator('#edVers').scrollIntoViewIfNeeded(); await pA.evaluate(() => document.getElementById('edVers').scrollIntoView());
    await shot(pA, 'c-earlier-versions');
  });

  await step('(d) bring back an older version', async () => {
    const row = pA.locator('#edVers .vrow').nth(1), when = await row.locator('.vhead b').textContent();
    ok(await row.locator('button').filter({ hasText: exact('Restore') }).getAttribute('aria-label') === 'Restore the version from ' + when, '(d) each Restore button says which version (for screen readers)');
    await click(pA, row.locator('button').filter({ hasText: exact('Restore') }));
    ok(await until(pA, () => { const c = document.querySelectorAll('#edVers .vrow')[1].querySelector('.edconfirm'); return !!c && !c.hidden && /What it would change:/.test(c.textContent) }, null, 20000), '(d) Restore first checks what it would change');
    const cf = await row.locator('.edconfirm').textContent();
    ok(cf.startsWith('Restore the version from ' + when + '? It goes live straight away, and the version that’s live now stays in this list.') && cf.includes('What it would change:Renamed “' + T1 + '” to “' + tOld + '”'), '(d) then asks, saying what would change: “' + cf.slice(0, 100) + '…”');
    ok(await pA.evaluate(() => { const a = document.activeElement, c = a && a.closest('.edconfirm'), l = c && document.getElementById(c.getAttribute('aria-labelledby') || '-'); return a.textContent === 'Yes, restore it' && c.getAttribute('role') === 'group' && !!l && /^Restore the version from/.test(l.textContent) }), '(d) the focus is on “Yes, restore it”, in a group labelled by the question');
    ok((await P({ a: 'catHist' }, OT)).total === h1.total, '(d) nothing changes before Pam says yes');
    await row.scrollIntoViewIfNeeded(); await shot(pA, 'd-restore-asks');
    await click(pA, row.locator('button').filter({ hasText: exact('Yes, restore it') }));
    await until(pA, () => /^Restored|^That version is the same/.test(EDmsg || '') || !!EDfail);
    const m = await txt(pA, '#edMsg') || '';
    ok(m.startsWith('Restored the version from ' + when + '. Visitors will see it from their next visit.') && await pA.evaluate(() => document.activeElement && document.activeElement.id === 'edMsg'), '(d) “' + m.slice(0, 110) + '” (with the focus on it)');
    const h2 = await P({ a: 'catHist' }, OT), live = (await P({ a: 'catGet' }, OT)).cat;
    ok(h2.total === h1.total + 1 && h2.list[0].kind === 'restore' && /^Restored the version from /.test(h2.list[0].changes[0]), '(d) it became a new version: “' + h2.list[0].changes[0] + '”');
    ok(h2.list[0].changes.includes('Renamed “' + T1 + '” to “' + tOld + '”') && live.arts[0].t === tOld, '(d) the old title is live again (“Renamed “' + T1 + '” to “' + tOld + '””)');
    ok(h2.list.some(x => x.v === h1.list[0].v), '(d) the version it replaced is still kept');
    await shot(pA, 'd-restored');
  });

  await step('(e) backups', async () => {
    await pA.waitForSelector('#edVers .vbk', { timeout: 30000 });
    const live = (await P({ a: 'catGet' }, OT)).cat;
    const [dl] = await Promise.all([pA.waitForEvent('download', { timeout: 30000 }), click(pA, btn(pA, 'Download a backup', '#edVers'))]);
    const fn = dl.suggestedFilename(), fp = path.join(SHOTS, fn); await dl.saveAs(fp);
    const bk = JSON.parse(fs.readFileSync(fp, 'utf8'));
    ok(/^pams-gallery-backup-\d{4}-\d\d-\d\d\.json$/.test(fn) && bk.kind === 'pams-gallery-backup' && bk.version === 1 && bk.v === live.v && Array.isArray(bk.cat.arts) && bk.cat.arts.length === live.arts.length, '(e) “Download a backup” gives ' + fn + ': kind pams-gallery-backup, the live version, ' + bk.cat.arts.length + ' paintings');
    const T2 = 'P6UI From the backup', tB = bk.cat.arts[1].t, mod = JSON.parse(JSON.stringify(bk)); mod.cat.arts[1].t = T2;
    const mp = path.join(SHOTS, 'p6ui-backup-edited.json'); fs.writeFileSync(mp, JSON.stringify(mod));
    const hb = await P({ a: 'catHist' }, OT);
    await pA.setInputFiles('#edVers input[type=file]', mp);
    ok(await until(pA, () => document.querySelector('#edVers .vbox'), null, 30000), '(e) uploading a backup shows a preview');
    const pv = await txt(pA, '#edVers .vbox') || '';
    ok(pv.startsWith('Backup from ') && pv.includes('What would change:') && pv.includes('Renamed “' + tB + '” to “' + T2 + '”') && await btn(pA, 'Restore this backup', '#edVers .vbox').count() === 1, '(e) the preview says what would change: Renamed “' + tB + '” to “' + T2 + '”');
    ok(await pA.evaluate(() => document.activeElement && document.activeElement.id === 'vbH'), '(e) the preview takes the focus');
    const hb2 = await P({ a: 'catHist' }, OT);
    ok(hb2.total === hb.total && (await P({ a: 'catGet' }, OT)).cat.arts[1].t === tB, '(e) nothing changes before “Restore this backup”');
    await pA.locator('#edVers .vbox').scrollIntoViewIfNeeded(); await shot(pA, 'e-backup-preview');
    await click(pA, btn(pA, 'Restore this backup', '#edVers .vbox'));
    await until(pA, () => !EDbusy && /^Your backup is live again/.test(EDmsg || ''));
    const hc = await P({ a: 'catHist' }, OT), lc = (await P({ a: 'catGet' }, OT)).cat;
    ok(hc.total === hb.total + 1 && hc.list[0].kind === 'import' && hc.list[0].changes[0] === 'Restored from a backup file' && lc.arts[1].t === T2, '(e) “Restore this backup”: “' + await txt(pA, '#edMsg') + '” — a new version from the file');
    await shot(pA, 'e-backup-restored');
    const jp = path.join(SHOTS, 'p6ui-not-a-backup.json'); fs.writeFileSync(jp, '{"hello":"world"}');
    await pA.waitForSelector('#edVers input[type=file]', { state: 'attached' }); await pA.setInputFiles('#edVers input[type=file]', jp);
    ok(await until(pA, () => /isn’t a gallery backup/.test((document.querySelector('#edVers .vimp') || {}).textContent || ''), null, 15000), '(e) a file that isn’t a backup is turned away: “' + (await txt(pA, '#edVers .vimp') || '').slice(0, 80) + '”');
  });

  await step('(f) removing asks first', async () => {
    await tabTo(pA, 'a');
    const n = await pA.locator('#dBody .edrow').count(), last = pA.locator('#dBody .edrow').nth(n - 1), tl = await pA.evaluate(() => ED.arts[ED.arts.length - 1].t);
    await click(pA, last.locator('.edacts button').filter({ hasText: exact('Remove') }));
    await click(pA, last.locator('button').filter({ hasText: exact('Remove it') }));
    await waitState(pA, /^Unpublished changes/, 5000);
    const hf = await P({ a: 'catHist' }, OT);
    await click(pA, '#edPub');
    ok(await until(pA, () => document.querySelector('#dBody .edask'), null, 10000), '(f) Publish after removing a painting asks first');
    const ask = await txt(pA, '#dBody .edask') || '';
    ok(ask.startsWith('Publishing will take these out of your gallery:') && ask.includes('The painting “' + tl + '”') && ask.includes('Settings → Earlier versions'), '(f) “Publishing will take these out of your gallery: The painting “' + tl + '” …”');
    ok(await until(pA, () => document.activeElement && document.activeElement.id === 'edAskT', null, 3000), '(f) the question takes the focus');   // set just after it's drawn
    await shot(pA, 'f-remove-asks');
    await click(pA, btn(pA, 'Not yet', '#dBody .edask'));
    ok((await P({ a: 'catHist' }, OT)).total === hf.total && !(await pA.$('#dBody .edask')) && await pA.evaluate(() => document.activeElement && document.activeElement.id === 'edPub'), '(f) “Not yet” publishes nothing and puts the focus back on Publish');
    await click(pA, '#edDis');
    ok((await txt(pA, '#dBody .edask') || '').startsWith('Discard all your unpublished changes?'), '(f) “Discard changes” asks first too');
    await shot(pA, 'f-discard-asks');
    await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    await until(pA, () => ED && !EDdirty && !EDload && document.getElementById('edState') && /^Everything is published$/.test(document.getElementById('edState').textContent), null, 30000);
    ok(await pA.evaluate(() => ED.arts.length) === n && (await P({ a: 'draftGet' }, OT)).draft === null && /Your unpublished changes were discarded\./.test(await txt(pA, '#dBody') || ''), '(f) after discarding, the painting is back, no draft is left, and the dashboard says so');
  });

  await step('(g) a second tab', async () => { const pB = await open(ctx, 'tab B'); try {
    await dash(pB, 'a');
    await reopen(pA, 'a');
    const tA = await pA.evaluate(() => ED.arts[0].t);
    await editTitle(pA, 0, 'P6UI Tab A title');
    ok(await waitState(pA, /saved as a draft$/, 12000), '(g) tab A’s change is saved as a draft');
    await editTitle(pB, 1, 'P6UI Tab B title');
    ok(await waitState(pB, /^Unpublished changes — saved on this device only$/, 12000), '(g) tab B (opened earlier) can’t replace tab A’s draft: “' + await txt(pB, '#edState') + '”');
    const why = await txt(pB, '#edWhy') || '';
    ok(why.startsWith('Another device or tab has its own unpublished changes saved as a draft'), '(g) and it says why: “' + why.slice(0, 80) + '…”');
    await shot(pB, 'g-tab-b-device-only');
    await click(pA, '#edPub'); ok(await until(pA, () => !EDbusy && /^Published/.test(EDmsg || '')), '(g) tab A publishes');
    await titleBox(pB, 1).fill('P6UI Tab B title!');
    ok(await waitState(pB, /saved as a draft$/, 12000), '(g) tab B’s next change is saved as a draft again, now tab A’s is gone');
    await click(pB, '#edPub');
    await until(pB, () => !EDbusy && (EDfail || EDmsg));
    const e = await txt(pB, '#edErr') || '';
    ok(e === 'Your gallery was published again from another device or tab while you were working. Nothing is lost — your changes are kept as a draft. Press “Publish changes” again to see what to do.', '(g) tab B is told in plain words: “' + e.slice(0, 95) + '…”');
    ok(await pB.evaluate(() => ED.arts[1].t) === 'P6UI Tab B title!' && await titleBox(pB, 1).inputValue() === 'P6UI Tab B title!' && await pB.evaluate(() => EDdirty), '(g) and keeps its edits');
    ok(await until(pB, () => EDstale && NEWER.length && document.querySelector('#dBody .mailwarn'), null, 20000) && /^Heads up: these changes were started before your gallery was last published/.test(await txt(pB, '#dBody .mailwarn') || ''), '(g) with a heads-up that publishing will ask first');
    await shot(pB, 'g-tab-b-told');
    await click(pB, '#edPub');
    ok(await until(pB, () => document.querySelector('#dBody .edask'), null, 10000), '(g) pressing Publish again asks first');
    const ga = await txt(pB, '#dBody .edask') || '';
    ok(ga.startsWith('Your gallery was published again after you started these changes.Published since then:') && ga.includes('Renamed “' + tA + '” to “P6UI Tab A title”') && ga.includes('Publish my changes anyway'), '(g) listing what the newer version changed (Renamed “' + tA + '” to “P6UI Tab A title”)');
    const gb = await pB.evaluate(() => [...document.querySelectorAll('#dBody .edask .edacts button')].map(b => b.textContent + '=' + b.className));
    ok(ga.includes('If you publish now, the newer changes listed above will be undone.') && JSON.stringify(gb) === JSON.stringify(['Not yet=btn main', 'Publish my changes anyway=sb warn']), '(g) it says plainly that those newer changes would be undone, and “Not yet” is the main button: ' + gb.join(', '));
    await shot(pB, 'g-tab-b-asks');
    await click(pB, btn(pB, 'Publish my changes anyway', '#dBody .edask'));
    ok(await until(pB, () => !EDbusy && /^Published/.test(EDmsg || '')), '(g) after Pam confirms, tab B publishes');
    const lg = (await P({ a: 'catGet' }, OT)).cat, hg = await P({ a: 'catHist' }, OT);
    ok(lg.arts[1].t === 'P6UI Tab B title!' && hg.list[1].changes.includes('Renamed “' + tA + '” to “P6UI Tab A title”'), '(g) tab B’s change is live, and tab A’s version is still kept in Earlier versions');
  } finally { await pB.close() } });

  await step('(h) the database refuses to save', async () => { try {
    await reopen(pA, 'a');
    const hh = await P({ a: 'catHist' }, OT), lh = (await P({ a: 'catGet' }, OT)).cat;
    ok((await mock(['MOCK.FAILWRITES', 'cat:ver:*'])).result === 'OK', '(h) the pretend database now refuses to keep new versions, as a full database does');
    await editTitle(pA, 2, 'P6UI Not published yet');
    await waitState(pA, /saved as a draft$/, 12000);
    await click(pA, '#edPub');
    await until(pA, () => !EDbusy && (EDfail || EDmsg));
    const e = await txt(pA, '#edErr') || '', m = await pA.evaluate(() => EDmsg);
    ok(e === 'The gallery’s storage is full, so nothing new could be saved. Please tell Claude so it can make room. Your changes are kept as a draft.' && !m && !(await pA.$('#edMsg')), '(h) Publish shows a clear message and not “Published”: “' + e + '”');
    ok(!(await txt(pA, '#dErr')), '(h) and says it once (in the publish bar, not again at the bottom)');
    ok(/^Unpublished changes/.test(await txt(pA, '#edState') || '') && await pA.evaluate(() => EDdirty && ED.arts[2].t === 'P6UI Not published yet'), '(h) the change is still there, unpublished');
    const hh2 = await P({ a: 'catHist' }, OT), lh2 = (await P({ a: 'catGet' }, OT)).cat;
    ok(hh2.total === hh.total && lh2.v === lh.v && lh2.arts[2].t === lh.arts[2].t, '(h) nothing changed on the live gallery');
    await shot(pA, 'h-database-full');
    await mock(['MOCK.FAILWRITES', 'cat:draft']);
    await titleBox(pA, 2).fill('P6UI Not published yet 2');
    ok(await waitState(pA, /^Unpublished changes — saved on this device only$/, 12000), '(h) when the draft can’t be saved either: “' + await txt(pA, '#edState') + '”');
    const w = await txt(pA, '#edWhy') || '';
    ok(w === 'The gallery’s server couldn’t save them just now, so they’re kept on this device for now. It will try again by itself.', '(h) “' + w + '”');
    ok(await pA.evaluate(() => JSON.parse(localStorage.getItem('pgDashDraft:' + EDSID)).ed.arts[2].t) === 'P6UI Not published yet 2', '(h) and this device has them');
    await shot(pA, 'h-draft-refused');
    await mock(['MOCK.FAILWRITES', '']);
    await click(pA, '#edPub');
    ok(await until(pA, () => !EDbusy && /^Published/.test(EDmsg || '')) && (await P({ a: 'catGet' }, OT)).cat.arts[2].t === 'P6UI Not published yet 2', '(h) once the database is back, the same changes publish');
  } finally { await mock(['MOCK.FAILWRITES', '']) } });

  await step('(i) limits', async () => {
    await reopen(pA, 'a');
    const row = pA.locator('#dBody .edrow').nth(0);
    if (!(await row.evaluate(r => r.classList.contains('open')))) { await click(pA, row.locator('.edacts button').filter({ hasText: exact('Edit') })); await pA.waitForTimeout(200) }
    const box = titleBox(pA, 0); await box.fill(''); await box.pressSequentially('x'.repeat(85));
    const c1 = await row.locator('.cnt').first().textContent();
    ok(c1 === '5 characters left', '(i) near the limit the title box says “' + c1 + '”');
    await box.pressSequentially('y'.repeat(10));
    const v = await box.inputValue(), c2 = await row.locator('.cnt').first().textContent(), full = await row.locator('.cnt').first().evaluate(x => x.classList.contains('full'));
    ok(v.length === 90 && c2 === 'That’s the limit — 90 characters.' && full, '(i) typing stops at 90 characters: “' + c2 + '”');
    await row.scrollIntoViewIfNeeded(); await shot(pA, 'i-limit-reached');
    const L = await pA.evaluate(() => { const f = document.querySelector('#dBody .edrow.open'), q = s => (f.querySelector(s) || {}).maxLength; return [q('input[placeholder="e.g. Oil on canvas"]'), q('input[placeholder="e.g. 60 × 80 cm"]'), q('input[placeholder="e.g. 2025"]'), q('textarea'), q('input[aria-label="Price"]')] });
    ok(JSON.stringify(L) === '[80,80,12,1200,40]', '(i) the other boxes hold what the gallery keeps (medium 80, size 80, year 12, description 1200, price 40): ' + JSON.stringify(L));
    await box.evaluate(i => { const d = new DataTransfer(); d.setData('text', 'z'.repeat(50)); i.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true })) }); await pA.waitForTimeout(100);
    const c3 = await row.locator('.cnt').first().textContent();
    ok(c3 === 'Only part of what you pasted fits — this box holds up to 90 characters.', '(i) a paste that doesn’t fit is pointed out: “' + c3 + '”');
    await shot(pA, 'i-paste-too-long');
    await tabTo(pA, 's');
    const S = await pA.evaluate(() => { const q = s => (document.querySelector('#dBody ' + s) || {}).maxLength; return [q('input[type=email]'), q('input[placeholder="e.g. 07700 900123"]'), q('input[placeholder="e.g. London, UK"]'), q('input[type=url]'), q('input[placeholder^="e.g. New collection"]')] });
    ok(JSON.stringify(S) === '[200,40,80,200,160]', '(i) Settings boxes too (email 200, phone 40, place 80, links 200, banner 160): ' + JSON.stringify(S));
    await click(pA, '#edDis'); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    await until(pA, () => ED && !EDdirty && !EDload, null, 30000);
  });

  await step('(k) changes made while publishing', async () => {
    await reopen(pA, 'a');
    await editTitle(pA, 3, 'P6UI First edit');
    let held = 0;
    await pA.route('**/api/app', async (route, req) => { if (req.method() === 'POST' && /"a":"catSave"/.test(req.postData() || '') && !held++) await new Promise(r => setTimeout(r, 3000)); await route.continue() });
    await click(pA, '#edPub');
    await until(pA, () => EDbusy, null, 5000);
    ok(/^Publishing…$/.test(await txt(pA, '#edState') || '') && await pA.evaluate(() => document.getElementById('edPub').disabled), '(k) while it publishes, the bar says “Publishing…”');
    await titleBox(pA, 3).fill('P6UI Second edit');
    await until(pA, () => !EDbusy && !!(EDmsg || EDfail));
    await pA.unroute('**/api/app');
    const m = await txt(pA, '#edMsg') || '', live = (await P({ a: 'catGet' }, OT)).cat;
    ok(m.startsWith('Published. You made more changes while it was publishing — press “Publish changes” again to publish those too.'), '(k) “' + m.slice(0, 110) + '…”');
    ok(live.arts[3].t === 'P6UI First edit' && await pA.evaluate(() => EDdirty && ED.arts[3].t === 'P6UI Second edit' && ED.v === PUBV), '(k) the first change is live; the one made meanwhile is kept, unpublished, on top of it');
    ok(await waitState(pA, /saved as a draft$/, 12000), '(k) and saved as a draft');
    await pA.evaluate(() => document.getElementById('edMsg').scrollIntoView()); await shot(pA, 'k-changed-while-publishing');
    await click(pA, '#edPub');
    ok(await until(pA, () => !EDbusy && /^Published —/.test(EDmsg || '')) && (await P({ a: 'catGet' }, OT)).cat.arts[3].t === 'P6UI Second edit', '(k) Publish again publishes it, with no question asked');
  });

  await step('(l) a tab closed straight after a change', async () => {
    const pC = await open(ctx, 'tab C'); await dash(pC, 'a');
    await editTitle(pC, 4, 'P6UI Closed in a hurry'); await pC.waitForTimeout(700);
    ok((await P({ a: 'draftGet' }, OT)).draft === null, '(l) less than a second after a change: not on the server yet');
    await pC.close(); await new Promise(r => setTimeout(r, 2000));
    const d = (await P({ a: 'draftGet' }, OT)).draft;
    ok(!!d && d.cat.arts[4].t === 'P6UI Closed in a hurry', '(l) closing the tab sends it to the server on the way out');
    await reopen(pA);
    ok(await until(pA, () => document.querySelector('#dBody .edoffer'), null, 30000) && (await txt(pA, '#dBody .edoffer') || '').includes('to “P6UI Closed in a hurry”'), '(l) the next time the dashboard opens, it offers that change');
    await click(pA, btn(pA, 'Discard them', '#dBody .edoffer')); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edoffer'));
    ok(await until(pA, () => !OFFER && !document.querySelector('#dBody .edoffer'), null, 15000) && (await P({ a: 'draftGet' }, OT)).draft === null && await devKeys(pA) === 0, '(l) “Discard them” → “Yes, discard them” removes both copies');
    const live = (await P({ a: 'catGet' }, OT)).cat, old = JSON.parse(JSON.stringify(live)); old.arts[5].t = 'P6UI Kept the old way';
    await pA.evaluate(o => localStorage.setItem('pgDashDraft', JSON.stringify({ t: Date.now() - 3600e3, base: o.v, ed: o })), old);
    await reopen(pA);
    const o = (await until(pA, () => document.querySelector('#dBody .edoffer'), null, 30000)) ? await txt(pA, '#dBody .edoffer') : '';
    ok(/They were saved on this device\./.test(o) && o.includes('to “P6UI Kept the old way”'), '(l) a copy kept on this device by the dashboard before this update is offered too');
    await shot(pA, 'l-offer-from-this-device');
    await click(pA, btn(pA, 'Continue where I left off', '#dBody .edoffer'));
    ok(await waitState(pA, /saved as a draft$/, 12000) && await pA.evaluate(() => ED.arts[5].t) === 'P6UI Kept the old way', '(l) Continue brings it back and saves it as a draft');
    await click(pA, '#edDis'); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    ok(await until(pA, () => ED && !EDdirty && !EDload && !OFFER, null, 30000) && (await P({ a: 'draftGet' }, OT)).draft === null && await devKeys(pA) === 0, '(l) “Discard changes” removes both copies');
  });

  await step('(m) a late answer from before a publish', async () => {
    await reopen(pA, 'a');
    await editTitle(pA, 0, 'P6UI Race one'); ok(await waitState(pA, /saved as a draft$/, 12000), '(m) a change, saved as a draft');
    let arm = 1;
    await pA.route('**/api/app', async route => { const pd = route.request().postData() || '';
      if (arm === 1 && /"a":"catGet"/.test(pd)) { arm = 2; const resp = await route.fetch(), body = await resp.text(); await new Promise(r => setTimeout(r, 5000)); await route.fulfill({ status: resp.status(), headers: resp.headers(), body }).catch(() => { }); return }
      await route.continue() });
    await click(pA, '#dRefresh'); await pA.waitForTimeout(300);
    await click(pA, '#edPub');
    ok(await until(pA, () => !EDbusy && /^Published/.test(EDmsg || ''), null, 30000), '(m) Refresh, then Publish straight away: published');
    await pA.waitForTimeout(6000);   // the answer to the refresh, fetched before the publish, arrives only now
    await pA.unroute('**/api/app');
    const live = (await P({ a: 'catGet' }, OT)).cat, s = await pA.evaluate(() => ({ PUBV, t: ED.arts[0].t, dirty: EDdirty, bar: document.getElementById('edState').textContent }));
    ok(arm === 2 && s.PUBV === live.v && s.t === 'P6UI Race one' && !s.dirty && s.bar === 'Everything is published', '(m) the late answer doesn’t turn the dashboard back to the version before the publish (“' + s.t + '”, ' + s.bar + ')');
    await editTitle(pA, 1, 'P6UI Typed after it');
    ok(await waitState(pA, /saved as a draft$/, 12000) && await pA.evaluate(() => ED.arts[1].t === 'P6UI Typed after it') && ((await P({ a: 'draftGet' }, OT)).draft || { cat: { arts: [{}, {}] } }).cat.arts[1].t === 'P6UI Typed after it', '(m) what Pam types next is kept, and saved as a draft');
    await click(pA, '#edPub'); ok(await until(pA, () => !EDbusy && /^Published —/.test(EDmsg || ''), null, 30000), '(m) and publishes with no question asked');
  });

  await step('(n) each tab keeps its own copy', async () => { const pB = await open(ctx, 'tab B2'); let pC = null; try {
    await dash(pB, 'a'); await reopen(pA, 'a');
    await editTitle(pA, 0, 'P6UI Tab A again'); ok(await waitState(pA, /saved as a draft$/, 12000), '(n) tab A’s change is saved as a draft');
    await editTitle(pB, 1, 'P6UI Tab B only'); ok(await waitState(pB, /^Unpublished changes — saved on this device only$/, 12000), '(n) tab B’s is kept on this device only (tab A has the draft)');
    await titleBox(pA, 0).fill('P6UI Tab A types on'); await pA.waitForTimeout(1500);
    const bk = await pB.evaluate(() => { const d = JSON.parse(localStorage.getItem('pgDashDraft:' + EDSID) || 'null'); return d && d.ed.arts[1].t });
    ok(bk === 'P6UI Tab B only' && /saved on this device only$/.test(await txt(pB, '#edState') || ''), '(n) tab A typing on doesn’t touch tab B’s copy, so “saved on this device only” stays true');
    await pB.close({ runBeforeUnload: false }); await pA.waitForTimeout(800);
    pC = await open(ctx, 'tab C2'); await dash(pC);
    const o = (await until(pC, () => document.querySelector('#dBody .edoffer'), null, 30000)) ? await txt(pC, '#dBody .edoffer') : '';
    ok(o.includes('to “P6UI Tab B only”') && !o.includes('P6UI Tab A'), '(n) once tab B is gone, a new tab offers tab B’s changes, and leaves tab A’s (still open) alone');
    await shot(pC, 'n-tab-b-offered');
    await click(pC, btn(pC, 'Discard them', '#dBody .edoffer')); await click(pC, btn(pC, 'Yes, discard them', '#dBody .edoffer'));
    await until(pC, () => !OFFER && !document.querySelector('#dBody .edoffer'), null, 15000); await tabTo(pC, 'a');
    ok(await until(pC, () => /still open in another tab of this browser/.test(document.getElementById('dBody').textContent), null, 15000), '(n) and says tab A’s unpublished changes are still open in another tab');
    await shot(pC, 'n-open-in-another-tab');
    ok(await pA.evaluate(() => EDdirty && ED.arts[0].t === 'P6UI Tab A types on') && /saved as a draft$/.test(await txt(pA, '#edState') || '') && ((await P({ a: 'draftGet' }, OT)).draft || { cat: { arts: [{}] } }).cat.arts[0].t === 'P6UI Tab A types on', '(n) tab A still has its changes, saved as a draft');
    await click(pA, '#edDis'); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    ok(await until(pA, () => ED && !EDdirty && !EDload && !OFFER, null, 30000) && (await P({ a: 'draftGet' }, OT)).draft === null && await devKeys(pA) === 0, '(n) tidy: no copies left');
  } finally { await pB.close().catch(() => { }); if (pC) await pC.close().catch(() => { }) } });

  await step('(o) unpublished changes that can’t be checked', async () => {
    const live = (await P({ a: 'catGet' }, OT)).cat, lap = JSON.parse(JSON.stringify(live)); lap.arts[0].t = 'P6UI Laptop draft';
    ok((await P({ a: 'draftSave', draft: lap, base: live.v, sid: 'p6uilapo' + Math.random().toString(36).slice(2, 8) }, OT)).ok, '(o) a draft saved from another device (the laptop)');
    let n = 0; await pA.route('**/api/app', route => { if (/"a":"draftGet"/.test(route.request().postData() || '') && n < 2) { n++; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The gallery’s database couldn’t save this just now, so nothing was changed.' }) }) } return route.continue() });
    await reopen(pA, 'a');
    const e = (await until(pA, () => document.querySelector('#dBody .err'), null, 20000)) ? await txt(pA, '#dBody .err') : '';
    ok(/^Your unpublished changes couldn’t be checked just now/.test(e) && !(await pA.$('#dBody .edoffer')) && !(await pA.$('#dBody .edrow')) && await btn(pA, 'Try again', '#dBody').count() === 1, '(o) when they can’t be checked: “' + e.slice(0, 70) + '…”, with “Try again”, and nothing to edit or overwrite');
    ok(((await P({ a: 'draftGet' }, OT)).draft || { cat: { arts: [{}] } }).cat.arts[0].t === 'P6UI Laptop draft', '(o) the laptop’s draft is untouched');
    await shot(pA, 'o-cant-check');
    await pA.unroute('**/api/app');
    await click(pA, btn(pA, 'Try again', '#dBody'));
    ok(await until(pA, () => document.querySelector('#dBody .edoffer'), null, 30000) && (await txt(pA, '#dBody .edoffer') || '').includes('to “P6UI Laptop draft”'), '(o) “Try again” then offers the laptop’s changes');
    await click(pA, btn(pA, 'Discard them', '#dBody .edoffer')); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edoffer'));
    ok(await until(pA, () => !OFFER && !document.querySelector('#dBody .edoffer'), null, 15000) && (await P({ a: 'draftGet' }, OT)).draft === null, '(o) tidy: discarded');
  });

  await step('(p) a publish whose answer is lost', async () => {
    await reopen(pA, 'a');
    await editTitle(pA, 2, 'P6UI Answer lost'); await waitState(pA, /saved as a draft$/, 12000);
    await pA.route('**/api/app', async route => { if (/"a":"catSave"/.test(route.request().postData() || '')) { const resp = await route.fetch(); await resp.body(); return route.abort('failed') } return route.continue() });
    await click(pA, '#edPub'); await until(pA, () => !EDbusy && (EDmsg || EDfail), null, 30000);
    await pA.unroute('**/api/app');
    const m = await txt(pA, '#edMsg') || '', live = (await P({ a: 'catGet' }, OT)).cat;
    ok(live.arts[2].t === 'P6UI Answer lost' && /^Published — visitors will see your changes/.test(m) && m.includes('to “P6UI Answer lost”') && /^Everything is published$/.test(await txt(pA, '#edState') || ''), '(p) it went through but the answer never came: the dashboard checks, and says “' + m.slice(0, 60) + '…”');
    ok((await P({ a: 'draftGet' }, OT)).draft === null && await devKeys(pA) === 0, '(p) and no draft is left behind');
  });

  await step('(q) an error page instead of an answer', async () => {
    await editTitle(pA, 2, 'P6UI Not sent'); await waitState(pA, /saved as a draft$/, 12000);
    await pA.route('**/api/app', route => /"a":"catSave"/.test(route.request().postData() || '') ? route.fulfill({ status: 504, contentType: 'text/plain', body: 'An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT\n' }) : route.continue());
    await click(pA, '#edPub'); await until(pA, () => !EDbusy && (EDmsg || EDfail), null, 30000);
    await pA.unroute('**/api/app');
    const e = await txt(pA, '#edErr') || '';
    ok(e === 'The gallery’s server didn’t answer properly just now. Please wait a minute, then try again. Your changes are kept as a draft.' && await pA.evaluate(() => EDdirty), '(q) an error page from the host: “' + e + '”');
    await shot(pA, 'q-error-page');
    await click(pA, '#edPub'); ok(await until(pA, () => !EDbusy && /^Published —/.test(EDmsg || ''), null, 30000) && (await P({ a: 'catGet' }, OT)).cat.arts[2].t === 'P6UI Not sent', '(q) Publish again publishes it');
  });

  await step('(r) a draft save that never answers', async () => {
    let release = null; const held = new Promise(r => { release = r });
    await pA.route('**/api/app', async route => { if (/"a":"draftSave"/.test(route.request().postData() || '')) { await held; return route.abort('failed').catch(() => { }) } return route.continue() });
    await editTitle(pA, 3, 'P6UI Stalled save'); await pA.waitForTimeout(2600);   // its draft save is on its way, and never answers
    const t0 = Date.now(); await click(pA, '#edPub');
    const done = await until(pA, () => !EDbusy && /^Published/.test(EDmsg || ''), null, 40000), dt = Date.now() - t0;
    ok(done && dt < 25000 && (await P({ a: 'catGet' }, OT)).cat.arts[3].t === 'P6UI Stalled save', '(r) Publish still goes through (' + (dt / 1000).toFixed(1) + ' s) instead of waiting for ever');
    release(); await pA.waitForTimeout(500); await pA.unroute('**/api/app');
  });

  await step('(s) a backup restored after the gallery was published elsewhere', async () => {
    await tabTo(pA, 's'); await until(pA, () => document.querySelector('#edVers .vrow'), null, 30000);
    const live = (await P({ a: 'catGet' }, OT)).cat, bk = { kind: 'pams-gallery-backup', version: 1, v: live.v, saved: new Date(live.v).toISOString(), cat: JSON.parse(JSON.stringify(live)) };
    bk.cat.arts[4].t = 'P6UI Backup title'; const fp = path.join(SHOTS, 'p6ui-backup-stale.json'); fs.writeFileSync(fp, JSON.stringify(bk));
    await pA.setInputFiles('#edVers input[type=file]', fp);
    ok(await until(pA, () => document.querySelector('#edVers .vbox'), null, 30000), '(s) a backup’s preview');
    const x = JSON.parse(JSON.stringify(live)); x.arts[5].t = 'P6UI Published elsewhere';
    ok((await P({ a: 'catSave', cat: x, base: live.v }, OT)).ok, '(s) meanwhile the gallery is published from another device');
    await click(pA, btn(pA, 'Restore this backup', '#edVers .vbox'));
    const shown = await until(pA, () => { const b = document.querySelector('#edVers .vbox'); return !!b && /published again from another device or tab, so the backup wasn’t restored yet/.test(b.textContent) }, null, 20000);
    const pv = await txt(pA, '#edVers .vbox') || '';
    ok(shown && pv.includes('to “P6UI Backup title”') && (await P({ a: 'catGet' }, OT)).cat.arts[5].t === 'P6UI Published elsewhere', '(s) nothing is restored, and the new preview is there to check: “' + pv.slice(0, 90) + '…”');
    await pA.locator('#edVers .vbox').scrollIntoViewIfNeeded(); await shot(pA, 's-backup-asks-again');
    await click(pA, btn(pA, 'Not yet', '#edVers .vbox'));
  });

  await step('(t) changes carried on from another device', async () => {
    const ph = await newCtx(b, { viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
    try {
      let pP = await open(ph, 'phone 2'); await dash(pP, 'a');
      await editTitle(pP, 0, 'P6UI Phone change'); ok(await waitState(pP, /saved as a draft$/, 12000), '(t) a change on the phone, saved as a draft (the phone stays open)');
      await reopen(pA, 'a');
      ok(await until(pA, () => document.querySelector('#dBody .edoffer'), null, 30000) && (await txt(pA, '#dBody .edoffer') || '').includes('to “P6UI Phone change”'), '(t) the laptop offers the phone’s changes');
      await click(pA, btn(pA, 'Continue where I left off', '#dBody .edoffer')); await waitState(pA, /saved as a draft$/, 12000);
      await editTitle(pA, 1, 'P6UI Laptop addition');
      await click(pA, '#edPub'); ok(await until(pA, () => !EDbusy && /^Published —/.test(EDmsg || ''), null, 30000), '(t) carried on and published from the laptop');
      await reopen(pP, 'a');
      const told = await waitState(pP, /^Unpublished changes — saved on this device only$/, 15000), why = await txt(pP, '#edWhy') || '';
      ok(told && /^Another device carried on with these changes \(.+\), so they’re no longer saved as a draft — only on this device\./.test(why), '(t) the phone, still open, is told: “' + why.slice(0, 100) + '…”');
      await pP.close(); await new Promise(r => setTimeout(r, 1500));
      ok(((await P({ a: 'draftGet' }, OT)).draft || {}).sid === undefined, '(t) closing it doesn’t save those same changes back as a draft');
      pP = await open(ph, 'phone 3'); await dash(pP, 'a'); await pP.waitForTimeout(500);
      const left = await devKeys(pP);
      ok(!(await pP.$('#dBody .edoffer')) && left === 0 && /^Everything is published$/.test(await txt(pP, '#edState') || ''), '(t) back on the phone, its own copy isn’t offered as forgotten changes (they were carried on and published), and is tidied away');
    } finally { await ph.close() }
  });

  await step('(u) changes typed while a version is brought back', async () => {
    await reopen(pA, 's'); await until(pA, () => document.querySelectorAll('#edVers .vrow').length > 1, null, 30000);
    const row = pA.locator('#edVers .vrow').nth(1);
    await click(pA, row.locator('button').filter({ hasText: exact('Restore') }));
    await row.locator('button').filter({ hasText: exact('Yes, restore it') }).waitFor({ timeout: 20000 });
    await pA.route('**/api/app', async route => { if (/"a":"catRestore"/.test(route.request().postData() || '')) await new Promise(r => setTimeout(r, 3000)); return route.continue() });
    await click(pA, row.locator('button').filter({ hasText: exact('Yes, restore it') }));
    ok(await until(pA, () => EDbusy, null, 5000) && /^Publishing…$/.test(await txt(pA, '#edState') || '') && await pA.evaluate(() => document.getElementById('edPub').disabled), '(u) while it is brought back, the bar says “Publishing…”');
    await pA.locator('#dBody input[placeholder="e.g. 07700 900123"]').fill('07700 900456');
    await until(pA, () => !EDbusy && !!(EDmsg || EDfail), null, 30000); await pA.unroute('**/api/app');
    const s = await pA.evaluate(() => ({ m: EDmsg, dirty: EDdirty, ph: ED.site.phone, stale: EDstale }));
    ok(/^Restored the version from .* The changes you made while that was happening are kept, unpublished\.$/.test(s.m || '') && s.dirty && s.ph === '07700 900456' && s.stale, '(u) what Pam typed meanwhile is kept, unpublished: “…' + (s.m || '').slice(-72) + '”');
    ok(await waitState(pA, /saved as a draft$/, 12000), '(u) and saved as a draft');
    await click(pA, '#edDis'); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    await until(pA, () => ED && !EDdirty && !EDload, null, 30000);
  });

  await step('(v) “Publish my changes anyway” replaces only the version Pam was asked about', async () => {
    await reopen(pA, 'a');
    await editTitle(pA, 0, 'P6UI Mine'); await waitState(pA, /saved as a draft$/, 12000);
    let live = (await P({ a: 'catGet' }, OT)).cat, x = JSON.parse(JSON.stringify(live)); x.arts[5].t = 'P6UI Elsewhere one'; await P({ a: 'catSave', cat: x, base: live.v }, OT);
    await click(pA, '#dRefresh'); await until(pA, () => EDstale && NEWER.length === 1, null, 20000);
    await click(pA, '#edPub'); await until(pA, () => document.querySelector('#dBody .edask'), null, 10000);
    live = (await P({ a: 'catGet' }, OT)).cat; x = JSON.parse(JSON.stringify(live)); x.arts[6].t = 'P6UI Elsewhere two'; await P({ a: 'catSave', cat: x, base: live.v }, OT);
    await click(pA, '#dRefresh'); await until(pA, () => NEWER.length === 2, null, 20000);
    await click(pA, btn(pA, 'Publish my changes anyway', '#dBody .edask'));
    await until(pA, () => !EDbusy && !!(EDfail || EDmsg), null, 30000);
    const l2 = (await P({ a: 'catGet' }, OT)).cat;
    ok(l2.arts[6].t === 'P6UI Elsewhere two' && l2.arts[0].t !== 'P6UI Mine' && /published again/.test(await txt(pA, '#edErr') || ''), '(v) a version published after Pam was asked isn’t replaced unseen');
    await click(pA, '#edPub'); await until(pA, () => document.querySelector('#dBody .edask'), null, 10000);
    ok((await txt(pA, '#dBody .edask') || '').includes('to “P6UI Elsewhere two”'), '(v) pressing Publish again asks about it too');
    await click(pA, btn(pA, 'Publish my changes anyway', '#dBody .edask'));
    ok(await until(pA, () => !EDbusy && /^Published/.test(EDmsg || ''), null, 30000) && (await P({ a: 'catGet' }, OT)).cat.arts[0].t === 'P6UI Mine', '(v) and once Pam confirms, her changes are published');
  });

  await step('(w) words typed just before Publish', async () => {
    await reopen(pA, 'a');
    let hold = null; const held = new Promise(r => { hold = r });
    const row = pA.locator('#dBody .edrow').nth(4);
    if (!(await row.evaluate(r => r.classList.contains('open')))) { await click(pA, row.locator('.edacts button').filter({ hasText: exact('Edit') })); await pA.waitForTimeout(200) }
    const box = titleBox(pA, 4); await box.fill('P6UI Saved part'); await waitState(pA, /saved as a draft$/, 12000);
    await pA.route('**/api/app', async route => { if (/"a":"catSave"/.test(route.request().postData() || '')) { await held; return route.abort('failed').catch(() => { }) } return route.continue() });
    await box.press('End'); await box.pressSequentially(' and last words', { delay: 20 }); await click(pA, '#edPub');
    await until(pA, () => EDbusy, null, 5000);
    const devT = await pA.evaluate(() => { const d = JSON.parse(localStorage.getItem('pgDashDraft:' + EDSID) || 'null'); return d && d.ed.arts[4].t });
    await pA.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) });   // the phone switches apps mid-publish
    await pA.waitForTimeout(1500);
    const sv = ((await P({ a: 'draftGet' }, OT)).draft || { cat: { arts: [] } }).cat.arts[4];
    await pA.evaluate(() => { delete document.visibilityState });
    ok(devT === 'P6UI Saved part and last words' && !!sv && sv.t === 'P6UI Saved part and last words', '(w) words typed just before Publish are in this device’s copy at once, and reach the server’s draft when the page is hidden mid-publish');
    hold(); await until(pA, () => !EDbusy, null, 30000); await pA.unroute('**/api/app');
    await click(pA, '#edPub');
    ok(await until(pA, () => !EDbusy && /^Published —/.test(EDmsg || ''), null, 30000) && (await P({ a: 'catGet' }, OT)).cat.arts[4].t === 'P6UI Saved part and last words', '(w) the publish that never got through: the changes are still there, and publish');
  });

  // ---- what Pam sees (part B): wording, focus, phone, screen readers ----
  await step('(x) nothing can be saved anywhere', async () => { try {
    await reopen(pA, 'a');
    await mock(['MOCK.FAILWRITES', '*']);
    await editTitle(pA, 2, 'P6UI Nowhere to save');
    ok(await waitState(pA, /^Unpublished changes — saved on this device only$/, 15000), '(x) with the server refusing every save, the bar says “saved on this device only”');
    await click(pA, '#edPub'); await until(pA, () => !EDbusy && !!EDfail, null, 30000);
    const s = await pA.evaluate(() => ({ st: $('edState').textContent, err: $('edErr').textContent, why: $('edWhy').textContent, bottom: $('dErr').textContent, inBar: !!document.querySelector('#dBody .edbar #edWhy') }));
    ok(s.err === 'The gallery’s storage is full, so nothing new could be saved. Please tell Claude so it can make room. Your changes are kept on this device.' && /saved on this device only$/.test(s.st) && !s.why && !s.bottom, '(x) Publish: “' + s.err + '” — it agrees with the bar, and isn’t repeated in grey or at the bottom');
    ok(!s.inBar, '(x) the grey reason line sits under the pinned bar, not in it');
    await shot(pA, 'x-nowhere-to-save');
    await mock(['MOCK.FAILWRITES', '']);
    // this device can't keep a copy either, and the gallery can't be reached
    await pA.evaluate(() => { window.__si = Storage.prototype.setItem; Storage.prototype.setItem = function (k) { if (/^pgDashDraft/.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return window.__si.apply(this, arguments) } });
    await pA.route('**/api/app', route => /"a":"draftSave"/.test(route.request().postData() || '') ? route.abort('internetdisconnected') : route.continue());
    await titleBox(pA, 2).fill('P6UI Not saved anywhere');
    ok(await waitState(pA, /^Unpublished changes — not saved yet\. Please keep this page open\.$/, 15000), '(x) when this device can’t keep a copy either: “' + await txt(pA, '#edState') + '” (pinned at the top)');
    const W = 'The gallery can’t be reached just now, and this device couldn’t keep a copy either. They’ll be saved online by themselves once the connection is back.';
    const wok = await until(pA, w => (document.getElementById('edWhy') || {}).textContent === w, W, 15000);   // once the save to the server has been tried
    ok(wok, '(x) “' + await txt(pA, '#edWhy') + '”');
    await shot(pA, 'x-not-saved-anywhere');
    await pA.unroute('**/api/app'); await pA.evaluate(() => { Storage.prototype.setItem = window.__si });
    await titleBox(pA, 2).fill('P6UI Saved again');
    ok(await waitState(pA, /saved as a draft$/, 15000), '(x) once things work again, the next change is saved as a draft');
    await click(pA, '#edDis'); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    ok(await until(pA, () => ED && !EDdirty && !EDload && !OFFER, null, 30000) && (await P({ a: 'draftGet' }, OT)).draft === null, '(x) tidy: discarded');
  } finally { await mock(['MOCK.FAILWRITES', '']); await pA.unroute('**/api/app').catch(() => { }); await pA.evaluate(() => { if (window.__si) Storage.prototype.setItem = window.__si }).catch(() => { }) } });

  await step('(y) restoring shows what it would change first', async () => {
    const live = (await P({ a: 'catGet' }, OT)).cat, t0 = live.arts[0].t, x = JSON.parse(JSON.stringify(live)); x.arts[0].t = 'P6UI Restore preview';
    const r1 = await P({ a: 'catSave', cat: x, base: live.v }, OT), r2 = r1.ok ? await P({ a: 'catSave', cat: live, base: r1.cat.v }, OT) : {};
    ok(r1.ok && r2.ok, '(y) two more versions: a rename, then back again (so an older version is the same as the live one)');
    await reopen(pA, 's'); await until(pA, () => document.querySelectorAll('#edVers .vrow').length > 3, null, 30000);
    const note = await pA.evaluate(() => [...document.querySelectorAll('#edVers > p.note')].map(p => p.textContent).join(' '));
    ok(note.includes('Each one lists what that publish changed, compared with the version before it.'), '(y) the section says what each entry lists');
    const row1 = pA.locator('#edVers .vrow').nth(1), row2 = pA.locator('#edVers .vrow').nth(2);
    await click(pA, row2.locator('button').filter({ hasText: exact('Restore') }));
    ok(await until(pA, () => /nothing to restore/.test((document.querySelectorAll('#edVers .vrow')[2].querySelector('.edconfirm') || {}).textContent || ''), null, 20000), '(y) a version that is the same as the live one: “' + ((await row2.locator('.edconfirm').textContent()) || '').slice(0, 90) + '”');
    ok(await row2.locator('button').filter({ hasText: exact('Yes, restore it') }).count() === 0 && await pA.evaluate(() => document.activeElement && document.activeElement.textContent === 'Close'), '(y) with only “Close” (focused), so nothing pointless can be pressed');
    await row2.scrollIntoViewIfNeeded(); await shot(pA, 'y-nothing-to-restore');
    await pA.keyboard.press('Escape');
    ok(await pA.evaluate(() => dashD.open && document.querySelectorAll('#edVers .vrow')[2].querySelector('.edconfirm').hidden && document.activeElement && document.activeElement.textContent === 'Restore'), '(y) Escape closes that box, not the dashboard, and the focus goes back to “Restore”');
    await click(pA, row1.locator('button').filter({ hasText: exact('Restore') }));
    ok(await until(pA, () => /What it would change:/.test((document.querySelectorAll('#edVers .vrow')[1].querySelector('.edconfirm') || {}).textContent || ''), null, 20000), '(y) the version before it asks first');
    const c1 = await row1.locator('.edconfirm').textContent();
    ok(c1.includes('What it would change:Renamed “' + t0 + '” to “P6UI Restore preview”'), '(y) and says what restoring it would change: Renamed “' + t0 + '” to “P6UI Restore preview”');
    await row1.scrollIntoViewIfNeeded(); await shot(pA, 'y-restore-would-change');
    await pA.keyboard.press('Escape');
    ok(await pA.evaluate(() => dashD.open && document.querySelectorAll('#edVers .vrow')[1].querySelector('.edconfirm').hidden), '(y) Escape works as “Not yet”');
    ok((await P({ a: 'catGet' }, OT)).cat.v === r2.cat.v, '(y) nothing was changed');
  });

  await step('(z) a download that doesn’t work says so', async () => { try {
    await tabTo(pA, 's'); await until(pA, () => document.querySelector('#edVers .vrow'), null, 30000);
    await pA.route('**/api/app', route => /"a":"catVer"/.test(route.request().postData() || '') ? route.abort('internetdisconnected') : route.continue());
    await click(pA, btn(pA, 'Download a backup', '#edVers'));
    const near = await until(pA, () => { const e = document.querySelector('#edVers .vbk + p.err'); return !!e && /couldn’t be downloaded/.test(e.textContent) }, null, 20000);
    const be = await pA.evaluate(() => { const e = document.querySelector('#edVers .vbk + p.err'), b = document.querySelector('#edVers .vbk button'), c = document.querySelector('#dash .txt').getBoundingClientRect(), r = e.getBoundingClientRect(); return { t: e.textContent, role: e.getAttribute('role'), gap: Math.round(r.top - b.getBoundingClientRect().bottom), vis: r.top >= c.top && r.bottom <= c.bottom, bottom: document.getElementById('dErr').textContent } });
    ok(near && be.t === 'The backup couldn’t be downloaded — please check your internet connection and try again.' && be.role === 'alert' && be.vis && be.gap < 60 && !be.bottom, '(z) “Download a backup” offline: “' + be.t + '”, right under the button (' + be.gap + ' px), announced');
    await shot(pA, 'z-download-failed');
    const row = pA.locator('#edVers .vrow').nth(1); await click(pA, row.locator('button').filter({ hasText: exact('Download') }));
    ok(await until(pA, () => /^The version couldn’t be downloaded — please check your internet connection/.test((document.querySelectorAll('#edVers .vrow')[1].querySelector('p.err') || {}).textContent || ''), null, 20000), '(z) a version’s own “Download” says so in its row');
  } finally { await pA.unroute('**/api/app').catch(() => { }) } });

  await step('(o2) older and newer changes: only Pam’s own are listed as hers', async () => {
    await reopen(pA, 'a');
    const L = (await P({ a: 'catGet' }, OT)).cat, v = L.v, sOld = 'p6uiold' + Math.random().toString(36).slice(2, 8), sDev = 'p6uidev' + Math.random().toString(36).slice(2, 8);
    const od = JSON.parse(JSON.stringify(L)); od.arts[1].t = 'P6UI Older draft';
    ok((await P({ a: 'draftSave', draft: od, base: v, sid: sOld }, OT)).ok, '(o2) an older draft from another device, saved on the server');
    const nw = JSON.parse(JSON.stringify(L)); nw.arts[2].t = 'P6UI Newer publish';
    ok((await P({ a: 'catSave', cat: nw, base: v }, OT)).ok, '(o2) the gallery is published again after that (a rename)');
    const dv = JSON.parse(JSON.stringify(L)); dv.arts[3].t = 'P6UI Device copy';
    await pA.evaluate(a => localStorage.setItem('pgDashDraft:' + a.sid, JSON.stringify({ t: Date.now(), base: a.v, sid: a.sid, gen: 3, ed: a.ed })), { sid: sDev, v, ed: dv });
    await reopen(pA);
    ok(await until(pA, () => { const o = document.querySelector('#dBody .edoffer'); return !!o && /older unpublished changes/.test(o.textContent) && /would also undo/.test(o.textContent) && /They change:/.test(o.textContent) }, null, 30000), '(o2) the newest changes are offered, with the newer publish and the older draft');
    const o = await txt(pA, '#dBody .edoffer') || '';
    const mine = await pA.evaluate(() => { const ps = [...document.querySelectorAll('#dBody .edoffer p')], i = ps.findIndex(p => p.textContent === 'Your changes:'), ul = i >= 0 ? ps[i].nextElementSibling : null; return ul ? [...ul.children].map(li => li.textContent) : [] });
    ok(JSON.stringify(mine) === JSON.stringify(['Renamed “' + L.arts[3].t + '” to “P6UI Device copy”']), '(o2) “Your changes:” lists only her own change: ' + JSON.stringify(mine));
    ok(o.includes('Publishing them now would also undo these newer changes') && o.includes('Renamed “' + L.arts[2].t + '” to “P6UI Newer publish”'), '(o2) and, apart from them, the newer change that publishing them would undo');
    ok(o.includes('There are also older unpublished changes from') && o.includes('Renamed “' + L.arts[1].t + '” to “P6UI Older draft”') && o.includes('the older ones are kept on this device'), '(o2) the older draft is listed with what it changes, and is kept if Pam carries on');
    await pA.locator('#dBody .edoffer').scrollIntoViewIfNeeded(); await shot(pA, 'o2-offer-own-changes');
    await click(pA, btn(pA, 'Continue where I left off', '#dBody .edoffer'));
    ok(await waitState(pA, /saved as a draft$/, 15000), '(o2) Continue: saved as a draft');
    const kept = await pA.evaluate(s => { const d = JSON.parse(localStorage.getItem('pgDashDraft:' + s) || 'null'); return d && d.ed.arts[1].t }, sOld);
    ok(kept === 'P6UI Older draft' && ((await P({ a: 'draftGet' }, OT)).draft || {}).sid !== sOld, '(o2) the older draft it replaced on the server is kept on this device');
    await click(pA, '#edPub'); await until(pA, () => document.querySelector('#dBody .edask'), null, 10000);
    await until(pA, () => document.activeElement && document.activeElement.id === 'edAskT', null, 3000);
    await pA.keyboard.press('Escape');
    ok(await pA.evaluate(() => dashD.open && !ASK && !document.querySelector('#dBody .edask') && document.activeElement && document.activeElement.id === 'edPub'), '(o2) Escape closes the question, not the dashboard, and the focus goes back to Publish');
    await click(pA, '#edDis'); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    ok(await until(pA, () => { const t = document.getElementById('edOfT'); return !!t && document.activeElement === t && /^Done — those changes were discarded\.$/.test(t.textContent) }, null, 30000), '(o2) after discarding, the older changes are offered next, starting “Done — those changes were discarded.” (with the focus)');
    const o3 = await txt(pA, '#dBody .edoffer') || '';
    ok(o3.includes('You also have other unpublished changes, from') && o3.includes('to “P6UI Older draft”'), '(o2) “' + o3.slice(0, 110) + '…”');
    await shot(pA, 'o2-done-then-older');
    await click(pA, btn(pA, 'Discard them', '#dBody .edoffer')); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edoffer'));
    ok(await until(pA, () => !OFFER && document.activeElement && document.activeElement.id === 'edNote' && /^Your unpublished changes were discarded\./.test(document.activeElement.textContent), null, 30000), '(o2) and after that: “Your unpublished changes were discarded.” (with the focus)');
    ok(await devKeys(pA) === 0 && (await P({ a: 'draftGet' }, OT)).draft === null, '(o2) tidy: no copies left');
    const now = (await P({ a: 'catGet' }, OT)).cat; await P({ a: 'catSave', cat: L, base: now.v }, OT);
  });

  await step('(q2) signed out', async () => { try {
    await reopen(pA, 'a');
    await pA.route('**/api/app', route => /"a":"(draftSave|catSave)"/.test(route.request().postData() || '') ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Please sign in.' }) }) : route.continue());
    await editTitle(pA, 4, 'P6UI Signed out');
    ok(await waitState(pA, /^Unpublished changes — saved on this device only$/, 15000), '(q2) signed out: “saved on this device only”');
    const w = await pA.evaluate(() => ({ t: $('edWhy').textContent, b: [...$('edWhy').querySelectorAll('button')].map(x => x.textContent) }));
    ok(w.t === 'You’re signed out, so these changes are only kept on this device. Sign in again' && JSON.stringify(w.b) === '["Sign in again"]', '(q2) “' + w.t + '” (a button, not “from Account”)');
    await click(pA, '#edPub'); await until(pA, () => !EDbusy && !!EDfail, null, 30000);
    const e = await pA.evaluate(() => ({ t: $('edErr').textContent, b: [...$('edErr').querySelectorAll('button')].map(x => x.textContent), why: $('edWhy').textContent, all: $('dBody').textContent }));
    ok(e.t === 'You’re signed out. Please sign in again, then try again. Your changes are kept on this device. Sign in again' && JSON.stringify(e.b) === '["Sign in again"]' && !e.why && !/“Account”/.test(e.all), '(q2) Publish: “' + e.t + '”, said once, with no mention of “Account”');
    await shot(pA, 'q2-signed-out');
    await click(pA, pA.locator('#edErr button'));
    ok(await until(pA, () => !dashD.open && acct.open, null, 10000), '(q2) “Sign in again” opens the sign-in window (the dashboard steps aside)');
    await pA.unroute('**/api/app');
    await pA.evaluate(() => { afterSign = null; acct.close() }); await dash(pA, 'a');
    ok(await pA.evaluate(() => EDdirty && ED.arts[4].t === 'P6UI Signed out') && await waitState(pA, /saved as a draft$/, 15000), '(q2) back in the dashboard, the changes are still there, and are saved as a draft again');
    await click(pA, '#edDis'); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    await until(pA, () => ED && !EDdirty && !EDload && !OFFER, null, 30000);
  } finally { await pA.unroute('**/api/app').catch(() => { }) } });

  await step('(r2) “Please fix this first” goes once it’s fixed', async () => {
    await reopen(pA, 's');
    const em = pA.locator('#dBody input[type=email]'); await em.fill('pam@example');
    await click(pA, '#edPub');
    ok(/^Please fix this first: The email for enquiries doesn’t look right/.test(await txt(pA, '#edErr') || ''), '(r2) a mistake: “Please fix this first: The email for enquiries doesn’t look right…”');
    await em.fill('pam@example.com');
    ok(!(await txt(pA, '#edErr')) && !(await txt(pA, '#dErr')), '(r2) once it’s corrected, the message goes straight away');
    await click(pA, '#edDis'); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    await until(pA, () => ED && !EDdirty && !EDload && !OFFER, null, 30000);
  });

  await step('(s2) a backup with problems names them', async () => {
    await tabTo(pA, 's');
    await click(pA, btn(pA, 'Go to Earlier versions and backups', '#dBody'));
    ok(await until(pA, () => { const h = document.querySelector('#edVers h3'), c = document.querySelector('#dash .txt').getBoundingClientRect(); if (!h || document.activeElement !== h) return false; const r = h.getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom }, null, 5000), '(s2) “Go to Earlier versions and backups” at the top of Settings jumps there');
    const live = (await P({ a: 'catGet' }, OT)).cat, bk = { kind: 'pams-gallery-backup', version: 1, v: live.v, saved: new Date(live.v).toISOString(), cat: JSON.parse(JSON.stringify(live)) };
    bk.cat.arts.push({ id: 'bad id!', t: 'P6UI Broken painting', img: 'emb:p1' }); bk.cat.arts.push({ id: 'p6uilost', t: 'P6UI Lost photo', img: '/api/app?img=p6uinotthere0' });
    const fp = path.join(SHOTS, 'p6ui-backup-problems.json'); fs.writeFileSync(fp, JSON.stringify(bk));
    await pA.setInputFiles('#edVers input[type=file]', fp);
    ok(await until(pA, () => document.querySelector('#edVers .vbox'), null, 30000), '(s2) the preview');
    const pv = await pA.evaluate(() => ({ w: [...document.querySelectorAll('#edVers .vbox .mailwarn')].map(p => p.textContent), h: getComputedStyle(document.querySelector('#edVers .vbox h4')).fontFamily, fs: getComputedStyle(document.querySelector('#edVers .vbox p:not(.mailwarn)')).fontSize }));
    ok(pv.w.length === 2 && pv.w[0] === '1 painting (“P6UI Broken painting”) can’t be used, so it’d be left out.' && pv.w[1] === '1 photo (“P6UI Lost photo”) isn’t on the gallery’s server any more, so that one would show without a picture.', '(s2) it names them: ' + pv.w.join(' | '));
    ok(/Cormorant/.test(pv.h) && pv.fs === '14.08px', '(s2) and looks like the rest of the dashboard (heading ' + pv.h.split(',')[0] + ', text ' + pv.fs + ')');
    const oc = await pA.evaluate(() => { const h = document.querySelector('#edVers .vbox h4'); h.focus(); return getComputedStyle(h).outlineColor });
    ok(oc === 'rgb(75, 46, 34)', '(s2) its focus outline is the dark walnut (about 12:1 against the box), not the pale bronze: ' + oc);
    await pA.locator('#edVers .vbox').scrollIntoViewIfNeeded(); await shot(pA, 's2-backup-problems');
    await pA.keyboard.press('Escape');
    ok(await pA.evaluate(() => dashD.open && !document.querySelector('#edVers .vbox') && document.activeElement && document.activeElement.id === 'vbkUp'), '(s2) Escape closes the preview (nothing restored), not the dashboard');
    const big = path.join(SHOTS, 'p6ui-too-big.json'); fs.writeFileSync(big, 'x'.repeat(3100000));
    await pA.setInputFiles('#edVers input[type=file]', big);
    ok(await until(pA, () => /too big to be a gallery backup\. Please choose a backup saved from this dashboard/.test((document.querySelector('#edVers .vimp') || {}).textContent || ''), null, 10000), '(s2) a file that’s too big says what to do instead');
    fs.unlinkSync(big);
  });

  await step('(t2) a photo that can’t be added', async () => { try {
    await tabTo(pA, 'a');
    const png = path.join(SHOTS, 'p6ui-tiny.png'); fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    await pA.route('**/api/app', route => /"a":"imgUpload"/.test(route.request().postData() || '') ? route.abort('internetdisconnected') : route.continue());
    await pA.setInputFiles('#dBody .edhead input[type=file]', png);
    ok(await until(pA, () => /^The photo couldn’t be added — please check your internet connection and try again\.$/.test((document.getElementById('edErr') || {}).textContent || ''), null, 20000), '(t2) adding a photo offline: “' + (await txt(pA, '#edErr')) + '” (in the publish bar, and no “please email Pam”)');
    ok(await pA.evaluate(() => !EDdirty && /^Everything is published$/.test($('edState').textContent)), '(t2) nothing else changed');
  } finally { await pA.unroute('**/api/app').catch(() => { }) } });

  await step('(j) phone', async () => {
    const live = (await P({ a: 'catGet' }, OT)).cat, other = JSON.parse(JSON.stringify(live)); other.arts[0].t = 'P6UI From the laptop';
    const sv = await P({ a: 'draftSave', draft: other, base: live.v, sid: 'p6uilaptop' + Math.random().toString(36).slice(2, 8), take: true }, OT);
    ok(sv.ok, '(j) a draft saved from another device (the laptop)');
    const ph = await newCtx(b, Object.assign({}, devices['iPhone 13'], { deviceScaleFactor: 2 }));
    const pP = await open(ph, 'phone');
    await dash(pP);
    ok(await until(pP, () => document.querySelector('#dBody .edoffer'), null, 30000), '(j) on the phone, the dashboard offers the laptop’s unpublished changes');
    ok(await until(pP, () => { const t = document.getElementById('edOfT'), c = document.querySelector('#dash .txt'); if (!t || document.activeElement !== t) return false; const r = t.getBoundingClientRect(), b = c.getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom }, null, 5000), '(j) it is scrolled to and takes the focus (it used to wait below the visit numbers, off the screen)');
    let o = await noOverflow(pP); ok(!o.length, '(j) the offer fits the phone screen' + (o.length ? ': ' + o.join('; ') : ''));
    await shot(pP, 'j-phone-offer');
    await click(pP, btn(pP, 'Continue where I left off', '#dBody .edoffer'));
    ok(await waitState(pP, /saved as a draft$/, 12000), '(j) Continue: “' + await txt(pP, '#edState') + '”');
    o = await noOverflow(pP); ok(!o.length, '(j) the publish bar fits' + (o.length ? ': ' + o.join('; ') : ''));
    await pP.evaluate(() => document.querySelector('#dash .txt').scrollTop = document.querySelector('#dBody .edbar').offsetTop - 20); await shot(pP, 'j-phone-bar');
    try {
      await mock(['MOCK.FAILWRITES', '*']);
      await editTitle(pP, 0, 'P6UI Phone not saved'); await waitState(pP, /saved on this device only$/, 15000);
      const h1 = await pP.evaluate(() => ({ bar: Math.round(document.querySelector('#dBody .edbar').getBoundingClientRect().height), out: !document.querySelector('#dBody .edbar #edWhy') && !!document.getElementById('edWhy').textContent }));
      await click(pP, '#edPub'); await until(pP, () => !EDbusy && !!EDfail, null, 30000);
      const h2 = await pP.evaluate(() => Math.round(document.querySelector('#dBody .edbar').getBoundingClientRect().height));
      ok(h1.out && h1.bar <= 120 && h2 <= 200, '(j) the pinned bar stays small on a phone: ' + h1.bar + ' px, with the reason under it (not pinned); ' + h2 + ' px with the “storage is full” message (it was 196 and 250)');
      await pP.evaluate(() => document.querySelector('#dash .txt').scrollTop = document.querySelector('#dBody .edbar').offsetTop - 20); await shot(pP, 'j-phone-bar-full');
    } finally { await mock(['MOCK.FAILWRITES', '']) }
    const n = await pP.locator('#dBody .edrow').count(), last = pP.locator('#dBody .edrow').nth(n - 1);
    await click(pP, last.locator('.edacts button').filter({ hasText: exact('Remove') })); await click(pP, last.locator('button').filter({ hasText: exact('Remove it') }));
    await click(pP, '#edPub');
    ok(await until(pP, () => document.querySelector('#dBody .edask'), null, 10000), '(j) the removal question on the phone');
    o = await noOverflow(pP); ok(!o.length, '(j) the question and its buttons fit' + (o.length ? ': ' + o.join('; ') : ''));
    await shot(pP, 'j-phone-ask');
    await click(pP, btn(pP, 'Not yet', '#dBody .edask'));
    await click(pP, '#edDis'); await click(pP, btn(pP, 'Yes, discard them', '#dBody .edask'));
    ok(await until(pP, () => ED && !EDdirty && !EDload && !OFFER, null, 30000) && (await P({ a: 'draftGet' }, OT)).draft === null, '(j) “Discard changes” on the phone clears the draft it carried on from');
    await tabTo(pP, 's'); await until(pP, () => document.querySelector('#edVers .vrow'), null, 30000);
    await pP.evaluate(() => document.getElementById('edVers').scrollIntoView());
    o = await noOverflow(pP); ok(!o.length, '(j) Earlier versions fits the phone' + (o.length ? ': ' + o.join('; ') : ''));
    await shot(pP, 'j-phone-versions');
    const r1 = pP.locator('#edVers .vrow').nth(1); await click(pP, r1.locator('button').filter({ hasText: exact('Restore') }));
    await until(pP, () => { const c = document.querySelectorAll('#edVers .vrow')[1].querySelector('.edconfirm'); return !!c && !c.hidden && /What it would change:|nothing to restore/.test(c.textContent) }, null, 20000);
    await r1.locator('.edconfirm').scrollIntoViewIfNeeded();
    o = await noOverflow(pP); ok(!o.length, '(j) restoring a version: what it would change, and the question, fit the phone' + (o.length ? ': ' + o.join('; ') : ''));
    await shot(pP, 'j-phone-restore-asks');
    await pP.keyboard.press('Escape');
    await ph.close();
  });

  // put the gallery back as it was, and leave no draft
  await mock(['MOCK.FAILWRITES', '']);
  const live = (await P({ a: 'catGet' }, OT)).cat, r = await P({ a: 'catSave', cat: cat0, base: live.v }, OT);
  const d = (await P({ a: 'draftGet' }, OT)).draft; if (d) await P({ a: 'draftClear', t: d.t }, OT);
  ok(r.ok && !(await P({ a: 'draftGet' }, OT)).draft, 'tidy-up: the starting catalogue is live again and no draft is left');
  ok(!ERRS.length, 'no errors on the page' + (ERRS.length ? ': ' + ERRS.slice(0, 5).join(' | ') : ''));
  console.log('screenshots (' + SHOT.length + ') in ' + SHOTS + ': ' + SHOT.join(', '));
  console.log('took ' + Math.round((Date.now() - t0) / 1000) + ' s');
  await b.close();
})().catch(e => { console.log('FAIL the test stopped: ' + String(e && e.stack || e).slice(0, 600)); process.exitCode = 1; process.exit(1) });
