// Pam's Gallery: members, rewards, buy requests, messages, visitors, the catalogue (paintings, favourites,
// collections, prints) and the owner dashboard. One Vercel function; data lives in Upstash Redis, reached over its REST API.
const crypto = require('crypto');

const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const OWNER = 'pts98@hotmail.co.uk';
const SITE = 'https://itsamepameo.com';
// payments and Google sign-in switch on when their keys are added in Vercel (Settings → Environment Variables)
const STRIPE = process.env.STRIPE_SECRET_KEY || '';
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || '';
// the built-in paintings' photographs (served from /lib/), for link previews when a painting is shared
const EMB_IMG = {"p1": "/lib/g-c0fafcbf388e.jpg", "p2": "/lib/g-04b6c6b76917.jpg", "p3": "/lib/g-bab2acf08825.jpg", "p4": "/lib/g-f91d640d659d.jpg", "p5": "/lib/g-40cf8b507475.jpg", "p6": "/lib/g-d6fa78aecd0a.jpg"};
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
    p: str(a.p, 40), mode: ['price', 'auction'].indexOf(a.mode) >= 0 ? a.mode : 'request', status: ['Available', 'On hold', 'Sold'].indexOf(a.status) >= 0 ? a.status : 'Available',
    w: num(a.w, .15, 1.6, .5), h: num(a.h, .15, 1.6, .7), img: a.img, ar: !!a.ar && /^emb:p[1-9]$/.test(a.img), bg: /^#[0-9a-f]{6}$/i.test(a.bg || '') ? a.bg : '#cfc6d6',
    auc: a.mode === 'auction' && a.auc ? { start: num(a.auc.start, 1, 1e7, 100), step: num(a.auc.step, 1, 1e6, 10), ends: Math.round(num(a.auc.ends, 0, 4e12, 0)) } : undefined
  }));
  const ids = new Set(arts.map(a => a.id));
  const favs = (Array.isArray(c.favs) ? c.favs : []).map(String).filter(x => ids.has(x)).filter((x, i, A) => A.indexOf(x) === i).slice(0, 6);
  const colls = (Array.isArray(c.colls) ? c.colls : []).slice(0, 8).map(k => ({ t: str(k.t, 60) || 'Untitled collection', d: str(k.d, 400),
    works: (Array.isArray(k.works) ? k.works : []).map(String).filter(x => ids.has(x)).filter((x, i, A) => A.indexOf(x) === i).slice(0, 12), soon: Math.round(num(k.soon, 0, 6, 3)) }));
  const prints = (Array.isArray(c.prints) ? c.prints : []).slice(0, 80).filter(p => p && okId(p.id)).map(p => ({
    id: String(p.id), art: ids.has(String(p.art)) ? String(p.art) : '', t: str(p.t, 90), d: str(p.d, 600), img: okImg(p.img) ? p.img : '',
    sizes: (Array.isArray(p.sizes) ? p.sizes : []).slice(0, 10).map(z => ({ l: str(z.l, 60), p: str(z.p, 30) })).filter(z => z.l), on: p.on !== false
  })).filter(p => p.art || p.img);
  const texts = {}; if (c.texts && typeof c.texts === 'object') Object.keys(c.texts).slice(0, 60).forEach(k => { if (/^[a-z]{2,10}\.[a-z]{2,14}$/.test(k)) texts[k] = String(c.texts[k] == null ? '' : c.texts[k]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 3000) });
  const S = c.site && typeof c.site === 'object' ? c.site : {}, url = v => { v = str(v, 200); return /^https:\/\/[^\s"<>]+$/.test(v) ? v : '' };
  const social = {}; ['instagram', 'tiktok', 'facebook', 'x', 'pinterest', 'youtube', 'threads', 'linkedin', 'website'].forEach(k => { const u = url(S.social && S.social[k]); if (u) social[k] = u });
  const site = { email: okEmail(str(S.email, 200)) ? str(S.email, 200) : '', phone: str(S.phone, 40), place: str(S.place, 80), social,
    banner: { on: !!(S.banner && S.banner.on), text: str(S.banner && S.banner.text, 160) }, commissions: !!S.commissions, offers: S.offers !== false,
    share: S.share !== false, likes: S.likes !== false, cur: ['GBP', 'EUR', 'USD'].indexOf(S.cur) >= 0 ? S.cur : 'GBP' };
  return { v: Date.now(), arts, favs, colls, prints, texts, site };
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
    if (u && !u.hash) throw err('This account signs in with Google — please use the “Sign in with Google” button.', 401);
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) throw err('That email and password don’t match.', 401);
    return { token: sign(email), me: profile(u, await getCat()) };
  },

  async google(req, b) {
    await limit(req, 'google', 20, 900);
    if (!GOOGLE_ID) throw err('Google sign-in isn’t switched on yet — please use your email for now.', 400);
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(b.credential || '').slice(0, 4000)));
    const t = r.ok ? await r.json() : null;
    if (!t || t.aud !== GOOGLE_ID || !(t.email_verified === true || t.email_verified === 'true') || +t.exp * 1000 < Date.now() || !okEmail(String(t.email || '').toLowerCase())) throw err('Google sign-in didn’t work — please try again.', 401);
    const email = String(t.email).toLowerCase(); let u = await user(email);
    if (!u) {
      u = { email, name: clean(t.name || t.given_name || email.split('@')[0], 80), salt: '', hash: '', google: String(t.sub), created: Date.now(), points: 0, owned: [], welcomeUsed: false, news: false };
      await db('SET', 'u:' + email, JSON.stringify(u)); await db('ZADD', 'members', String(u.created), email);
    } else if (!u.google) { u.google = String(t.sub); await db('SET', 'u:' + email, JSON.stringify(u)) }
    return { token: sign(email), me: profile(u, await getCat()) };
  },

  async me(req) {
    const u = await auth(req); if (!u) throw err('Please sign in again.', 401);
    const [ids, bidOn] = await pipe([['LRANGE', 'u:' + u.email + ':orders', '0', '49'], ['LRANGE', 'u:' + u.email + ':bids', '0', '99']]);
    const orders = (await pipe((ids || []).map(i => ['GET', 'o:' + i]))).map(J).filter(Boolean).map(o => ({ id: o.id, ts: o.ts, title: o.title, status: o.status, offer: o.offer || 0, pay: o.pay && !o.pay.paid ? o.pay.url : '' }));
    const cat = await getCat(), arts = Array.from(new Set(bidOn || [])), bids = [];
    for (const aid of arts) {
      const a = cat && (cat.arts || []).find(x => x.id === aid); if (!a || !a.auc) continue;
      const top = topOf(await db('ZREVRANGE', 'bids:' + aid, '0', '0', 'WITHSCORES')), mine = top && top.email === u.email, over = Date.now() > a.auc.ends;
      bids.push({ title: a.t, top: top ? top.amount : 0, ends: a.auc.ends, state: over ? (mine ? 'won' : 'lost') : (mine ? 'leading' : 'outbid') });
    }
    return { me: profile(u, cat), orders, bids, cur: cat && cat.site ? cat.site.cur : 'GBP' };
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
    const offer = Math.round(Math.max(0, Math.min(1e7, parseFloat(String(b.offer || '').replace(/[^0-9.]/g, '')) || 0)) * 100) / 100;
    const o = { id: id(), ts: Date.now(), kind, artId: aid, title, name, email, phone: clean(b.phone, 40), message: clean(b.message, 2000), member: !!u, offer,
      welcome: !!(u && !u.welcomeUsed && kind === 'art'), useCredit: !!(u && b.useCredit && rewards(u, cat).points.credit > 0), status: 'new' };
    await pipe([['SET', 'o:' + o.id, JSON.stringify(o)], ['LPUSH', 'orders', o.id]].concat(u ? [['LPUSH', 'u:' + email + ':orders', o.id]] : []));
    return { ok: true, id: o.id };
  },

  async like(req, b) {
    await limit(req, 'like', 200, 3600);
    const aid = clean(b.id, 24), vid = clean(b.vid, 40); if (!/^[a-z0-9]{1,24}$/i.test(aid) || !vid) throw err('Unknown painting.', 400);
    const [, n] = await pipe([[b.on === false ? 'SREM' : 'SADD', 'lk:' + aid, vid], ['SCARD', 'lk:' + aid]]);
    return { ok: true, n: +n || 0 };
  },

  async bid(req, b) {
    await limit(req, 'bid', 30, 3600);
    const u = await auth(req); if (!u) throw err('Please sign in or create an account to bid — it only takes a moment.', 401);
    const cat = await getCat(), a = cat && (cat.arts || []).find(x => x.id === String(b.id));
    if (!a || a.mode !== 'auction' || !a.auc) throw err('This painting isn’t in an auction.', 400);
    if (a.status === 'Sold' || Date.now() > a.auc.ends) throw err('This auction has closed.', 400);
    const amt = Math.round(Math.max(0, Math.min(1e7, parseFloat(String(b.amount || '').replace(/[^0-9.]/g, '')) || 0)) * 100) / 100;
    const top = topOf(await db('ZREVRANGE', 'bids:' + a.id, '0', '0', 'WITHSCORES')), min = top ? top.amount + a.auc.step : a.auc.start;
    if (amt < min) throw err('The next bid must be at least ' + money(min, cat.site && cat.site.cur) + '.', 400);
    const bidr = { id: id(), ts: Date.now(), email: u.email, name: u.name, amount: amt };
    const [, n] = await pipe([['ZADD', 'bids:' + a.id, String(amt), JSON.stringify(bidr)], ['ZCARD', 'bids:' + a.id], ['LPUSH', 'u:' + u.email + ':bids', a.id]]);
    return { ok: true, top: amt, n: +n || 1 };
  },

  async sub(req, b) {
    await limit(req, 'sub', 10, 3600);
    const email = clean(b.email, 200).toLowerCase(); if (!okEmail(email)) throw err('Please enter a valid email address.', 400);
    await pipe([['ZADD', 'subs', String(Date.now()), email]]);
    return { ok: true };
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
    const cat = await getCat(), arts = cat && cat.arts || [];
    const extra = await pipe(arts.map(a => ['SCARD', 'lk:' + a.id]).concat(arts.map(a => ['ZREVRANGE', 'bids:' + a.id, '0', '19', 'WITHSCORES'])).concat([['ZREVRANGE', 'subs', '0', '499', 'WITHSCORES'], ['ZCARD', 'subs']]));
    const likes = arts.map((a, i) => ({ id: a.id, t: a.t, n: +extra[i] || 0 })).filter(x => x.n).sort((x, y) => y.n - x.n);
    const auctions = arts.map((a, i) => ({ a, L: extra[arts.length + i] })).filter(x => x.a.mode === 'auction' && x.a.auc).map(({ a, L }) => {
      const bids = []; for (let k = 0; k + 1 < (L || []).length; k += 2) { const r = J(L[k]); if (r) bids.push({ name: r.name, email: r.email, amount: +L[k + 1] || r.amount, ts: r.ts }) }
      return { id: a.id, t: a.t, start: a.auc.start, step: a.auc.step, ends: a.auc.ends, over: Date.now() > a.auc.ends, bids };
    });
    const SL = extra[arts.length * 2] || [], subs = []; for (let k = 0; k + 1 < SL.length; k += 2) subs.push({ email: SL[k], ts: +SL[k + 1] || 0 });
    const orders = more.slice(0, oids.length).map(J).filter(Boolean), msgs = more.slice(oids.length, oids.length + mids.length).map(J).filter(Boolean),
      members = more.slice(oids.length + mids.length).map(J).filter(Boolean).map(m => ({ name: m.name, email: m.email, joined: m.created, points: m.points || 0, owned: (m.owned || []).map(a => titleOf(cat, artId(a))), news: !!m.news }));
    return {
      visits: { total: +total || 0, unique: +uniq || 0, days, perDay: vis, uniquePerDay: uv },
      where: { countries: pairs(gcc), week: Object.keys(week).map(k => [k, week[k]]).sort((a, b) => b[1] - a[1]), cities: cities.map((c, i) => { const p = c[0].split('|'), q = String(ll[i] || '').split(','); return { city: p[0], region: p[1], cc: p[2], n: c[1], lat: +q[0] || null, lon: +q[1] || null } }), devices: pairs(gdev), sources: pairs(gref) },
      members: { count: +nMembers || 0, list: members }, orders: await checkPaid(orders), msgs, likes, auctions, subs: { count: +extra[arts.length * 2 + 1] || 0, list: subs },
      pay: !!STRIPE, google: !!GOOGLE_ID, cur: cat && cat.site ? cat.site.cur : 'GBP'
    };
  },

  async dashOrder(req, b) {
    await owner(req);
    const o = J(await db('GET', 'o:' + clean(b.id, 40))); if (!o) throw err('Order not found.', 404);
    const st = ORDER_ST.indexOf(b.status) >= 0 ? b.status : o.status;
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

  // a secure Stripe payment link for an enquiry, an accepted offer or a won auction: card, Apple Pay and Google Pay
  async payLink(req, b) {
    await owner(req);
    if (!STRIPE) throw err('Payments aren’t switched on yet — add your Stripe key in Vercel first (see the Grow tab for the steps).', 400);
    const o = J(await db('GET', 'o:' + clean(b.id, 40))); if (!o) throw err('Order not found.', 404);
    const amt = Math.round(Math.max(0, Math.min(1e7, parseFloat(String(b.amount || '').replace(/[^0-9.]/g, '')) || 0)) * 100);
    if (amt < 100) throw err('Enter the amount to charge.', 400);
    const cat = await getCat(), cur = (cat && cat.site && cat.site.cur || 'GBP').toLowerCase();
    const price = await stripe('prices', { currency: cur, unit_amount: amt, 'product_data[name]': o.title.slice(0, 240) });
    const form = { 'line_items[0][price]': price.id, 'line_items[0][quantity]': 1, 'metadata[order]': o.id, 'after_completion[type]': 'redirect', 'after_completion[redirect][url]': SITE + '/?paid=1', 'phone_number_collection[enabled]': 'true' };
    SHIP.forEach((c, i) => { form['shipping_address_collection[allowed_countries][' + i + ']'] = c });
    const link = await stripe('payment_links', form);
    o.pay = { url: link.url + (o.email ? '?prefilled_email=' + encodeURIComponent(o.email) : ''), link: link.id, amount: amt / 100, cur: cur.toUpperCase(), ts: Date.now(), paid: false };
    if (['new', 'contacted'].indexOf(o.status) >= 0) o.status = 'awaiting';
    await db('SET', 'o:' + o.id, JSON.stringify(o));
    return { ok: true, order: o };
  },

  // an auction that has closed: the winner joins the sales list, ready for a payment link
  async aucClose(req, b) {
    await owner(req);
    const cat = await getCat(), a = cat && (cat.arts || []).find(x => x.id === String(b.id)); if (!a || !a.auc) throw err('Auction not found.', 404);
    const ex = await db('GET', 'aucord:' + a.id); if (ex) return { ok: true, id: ex };
    const top = topOf(await db('ZREVRANGE', 'bids:' + a.id, '0', '0', 'WITHSCORES')); if (!top) throw err('No bids yet.', 400);
    const o = { id: id(), ts: Date.now(), kind: 'auction', artId: a.id, title: 'Auction: ' + a.t, name: top.name, email: top.email, phone: '', message: 'Winning bid ' + money(top.amount, cat.site && cat.site.cur), member: true, offer: top.amount, welcome: false, useCredit: false, status: 'contacted' };
    await pipe([['SET', 'o:' + o.id, JSON.stringify(o)], ['LPUSH', 'orders', o.id], ['LPUSH', 'u:' + top.email + ':orders', o.id], ['SET', 'aucord:' + a.id, o.id]]);
    return { ok: true, id: o.id };
  },

  async dashMsg(req, b) {
    await owner(req);
    const m = J(await db('GET', 'm:' + clean(b.id, 40))); if (!m) throw err('Message not found.', 404);
    m.read = !!b.read; await db('SET', 'm:' + m.id, JSON.stringify(m)); return { ok: true };
  },

  // ---- the catalogue ----
  async catGet(req) { await owner(req); return { cat: await getCat() } },
  async catHist(req) {
    await owner(req);
    const L = (await db('LRANGE', 'cat:hist', '0', '9')).map(J).filter(Boolean);
    return { list: L.map(c => ({ v: c.v, arts: (c.arts || []).length, colls: (c.colls || []).length, prints: (c.prints || []).length, texts: Object.keys(c.texts || {}).length })) };
  },
  async catRestore(req, b) {
    await owner(req);
    const L = (await db('LRANGE', 'cat:hist', '0', '9')).map(J).filter(Boolean), c = L.find(x => x.v === +b.v); if (!c) throw err('That version is no longer kept.', 404);
    const n = cleanCat(c); await pipe([['SET', 'cat', JSON.stringify(n)], ['LPUSH', 'cat:hist', JSON.stringify(n)], ['LTRIM', 'cat:hist', '0', '9']]);
    return { ok: true, cat: n };
  },
  async growGet(req) { await owner(req); return { grow: J(await db('GET', 'grow')) || { done: [], notes: {} } } },
  async growSave(req, b) {
    await owner(req); const g = b.grow || {}, notes = {};
    if (g.notes && typeof g.notes === 'object') Object.keys(g.notes).slice(0, 120).forEach(k => { if (/^[a-z0-9-]{1,30}$/.test(k)) notes[k] = clean(g.notes[k], 600) });
    const v = { done: (Array.isArray(g.done) ? g.done : []).map(String).filter(x => /^[a-z0-9-]{1,30}$/.test(x)).slice(0, 200), notes };
    await db('SET', 'grow', JSON.stringify(v)); return { ok: true, grow: v };
  },
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

const ORDER_ST = ['new', 'contacted', 'awaiting', 'paid', 'sent', 'completed', 'cancelled'];
const SHIP = ['GB', 'IE', 'US', 'CA', 'AU', 'NZ', 'FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'LU', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'PT', 'PL', 'GR', 'JP', 'SG', 'HK', 'AE'];
function topOf(L) { if (!L || L.length < 2) return null; const r = J(L[0]); return r ? Object.assign(r, { amount: +L[1] || r.amount }) : null }
function money(n, cur) { return ({ GBP: '£', EUR: '€', USD: '$' }[cur || 'GBP'] || '£') + (Math.round(n * 100) / 100).toLocaleString('en-GB') }
async function stripe(path, form, method) {
  const r = await fetch('https://api.stripe.com/v1/' + path, { method: method || 'POST', headers: { Authorization: 'Bearer ' + STRIPE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: method === 'GET' ? undefined : new URLSearchParams(form).toString() });
  const j = await r.json(); if (!r.ok) throw err('Stripe: ' + (j.error && j.error.message || 'request failed'), 400); return j;
}
async function checkPaid(orders) {           // payment links still waiting: has Stripe taken the money yet?
  if (!STRIPE) return orders;
  const wait = orders.filter(o => o.pay && o.pay.link && !o.pay.paid).slice(0, 8);
  await Promise.all(wait.map(async o => {
    try {
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions?limit=5&payment_link=' + encodeURIComponent(o.pay.link), { headers: { Authorization: 'Bearer ' + STRIPE } });
      const j = await r.json(), paid = (j.data || []).find(x => x.payment_status === 'paid');
      if (paid) { o.pay.paid = true; o.pay.paidAt = Date.now(); o.pay.ship = paid.shipping_details || paid.collected_information && paid.collected_information.shipping_details || null; if (['new', 'contacted', 'awaiting'].indexOf(o.status) >= 0) o.status = 'paid'; await db('SET', 'o:' + o.id, JSON.stringify(o)) }
    } catch (e) { }
  }));
  return orders;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// a painting's own link: rich previews on social media and in messages, then straight into the gallery at that painting
async function sharePage(aid, res) {
  const cat = await getCat(), a = cat && (cat.arts || []).find(x => x.id === aid) || (!cat && /^p[1-6]$/.test(aid) ? { id: aid, t: ARTS[+aid.slice(1) - 1], m: 'Original painting', img: 'emb:' + aid } : null);
  const img = a ? (/^emb:/.test(a.img) ? EMB_IMG[a.img.slice(4)] || '' : a.img) : '', go = '/' + (a ? '#art-' + a.id : '');
  const t = a ? a.t + ' — an original painting by Pam' : 'Pam’s Gallery — original paintings', d = a ? (a.m ? a.m + '. ' : '') + 'See it in Pam’s gallery and enquire to buy.' : 'Original paintings by Pam.';
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  res.status(200).end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(t) + '</title><meta name="description" content="' + esc(d) + '">' +
    '<meta property="og:type" content="website"><meta property="og:site_name" content="Pam’s Gallery"><meta property="og:title" content="' + esc(t) + '"><meta property="og:description" content="' + esc(d) + '">' +
    (img ? '<meta property="og:image" content="' + esc(SITE + img) + '"><meta name="twitter:image" content="' + esc(SITE + img) + '">' : '') +
    '<meta property="og:url" content="' + esc(SITE + '/api/app?s=' + (a ? a.id : '')) + '"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="' + SITE + '/">' +
    '<meta http-equiv="refresh" content="0;url=' + esc(go) + '"></head><body><p><a href="' + esc(go) + '">Open ' + esc(a ? a.t : 'Pam’s Gallery') + '</a></p><script>location.replace(' + JSON.stringify(go) + ')</script></body></html>');
}

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
      if (q.cat) { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=30'); res.status(200).json({ cat: await getCat(), cfg: { google: GOOGLE_ID, pay: !!STRIPE } }); return }
      if (q.s && /^[a-z0-9]{1,24}$/i.test(String(q.s))) { await sharePage(String(q.s), res); return }
      if (q.live) {           // likes and the current bid on each auction, refreshed every few seconds
        const cat = await getCat(), arts = cat && cat.arts || ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(id => ({ id })), auc = arts.filter(a => a.mode === 'auction' && a.auc);
        const r = await pipe(arts.map(a => ['SCARD', 'lk:' + a.id]).concat(auc.map(a => ['ZREVRANGE', 'bids:' + a.id, '0', '0', 'WITHSCORES'])).concat(auc.map(a => ['ZCARD', 'bids:' + a.id])));
        const likes = {}; arts.forEach((a, i) => { if (+r[i]) likes[a.id] = +r[i] });
        const bids = {}; auc.forEach((a, i) => { const t = topOf(r[arts.length + i]); bids[a.id] = { top: t ? t.amount : 0, n: +r[arts.length + auc.length + i] || 0, ends: a.auc.ends } });
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=4, stale-while-revalidate=20'); res.status(200).json({ likes, bids }); return;
      }
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
