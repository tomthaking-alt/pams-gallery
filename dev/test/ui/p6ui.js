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
async function step(name, fn) { try { await fn() } catch (e) { ok(false, name + ' — stopped: ' + String(e && e.message || e).split('\n')[0].slice(0, 300)) } }

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
    const dev = await pA.evaluate(() => JSON.parse(localStorage.getItem('pgDashDraft') || 'null'));
    ok(!!dev && dev.ed.arts[0].t === T1 && dev.sid === d.sid, '(a) and this device keeps a copy too');
    await shot(pA, 'a-saved-as-draft');
  });

  await step('(b) the offer after a reload', async () => {
    await pA.reload({ waitUntil: 'commit' }); await ready(pA);
    await dash(pA);
    ok(await until(pA, () => document.querySelector('#dBody .edoffer'), null, 30000), '(b) after a reload, opening the dashboard offers the unpublished changes (on the first tab)');
    const o = await txt(pA, '#dBody .edoffer') || '';
    ok(/^You have unpublished changes from \d{1,2} [A-Z][a-z]{2,4} \d{4}, \d\d:\d\d\. They were saved as a draft\./.test(o), '(b) “' + o.slice(0, 90) + '…”');
    ok(o.includes('What they change:') && o.includes('Renamed “' + tOld + '” to “' + T1 + '”'), '(b) it says what they change: Renamed “' + tOld + '” to “' + T1 + '”');
    ok(await btn(pA, 'Continue where I left off', '#dBody .edoffer').count() === 1 && await btn(pA, 'Discard them', '#dBody .edoffer').count() === 1, '(b) with “Continue where I left off” and “Discard them”');
    await shot(pA, 'b-offer');
    await tabTo(pA, 'a');
    ok(/Choose what to do with your unpublished changes above/.test(await txt(pA, '#dBody') || ''), '(b) editing waits until Pam chooses (nothing can overwrite the draft)');
    await click(pA, btn(pA, 'Discard them', '#dBody .edoffer'));
    ok(/^Discard these changes for good\?/.test(await txt(pA, '#dBody .edoffer .edconfirm') || '') && await pA.evaluate(() => document.activeElement && document.activeElement.textContent === 'Yes, discard them'), '(b) “Discard them” asks first, with the focus on “Yes, discard them”');
    await click(pA, btn(pA, 'Keep them', '#dBody .edoffer'));
    await click(pA, btn(pA, 'Continue where I left off', '#dBody .edoffer'));
    await pA.waitForSelector('#dBody .edrow', { timeout: 30000 });
    const back = await pA.evaluate(() => ({ t: ED.arts[0].t, dirty: EDdirty, tab: dTab, row: document.querySelector('#dBody .edrow .edinfo b').textContent, note: (document.querySelector('#dBody .edmsg') || {}).textContent }));
    ok(back.t === T1 && back.row === T1 && back.dirty && back.tab === 'a', '(b) “Continue where I left off” brings the edit back (“' + back.row + '”)');
    ok(/^Your unpublished changes are back\./.test(back.note || ''), '(b) “' + (back.note || '') + '”');
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
    ok(await waitState(pA, /^Everything is published$/, 5000), '(c) the bar says “Everything is published”');
    ok((await P({ a: 'draftGet' }, OT)).draft === null, '(c) publishing cleared the server draft');
    ok(await pA.evaluate(() => localStorage.getItem('pgDashDraft')) === null, '(c) and the copy on this device');
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
    } else ok(!(await more.isVisible()), '(c) no “Show earlier versions” button when everything is shown');
    await pA.locator('#edVers').scrollIntoViewIfNeeded(); await pA.evaluate(() => document.getElementById('edVers').scrollIntoView());
    await shot(pA, 'c-earlier-versions');
  });

  await step('(d) bring back an older version', async () => {
    const row = pA.locator('#edVers .vrow').nth(1), when = await row.locator('.vhead b').textContent();
    ok(await row.locator('button').filter({ hasText: exact('Restore') }).getAttribute('aria-label') === 'Restore the version from ' + when, '(d) each Restore button says which version (for screen readers)');
    await click(pA, row.locator('button').filter({ hasText: exact('Restore') }));
    const cf = await row.locator('.edconfirm').textContent();
    ok(cf.startsWith('Bring back the version from ' + when + '? It goes live straight away, and the version that’s live now stays in this list.'), '(d) Restore asks first: “' + cf.slice(0, 100) + '…”');
    ok((await P({ a: 'catHist' }, OT)).total === h1.total, '(d) nothing changes before Pam says yes');
    await row.scrollIntoViewIfNeeded(); await shot(pA, 'd-restore-asks');
    await click(pA, row.locator('button').filter({ hasText: exact('Yes, bring it back') }));
    await until(pA, () => /^Brought back|^That version is the same/.test(EDmsg || '') || !!EDfail);
    const m = await txt(pA, '#edMsg') || '';
    ok(m.startsWith('Brought back the version from ' + when + '. Visitors will see it from their next visit.'), '(d) “' + m.slice(0, 110) + '”');
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
    ok(await pA.evaluate(() => document.activeElement && document.activeElement.id === 'edAskT'), '(f) the question takes the focus');
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
    ok(/^The gallery’s database is full, so nothing new could be saved\. Your changes are still safe in your draft/.test(e) && !m && !(await pA.$('#edMsg')), '(h) Publish shows a clear message and not “Published”: “' + e.slice(0, 100) + '…”');
    ok(/^Unpublished changes/.test(await txt(pA, '#edState') || '') && await pA.evaluate(() => EDdirty && ED.arts[2].t === 'P6UI Not published yet'), '(h) the change is still there, unpublished');
    const hh2 = await P({ a: 'catHist' }, OT), lh2 = (await P({ a: 'catGet' }, OT)).cat;
    ok(hh2.total === hh.total && lh2.v === lh.v && lh2.arts[2].t === lh.arts[2].t, '(h) nothing changed on the live gallery');
    await shot(pA, 'h-database-full');
    await mock(['MOCK.FAILWRITES', 'cat:draft']);
    await titleBox(pA, 2).fill('P6UI Not published yet 2');
    ok(await waitState(pA, /^Unpublished changes — saved on this device only$/, 12000), '(h) when the draft can’t be saved either: “' + await txt(pA, '#edState') + '”');
    const w = await txt(pA, '#edWhy') || '';
    ok(w === 'The gallery’s server couldn’t save them just now, so they’re kept on this device for now. It will try again by itself.', '(h) “' + w + '”');
    ok(await pA.evaluate(() => JSON.parse(localStorage.getItem('pgDashDraft')).ed.arts[2].t) === 'P6UI Not published yet 2', '(h) and this device has them');
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
    ok(await until(pA, () => !OFFER && !document.querySelector('#dBody .edoffer'), null, 15000) && (await P({ a: 'draftGet' }, OT)).draft === null && await pA.evaluate(() => localStorage.getItem('pgDashDraft')) === null, '(l) “Discard them” → “Yes, discard them” removes both copies');
    const live = (await P({ a: 'catGet' }, OT)).cat, old = JSON.parse(JSON.stringify(live)); old.arts[5].t = 'P6UI Kept the old way';
    await pA.evaluate(o => localStorage.setItem('pgDashDraft', JSON.stringify({ t: Date.now() - 3600e3, base: o.v, ed: o })), old);
    await reopen(pA);
    const o = (await until(pA, () => document.querySelector('#dBody .edoffer'), null, 30000)) ? await txt(pA, '#dBody .edoffer') : '';
    ok(/They were saved on this device\./.test(o) && o.includes('to “P6UI Kept the old way”'), '(l) a copy kept on this device by the dashboard before this update is offered too');
    await shot(pA, 'l-offer-from-this-device');
    await click(pA, btn(pA, 'Continue where I left off', '#dBody .edoffer'));
    ok(await waitState(pA, /saved as a draft$/, 12000) && await pA.evaluate(() => ED.arts[5].t) === 'P6UI Kept the old way', '(l) Continue brings it back and saves it as a draft');
    await click(pA, '#edDis'); await click(pA, btn(pA, 'Yes, discard them', '#dBody .edask'));
    ok(await until(pA, () => ED && !EDdirty && !EDload && !OFFER, null, 30000) && (await P({ a: 'draftGet' }, OT)).draft === null && await pA.evaluate(() => localStorage.getItem('pgDashDraft')) === null, '(l) “Discard changes” removes both copies');
  });

  await step('(j) phone', async () => {
    const live = (await P({ a: 'catGet' }, OT)).cat, other = JSON.parse(JSON.stringify(live)); other.arts[0].t = 'P6UI From the laptop';
    const sv = await P({ a: 'draftSave', draft: other, base: live.v, sid: 'p6uilaptop' + Math.random().toString(36).slice(2, 8), take: true }, OT);
    ok(sv.ok, '(j) a draft saved from another device (the laptop)');
    const ph = await newCtx(b, Object.assign({}, devices['iPhone 13'], { deviceScaleFactor: 2 }));
    const pP = await open(ph, 'phone');
    await dash(pP);
    ok(await until(pP, () => document.querySelector('#dBody .edoffer'), null, 30000), '(j) on the phone, the dashboard offers the laptop’s unpublished changes');
    let o = await noOverflow(pP); ok(!o.length, '(j) the offer fits the phone screen' + (o.length ? ': ' + o.join('; ') : ''));
    await pP.locator('#dBody .edoffer').scrollIntoViewIfNeeded(); await shot(pP, 'j-phone-offer');
    await click(pP, btn(pP, 'Continue where I left off', '#dBody .edoffer'));
    ok(await waitState(pP, /saved as a draft$/, 12000), '(j) Continue: “' + await txt(pP, '#edState') + '”');
    o = await noOverflow(pP); ok(!o.length, '(j) the publish bar fits' + (o.length ? ': ' + o.join('; ') : ''));
    await pP.evaluate(() => document.querySelector('#dash .txt').scrollTop = document.querySelector('#dBody .edbar').offsetTop - 20); await shot(pP, 'j-phone-bar');
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
