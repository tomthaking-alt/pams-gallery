// Pam's Gallery: members, rewards, buy requests, messages, visitors, the catalogue (paintings, favourites,
// collections, prints) and the owner dashboard. One Vercel function; data lives in Upstash Redis, reached over its REST API.
const crypto = require('crypto');

const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const OWNER = 'pts98@hotmail.co.uk';
const SECRET = crypto.createHash('sha256').update('pams-gallery-session|' + (DB_TOKEN || '')).digest();

// ---- rewards (easy to change) ----
const WELCOME = { pct: 5, text: '5% off your first painting' };
const POINTS = { per: 1, every: 500, worth: 50, text: '1 point for every £1 spent · every 500 points = £50 off' };
const SET_REWARD = 'a signed print of your choice';
// the six paintings the site was built with; used until Pam saves her own catalogue
const ARTS = ['Orchid in the Clouds', 'Violet Garden', 'Three Masks in Blue', 'Three Masks in Green', 'The Messenger', 'White Bloom over Ember'];
const BASE_SETS = [
  { name: 'The Dreaming Garden', arts: ['p1', 'p2'] },
  { name: 'The Masquerade', arts: ['p3', 'p4'] },
  { name: 'Embers & Omens', arts: ['p5', 'p6'] }
];

async function db(...cmd) {
  const r = await fetch(DB_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json(); if (j.error) throw new Error('db: ' + j.error); return j.result;
}
async function pipe(cmds) {
  if (!cmds.length) return [];
  const r = await fetch(DB_URL.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  const j = await r.json(); if (!Array.isArray(j)) throw new Error('db pipeline'); return j.map(x => x.result);
}
const J = s => { try { return s ? JSON.parse(s) : null } catch (e) { return null } };

function b64u(b) { return Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') }
function sign(email) {
  const body = b64u(JSON.stringify({ e: email, x: Date.now() + 30 * 864e5 }));
  return body + '.' + b64u(crypto.createHmac('sha256', SECRET).update(body).digest());
}
function verify(tok) {
  if (!tok || typeof tok !== 'string' || tok.indexOf('.') < 0) return null;
  const [body, sig] = tok.split('.'); const good = b64u(crypto.createHmac('sha256', SECRET).update(body).digest());
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const p = J(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); if (!p || p.x < Date.now()) return null; return p.e;
}
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex') }
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const okEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
const day = (t) => new Date(t || Date.now()).toISOString().slice(0, 10);
const id = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const err = (msg, code) => Object.assign(new Error(msg), { code });

async function limit(req, key, max, secs) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || 'x').split(',')[0].trim();
  const k = 'rl:' + key + ':' + ip; const n = await db('INCR', k); if (n === 1) await db('EXPIRE', k, String(secs));
  if (n > max) throw err('Too many attempts — please try again a little later.', 429);
}

// ---- the catalogue Pam edits from her dashboard ----
async function getCat() { return J(await db('GET', 'cat')) }
const artId = a => typeof a === 'number' ? 'p' + (a + 1) : String(a);      // older records stored painting numbers
function titleOf(cat, aid) { if (cat) { const a = (cat.arts || []).find(x => x.id === aid); if (a) return a.t } const n = /^p(\d)$/.exec(aid); return n ? ARTS[+n[1] - 1] || aid : aid }
function setsOf(cat) {
  if (cat && Array.isArray(cat.colls) && cat.colls.length) return cat.colls.filter(c => c.works && c.works.length).map(c => ({ name: c.t, arts: c.works }));
  return BASE_SETS;
}
function cleanCat(c) {
  const str = (v, n) => clean(v, n), num = (v, lo, hi, d) => { const x = parseFloat(v); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d };
  const okId = v => /^[a-z0-9]{1,24}$/i.test(String(v || ''));
  const okImg = v => typeof v === 'string' && (/^emb:p[1-9]$/.test(v) || /^\/api\/app\?img=[a-z0-9]{6,40}$/i.test(v));
  const arts = (Array.isArray(c.arts) ? c.arts : []).slice(0, 120).filter(a => a && okId(a.id) && okImg(a.img)).map(a => ({
    id: String(a.id), t: str(a.t, 90) || 'Untitled', m: str(a.m, 80), s: str(a.s, 80), year: str(a.year, 12), d: str(a.d, 1200),
    p: str(a.p, 40), mode: a.mode === 'price' ? 'price' : 'request', status: ['Available', 'On hold', 'Sold'].indexOf(a.status) >= 0 ? a.status : 'Available',
    w: num(a.w, .15, 1.6, .5), h: num(a.h, .15, 1.6, .7), img: a.img, ar: !!a.ar && /^emb:p[1-9]$/.test(a.img), bg: /^#[0-9a-f]{6}$/i.test(a.bg || '') ? a.bg : '#cfc6d6'
  }));
  const ids = new Set(arts.map(a => a.id));
  const favs = (Array.isArray(c.favs) ? c.favs : []).map(String).filter(x => ids.has(x)).filter((x, i, A) => A.indexOf(x) === i).slice(0, 6);
  const colls = (Array.isArray(c.colls) ? c.colls : []).slice(0, 8).map(k => ({ t: str(k.t, 60) || 'Untitled collection', d: str(k.d, 400),
    works: (Array.isArray(k.works) ? k.works : []).map(String).filter(x => ids.has(x)).filter((x, i, A) => A.indexOf(x) === i).slice(0, 12), soon: Math.round(num(k.soon, 0, 6, 3)) }));
  const prints = (Array.isArray(c.prints) ? c.prints : []).slice(0, 80).filter(p => p && okId(p.id)).map(p => ({
    id: String(p.id), art: ids.has(String(p.art)) ? String(p.art) : '', t: str(p.t, 90), d: str(p.d, 600), img: okImg(p.img) ? p.img : '',
    sizes: (Array.isArray(p.sizes) ? p.sizes : []).slice(0, 10).map(z => ({ l: str(z.l, 60), p: str(z.p, 30) })).filter(z => z.l), on: p.on !== false
  })).filter(p => p.art || p.img);
  return { v: Date.now(), arts, favs, colls, prints };
}

function rewards(u, cat) {
  const owned = (u.owned || []).map(artId);
  return {
    welcome: { text: WELCOME.text, available: !u.welcomeUsed },
    points: { balance: u.points || 0, text: POINTS.text, every: POINTS.every, worth: POINTS.worth, credit: Math.floor((u.points || 0) / POINTS.every) * POINTS.worth },
    sets: setsOf(cat).map(s => ({ name: s.name, reward: SET_REWARD, pieces: s.arts.map(a => ({ title: titleOf(cat, a), owned: owned.indexOf(a) >= 0 })), complete: s.arts.every(a => owned.indexOf(a) >= 0) }))
  };
}
function profile(u, cat) { return { name: u.name, email: u.email, joined: u.created, owner: u.email === OWNER, rewards: rewards(u, cat) } }
async function user(email) { return J(await db('GET', 'u:' + email)) }
async function auth(req) { const e = verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')); if (!e) return null; return await user(e) }
async function owner(req) { const u = await auth(req); if (!u || u.email !== OWNER) throw err('Owner only.', 403); return u }

const hdr = (req, k) => { const v = req.headers[k]; if (!v) return ''; try { return decodeURIComponent(String(v)) } catch (e) { return String(v) } };

const actions = {
  async health() { return { ok: true, db: !!(DB_URL && DB_TOKEN) } },

  // one count per visit; where from is only the rough area Vercel works out from the connection (no addresses are kept)
  async visit(req, b) {
    const vid = clean(b.vid, 40) || 'anon', d = day(), TTL = String(400 * 86400);
    const cc = clean(hdr(req, 'x-vercel-ip-country'), 2).toUpperCase() || 'XX', city = clean(hdr(req, 'x-vercel-ip-city'), 60), reg = clean(hdr(req, 'x-vercel-ip-country-region'), 10);
    const lat = parseFloat(hdr(req, 'x-vercel-ip-latitude')), lon = parseFloat(hdr(req, 'x-vercel-ip-longitude'));
    const ua = String(req.headers['user-agent'] || ''), dev = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Phone' : 'Computer';
    const ref = clean(String(b.ref || '').toLowerCase().replace(/^www\./, ''), 60).replace(/[^a-z0-9.\-]/g, '') || 'direct';
    const ck = city ? city + '|' + reg + '|' + cc : '';
    const cmds = [['INCR', 'v:total'], ['INCR', 'v:d:' + d], ['EXPIRE', 'v:d:' + d, TTL], ['PFADD', 'vu:d:' + d, vid], ['EXPIRE', 'vu:d:' + d, TTL], ['PFADD', 'vu:all', vid],
      ['ZINCRBY', 'g:cc', '1', cc], ['ZINCRBY', 'g:cc:' + d, '1', cc], ['EXPIRE', 'g:cc:' + d, TTL], ['ZINCRBY', 'g:dev', '1', dev], ['ZINCRBY', 'g:ref', '1', ref]];
    if (ck) { cmds.push(['ZINCRBY', 'g:city', '1', ck]); if (isFinite(lat) && isFinite(lon)) cmds.push(['HSETNX', 'g:ll', ck, lat.toFixed(2) + ',' + lon.toFixed(2)]) }
    await pipe(cmds);
    return { ok: true };
  },

  async signup(req, b) {
    await limit(req, 'signup', 8, 3600);
    const email = clean(b.email, 200).toLowerCase(), name = clean(b.name, 80), pw = String(b.password || '');
    if (!name) throw err('Please tell us your name.', 400);
    if (!okEmail(email)) throw err('Please enter a valid email address.', 400);
    if (pw.length < 8 || pw.length > 200) throw err('Please choose a password of at least 8 characters.', 400);
    if (!b.consent) throw err('Please agree to the privacy note to create an account.', 400);
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { email, name, salt, hash: hashPw(pw, salt), created: Date.now(), points: 0, owned: [], welcomeUsed: false, news: !!b.news };
    const set = await db('SET', 'u:' + email, JSON.stringify(u), 'NX');
    if (set !== 'OK') throw err('There is already an account with that email — please sign in.', 409);
    await db('ZADD', 'members', String(u.created), email);
    return { token: sign(email), me: profile(u, await getCat()) };
  },

  async login(req, b) {
    await limit(req, 'login', 15, 900);
    const email = clean(b.email, 200).toLowerCase(), pw = String(b.password || '');
    const u = await user(email);
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) throw err('That email and password don’t match.', 401);
    return { token: sign(email), me: profile(u, await getCat()) };
  },

  async me(req) {
    const u = await auth(req); if (!u) throw err('Please sign in again.', 401);
    const ids = await db('LRANGE', 'u:' + u.email + ':orders', '0', '49');
    const orders = (await pipe(ids.map(i => ['GET', 'o:' + i]))).map(J).filter(Boolean).map(o => ({ id: o.id, ts: o.ts, title: o.title, status: o.status }));
    return { me: profile(u, await getCat()), orders };
  },

  // a request to buy: a painting (by id, or the older painting number) or a print in a chosen size
  async order(req, b) {
    await limit(req, 'order', 10, 3600);
    const u = await auth(req), cat = await getCat();
    const name = u ? u.name : clean(b.name, 80), email = u ? u.email : clean(b.email, 200).toLowerCase();
    if (!name || !okEmail(email)) throw err('Please add your name and a valid email so Pam can reply.', 400);
    let kind = 'art', aid = '', title = '';
    if (b.print) {
      const pr = cat && (cat.prints || []).find(x => x.id === String(b.print)); if (!pr) throw err('That print is no longer available.', 404);
      const sz = (pr.sizes || [])[parseInt(b.size, 10) || 0] || { l: '', p: '' };
      kind = 'print'; aid = pr.art || ''; title = 'Print: ' + (pr.t || titleOf(cat, pr.art)) + (sz.l ? ' — ' + sz.l : '') + (sz.p ? ' (' + sz.p + ')' : '');
    } else {
      aid = b.id ? String(b.id) : 'p' + (Math.max(0, Math.min(ARTS.length - 1, parseInt(b.art, 10) || 0)) + 1);
      if (cat && !(cat.arts || []).some(a => a.id === aid)) throw err('That painting is no longer listed.', 404);
      title = titleOf(cat, aid);
    }
    const o = { id: id(), ts: Date.now(), kind, artId: aid, title, name, email, phone: clean(b.phone, 40), message: clean(b.message, 2000), member: !!u,
      welcome: !!(u && !u.welcomeUsed && kind === 'art'), useCredit: !!(u && b.useCredit && rewards(u, cat).points.credit > 0), status: 'new' };
    await pipe([['SET', 'o:' + o.id, JSON.stringify(o)], ['LPUSH', 'orders', o.id]].concat(u ? [['LPUSH', 'u:' + email + ':orders', o.id]] : []));
    return { ok: true, id: o.id };
  },

  async message(req, b) {
    await limit(req, 'msg', 10, 3600);
    const u = await auth(req), name = u ? u.name : clean(b.name, 80), email = u ? u.email : clean(b.email, 200).toLowerCase(), text = clean(b.message, 3000);
    if (!name || !okEmail(email)) throw err('Please add your name and a valid email so Pam can reply.', 400);
    if (text.length < 2) throw err('Please write a message.', 400);
    const m = { id: id(), ts: Date.now(), name, email, message: text, member: !!u, read: false };
    await pipe([['SET', 'm:' + m.id, JSON.stringify(m)], ['LPUSH', 'msgs', m.id]]);
    return { ok: true };
  },

  async dash(req) {
    await owner(req);
    const days = []; for (let i = 29; i >= 0; i--) days.push(day(Date.now() - i * 864e5));
    const base = [['GET', 'v:total'], ['PFCOUNT', 'vu:all'], ['ZCARD', 'members'], ['LRANGE', 'orders', '0', '199'], ['LRANGE', 'msgs', '0', '199'], ['ZREVRANGE', 'members', '0', '299'],
      ['ZREVRANGE', 'g:cc', '0', '59', 'WITHSCORES'], ['ZREVRANGE', 'g:city', '0', '79', 'WITHSCORES'], ['ZREVRANGE', 'g:dev', '0', '5', 'WITHSCORES'], ['ZREVRANGE', 'g:ref', '0', '19', 'WITHSCORES']];
    const res = await pipe(base.concat(days.map(d => ['GET', 'v:d:' + d])).concat(days.map(d => ['PFCOUNT', 'vu:d:' + d])).concat(days.slice(-7).map(d => ['ZREVRANGE', 'g:cc:' + d, '0', '59', 'WITHSCORES'])));
    const [total, uniq, nMembers, oids, mids, emails, gcc, gcity, gdev, gref] = res, N = base.length, D = days.length;
    const vis = res.slice(N, N + D).map(x => +x || 0), uv = res.slice(N + D, N + 2 * D).map(x => +x || 0), wk = res.slice(N + 2 * D);
    const pairs = a => { const o = []; for (let i = 0; i + 1 < (a || []).length; i += 2)o.push([a[i], +a[i + 1] || 0]); return o };
    const week = {}; wk.forEach(a => pairs(a).forEach(([k, n]) => { week[k] = (week[k] || 0) + n }));
    const cities = pairs(gcity), ll = cities.length ? await db('HMGET', 'g:ll', ...cities.map(c => c[0])) : [];
    const more = await pipe(oids.map(i => ['GET', 'o:' + i]).concat(mids.map(i => ['GET', 'm:' + i])).concat(emails.map(e => ['GET', 'u:' + e])));
    const cat = await getCat();
    const orders = more.slice(0, oids.length).map(J).filter(Boolean), msgs = more.slice(oids.length, oids.length + mids.length).map(J).filter(Boolean),
      members = more.slice(oids.length + mids.length).map(J).filter(Boolean).map(m => ({ name: m.name, email: m.email, joined: m.created, points: m.points || 0, owned: (m.owned || []).map(a => titleOf(cat, artId(a))), news: !!m.news }));
    return {
      visits: { total: +total || 0, unique: +uniq || 0, days, perDay: vis, uniquePerDay: uv },
      where: { countries: pairs(gcc), week: Object.keys(week).map(k => [k, week[k]]).sort((a, b) => b[1] - a[1]), cities: cities.map((c, i) => { const p = c[0].split('|'), q = String(ll[i] || '').split(','); return { city: p[0], region: p[1], cc: p[2], n: c[1], lat: +q[0] || null, lon: +q[1] || null } }), devices: pairs(gdev), sources: pairs(gref) },
      members: { count: +nMembers || 0, list: members }, orders, msgs
    };
  },

  async dashOrder(req, b) {
    await owner(req);
    const o = J(await db('GET', 'o:' + clean(b.id, 40))); if (!o) throw err('Order not found.', 404);
    const st = ['new', 'contacted', 'completed', 'cancelled'].indexOf(b.status) >= 0 ? b.status : o.status;
    if (st === 'completed' && !o.awarded && o.member) {           // a sale: award points, record the piece for collection rewards, use up the welcome gift
      const m = await user(o.email);
      if (m) {
        const amt = Math.max(0, Math.min(1e6, parseFloat(b.amount) || 0)), spent = Math.max(0, Math.min(m.points || 0, parseInt(b.pointsUsed, 10) || 0));
        m.points = (m.points || 0) - spent + Math.floor(amt * POINTS.per);
        if (o.kind !== 'print') m.owned = Array.from(new Set((m.owned || []).map(artId).concat([o.artId || artId(o.art || 0)])));
        if (o.welcome) m.welcomeUsed = true;
        await db('SET', 'u:' + m.email, JSON.stringify(m)); o.awarded = true; o.amount = amt; o.pointsUsed = spent;
      }
    }
    o.status = st; o.note = clean(b.note != null ? b.note : o.note, 500);
    await db('SET', 'o:' + o.id, JSON.stringify(o));
    return { ok: true, order: o };
  },

  async dashMsg(req, b) {
    await owner(req);
    const m = J(await db('GET', 'm:' + clean(b.id, 40))); if (!m) throw err('Message not found.', 404);
    m.read = !!b.read; await db('SET', 'm:' + m.id, JSON.stringify(m)); return { ok: true };
  },

  // ---- the catalogue ----
  async catGet(req) { await owner(req); return { cat: await getCat() } },
  async catSave(req, b) {
    await owner(req);
    if (!b.cat || typeof b.cat !== 'object') throw err('Nothing to save.', 400);
    const c = cleanCat(b.cat); if (!c.arts.length) throw err('Keep at least one painting in the gallery.', 400);
    await pipe([['SET', 'cat', JSON.stringify(c)], ['LPUSH', 'cat:hist', JSON.stringify(c)], ['LTRIM', 'cat:hist', '0', '9']]);   // the last ten versions are kept, just in case
    return { ok: true, cat: c };
  },
  // a photo, already resized in the browser; kept in pieces small enough for the database
  async imgUpload(req, b) {
    await owner(req);
    const type = /^image\/(jpeg|png|webp)$/.test(b.type) ? b.type : 'image/jpeg', data = String(b.data || '').replace(/^data:[^,]*,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw err('That file doesn’t look like a photo.', 400);
    if (data.length > 3.6e6) throw err('That photo is too large — please try a smaller one.', 413);
    const key = id(), CH = 380000, n = Math.ceil(data.length / CH);
    for (let i = 0; i < n; i++) await db('SET', 'img:' + key + ':' + i, data.slice(i * CH, (i + 1) * CH));
    await db('SET', 'img:' + key, JSON.stringify({ n, type, ts: Date.now() }));
    return { ok: true, url: '/api/app?img=' + key };
  }
};

async function getImage(key, res) {
  const meta = J(await db('GET', 'img:' + key)); if (!meta) { res.status(404).end(); return }
  const parts = await Promise.all(Array.from({ length: meta.n }, (_, i) => db('GET', 'img:' + key + ':' + i)));   // one piece per request keeps each reply small
  const buf = Buffer.from(parts.join(''), 'base64');
  res.setHeader('Content-Type', meta.type); res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  res.status(200).end(buf);
}

module.exports = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (!(DB_URL && DB_TOKEN)) { res.setHeader('Cache-Control', 'no-store'); res.status(503).json({ error: 'not_configured' }); return }
      if (q.img && /^[a-z0-9]{6,40}$/i.test(String(q.img))) { await getImage(String(q.img), res); return }
      if (q.cat) { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=30'); res.status(200).json({ cat: await getCat() }); return }
      res.setHeader('Cache-Control', 'no-store'); res.status(400).json({ error: 'Unknown request.' }); return;
    }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
    let b = req.body; if (typeof b === 'string') b = J(b); b = b || {};
    const fn = actions[b.a];
    if (!fn) { res.status(400).json({ error: 'Unknown request.' }); return }
    if (b.a !== 'health' && !(DB_URL && DB_TOKEN)) { res.status(503).json({ error: 'Accounts are being set up — please email Pam for now.', code: 'not_configured' }); return }
    res.status(200).json(await fn(req, b));
  } catch (e) {
    const code = e.code && e.code >= 400 && e.code < 600 ? e.code : 500;
    res.status(code).json({ error: code === 500 ? 'Something went wrong — please try again.' : e.message });
    if (code === 500) console.error(e);
  }
};
