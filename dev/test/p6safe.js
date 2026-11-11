// Phase 6 server checks: nothing Pam publishes or drafts is lost. Every version is kept with what changed, an older page can't
// publish over newer work, unpublished changes are saved as a draft on the server, backups go out and come back, and the versions
// kept the old way ('cat:hist', the last ten) join the full list. Part 1 uses the local site; part 2 runs the server code here on a
// private pretend database of its own (first catalogue, a missing live copy, a full database, 2,000 versions, the move from the old list).
// Needs: the local site and pretend database (with test accounts and the demo catalogue: node dev/test/api3.js && node dev/test/demo.js).
const B = 'http://localhost:8794', U = B + '/api/app', IP = '10.6.' + Math.floor(Math.random() * 250) + '.1';   // own rate-limit bucket
const path = require('path'), { spawn } = require('child_process');
const MOCK = path.join(__dirname, 'mockredis.py'), APP = path.join(__dirname, '..', 'out', 'app.js');
const PORT = 18800 + Math.floor(Math.random() * 90), PU = 'http://127.0.0.1:' + PORT;    // part 2's private pretend database
async function P(b, tok) { const h = { 'Content-Type': 'application/json', 'x-forwarded-for': IP }; if (tok) h.Authorization = 'Bearer ' + tok; const r = await fetch(U, { method: 'POST', headers: h, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); j._s = r.status; return j }
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const clone = x => JSON.parse(JSON.stringify(x)), same = (a, b) => JSON.stringify(a) === JSON.stringify(b), sid = p => p + Math.random().toString(36).slice(2, 10);
const WHEN = /^Restored the version from \d{1,2} [A-Z][a-z]{2,3}( \d{4})?, \d\d:\d\d$/;

async function part1() {
  const OT = (await P({ a: 'login', email: 'pts98@hotmail.co.uk', password: 'testpass123' })).token, BT = (await P({ a: 'login', email: 'bob@example.com', password: 'bobpass123' })).token;
  ok(OT && BT, 'signed in as owner and member');
  const cat0 = (await P({ a: 'catGet' }, OT)).cat;
  ok(cat0 && cat0.v && cat0.arts.length >= 10, 'a published catalogue to work with (on a fresh database run api3.js && demo.js first)'); if (!cat0 || cat0.arts.length < 10) return;
  for (const a of ['catVer', 'catImport', 'draftSave', 'draftGet', 'draftClear']) { const r0 = await P({ a, cat: { arts: [] }, draft: { arts: [] }, sid: 'abcdefgh' }), r1 = await P({ a, cat: { arts: [] }, draft: { arts: [] }, sid: 'abcdefgh' }, BT); ok(r0._s === 403 && r1._s === 403 && !r1.cat && !r1.draft, 'only Pam: ' + a + ' (' + r0._s + ',' + r1._s + ')') }
  let v = cat0.v, r;
  const n0 = (await P({ a: 'catHist' }, OT)).total, made = [];
  // an older page can't publish over newer work
  const cx = clone(cat0); cx.arts[0].t = 'P6 not published';
  r = await P({ a: 'catSave', cat: cx }, OT); ok(r._s === 409 && r.code === 'base_missing' && /reload/i.test(r.error), 'a publish that doesn’t say which version it started from is refused (' + r._s + ')');
  r = await P({ a: 'catSave', cat: cx, base: v - 1 }, OT); ok(r._s === 409 && r.code === 'stale' && r.live === v, 'a publish from an older version is refused');
  // values that can't even be turned into text (only a script could send them): a plain refusal, never a server error
  const odd = clone(cat0); odd.arts[0].t = { toString: 1, valueOf: 1 };
  r = await P({ a: 'catImport', cat: odd, dry: true }, OT); ok(r._s === 400 && /isn’t a gallery backup/.test(r.error), 'a backup file with values that can’t be read: “That file isn’t a gallery backup” (' + r._s + ')');
  r = await P({ a: 'catSave', cat: odd, base: v }, OT); const r2 = await P({ a: 'draftSave', draft: odd, base: v, sid: sid('p6odd') }, OT);
  ok(r._s === 400 && r2._s === 400 && /couldn’t be read/.test(r.error), 'the same in a publish or a draft: a plain answer (' + r._s + ', ' + r2._s + ')');
  // what changed, in plain English
  const pub = async (c, want, msg) => { const x = await P({ a: 'catSave', cat: c, base: v }, OT); if (x.ok) { v = x.cat.v; made.push({ v, changes: x.changes }) } ok(x.ok && (!want || same(x.changes, want)), msg + ': ' + JSON.stringify(x.changes || x.error)); return x };
  const A = cat0.arts[0], Bp = cat0.arts[1]; let c = clone(cat0);
  c.arts[0].t = 'P6 Renamed'; await pub(c, ['Renamed “' + A.t + '” to “P6 Renamed”'], 'rename');
  c = clone(c); c.arts[0].s = 'P6 size 61 × 46 cm'; await pub(c, ['Changed the size of “P6 Renamed”'], 'size');
  c = clone(c); c.arts[0].d = 'P6 words about the painting.'; await pub(c, ['Changed the description of “P6 Renamed”'], 'description');
  c = clone(c); c.arts[0].mode = 'price'; c.arts[0].p = '£6,543'; await pub(c, ['Changed the price of “P6 Renamed”'], 'price');
  c = clone(c); c.arts.push({ id: 'p6x', t: 'P6 Added', img: 'emb:p1' }); await pub(c, ['Added “P6 Added”'], 'add');
  c = clone(c); c.arts = c.arts.filter(a => a.id !== 'p6x'); await pub(c, ['Removed “P6 Added”'], 'remove');
  c = clone(c); c.arts[1].s = 'P6 30 × 40 cm'; c.arts[1].year = '1999'; c.arts[1].d = 'P6 other words.'; await pub(c, ['Changed the size, year and description of “' + Bp.t + '”'], 'several details of one painting');
  c = clone(c); const K = c.colls[0], Y = c.arts.find(a => K.works.indexOf(a.id) < 0);
  c.favs = c.favs.slice().reverse(); K.works.push(Y.id); c.site.banner.text = 'P6 banner'; c.site.buy = Object.assign({}, c.site.buy, { ukCost: 'P6 £9' }); c.texts['george.greet'] = 'P6 coo';
  await pub(c, ['Changed This Month’s Favourites', 'Collection “' + K.t + '”: added “' + Y.t + '”', 'Changed King George’s words', 'Changed the banner', 'Changed the buying & delivery details'], 'favourites, a collection, King George, the banner, buying & delivery');
  c = clone(c); c.arts.slice(0, 10).forEach((a, i) => { a.t = 'P6 many ' + i }); r = await pub(c, null, 'ten renames');
  ok(r.changes.length === 9 && r.changes[8] === 'and 2 more changes', 'at most eight lines, then “and 2 more changes”');
  r = await P({ a: 'catSave', cat: clone(c), base: v }, OT); ok(r.ok && r.unchanged === true && r.cat.v === v, 'publishing with nothing changed adds no version');
  r = await P({ a: 'catSave', cat: clone(c), base: v - 1 }, OT); ok(r.ok && r.unchanged === true && r.cat.v === v, 'the same as what’s live, sent from an older page (a publish whose answer was lost, sent again): nothing is replaced, so no refusal');
  // every version kept and listed, twenty at a time
  let h = await P({ a: 'catHist' }, OT);
  ok(h.total === n0 + made.length && h.total > 10 && h.live === v && h.list[0].v === v, 'every version kept: ' + h.total + ' listed, the newest live');
  ok(made.every(m => { const e = h.list.find(x => x.v === m.v); return e && e.kind === 'publish' && same(e.changes, m.changes) }), 'each new version is listed with its change lines');
  ok(h.list.length === Math.min(20, h.total) && h.more === h.total > 20 && h.list.every((x, i) => !i || x.v < h.list[i - 1].v), 'twenty at a time, newest first');
  if (h.more) { const h2 = await P({ a: 'catHist', from: 20 }, OT); ok(h2.list.length && h2.list[0].v < h.list[19].v && !h2.list.some(x => h.list.find(y => y.v === x.v)), 'Show earlier versions: the next twenty, no repeats') }
  // bringing an earlier version back
  r = await P({ a: 'catRestore', v: cat0.v }, OT); ok(r._s === 409 && r.code === 'base_missing', 'restore says which version it started from');
  r = await P({ a: 'catRestore', v: cat0.v, base: v - 1 }, OT); ok(r._s === 409 && r.code === 'stale', 'restore from an older page refused');
  r = await P({ a: 'catRestore', v: 1, base: v }, OT); ok(r._s === 404, 'a version that was never kept: 404');
  r = await P({ a: 'catRestore', v: cat0.v, base: v }, OT); ok(r.ok && r.cat.arts[0].t === A.t && WHEN.test(r.changes[0]), 'an earlier version brought back: ' + r.changes.slice(0, 3).join(' | '));
  const vBefore = v; v = r.cat.v; h = await P({ a: 'catHist' }, OT);
  ok(h.list[0].v === v && h.list[0].kind === 'restore' && h.list[0].from === cat0.v && h.list.some(x => x.v === vBefore) && h.list.some(x => x.v === cat0.v), 'the restore is a new version; the ones before it are all still kept');
  // drafts on the server
  const sA = sid('p6a'), sB = sid('p6b'), d = clone(cat0); d.arts[0].t = 'P6 Draft';
  r = await P({ a: 'draftSave', draft: d, base: v, sid: sA }, OT); ok(r.ok && r.t, 'unpublished changes saved as a draft'); const tA = r.t;
  r = await P({ a: 'draftGet' }, OT); ok(r.draft && r.draft.t === tA && r.draft.base === v && r.draft.sid === sA && r.draft.cat.arts[0].t === 'P6 Draft', 'the draft comes back as saved');
  r = await P({ a: 'draftSave', draft: cat0, base: v, sid: sB }, OT); ok(r._s === 409 && r.code === 'draft_other' && r.draft.t === tA, 'another dashboard can’t overwrite it unasked');
  r = await P({ a: 'draftSave', draft: d, base: v, sid: sB, take: true }, OT); ok(r.ok, 'it can when Pam chose to carry on there'); const tB = r.t;
  r = await P({ a: 'draftClear', t: tB - 1 }, OT); ok(r.ok && r.cleared === false && (await P({ a: 'draftGet' }, OT)).draft, 'clearing with the wrong time leaves it');
  r = await P({ a: 'draftClear', t: tB }, OT); ok(r.cleared === true && !(await P({ a: 'draftGet' }, OT)).draft, 'Discard them clears it');
  await P({ a: 'draftSave', draft: d, base: v, sid: sA }, OT);
  c = clone((await P({ a: 'catGet' }, OT)).cat); c.arts[2].d = 'P6 published elsewhere';
  r = await P({ a: 'catSave', cat: c, base: v, sid: sB }, OT); v = r.cat.v; ok(r.ok && (await P({ a: 'draftGet' }, OT)).draft, 'publishing from another dashboard leaves this draft alone');
  c = clone(c); c.arts[2].d = 'P6 published from the draft'; r = await P({ a: 'catSave', cat: c, base: v, sid: sA }, OT); v = r.cat.v;
  ok(r.ok && !(await P({ a: 'draftGet' }, OT)).draft, 'publishing from the draft’s own dashboard clears it');
  await P({ a: 'draftSave', draft: (await P({ a: 'catGet' }, OT)).cat, base: v, sid: sA }, OT); ok(!(await P({ a: 'draftGet' }, OT)).draft, 'a draft with nothing unpublished in it is tidied away');
  const long = clone(d); long.arts[0].t = 'x'.repeat(200); await P({ a: 'draftSave', draft: long, base: v, sid: sA }, OT);
  r = await P({ a: 'draftGet' }, OT); ok(r.draft && r.draft.cat.arts[0].t.length === 90, 'drafts keep the same limits as publishing'); await P({ a: 'draftClear', sid: sA }, OT);
  // a dashboard's newest edits stay, whatever order its saves arrive in
  const sG = sid('p6g'), dg = clone(cat0); dg.arts[0].t = 'P6 edit 5'; await P({ a: 'draftSave', draft: dg, base: v, sid: sG, gen: 5 }, OT);
  dg.arts[0].t = 'P6 edit 3'; const late = await P({ a: 'draftSave', draft: dg, base: v, sid: sG, gen: 3 }, OT);
  r = await P({ a: 'draftGet' }, OT); ok(late.ok && late.kept && r.draft && r.draft.cat.arts[0].t === 'P6 edit 5' && r.draft.gen === 5, 'an older save from the same dashboard arriving late doesn’t replace its newer edits');
  ok(typeof r.now === 'number' && Math.abs(r.now - Date.now()) < 60000, 'draftGet says the server’s time (to compare with copies kept on a device)');
  // carrying on replaces only the draft Pam was shown, and notes where it went
  const sH = sid('p6h'), tG = r.draft.t; dg.arts[0].t = 'P6 carried on';
  r = await P({ a: 'draftSave', draft: dg, base: v, sid: sH, take: tG - 1 }, OT); ok(r._s === 409 && r.code === 'draft_other' && (await P({ a: 'draftGet' }, OT)).draft.sid === sG, 'carrying on after another draft was saved meanwhile: refused, and that newer draft stays');
  r = await P({ a: 'draftSave', draft: dg, base: v, sid: sH, take: tG, from: tG }, OT); ok(r.ok, 'carrying on with the draft Pam was shown');
  r = await P({ a: 'draftGet', devs: [sG, sH, 'not a session!', { x: 1 }] }, OT);
  ok(r.draft && r.draft.sid === sH && r.done[sG] && r.done[sG].k === 'c' && r.done[sG].gen === 5 && !r.done[sH], 'the dashboard it came from is noted as carried on (so its own device doesn’t offer it again later)');
  r = await P({ a: 'draftClear', t: r.draft.t, done: 'd' }, OT); ok(r.cleared && (await P({ a: 'draftGet', devs: [sH] }, OT)).done[sH].k === 'd', '“Discard them” on another dashboard’s draft notes it as discarded');
  // two dashboards saving their first draft at the same moment: never both told “saved”
  let both = 0; for (let i = 0; i < 6; i++) { const x = await Promise.all([P({ a: 'draftSave', draft: dg, base: v, sid: sid('p6r') }, OT), P({ a: 'draftSave', draft: d, base: v, sid: sid('p6s') }, OT)]); if (x[0].ok && x[1].ok) both++; const dd = (await P({ a: 'draftGet' }, OT)).draft; if (dd) await P({ a: 'draftClear', t: dd.t }, OT) }
  ok(both === 0, 'two dashboards saving their first draft at once are never both told “saved” (' + both + ' of 6)');
  // collections' ids are bookkeeping: a draft that only changes them is nothing new
  const live1 = (await P({ a: 'catGet' }, OT)).cat, ids = clone(live1); ids.colls.forEach((k, i) => { k.id = 'p6coll' + i + Math.random().toString(36).slice(2, 6) });
  r = await P({ a: 'draftSave', draft: ids, base: live1.v, sid: sid('p6i') }, OT);
  ok(r.ok && (await P({ a: 'draftGet' }, OT)).draft === null && (await P({ a: 'catImport', cat: ids, dry: true }, OT)).preview.same === true, 'a draft that only gives the collections new ids (nothing visitors see) is tidied away, and counts as the same gallery');
  ids.colls[0].t = 'P6 renamed collection'; r = await P({ a: 'catImport', cat: ids, dry: true }, OT);
  ok(r.preview && !r.preview.same && r.preview.changes.some(x => /^Renamed the collection .* to “P6 renamed collection”$/.test(x)), 'a real change to a collection still counts: ' + (r.preview && r.preview.changes[0]));
  // backups
  r = await P({ a: 'catVer' }, OT); ok(r.cat && r.cat.v === v && r.live, 'download the live version');
  const old = (await P({ a: 'catVer', v: cat0.v }, OT)).cat; ok(old && old.v === cat0.v && old.arts[0].t === A.t, 'download any kept version');
  ok((await P({ a: 'catVer', v: 1 }, OT))._s === 404, 'a version that was never kept: 404');
  const file = { kind: 'pams-gallery-backup', version: 1, v: old.v, saved: new Date(old.v).toISOString(), cat: old }, t0 = (await P({ a: 'catHist' }, OT)).total;
  r = await P({ a: 'catImport', cat: file, dry: true }, OT);
  ok(r.ok && r.preview && r.preview.arts === old.arts.length && r.preview.dropped === 0 && r.preview.missing === 0 && r.preview.changes.length && !r.preview.same, 'a backup file is checked and summed up first: ' + JSON.stringify(r.preview || r.error).slice(0, 150));
  ok((await P({ a: 'catHist' }, OT)).total === t0, 'looking at a backup changes nothing');
  r = await P({ a: 'catImport', cat: file }, OT); ok(r._s === 409 && r.code === 'base_missing', 'restoring a backup says which version it started from');
  r = await P({ a: 'catImport', cat: file, base: v, sid: sA }, OT); ok(r.ok && r.changes[0] === 'Restored from a backup file' && r.cat.arts[0].t === A.t, 'a backup goes live as a new version: ' + r.changes.slice(0, 3).join(' | ')); v = r.cat.v;
  h = await P({ a: 'catHist' }, OT); ok(h.list[0].kind === 'import' && h.list[0].from === old.v, 'listed as restored from a backup file');
  ok((await P({ a: 'catImport', cat: { arts: 'x' }, dry: true }, OT))._s === 400 && (await P({ a: 'catImport', cat: { arts: [{ id: 'bad id!', img: 'nope' }] }, dry: true }, OT))._s === 400, 'not a backup, or nothing usable in it: refused');
  // what restoring a version would change, before anything changes
  const nh = (await P({ a: 'catHist' }, OT)).total;
  r = await P({ a: 'catRestore', v: made[0].v, dry: true }, OT);   // the first rename above (the backup just brought the starting version back)
  ok(r.ok && r.preview && !r.preview.same && same(r.preview.changes, ['Renamed “' + A.t + '” to “P6 Renamed”']) && (await P({ a: 'catHist' }, OT)).total === nh && (await P({ a: 'catGet' }, OT)).cat.v === v, 'restore, just looking: says what bringing back a version would change, and changes nothing: ' + (r.preview && r.preview.changes.slice(0, 2).join(' | ')));
  r = await P({ a: 'catRestore', v: v, dry: true }, OT); ok(r.ok && r.preview && r.preview.same === true, 'restore, just looking, of the live version: “the same”');
  r = await P({ a: 'catRestore', v: 1, dry: true }, OT); ok(r._s === 404, 'restore, just looking, of a version that was never kept: 404');
  // a backup's problems, by name
  const bad = clone((await P({ a: 'catGet' }, OT)).cat); bad.arts.push({ id: 'bad id!', t: 'P6 Broken', img: 'emb:p1' }); bad.arts.push({ id: 'p6lost', t: 'P6 Lost photo', img: '/api/app?img=p6notthere00' });
  r = await P({ a: 'catImport', cat: bad, dry: true }, OT);
  ok(r.ok && r.preview.dropped === 1 && same(r.preview.droppedNames, ['P6 Broken']) && r.preview.missing === 1 && same(r.preview.missingNames, ['P6 Lost photo']), 'a backup’s problems are named: ' + JSON.stringify(r.preview && [r.preview.droppedNames, r.preview.missingNames]));
  // a draft started before a newer publish: compared with the version it started from, only its own changes are listed
  const base0 = (await P({ a: 'catGet' }, OT)).cat, mine = clone(base0); mine.arts[1].t = 'P6 Mine only';
  const newer = clone(base0); newer.arts[2].t = 'P6 Newer elsewhere'; r = await P({ a: 'catSave', cat: newer, base: base0.v }, OT); if (r.ok) v = r.cat.v;
  r = await P({ a: 'catImport', cat: mine, dry: true, against: base0.v }, OT);
  ok(r.ok && same(r.preview.changes, ['Renamed “' + base0.arts[1].t + '” to “P6 Mine only”']) && r.preview.against === base0.v && r.preview.sameAgainst === false && r.preview.same === false, 'a draft compared with the version it started from lists only its own change: ' + JSON.stringify(r.preview && r.preview.changes));
  r = await P({ a: 'catImport', cat: mine, dry: true }, OT);
  ok(r.ok && r.preview.changes.length === 2 && !r.preview.against, 'compared with the live gallery it would also undo the newer change: ' + JSON.stringify(r.preview && r.preview.changes));
  r = await P({ a: 'catImport', cat: clone(base0), dry: true, against: base0.v }, OT); ok(r.ok && r.preview.sameAgainst === true, 'a draft with nothing of its own since the version it started from: sameAgainst');
  r = await P({ a: 'catImport', cat: mine, dry: true, against: 1 }, OT); ok(r.ok && !r.preview.against && r.preview.changes.length === 2, 'started from a version that isn’t kept any more: compared with the live gallery instead');
  ok((await P({ a: 'catHist' }, OT)).total === nh + 1, 'looking changes nothing (only the one publish above was added)');
  // tidy up
  r = await P({ a: 'catSave', cat: clone(cat0), base: v }, OT); ok((r.ok || r.unchanged) && same(r.cat.arts.map(a => a.t), cat0.arts.map(a => a.t)), 'restored the test catalogue');
}

// ---- part 2: the server code in this process, on a private pretend database ----
let mock = null, app = null, ipn = 1;
async function startMock() {
  mock = spawn('python3', [MOCK, String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(PU, { method: 'POST', headers: { Authorization: 'Bearer testtoken' }, body: '["GET","x"]' }); return } catch (e) { await new Promise(r => setTimeout(r, 100)) } }
  throw new Error('the private pretend database did not start on port ' + PORT);
}
async function stopMock() { const m = mock; mock = null; if (m) await new Promise(r => { m.on('exit', r); m.kill() }) }
process.on('exit', () => { if (mock) mock.kill() });
async function DB(c) { const r = await fetch(PU + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer testtoken' }, body: JSON.stringify(c) }); return (await r.json()).map(x => x.error ? { error: x.error } : x.result) }
function call(method, body, query, tok) {
  return new Promise(done => {
    const h = { 'x-forwarded-for': '10.7.' + (ipn++ % 250) + '.1', 'content-type': 'application/json' }; if (tok) h.authorization = 'Bearer ' + tok;
    const req = { method, headers: h, body: body || {}, query: query || {}, url: '/api/app', socket: { remoteAddress: '10.0.0.1' } }; let code = 200;
    const res = { setHeader: () => { }, getHeader: () => undefined, status: c => { code = c; return res }, json: j => done(Object.assign({ _s: code }, j)), end: t => done({ _s: code, t: String(t || '') }), send: t => done({ _s: code, t: String(t || '') }), redirect: (c, u) => done({ _s: c, loc: u }) };
    Object.defineProperty(res, 'statusCode', { get: () => code, set: x => { code = x } }); app(req, res);
  });
}
const Q = (b, tok) => call('POST', b, null, tok);
const mini = (titles, v) => ({ v, arts: titles.map((t, i) => ({ id: 'p' + (i + 1), t, img: 'emb:p' + (i + 1) })), favs: ['p1'], colls: [{ id: 'c1', t: 'First', works: ['p1', 'p2'], soon: 3 }], prints: [], texts: {}, site: {}, seen: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15'] });
const owner = async () => (await Q({ a: 'signup', name: 'Pam', email: 'pts98@hotmail.co.uk', password: 'testpass123', consent: true })).token;

async function part2() {
  process.env.KV_REST_API_URL = PU; process.env.KV_REST_API_TOKEN = 'testtoken';
  await startMock(); app = require(APP);
  let OT = await owner(); ok(!!OT, 'part 2: a private pretend database with an owner account');
  let r = await Q({ a: 'catGet' }, OT); ok(r.cat === null && r.none === true, 'with nothing published, the server says so plainly (the only time the dashboard may start from the built-in paintings)');
  r = await Q({ a: 'catSave', cat: mini(['A', 'B', 'C']) }, OT); ok(r.ok && same(r.changes, ['Published your gallery for the first time']), 'the very first catalogue needs no base');
  let v = r.cat.v;
  r = await Q({ a: 'catSave', cat: mini(['A', 'B2', 'C']) }, OT); ok(r._s === 409 && r.code === 'base_missing', 'after that, a base is needed');
  r = await Q({ a: 'catSave', cat: mini(['A', 'B2', 'C']), base: v }, OT); v = r.cat.v; ok(r.ok, 'publish on top of it');
  // the live copy goes missing, or can't be read
  for (const how of ['missing', 'unreadable']) {
    await DB([how === 'missing' ? ['DEL', 'cat'] : ['SET', 'cat', 'not json']]);
    r = await call('GET', null, { cat: '1' }); ok(r.cat && r.cat.v === v && r.cat.arts[1].t === 'B2', how + ' live copy: visitors still see the newest version, not the built-in paintings');
    r = await Q({ a: 'catSave', cat: mini(['A', 'X', 'C']) }, OT); ok(r._s === 409 && r.code === 'base_missing', how + ' live copy: a publish without a base is still refused');
    r = await Q({ a: 'catGet' }, OT); ok(r.cat && r.cat.v === v && r.healed === v && JSON.parse((await DB([['GET', 'cat']]))[0]).v === v, how + ' live copy: opening the dashboard puts it back');
  }
  // the live copy missing and the newest kept version unreadable too: the next newest kept version (never the old list, which may be weeks old)
  const [liveJ, packed] = await DB([['GET', 'cat'], ['GET', 'cat:ver:' + v]]); await DB([['DEL', 'cat'], ['SET', 'cat:ver:' + v, 'z:broken']]);
  r = await call('GET', null, { cat: '1' }); const hl = await Q({ a: 'catGet' }, OT);
  ok(r.cat && r.cat.arts[1].t === 'B' && hl.healed && hl.cat.arts[1].t === 'B' && !hl.healedOld, 'the live copy and the newest kept version both unreadable: the next newest kept version stands in (' + (r.cat && r.cat.arts.map(a => a.t).join()) + ')');
  await DB([['SET', 'cat:ver:' + v, packed], ['SET', 'cat', liveJ]]);
  // one publish at a time
  await DB([['SET', 'cat:lock', 'someone', 'NX', 'EX', '30']]);
  r = await Q({ a: 'catSave', cat: mini(['A', 'B3', 'C']), base: v }, OT); ok(r._s === 409 && r.code === 'busy', 'a second publish waits while one is being written');
  await DB([['DEL', 'cat:lock']]);
  // the database takes the new live copy, but its answer is lost on the way back: it is live, so it's reported as published, and the photo locks stay right
  const up = await Q({ a: 'imgUpload', data: 'QUJDRA==', type: 'image/jpeg' }, OT), key = /img=([a-z0-9]+)/.exec(up.url || '')[1];
  const c6 = mini(['A', 'B2', 'C']); c6.arts[0].img = up.url; c6.arts[0].early = Date.now() + 864e5;
  r = await Q({ a: 'catSave', cat: c6, base: v }, OT); v = r.cat.v; ok(r.ok && (await call('GET', null, { img: key }))._s === 404, 'a members-only painting’s own photo is kept private');
  const real = global.fetch; let cut = 0; const c7 = clone(c6); delete c7.arts[0].early;
  global.fetch = async (u, o) => { const res = await real(u, o); if (!cut && o && typeof o.body === 'string' && o.body.startsWith('[["SET","cat","')) { cut = 1; throw new TypeError('fetch failed') } return res };
  try { r = await Q({ a: 'catSave', cat: c7, base: v }, OT) } finally { global.fetch = real }
  let lv = JSON.parse((await DB([['GET', 'cat']]))[0]);
  ok(cut && r.ok && r.cat.v === lv.v && lv.v !== v && !lv.arts[0].early && (await call('GET', null, { img: key }))._s === 200, 'a publish that went live although the database’s answer was lost: reported as published, and the photo is open to everyone (' + r._s + ')');
  v = lv.v;
  // a very slow publish that outlasts its lock stops before replacing the live copy (another publish may have started meanwhile)
  let stole = 0; global.fetch = async (u, o) => { if (!stole && o && typeof o.body === 'string' && o.body.includes('"ZADD","cat:idx"')) { stole = 1; await real(PU + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer testtoken' }, body: JSON.stringify([['SET', 'cat:lock', 'someone-else']]) }) } return real(u, o) };
  try { r = await Q({ a: 'catSave', cat: mini(['A', 'B7', 'C']), base: v }, OT) } finally { global.fetch = real }
  lv = JSON.parse((await DB([['GET', 'cat']]))[0]);
  ok(stole && r._s === 409 && r.code === 'busy' && lv.v === v, 'a publish that outlasted its lock stops before going live: “Another publish is still finishing” (' + r._s + ')');
  await DB([['DEL', 'cat:lock']]);
  // a database that turns writes away (as a full one does): never “Published”
  const n0 = (await DB([['ZCARD', 'cat:idx']]))[0];
  for (const k of ['cat:ver:*', 'cat:idx', 'cat']) {
    await DB([['MOCK.FAILWRITES', k]]);
    r = await Q({ a: 'catSave', cat: mini(['A', 'B3', 'C']), base: v }, OT);
    ok(r._s === 507 && /full/.test(r.error) && JSON.parse((await DB([['GET', 'cat']]))[0]).v === v, 'writes to ' + k + ' refused: an error, and the live gallery is unchanged (' + r._s + ')');
  }
  ok((await DB([['ZCARD', 'cat:idx']]))[0] === n0 + 1, 'refused at the very last step: kept in the list (so it can be brought back), never live');
  await DB([['MOCK.FAILWRITES', '*']]); r = await Q({ a: 'draftSave', draft: mini(['D']), base: v, sid: 'abcdefgh12' }, OT); ok(r._s === 507, 'a refused draft save is an error too');
  await DB([['MOCK.FAILWRITES', '']]); ok(!(await DB([['GET', 'cat:lock']]))[0], 'no lock left behind');
  r = await Q({ a: 'catSave', cat: mini(['A', 'B3', 'C']), base: v }, OT); ok(r.ok, 'publishing works again once the database accepts writes'); v = r.cat.v;
  // no more than 2,000 versions: the oldest go, with their copies
  const have = (await DB([['ZCARD', 'cat:idx']]))[0], F = 2000 - have + 3, cmds = [], OLD = 1e12;
  for (let i = 0; i < F; i++) cmds.push(['ZADD', 'cat:idx', String(OLD + i), JSON.stringify({ v: OLD + i, kind: 'publish', arts: 1, colls: 0, prints: 0, texts: 0, names: ['old'], changes: [] })], ['SET', 'cat:ver:' + (OLD + i), 'x']);
  await DB(cmds);
  r = await Q({ a: 'catSave', cat: mini(['A', 'B4', 'C']), base: v }, OT); v = r.cat.v;
  const [zc, g0, g3, g4] = await DB([['ZCARD', 'cat:idx'], ['GET', 'cat:ver:' + OLD], ['GET', 'cat:ver:' + (OLD + 3)], ['GET', 'cat:ver:' + (OLD + 4)]]);
  ok(r.ok && zc === 2000 && g0 === null && g3 === null && g4 === 'x', 'at most 2,000 versions kept; the four oldest removed with their copies (' + zc + ')');
  r = await Q({ a: 'catHist', from: 1980 }, OT); ok(r.list.length === 20 && !r.more && r.total === 2000, 'the last page of the list');
  await stopMock();
  // the versions kept the old way join the full list
  await startMock(); OT = await owner();
  const t0 = Date.now() - 864e5, H = [mini(['A', 'B', 'C'], t0), mini(['A', 'B2', 'C'], t0 + 6e4), mini(['A', 'B2', 'C'], t0 + 12e4), mini(['A2', 'B2', 'C'], t0 + 18e4)];
  await DB(H.map(x => ['LPUSH', 'cat:hist', JSON.stringify(x)]).concat([['SET', 'cat', JSON.stringify(H[3])]]));
  r = await Q({ a: 'catHist' }, OT);
  ok(r.total === 4 && r.list[0].v === H[3].v && same(r.list[0].changes, ['Renamed “A” to “A2”']) && same(r.list[1].changes, ['Published again with no changes']) && same(r.list[2].changes, ['Renamed “B” to “B2”']) && r.list[3].old === 1 && r.list[0].v === r.live,
    'the four old versions are listed with what changed between them: ' + r.list.map(x => x.changes[0] || '(oldest)').join(' | '));
  ok((await DB([['GET', 'mig:catidx']]))[0] && (await Q({ a: 'catVer', v: H[0].v }, OT)).cat.arts[1].t === 'B', 'moved over once; each old version can be downloaded');
  await DB([['DEL', 'mig:catidx']]); r = await Q({ a: 'catHist' }, OT); ok(r.total === 4, 'moving them again adds no duplicates');
  r = await Q({ a: 'catSave', cat: mini(['A3', 'B2', 'C']), base: H[3].v }, OT); ok(r.ok && same(r.changes, ['Renamed “A2” to “A3”']), 'publishing on top of the old versions');
  await DB([['DEL', 'mig:catidx']]); r = await Q({ a: 'catHist' }, OT); ok(r.total === 5 && r.list[0].kind === 'publish' && same(r.list[0].changes, ['Renamed “A2” to “A3”']), 'moving again later leaves newer versions alone');
  r = await Q({ a: 'catRestore', v: H[0].v, base: r.live }, OT); ok(r.ok && r.cat.arts[1].t === 'B', 'an old version can be brought back');
  const t6 = (await Q({ a: 'catHist' }, OT)).total, o5 = mini(['A4', 'B', 'C'], Date.now() + 5000);
  await DB([['LPUSH', 'cat:hist', JSON.stringify(o5)], ['SET', 'cat', JSON.stringify(o5)]]);   // as the old code publishes, if it's ever put back for a while
  r = await Q({ a: 'catHist' }, OT); ok(r.total === t6 + 1 && r.list[0].v === o5.v && r.live === o5.v, 'a version published the old way after the move joins the list by itself (' + r.total + ')');
  r = await Q({ a: 'catSave', cat: mini(['A5', 'B', 'C']), base: o5.v }, OT); const back = await Q({ a: 'catRestore', v: o5.v, base: r.cat && r.cat.v }, OT);
  ok(r.ok && back.ok && back.cat.arts[0].t === 'A4', 'and can be brought back after newer publishes');
  const o6 = mini(['A6', 'B', 'C'], Date.now() + 9000); await DB([['SET', 'cat', JSON.stringify(o6)]]);   // written straight into the live copy, kept nowhere else
  r = await Q({ a: 'catSave', cat: mini(['A7', 'B', 'C']), base: o6.v }, OT);
  ok(r.ok && (await Q({ a: 'catHist' }, OT)).list.some(x => x.v === o6.v) && (await Q({ a: 'catVer', v: o6.v }, OT)).cat.arts[0].t === 'A6', 'a live copy that wasn’t kept anywhere is kept as a version before it’s replaced');
  // only the old list exists and the live copy is missing: the old copy stands in, and the dashboard is told it's an old one
  await stopMock(); await startMock(); OT = await owner(); await DB([['LPUSH', 'cat:hist', JSON.stringify(H[3])]]);
  r = await Q({ a: 'catGet' }, OT); ok(r.cat && r.cat.v === H[3].v && r.healed === H[3].v && r.healedOld === 1, 'with only the old list, its newest copy stands in, marked as an old copy');
  await stopMock();
}

(async () => {
  try { await part1() } catch (e) { ok(false, 'part 1 stopped: ' + e.message) }
  try { await part2() } catch (e) { ok(false, 'part 2 stopped: ' + e.message) }
  await stopMock(); process.exit();
})();
