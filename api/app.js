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
// email: alerts to Pam work as soon as RESEND_API_KEY is added; emails to buyers also need a sender on Pam's own domain (MAIL_FROM)
const RESEND = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Pam’s Gallery <onboarding@resend.dev>';
const BUYER_MAIL = !!(RESEND && process.env.MAIL_FROM);
// the artworks built into the site: titles and details, and their image files under /lib/ (wm = the watermarked copy
// used for link previews, so the clean image never leaves the gallery)
const EMB = {"p1": {"t": "Orchid in the Clouds", "m": "Oil on board", "d": "", "w": 0.5, "h": 0.706, "img": "/lib/g-e8cca6370e22.jpg", "tn": "/lib/g-1a8bb7fd0a7c.jpg", "wm": "/lib/g-ee86cd76b1bc.jpg"}, "p2": {"t": "Violet Garden", "m": "Oil on canvas board", "d": "", "w": 0.66, "h": 0.49, "img": "/lib/g-0c6b5f892136.jpg", "tn": "/lib/g-26dedc1586a5.jpg", "wm": "/lib/g-a9a3bfaef716.jpg"}, "p3": {"t": "Three Masks in Blue", "m": "Oil on board", "d": "", "w": 0.7, "h": 0.507, "img": "/lib/g-5ac75187fe3a.jpg", "tn": "/lib/g-a502fdf26999.jpg", "wm": "/lib/g-0e6ddd8f947e.jpg"}, "p4": {"t": "Three Masks in Green", "m": "Oil on board", "d": "", "w": 0.55, "h": 0.545, "img": "/lib/g-a969f2953493.jpg", "tn": "/lib/g-6f4e029ba2e8.jpg", "wm": "/lib/g-b2340e8d7987.jpg"}, "p5": {"t": "The Messenger", "m": "Oil on board", "d": "", "w": 0.5, "h": 0.713, "img": "/lib/g-da433a8146b7.jpg", "tn": "/lib/g-cb057757e1ee.jpg", "wm": "/lib/g-25cfba5fbf73.jpg"}, "p6": {"t": "White Bloom over Ember", "m": "Oil on board", "d": "", "w": 0.5, "h": 0.706, "img": "/lib/g-7aff2fadbb10.jpg", "tn": "/lib/g-b3083e250215.jpg", "wm": "/lib/g-3920c65ce810.jpg"}, "p7": {"t": "The Hall of Many Stairs", "m": "Oil on board", "d": "Staircases climb from every direction towards arched doorways and fan out around a stepped temple. An impossible city in teal, violet and gold, with not a soul in sight.", "w": 0.7, "h": 0.522, "img": "/lib/g-55c28051b4d3.jpg", "tn": "/lib/g-d588e66ae6ea.jpg", "wm": "/lib/g-78751f52ab15.jpg"}, "p8": {"t": "The Paper Nest", "m": "Oil on board", "d": "A plump violet bird keeps watch over two sleepy little figures, tucked into a nest of folded paper triangles on a calm sea-green ground.", "w": 0.6, "h": 0.596, "img": "/lib/g-47be435a9695.jpg", "tn": "/lib/g-d211740213a4.jpg", "wm": "/lib/g-2402ea68c9fb.jpg"}, "p9": {"t": "The Petal Choir", "m": "Oil on board", "d": "A crowd of flower-headed faces, eyes closed and lips pursed as if mid-song, packed tight in bold black outlines. Jewel colours glow between the lines like stained glass.", "w": 0.7, "h": 0.506, "img": "/lib/g-e58107129201.jpg", "tn": "/lib/g-59bb7675900e.jpg", "wm": "/lib/g-8224abae5b42.jpg"}, "p10": {"t": "The Stair Keepers", "m": "Oil on board", "d": "Two round-faced characters perch on a great teal staircase, one crowned in violet petals, the other in a spotted turquoise bonnet. They look as if they have guarded these steps for a very long time.", "w": 0.7, "h": 0.505, "img": "/lib/g-b076501e59c4.jpg", "tn": "/lib/g-eea6f35ec723.jpg", "wm": "/lib/g-dd93214b250b.jpg"}, "p11": {"t": "Unravelling", "m": "Pen and ink on paper", "d": "A long-limbed figure flings its arms wide as tangled loops spin out around it like thread coming loose. Drawn entirely in fine black ink, it is all motion and release.", "w": 0.66, "h": 0.573, "img": "/lib/g-3b3cbc4ca575.jpg", "tn": "/lib/g-0b05bdb83dac.jpg", "wm": "/lib/g-3d3d854c3c20.jpg"}, "p12": {"t": "Three in the Tangle", "m": "Pen and ink on paper", "d": "Three quiet faces drift together in a cloud of looping lines and tiny bubbles, eyes half closed and lips pursed. Every loop is drawn by hand in fine black ink.", "w": 0.7, "h": 0.482, "img": "/lib/g-9bed9b93d225.jpg", "tn": "/lib/g-5c986316e01c.jpg", "wm": "/lib/g-2df85d7787ef.jpg"}, "p13": {"t": "The Dance of the Petal Folk", "m": "Pen and ink on paper", "d": "Three flower-headed figures stumble, stretch and tumble through a storm of loops, one of them flung right off its feet. A joyful, chaotic little dance in pen and ink.", "w": 0.7, "h": 0.47, "img": "/lib/g-ad43cd45fb1d.jpg", "tn": "/lib/g-50955095990f.jpg", "wm": "/lib/g-d7846d56a03e.jpg"}, "p14": {"t": "Happy Hour in the Gorge", "m": "Digital painting", "d": "One crow lounges in a pink-and-yellow rubber ring with a martini held high, while a second swoops in looking thoroughly unimpressed. They drift on glassy, faceted water between cliffs of red and smoky crystal.", "w": 0.95, "h": 0.398, "img": "/lib/g-747839fd9fed.jpg", "tn": "/lib/g-c43c10b5c5fa.jpg", "wm": "/lib/g-ae3ebf1a7e4f.jpg"}, "p15": {"t": "The Welcoming Committee", "m": "Digital painting", "d": "Two curious pigeons lean right into the picture to take a good look at you, while a crowd of crows gathers across rippling, melted dunes under a streaked blue sky. Every gallery needs a welcoming committee.", "w": 0.95, "h": 0.398, "img": "/lib/g-038804eca3d8.jpg", "tn": "/lib/g-4f4f6d942495.jpg", "wm": "/lib/g-30cc566730c9.jpg"}};
const SECRET = crypto.createHash('sha256').update(process.env.SESSION_SECRET ? 'pams-gallery-session|' + process.env.SESSION_SECRET : 'pams-gallery-session|' + (DB_TOKEN || '')).digest();

// ---- rewards (easy to change) ----
const WELCOME = { pct: 5, text: '5% off your first painting' };
const POINTS = { per: 1, every: 500, worth: 50, text: '1 point for every £1 spent · every 500 points = £50 off' };
const SET_REWARD = 'a signed print of your choice';
// the artworks built into the site; used until Pam saves her own catalogue
const ARTS = Object.keys(EMB).map(k => EMB[k].t);
// the frames Pam can choose for a painting (empty = chosen automatically to suit it)
const FR_OK = ['gilt', 'silver', 'ivory', 'deco', 'walnut', 'ebony', 'emerald', 'teal', 'jewel', 'maple', 'brass', 'white', 'black', 'oak', 'alu'];
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

// spam trap: a hidden field people never see (bots fill it in) and the time taken to fill the form in. Caught spam gets a polite
// "thank you" but nothing is stored or sent. Pages loaded before this change don't send the timing, so a missing time is allowed.
function isSpam(b, minMs) { if (b && b.hp) return true; const ft = b && b.ft; return typeof ft === 'number' && ft >= 0 && ft < (minMs || 1200) }
// private pictures (customers' reference photos): only links signed by the server open them, and the links expire
function imgSig(key, x) { return b64u(crypto.createHmac('sha256', SECRET).update('img|' + key + '|' + x).digest()).slice(0, 32) }
function signedImg(u, days) { const m = /img=([a-z0-9]{6,40})/i.exec(String(u || '')); if (!m) return u; const x = Date.now() + (days || 1) * 864e5; return '/api/app?img=' + m[1] + '&x=' + x + '&sig=' + imgSig(m[1], x) }
async function limit(req, key, max, secs) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || 'x').split(',')[0].trim();
  const k = 'rl:' + key + ':' + ip; const n = await db('INCR', k); if (n === 1) await db('EXPIRE', k, String(secs));
  if (n > max) throw err('Too many attempts — please try again a little later.', 429);
}

// ---- the catalogue Pam edits from her dashboard ----
async function getCat() { return withEmb(J(await db('GET', 'cat'))) }
// works added to the site itself join Pam's saved catalogue (at the end) until she removes them
function withEmb(c) {
  if (!c || !Array.isArray(c.arts)) return c;
  const seen = new Set(Array.isArray(c.seen) && c.seen.length ? c.seen : ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']), have = new Set(c.arts.map(a => a.id));
  Object.keys(EMB).forEach(id => { if (!seen.has(id) && !have.has(id)) { const e = EMB[id]; c.arts.push({ id, t: e.t, m: e.m, s: '', year: '', d: e.d, p: '', mode: 'request', status: 'Available', w: e.w, h: e.h, bg: '#cfc6d6', img: 'emb:' + id, ar: false }) } });
  return c;
}
const artId = a => typeof a === 'number' ? 'p' + (a + 1) : String(a);      // older records stored painting numbers
function titleOf(cat, aid) { if (cat) { const a = (cat.arts || []).find(x => x.id === aid); if (a) return a.t } const n = /^p(\d{1,2})$/.exec(aid); return n ? ARTS[+n[1] - 1] || aid : aid }
function setsOf(cat) {
  if (cat && Array.isArray(cat.colls) && cat.colls.length) return cat.colls.filter(c => c.works && c.works.length).map(c => ({ name: c.t, arts: c.works }));
  return BASE_SETS;
}
function cleanCat(c) {
  const str = (v, n) => clean(v, n), num = (v, lo, hi, d) => { const x = parseFloat(v); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d };
  const okId = v => /^[a-z0-9]{1,24}$/i.test(String(v || ''));
  const okUp = v => typeof v === 'string' && /^\/api\/app\?img=[a-z0-9]{6,40}$/i.test(v);
  const okImg = v => typeof v === 'string' && ((/^emb:p\d{1,2}$/.test(v) && !!EMB[v.slice(4)]) || okUp(v));
  const arts = (Array.isArray(c.arts) ? c.arts : []).slice(0, 120).filter(a => a && okId(a.id) && okImg(a.img)).map(a => ({
    id: String(a.id), t: str(a.t, 90) || 'Untitled', m: str(a.m, 80), s: str(a.s, 80), year: str(a.year, 12), d: str(a.d, 1200),
    p: str(a.p, 40), mode: ['price', 'auction'].indexOf(a.mode) >= 0 ? a.mode : 'request', status: ['Available', 'On hold', 'Sold'].indexOf(a.status) >= 0 ? a.status : 'Available',
    w: num(a.w, .15, 1.6, .5), h: num(a.h, .15, 1.6, .7), img: a.img, ar: !!a.ar && /^emb:p[1-6]$/.test(a.img), wm: okUp(a.wm) && a.wmOf === a.img ? a.wm : undefined, wmOf: okUp(a.wm) && a.wmOf === a.img ? a.img : undefined, bg: /^#[0-9a-f]{6}$/i.test(a.bg || '') ? a.bg : '#cfc6d6', fr: FR_OK.indexOf(a.fr) >= 0 ? a.fr : undefined,
    auc: a.mode === 'auction' && a.auc ? { start: num(a.auc.start, 1, 1e7, 100), step: num(a.auc.step, 1, 1e6, 10), ends: Math.round(num(a.auc.ends, 0, 4e12, 0)) } : undefined
  }));
  const ids = new Set(arts.map(a => a.id));
  const favs = (Array.isArray(c.favs) ? c.favs : []).map(String).filter(x => ids.has(x)).filter((x, i, A) => A.indexOf(x) === i).slice(0, 6);
  const colls = (Array.isArray(c.colls) ? c.colls : []).slice(0, 12).map(k => ({ t: str(k.t, 60) || 'Untitled collection', d: str(k.d, 400),
    works: (Array.isArray(k.works) ? k.works : []).map(String).filter(x => ids.has(x)).filter((x, i, A) => A.indexOf(x) === i).slice(0, 12), soon: Math.round(num(k.soon, 0, 6, 3)) }));
  const prints = (Array.isArray(c.prints) ? c.prints : []).slice(0, 80).filter(p => p && okId(p.id)).map(p => ({
    id: String(p.id), art: ids.has(String(p.art)) ? String(p.art) : '', t: str(p.t, 90), d: str(p.d, 600), img: okImg(p.img) ? p.img : '',
    sizes: (Array.isArray(p.sizes) ? p.sizes : []).slice(0, 10).map(z => ({ l: str(z.l, 60), p: str(z.p, 30) })).filter(z => z.l), on: p.on !== false
  })).filter(p => p.art || p.img);
  const texts = {}; if (c.texts && typeof c.texts === 'object') Object.keys(c.texts).slice(0, 150).forEach(k => { if (/^[a-z]{2,10}\.[a-z]{2,14}$/.test(k)) texts[k] = String(c.texts[k] == null ? '' : c.texts[k]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 3000) });
  const S = c.site && typeof c.site === 'object' ? c.site : {}, url = v => { v = str(v, 200); return /^https:\/\/[^\s"<>]+$/.test(v) ? v : '' };
  const social = {}; ['instagram', 'tiktok', 'facebook', 'x', 'pinterest', 'youtube', 'threads', 'linkedin', 'website'].forEach(k => { const u = url(S.social && S.social[k]); if (u) social[k] = u });
  const site = { email: okEmail(str(S.email, 200)) ? str(S.email, 200) : '', phone: str(S.phone, 40), place: str(S.place, 80), social,
    banner: { on: !!(S.banner && S.banner.on), text: str(S.banner && S.banner.text, 160) }, commissions: S.commissions !== false, offers: S.offers !== false,
    share: S.share !== false, likes: S.likes !== false, cur: ['GBP', 'EUR', 'USD'].indexOf(S.cur) >= 0 ? S.cur : 'GBP' };
  const seen = (Array.isArray(c.seen) ? c.seen : []).map(String).filter(x => /^p\d{1,2}$/.test(x)).slice(0, 99);
  return { v: Date.now(), arts, favs, colls, prints, texts, site, seen };
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
    if (b.hp) throw err('Something went wrong — please try again.', 400);
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
    if (isSpam(b)) return { ok: true, id: id() };
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
    const cur = cat && cat.site && cat.site.cur;
    await Promise.all([
      mail(ownerTo(cat), (offer ? 'New offer: ' + money(offer, cur) + ' for ' : 'New enquiry: ') + title, ['<b>' + esc(name) + '</b> (' + esc(email) + (o.phone ? ', ' + esc(o.phone) : '') + ')' + (u ? ' — a member' : '') + ' ' + (offer ? 'offered <b>' + money(offer, cur) + '</b> for' : 'enquired about') + ' <b>' + esc(title) + '</b>.', o.message ? '“' + esc(o.message) + '”' : '', 'Just reply to this email to answer them. Everything is also in your dashboard under “Enquiries & sales”.'], { url: SITE, label: 'Open your gallery' }, email),
      BUYER_MAIL && mail(email, 'Thank you for your enquiry — ' + title, ['Dear ' + esc(name.split(' ')[0]) + ',', 'Thank you for your interest in <b>' + esc(title) + '</b>' + (offer ? ' and your offer of <b>' + money(offer, cur) + '</b>' : '') + '. Pam has your enquiry and will reply to you personally, usually within a day.', 'With warm wishes,<br>Pam’s Gallery'], aid ? { url: SITE + '/#art-' + aid, label: 'See the painting again' } : null, ownerTo(cat))]);
    return { ok: true, id: o.id };
  },

  // a commission request, with up to three reference photos
  async commission(req, b) {
    await limit(req, 'comm', 6, 3600);
    if (isSpam(b)) return { ok: true, id: id() };
    const u = await auth(req), cat = await getCat();
    const name = u ? u.name : clean(b.name, 80), email = u ? u.email : clean(b.email, 200).toLowerCase(), idea = clean(b.idea, 3000);
    if (!name || !okEmail(email)) throw err('Please add your name and a valid email so Pam can reply.', 400);
    if (idea.length < 5) throw err('Please tell Pam a little about the painting you have in mind.', 400);
    const photos = [];
    for (const d of (Array.isArray(b.photos) ? b.photos : []).slice(0, 3)) {
      const data = String(d || '').replace(/^data:image\/(jpeg|png|webp);base64,/, '');
      if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 1.8e6) continue;
      const key = crypto.randomBytes(16).toString('hex'), CH = 380000, n = Math.ceil(data.length / CH);
      for (let i = 0; i < n; i++) await db('SET', 'img:' + key + ':' + i, data.slice(i * CH, (i + 1) * CH));
      await db('SET', 'img:' + key, JSON.stringify({ n, type: 'image/jpeg', ts: Date.now(), priv: true })); photos.push('/api/app?img=' + key);
    }
    const f = { size: clean(b.size, 80), budget: clean(b.budget, 80), when: clean(b.when, 60), where: clean(b.where, 200) };
    const msg = [idea, f.size && 'Size: ' + f.size, f.budget && 'Budget: ' + f.budget, f.when && 'Needed by: ' + f.when, f.where && 'Where it will hang: ' + f.where].filter(Boolean).join('\n');
    const o = { id: id(), ts: Date.now(), kind: 'commission', artId: '', title: 'Commission: ' + idea.split(/[.\n!?]/)[0].slice(0, 60), name, email, phone: clean(b.phone, 40), message: msg, photos, member: !!u, offer: 0, welcome: false, useCredit: false, status: 'new' };
    await pipe([['SET', 'o:' + o.id, JSON.stringify(o)], ['LPUSH', 'orders', o.id]].concat(u ? [['LPUSH', 'u:' + email + ':orders', o.id]] : []));
    await Promise.all([
      mail(ownerTo(cat), 'New commission request from ' + name, ['<b>' + esc(name) + '</b> (' + esc(email) + (o.phone ? ', ' + esc(o.phone) : '') + ') would like a commission:', esc(msg).replace(/\n/g, '<br>'), photos.length ? 'Reference photos: ' + photos.map((x, i) => '<a href="' + SITE + signedImg(x, 30) + '">photo ' + (i + 1) + '</a>').join(' · ') : '', 'Just reply to this email to answer them.'], { url: SITE, label: 'Open your gallery' }, email),
      BUYER_MAIL && mail(email, 'Your commission request — Pam’s Gallery', ['Dear ' + esc(name.split(' ')[0]) + ',', 'Thank you for asking Pam to paint something for you. She has your request and will be in touch personally to talk it through, usually within a couple of days.', 'With warm wishes,<br>Pam’s Gallery'], null, ownerTo(cat))]);
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
    const cur = cat.site && cat.site.cur, link = { url: SITE + '/#art-' + a.id, label: 'See the auction' };
    await Promise.all([
      mail(ownerTo(cat), 'New bid: ' + money(amt, cur) + ' for ' + a.t, ['<b>' + esc(u.name) + '</b> (' + esc(u.email) + ') bid <b>' + money(amt, cur) + '</b> for <b>' + esc(a.t) + '</b>. That’s ' + (+n || 1) + ' bid' + ((+n || 1) === 1 ? '' : 's') + ' so far; the auction closes ' + new Date(a.auc.ends).toUTCString().replace(/:\d\d GMT/, ' GMT') + '.'], link, u.email),
      BUYER_MAIL && top && top.email !== u.email && mail(top.email, 'You’ve been outbid on ' + a.t, ['Dear ' + esc(String(top.name || '').split(' ')[0]) + ',', 'Someone has placed a higher bid of <b>' + money(amt, cur) + '</b> on <b>' + esc(a.t) + '</b>. The auction is still open — if you’d like it, there’s still time to bid again.'], link, ownerTo(cat))]);
    return { ok: true, top: amt, n: +n || 1 };
  },

  async sub(req, b) {
    await limit(req, 'sub', 10, 3600);
    if (isSpam(b, 900)) return { ok: true };
    const email = clean(b.email, 200).toLowerCase(); if (!okEmail(email)) throw err('Please enter a valid email address.', 400);
    await pipe([['ZADD', 'subs', String(Date.now()), email]]);
    return { ok: true };
  },

  async message(req, b) {
    await limit(req, 'msg', 10, 3600);
    if (isSpam(b)) return { ok: true };
    const u = await auth(req), name = u ? u.name : clean(b.name, 80), email = u ? u.email : clean(b.email, 200).toLowerCase(), text = clean(b.message, 3000);
    if (!name || !okEmail(email)) throw err('Please add your name and a valid email so Pam can reply.', 400);
    if (text.length < 2) throw err('Please write a message.', 400);
    const m = { id: id(), ts: Date.now(), name, email, message: text, member: !!u, read: false };
    await pipe([['SET', 'm:' + m.id, JSON.stringify(m)], ['LPUSH', 'msgs', m.id]]);
    const cat = await getCat();
    await Promise.all([mail(ownerTo(cat), 'New message from ' + name, ['<b>' + esc(name) + '</b> (' + esc(email) + ') wrote:', '“' + esc(text).replace(/\n/g, '<br>') + '”', 'Just reply to this email to answer them.'], { url: SITE, label: 'Open your gallery' }, email),
      BUYER_MAIL && mail(email, 'Thank you for your message — Pam’s Gallery', ['Dear ' + esc(name.split(' ')[0]) + ',', 'Thank you for getting in touch. Pam has your message and will reply personally, usually within two working days.', 'Your message:', '“' + esc(text).replace(/\n/g, '<br>') + '”'], { url: SITE, label: 'Back to the gallery' }, ownerTo(cat))]);
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
      members: { count: +nMembers || 0, list: members }, orders: (await checkPaid(await privPhotos(orders))).map(o => o.photos && o.photos.length ? Object.assign({}, o, { photos: o.photos.map(x => signedImg(x, 1)) }) : o), msgs, likes, auctions, subs: { count: +extra[arts.length * 2 + 1] || 0, list: subs },
      pay: !!STRIPE, google: !!GOOGLE_ID, mail: !!RESEND, buyerMail: BUYER_MAIL, cur: cat && cat.site ? cat.site.cur : 'GBP'
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
    if (BUYER_MAIL) { o.pay.mailed = await mail(o.email, 'Your secure payment link — ' + o.title, ['Dear ' + esc(o.name.split(' ')[0]) + ',', 'Thank you so much! Here is your secure payment link for <b>' + esc(o.title) + '</b> (' + money(o.pay.amount, o.pay.cur) + '). You can pay by card, Apple Pay or Google Pay.', 'Once it’s paid, Pam will be in touch about delivery.'], { url: o.pay.url, label: 'Pay securely' }, ownerTo(cat)) }
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
    if (BUYER_MAIL) await mail(top.email, 'You won ' + a.t + '!', ['Dear ' + esc(String(top.name || '').split(' ')[0]) + ',', 'Congratulations — your bid of <b>' + money(top.amount, cat.site && cat.site.cur) + '</b> won <b>' + esc(a.t) + '</b>! Pam will be in touch very soon with a secure payment link and to arrange delivery.'], { url: SITE + '/#art-' + a.id, label: 'See your painting' }, ownerTo(cat));
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

function ownerTo(cat) { return cat && cat.site && cat.site.email || OWNER }
// a short, warm email in the gallery's colours; returns true when it was sent
async function mail(to, subject, paras, button, replyTo) {
  if (!RESEND || !to) return false;
  const html = '<div style="background:#f4ede1;padding:28px 12px;font-family:Helvetica,Arial,sans-serif;color:#2a1c14"><div style="max-width:560px;margin:0 auto;background:#fffdf9;border:1px solid #e3d8c6;border-radius:14px;padding:28px 26px">' +
    '<div style="font-family:Georgia,serif;font-style:italic;font-size:26px;color:#4b2e22">Pam’s Gallery</div><div style="height:2px;background:#d9b46a;margin:10px 0 22px;width:64px"></div>' +
    paras.filter(Boolean).map(p => '<p style="font-size:15px;line-height:1.65;margin:0 0 14px">' + p + '</p>').join('') +
    (button ? '<p style="margin:22px 0 6px"><a href="' + esc(button.url) + '" style="display:inline-block;background:#4b2e22;color:#faf6ee;text-decoration:none;padding:12px 22px;border-radius:99px;font-size:15px">' + esc(button.label) + '</a></p>' : '') +
    '<p style="font-size:12px;color:#8a7a6c;margin:24px 0 0">Original paintings by Pam · <a href="' + SITE + '" style="color:#8a7a6c">itsamepameo.com</a></p></div></div>';
  const text = paras.filter(Boolean).map(p => p.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")).join('\n\n') + (button ? '\n\n' + button.label + ': ' + button.url : '');
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: ctl.signal, headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ from: MAIL_FROM, to: [to], subject: subject.slice(0, 180), html, text }, replyTo && okEmail(replyTo) ? { reply_to: replyTo } : {})) });
    clearTimeout(t); if (!r.ok) console.error('mail', r.status, (await r.text()).slice(0, 300)); return r.ok;
  } catch (e) { console.error('mail', e.message); return false }
}
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
async function sharePage(aid, res) {         // older share links: send them on to the painting's own page
  const { arts } = await pubArts(), { by } = slugMap(arts), a = arts.find(x => x.id === aid);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300'); res.setHeader('Location', a ? '/art/' + by[a.id] : '/works'); res.status(301).end();
}

async function privPhotos(orders) {      // one-off: commission photos sent before photos became private
  if (await db('GET', 'mig:privphotos')) return orders;
  const keys = []; orders.forEach(o => (o.photos || []).forEach(u => { const m = /img=([a-z0-9]{6,40})/i.exec(u); if (m) keys.push(m[1]) }));
  const metas = keys.length ? await pipe(keys.map(k => ['GET', 'img:' + k])) : [];
  const fix = []; metas.forEach((v, i) => { const m = J(v); if (m && !m.priv) { m.priv = true; fix.push(['SET', 'img:' + keys[i], JSON.stringify(m)]) } });
  await pipe(fix.concat([['SET', 'mig:privphotos', '1']])); return orders;
}
async function getImage(key, res, q) {
  const meta = J(await db('GET', 'img:' + key)); if (!meta) { res.status(404).end(); return }
  if (meta.priv) {
    const x = +(q && q.x) || 0, sig = String(q && q.sig || '');
    if (!x || x < Date.now() || sig.length !== 32 || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(imgSig(key, x)))) { res.setHeader('Cache-Control', 'no-store'); res.status(404).end(); return }
  }
  const parts = await Promise.all(Array.from({ length: meta.n }, (_, i) => db('GET', 'img:' + key + ':' + i)));   // one piece per request keeps each reply small
  const buf = Buffer.from(parts.join(''), 'base64');
  res.setHeader('Content-Type', meta.type); res.setHeader('Cache-Control', meta.priv ? 'private, no-store' : 'public, max-age=31536000, s-maxage=31536000, immutable');
  res.status(200).end(buf);
}

// ---------- public pages that work without JavaScript: one page per painting, the plain gallery, the sitemap ----------
// They are made on the server from Pam's live catalogue, so search engines and link previews see real content, and anyone on
// a slow connection, an older phone or with JavaScript off can still browse, read every detail and enquire.
const FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Jost:wght@300;400;500&display=swap';
const FRDEF = { p1: 'ivory', p2: 'gilt', p3: 'silver', p4: 'emerald', p5: 'walnut', p6: 'ebony', p7: 'deco', p8: 'maple', p9: 'jewel', p10: 'teal', p11: 'black', p12: 'oak', p13: 'alu', p14: 'brass', p15: 'white' };
const RING = { gilt: '0 0 0 2px #8a6a2e,0 0 0 7px #d2ab5f,0 0 0 8px #7a5a22', silver: '0 0 0 2px #6f7278,0 0 0 7px #d3d6da,0 0 0 8px #6f7278', ivory: '0 0 0 2px #b8955a,0 0 0 7px #efe6d2,0 0 0 8px #b8955a',
  deco: '0 0 0 2px #e2c27a,0 0 0 3px #6e4f1c,0 0 0 6px #d9b45f,0 0 0 7px #6e4f1c,0 0 0 9px #e2c27a', walnut: '0 0 0 2px #d2ab5f,0 0 0 9px #573823', ebony: '0 0 0 2px #d2ab5f,0 0 0 9px #161414',
  emerald: '0 0 0 2px #d2ab5f,0 0 0 9px #1d5c46', teal: '0 0 0 2px #d2ab5f,0 0 0 9px #1c6a70', jewel: '0 0 0 2px #1e8a8a,0 0 0 3px #b0306a,0 0 0 4px #d4a531,0 0 0 5px #2a4fb0,0 0 0 10px #141212',
  maple: '0 0 0 3px #2c2420,0 0 0 8px #dcc29a', brass: '0 0 0 3px #2c2420,0 0 0 6px #c19a4e', white: '0 0 0 3px #cfc9bf,0 0 0 7px #f4f1ea',
  black: '0 0 0 1px #e3ddd0,0 0 0 10px #f7f4ec,0 0 0 13px #1b1a19', oak: '0 0 0 1px #e3ddd0,0 0 0 10px #f7f4ec,0 0 0 13px #c49a6c', alu: '0 0 0 1px #e3ddd0,0 0 0 10px #f7f4ec,0 0 0 13px #b5b8bd' };
function frameKey(a) {
  if (a.fr && RING[a.fr]) return a.fr; const id = /^emb:/.test(a.img || '') ? a.img.slice(4) : '';
  if (FRDEF[id]) return FRDEF[id]; const m = String(a.m || '');
  return /ink|pen\b|pencil|drawing|charcoal|graphite|etching|linocut|print/i.test(m) ? 'black' : /digital/i.test(m) ? 'brass' : /watercolou?r|gouache|pastel/i.test(m) ? 'oak' : 'gilt';
}
function slugify(t) { return String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'painting' }
function slugMap(arts) { const by = {}, used = {}; arts.forEach(a => { const s = slugify(a.t); let k = s, n = 2; while (used[k]) k = s + '-' + (n++); used[k] = a; by[a.id] = k }); return { used, by } }
async function pubArts() {
  const cat = await getCat();
  const arts = cat ? cat.arts : Object.keys(EMB).map(id => ({ id, t: EMB[id].t, m: EMB[id].m, d: EMB[id].d, s: '', year: '', p: '', mode: 'request', status: 'Available', img: 'emb:' + id, w: EMB[id].w, h: EMB[id].h }));
  return { cat, arts };
}
function imgsOf(a) { if (/^emb:/.test(a.img)) { const e = EMB[a.img.slice(4)] || {}; return { tn: e.tn || e.img, mid: e.img, wm: e.wm || '' } } return { tn: a.img, mid: a.img, wm: a.wm || '' } }
function kindOf(a) { const m = String(a.m || ''); return /digital/i.test(m) ? 'digital painting' : /ink|pen\b|pencil|drawing|charcoal|graphite/i.test(m) ? 'drawing' : 'painting' }
function priceOfA(a, top, cur) {
  if (a.status === 'Sold') return 'Sold';
  if (a.mode === 'auction' && a.auc) return top ? 'Current bid ' + money(top, cur) : 'Auction · bids from ' + money(a.auc.start, cur);
  if (a.mode === 'price' && a.p) return a.p; return 'Price on request';
}
function altOf(a) { const d = String(a.d || '').split(/(?<=[.!?])\s/)[0]; return '“' + a.t + '”, an original ' + kindOf(a) + ' by Pam' + (a.m ? ' (' + a.m + ')' : '') + (d ? '. ' + d : '') }
function textOf(cat, k, d) { const t = cat && cat.texts && cat.texts[k]; return t && String(t).trim() ? String(t) : d }
function formTs() { const t = Date.now(); return t + '.' + b64u(crypto.createHmac('sha256', SECRET).update('ts|' + t).digest()).slice(0, 16) }
function tsAge(v) { const m = /^(\d{10,14})\.([A-Za-z0-9_-]{16})$/.exec(String(v || '')); if (!m) return 0; const good = b64u(crypto.createHmac('sha256', SECRET).update('ts|' + m[1]).digest()).slice(0, 16); return good === m[2] ? Date.now() - +m[1] : 0 }
function contactEmail(cat) { return cat && cat.site && cat.site.email || OWNER }

const PAGE_CSS = `:root{--paper:#faf7f1;--card:#fffdf9;--ink:#2a1c14;--muted:#6b5a4e;--line:#e6ddcf;--walnut:#4b2e22;--bronze:#b08d57;--ok:#3f6b4a;--focus:#b08d57}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--paper);color:var(--ink);font:300 17px/1.65 Jost,system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--walnut);text-underline-offset:3px}a:hover{color:var(--ink)}
:focus-visible{outline:2px solid var(--focus);outline-offset:3px;border-radius:4px}
.skip{position:absolute;left:-999px;top:8px;background:var(--walnut);color:#fff;padding:.5rem .9rem;border-radius:8px;z-index:9}.skip:focus{left:12px}
.wrap{max-width:1200px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left));padding-right:max(20px,env(safe-area-inset-right))}
header.top{border-bottom:1px solid var(--line);background:rgba(250,247,241,.94);position:sticky;top:0;z-index:5;backdrop-filter:blur(8px)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:64px;flex-wrap:wrap}
.brand{font:italic 500 1.55rem/1 "Cormorant Garamond",Georgia,serif;color:var(--ink);text-decoration:none;letter-spacing:.01em}
nav.links{display:flex;gap:1.2rem;flex-wrap:wrap;font-size:.92rem}nav.links a{text-decoration:none;color:var(--muted)}nav.links a:hover,nav.links a[aria-current]{color:var(--ink)}
h1,h2{font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;line-height:1.1;text-wrap:balance;margin:0}
h1{font-style:italic;font-size:clamp(2.3rem,5vw,3.6rem)}h2{font-style:italic;font-size:clamp(1.7rem,3.4vw,2.3rem)}
.kick{font-size:.74rem;letter-spacing:.2em;text-transform:uppercase;color:var(--bronze);margin:0 0 .6rem}
.lede{color:var(--muted);max-width:62ch;font-size:1.06rem}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:46px;padding:.65rem 1.35rem;border-radius:99px;border:1px solid var(--walnut);color:var(--walnut);background:transparent;font:400 .95rem/1.2 Jost,sans-serif;text-decoration:none;cursor:pointer;transition:background .2s,color .2s}
.btn:hover{background:#efe6da;color:var(--ink)}.btn.main{background:var(--walnut);color:#faf6ee}.btn.main:hover{background:var(--ink);color:#fff}
.intro{padding:clamp(2.5rem,7vw,5rem) 0 1.5rem}.intro .btns{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:1.4rem}
.coll{padding:2.2rem 0;border-top:1px solid var(--line)}.coll>p{color:var(--muted);max-width:62ch;margin:.5rem 0 0}
.grid{list-style:none;padding:0;margin:1.6rem 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:2rem 1.6rem}
.grid a{display:block;text-decoration:none;color:inherit}
.ph{display:flex;align-items:center;justify-content:center;aspect-ratio:1/1;background:#f1e9dd;padding:12%;border-radius:2px;transition:background .25s}
.grid a:hover .ph{background:#ebe1d2}.ph img{max-width:100%;max-height:100%;height:auto;width:auto;display:block}
.t{display:block;font:italic 500 1.3rem/1.2 "Cormorant Garamond",Georgia,serif;margin-top:.8rem}.m{display:block;color:var(--muted);font-size:.9rem}
.pr{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;font-size:.92rem;margin-top:.15rem}
.badge{display:inline-block;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;border:1px solid currentColor;padding:.12rem .45rem;border-radius:3px;color:var(--ok)}
.badge.hold{color:#9a6a12}.badge.sold{color:#8a2f2f}
.crumbs{font-size:.88rem;color:var(--muted);padding-top:1.4rem}.crumbs a{color:var(--muted)}
.art{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:clamp(1.5rem,4vw,4rem);align-items:center;padding:1.6rem 0 3rem}
.art figure{margin:0;display:flex;justify-content:center;background:#f1e9dd;padding:clamp(1.6rem,5vw,4rem);border-radius:2px}
.art figure img{max-width:100%;max-height:72vh;height:auto;width:auto;display:block}
.by{color:var(--muted);margin:.35rem 0 1.2rem;font-size:1.02rem}
.price{font:500 1.5rem/1.2 "Cormorant Garamond",Georgia,serif;display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin:0 0 1rem}
dl.facts{display:grid;grid-template-columns:auto 1fr;gap:.35rem 1.4rem;margin:0 0 1.2rem;font-size:.97rem}dl.facts dt{color:var(--muted)}dl.facts dd{margin:0}
.desc{max-width:60ch}.actions{display:flex;gap:.8rem;flex-wrap:wrap;margin:1.4rem 0 1rem}
.trust{font-size:.88rem;color:var(--muted);max-width:60ch}
.enquire,.contact{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:clamp(1.3rem,4vw,2.4rem);margin:0 0 3rem}
form.f{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem 1.2rem;margin-top:1.2rem;max-width:760px}
form.f label{display:grid;gap:.35rem;font-size:.88rem;color:var(--muted)}form.f .wide{grid-column:1/-1}
form.f input,form.f textarea{font:300 1rem/1.4 Jost,sans-serif;color:var(--ink);background:#fff;border:1px solid #d6cbbb;border-radius:10px;padding:.7rem .85rem;width:100%}
form.f input:focus,form.f textarea:focus{border-color:var(--bronze);outline:2px solid rgba(176,141,87,.35);outline-offset:0}
form.f textarea{min-height:120px;resize:vertical}.small{font-size:.84rem;color:var(--muted);margin:0}
.note{border-radius:10px;padding:.85rem 1rem;margin:1rem 0 0;font-size:.95rem}.note.ok{background:#e8f1e8;color:#244a2d}.note.err{background:#fbe9e6;color:#7a2a1f}
.hp{position:absolute!important;left:-10000px!important;width:1px;height:1px;overflow:hidden}
footer.foot{border-top:1px solid var(--line);padding:2.4rem 0 3rem;color:var(--muted);font-size:.9rem}footer.foot .wrap{display:flex;flex-wrap:wrap;gap:1rem 2rem;justify-content:space-between}
img{-webkit-touch-callout:none;-webkit-user-drag:none;user-select:none}
header.top .wrap{padding-top:.55rem;padding-bottom:.55rem}
@media (max-width:820px){.art{grid-template-columns:1fr}form.f{grid-template-columns:1fr}}
@media (max-width:640px){header.top{position:static}nav.links{gap:.35rem 1rem;font-size:.9rem}.brand{font-size:1.4rem}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
` + Object.keys(RING).map(k => '.fr-' + k + '{box-shadow:0 10px 24px rgba(30,18,12,.28),' + RING[k] + '}').join('');

// a little script: turns the written-out email into a link, and asks before anyone saves a painting (the page works without it)
const PAGE_JS = "document.querySelectorAll('[data-u]').forEach(function(e){var a=document.createElement('a'),m=e.getAttribute('data-u')+'@'+e.getAttribute('data-d');a.href='mailto:'+m;a.textContent=m;e.replaceWith(a)});" +
  "document.addEventListener('contextmenu',function(e){if(e.target.tagName==='IMG'){e.preventDefault();var n=document.getElementById('protN');if(n){n.hidden=false;clearTimeout(window.__pt);window.__pt=setTimeout(function(){n.hidden=true},4500)}}});";
const PAGE_JS_HASH = "'sha256-" + crypto.createHash('sha256').update(PAGE_JS).digest('base64') + "'";
function shell(o) {
  const ogImg = o.img ? SITE + o.img : '';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src ' + PAGE_JS_HASH + '; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src \'self\' data:; form-action \'self\'; base-uri \'self\'; object-src \'none\'">' +
    '<title>' + esc(o.title) + '</title><meta name="description" content="' + esc(o.desc) + '"><link rel="canonical" href="' + esc(o.canon) + '">' +
    '<meta name="robots" content="' + (o.noindex ? 'noindex' : 'index, follow, max-image-preview:large') + '"><meta name="theme-color" content="#faf7f1">' +
    '<meta property="og:site_name" content="Pam’s Gallery"><meta property="og:type" content="' + (o.ogType || 'website') + '"><meta property="og:title" content="' + esc(o.ogTitle || o.title) + '"><meta property="og:description" content="' + esc(o.desc) + '"><meta property="og:url" content="' + esc(o.canon) + '">' +
    (ogImg ? '<meta property="og:image" content="' + esc(ogImg) + '"><meta property="og:image:alt" content="' + esc(o.imgAlt || o.title) + '">' : '') +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(o.ogTitle || o.title) + '"><meta name="twitter:description" content="' + esc(o.desc) + '">' + (ogImg ? '<meta name="twitter:image" content="' + esc(ogImg) + '">' : '') +
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="' + FONTS + '" rel="stylesheet">' +
    '<style>' + PAGE_CSS + '</style>' + (o.ld ? '<script type="application/ld+json">' + JSON.stringify(o.ld).replace(/</g, '\\u003c') + '</script>' : '') + '</head><body>' +
    '<a class="skip" href="#main">Skip to the content</a><header class="top"><div class="wrap"><a class="brand" href="/">Pam’s Gallery</a><nav class="links" aria-label="Main">' +
    '<a href="/works"' + (o.here === 'works' ? ' aria-current="page"' : '') + '>All works</a><a href="/">3D gallery</a><a href="/#commission">Commissions</a><a href="/#buying">Buying with confidence</a><a href="/works#contact">Contact</a></nav></div></header>' +
    '<main id="main" class="wrap">' + o.body + '</main>' +
    '<p id="protN" class="note" role="status" hidden style="position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#2a1c14;color:#f7f1e8;max-width:92vw;z-index:9">Pam’s artwork is protected by copyright. For a print or permission to use an image, just ask.</p>' +
    '<footer class="foot"><div class="wrap"><span>© Pam’s Gallery · Original paintings by Pam</span><span>Email: ' + o.email + '</span><span><a href="/works">All works</a> · <a href="/">The 3D gallery</a> · <a href="/#buying">Buying with confidence</a></span></div></footer>' +
    '<script>' + PAGE_JS + '</script></body></html>';
}
function emailSpan(addr) { const i = addr.indexOf('@'); return '<span data-u="' + esc(addr.slice(0, i)) + '" data-d="' + esc(addr.slice(i + 1)) + '">' + esc(addr.slice(0, i)) + ' [at] ' + esc(addr.slice(i + 1)) + '</span>' }
function card(a, slug, cur, eager) {
  const im = imgsOf(a), W = 600, H = Math.round(W * (a.h || .7) / (a.w || .5)), st = a.status || 'Available';
  return '<li><a href="/art/' + slug + '"><span class="ph"><img src="' + esc(im.tn) + '" alt="' + esc(altOf(a)) + '" width="' + W + '" height="' + H + '"' + (eager ? '' : ' loading="lazy"') + ' decoding="async" class="fr-' + frameKey(a) + '"></span>' +
    '<span class="t">' + esc(a.t) + '</span><span class="m">' + esc([a.m, a.s].filter(Boolean).join(' · ') || 'Original artwork') + '</span>' +
    '<span class="pr">' + esc(priceOfA(a, 0, cur)) + (st === 'Sold' ? '' : ' <span class="badge' + (st === 'On hold' ? ' hold' : '') + '">' + esc(st) + '</span>') + '</span></a></li>';
}
function notice(q) {
  if (q.sent === 'order') return '<p class="note ok" role="status">Thank you — Pam has your enquiry and will reply to you personally, usually within a day.</p>';
  if (q.sent === 'message') return '<p class="note ok" role="status">Thank you — Pam has your message and will reply personally, usually within two working days.</p>';
  if (q.err) return '<p class="note err" role="alert">' + esc(String(q.err).slice(0, 200)) + '</p>'; return '';
}
function enquiryForm(a, back, q, site) {
  const sold = a.status === 'Sold', offers = !sold && site.offers !== false && a.mode !== 'auction';
  return '<form class="f" method="post" action="/api/app"><input type="hidden" name="a" value="' + (sold ? 'message' : 'order') + '"><input type="hidden" name="form" value="1"><input type="hidden" name="back" value="' + esc(back) + '">' +
    '<input type="hidden" name="id" value="' + esc(a.id) + '"><input type="hidden" name="ts" value="' + formTs() + '">' +
    '<label>Your name<input name="name" required maxlength="80" autocomplete="name"></label><label>Email<input type="email" name="email" required maxlength="200" autocomplete="email"></label>' +
    '<label>Phone (optional)<input type="tel" name="phone" maxlength="40" autocomplete="tel"></label>' +
    (offers ? '<label>Your offer (optional)<input name="offer" inputmode="decimal" maxlength="12" placeholder="e.g. 450"></label>' : '<span></span>') +
    '<label class="wide">' + (sold ? 'Your message (this painting has found a home — ask about similar work)' : 'Your message (optional)') + '<textarea name="message" maxlength="2000" placeholder="Anything you’d like to know: framing, delivery, a viewing…"></textarea></label>' +
    '<label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>' +
    '<p class="small wide">Pam replies personally, usually within a day. Your details are only used to answer you — nothing is shared.</p>' +
    '<div class="wide"><button class="btn main" type="submit">' + (sold ? 'Send message' : 'Send enquiry') + '</button></div></form>' + notice(q);
}
async function artPage(q, res) {
  const { cat, arts } = await pubArts(), { used, by } = slugMap(arts), cur = cat && cat.site && cat.site.cur || 'GBP', site = cat && cat.site || {};
  let a = used[String(q.slug || '')];
  if (!a) { const byId = arts.find(x => x.id === String(q.slug || '')); if (byId) { res.setHeader('Location', '/art/' + by[byId.id]); res.status(301).end(); return } return notFound(res) }
  const slug = by[a.id], url = SITE + '/art/' + slug, im = imgsOf(a), coll = (cat && cat.colls || []).find(c => c.works.indexOf(a.id) >= 0);
  let top = 0; if (a.mode === 'auction' && a.auc) { const t = topOf(await db('ZREVRANGE', 'bids:' + a.id, '0', '0', 'WITHSCORES')); top = t ? t.amount : 0 }
  const st = a.status || 'Available', price = priceOfA(a, top, cur), kind = kindOf(a), alt = altOf(a), email = contactEmail(cat);
  const facts = [['Medium', a.m], ['Size', a.s || 'On request'], ['Year', a.year], ['Availability', st]].concat(a.mode === 'auction' && a.auc ? [['Auction ends', new Date(a.auc.ends).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London' }) + ' (UK time)']] : []).filter(f => f[1]);
  const more = coll ? coll.works.filter(id => id !== a.id).map(id => arts.find(x => x.id === id)).filter(Boolean) : arts.filter(x => x.id !== a.id).slice(0, 6);
  const num = parseFloat(String(a.p || '').replace(/[^0-9.]/g, ''));
  const ld = { '@context': 'https://schema.org', '@type': ['VisualArtwork', 'Product'], name: a.t, url, image: im.wm ? [SITE + im.wm] : undefined, description: a.d || (a.t + ', an original ' + kind + ' by Pam.'),
    creator: { '@type': 'Person', name: 'Pam', url: SITE }, artform: { 'digital painting': 'Digital art', drawing: 'Drawing' }[kind] || 'Painting', artMedium: a.m || undefined, dateCreated: a.year || undefined,
    offers: { '@type': 'Offer', url, priceCurrency: cur, availability: st === 'Sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock', price: a.mode === 'price' && isFinite(num) && num > 0 ? num : undefined,
      seller: { '@type': 'Person', name: 'Pam' } } };
  const body = '<nav class="crumbs" aria-label="Breadcrumb"><a href="/works">All works</a>' + (coll ? ' › <a href="/works#' + slugify(coll.t) + '">' + esc(coll.t) + '</a>' : '') + '</nav>' +
    '<article class="art"><figure><img src="' + esc(im.mid) + '" srcset="' + esc(im.tn) + ' 720w, ' + esc(im.mid) + ' 1280w" sizes="(min-width: 820px) 52vw, 90vw" alt="' + esc(alt) + '" class="fr-' + frameKey(a) + '" fetchpriority="high" decoding="async"></figure>' +
    '<div class="info">' + (coll ? '<p class="kick">' + esc(coll.t) + '</p>' : '<p class="kick">Original ' + kind + '</p>') + '<h1>' + esc(a.t) + '</h1><p class="by">An original ' + kind + ' by Pam</p>' +
    '<p class="price">' + esc(price) + (st === 'Sold' ? '' : ' <span class="badge' + (st === 'On hold' ? ' hold' : '') + '">' + esc(st) + '</span>') + '</p>' +
    '<dl class="facts">' + facts.map(f => '<dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd>').join('') + '</dl>' + (a.d ? '<p class="desc">' + esc(a.d) + '</p>' : '') +
    '<p class="actions">' + (st === 'Sold' ? '<a class="btn main" href="#enquire">Ask about similar work</a>' : a.mode === 'auction' ? '<a class="btn main" href="/#art-' + esc(a.id) + '">Place a bid in the gallery</a><a class="btn" href="#enquire">Ask a question</a>' : '<a class="btn main" href="#enquire">Enquire to buy</a>') +
    '<a class="btn" href="/#art-' + esc(a.id) + '">See it in the 3D gallery</a></p>' +
    '<p class="trust">' + esc(textOf(cat, 'trust.line', 'Signed certificate of authenticity · Secure payment · Tracked, insured delivery · 14-day returns')) + '. <a href="/#buying">Buying with confidence</a></p></div></article>' +
    '<section id="enquire" class="enquire" aria-labelledby="eqh"><h2 id="eqh">' + (st === 'Sold' ? 'Ask Pam about similar work' : 'Ask Pam about “' + esc(a.t) + '”') + '</h2>' + enquiryForm(a, '/art/' + slug, q, site) + '</section>' +
    (more.length ? '<section class="coll" aria-labelledby="mh"><h2 id="mh">' + (coll ? 'More from ' + esc(coll.t) : 'More works') + '</h2><ul class="grid">' + more.map(x => card(x, by[x.id], cur)).join('') + '</ul></section>' : '');
  html(res, shell({ title: a.t + ' — an original ' + kind + ' by Pam | Pam’s Gallery', ogTitle: a.t + ' — an original ' + kind + ' by Pam', desc: (a.d ? a.d.slice(0, 150) : 'An original ' + kind + ' by Pam.') + ' ' + price + '.',
    canon: url, img: im.wm, imgAlt: alt, ogType: 'product', ld, body, email: emailSpan(email) }), q.sent || q.err);
}
async function worksPage(q, res) {
  const { cat, arts } = await pubArts(), { by } = slugMap(arts), cur = cat && cat.site && cat.site.cur || 'GBP', email = contactEmail(cat);
  const colls = (cat && cat.colls || []).filter(c => c.works.some(id => arts.find(a => a.id === id))), inC = new Set(); colls.forEach(c => c.works.forEach(id => inC.add(id)));
  const loose = arts.filter(a => !inC.has(a.id)), secs = (loose.length ? [{ t: textOf(cat, 'newart.title', 'New from the studio'), d: textOf(cat, 'newart.text', 'The newest works, fresh from Pam’s studio.'), works: loose.map(a => a.id) }] : []).concat(colls);
  let n = 0; const sec = s => '<section class="coll" id="' + slugify(s.t) + '" aria-labelledby="h-' + slugify(s.t) + '"><h2 id="h-' + slugify(s.t) + '">' + esc(s.t) + '</h2>' + (s.d ? '<p>' + esc(s.d) + '</p>' : '') +
    '<ul class="grid">' + s.works.map(id => arts.find(a => a.id === id)).filter(Boolean).map(a => card(a, by[a.id], cur, n++ < 4)).join('') + '</ul></section>';
  const first = arts[0] && imgsOf(arts[0]).wm;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'All works — Pam’s Gallery', url: SITE + '/works', mainEntity: { '@type': 'ItemList', itemListElement: arts.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + '/art/' + by[a.id], name: a.t })) } };
  const body = '<section class="intro"><p class="kick">The collection</p><h1>All works</h1><p class="lede">Original paintings and drawings by Pam — every one a single, signed original with a certificate of authenticity. Tap any work for its size, price and story, or to ask Pam about it.</p>' +
    '<div class="btns"><a class="btn main" href="/">Walk through the 3D gallery</a><a class="btn" href="#contact">Contact Pam</a></div></section>' + secs.map(sec).join('') +
    '<section id="contact" class="contact" aria-labelledby="ch"><h2 id="ch">Contact Pam</h2><p class="lede">For questions, viewings, commissions or press, write to ' + emailSpan(email) + ' or send a message here.</p>' +
    '<form class="f" method="post" action="/api/app"><input type="hidden" name="a" value="message"><input type="hidden" name="form" value="1"><input type="hidden" name="back" value="/works"><input type="hidden" name="ts" value="' + formTs() + '">' +
    '<label>Your name<input name="name" required maxlength="80" autocomplete="name"></label><label>Email<input type="email" name="email" required maxlength="200" autocomplete="email"></label>' +
    '<label class="wide">Message<textarea name="message" required maxlength="3000"></textarea></label><label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>' +
    '<p class="small wide">Pam replies personally, usually within two working days. Your details are only used to answer you.</p><div class="wide"><button class="btn main" type="submit">Send message</button></div></form>' + notice(q) + '</section>';
  html(res, shell({ title: 'All works — original paintings by Pam | Pam’s Gallery', desc: 'Browse every original painting and drawing by Pam, with sizes, prices and availability, and enquire to buy.', canon: SITE + '/works', img: first, ld, body, here: 'works', email: emailSpan(email) }), q.sent || q.err);
}
async function sitemap(res) {
  const { cat, arts } = await pubArts(), { by } = slugMap(arts), d = new Date(cat && cat.v || Date.now()).toISOString().slice(0, 10);
  const u = (p, pr) => '<url><loc>' + SITE + p + '</loc><lastmod>' + d + '</lastmod><priority>' + pr + '</priority></url>';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
  res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + u('/', '1.0') + u('/works', '0.9') + arts.map(a => u('/art/' + by[a.id], '0.8')).join('') + '</urlset>');
}
function html(res, s, personal) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', personal ? 'no-store' : 'public, max-age=0, s-maxage=60, stale-while-revalidate=600'); res.status(200).end(s) }
function notFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  res.status(404).end(shell({ title: 'Page not found | Pam’s Gallery', desc: 'This page has wandered off.', canon: SITE + '/404', noindex: true, email: emailSpan(OWNER),
    body: '<section class="intro"><p class="kick">404</p><h1>This page has wandered off</h1><p class="lede">It may have moved, or the painting may have found a new home. Everything else is just where you left it.</p><div class="btns"><a class="btn main" href="/works">See all works</a><a class="btn" href="/">Walk through the gallery</a></div></section>' }));
}
// forms sent without JavaScript arrive as ordinary form posts: run them like the gallery's own, then show the page again with a thank-you or the problem
async function formPost(req, res, b) {
  const back = /^\/(art\/[a-z0-9-]{1,80}|works)$/.test(String(b.back || '')) ? String(b.back) : '/works';
  const fn = { order: actions.order, message: actions.message }[b.a];
  const go = (qs, hash) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Location', back + '?' + qs + (hash || '')); res.status(303).end() };
  if (!fn) return go('err=' + encodeURIComponent('That form couldn’t be sent.'), '#enquire');
  const x = { a: b.a, id: b.id, name: b.name, email: b.email, phone: b.phone, message: b.message, offer: b.offer, hp: b.website || '', ft: tsAge(b.ts) };
  try { await fn(req, x); go('sent=' + (b.a === 'order' ? 'order' : 'message'), back === '/works' ? '#contact' : '#enquire') }
  catch (e) { go('err=' + encodeURIComponent(e.code && e.code < 500 ? e.message : 'Something went wrong — please try again, or email Pam.'), back === '/works' ? '#contact' : '#enquire') }
}

module.exports = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const q = req.query || {};
      if (!(DB_URL && DB_TOKEN)) { res.setHeader('Cache-Control', 'no-store'); res.status(503).json({ error: 'not_configured' }); return }
      if (q.img && /^[a-z0-9]{6,40}$/i.test(String(q.img))) { await getImage(String(q.img), res, q); return }
      if (q.cat) { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=30'); res.status(200).json({ cat: await getCat(), cfg: { google: GOOGLE_ID, pay: !!STRIPE } }); return }
      if (q.s && /^[a-z0-9]{1,24}$/i.test(String(q.s))) { await sharePage(String(q.s), res); return }
      if (q.page === 'art' && /^[a-z0-9-]{1,80}$/i.test(String(q.slug || ''))) { await artPage(q, res); return }
      if (q.page === 'works') { await worksPage(q, res); return }
      if (q.page === 'sitemap') { await sitemap(res); return }
      if (q.page === '404' || q.page === 'art') { notFound(res); return }
      if (q.live) {           // likes and the current bid on each auction, refreshed every few seconds
        const cat = await getCat(), arts = cat && cat.arts || Object.keys(EMB).map(id => ({ id })), auc = arts.filter(a => a.mode === 'auction' && a.auc);
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
    if (b.form === '1') { if (!(DB_URL && DB_TOKEN)) { res.status(503).end('Please email Pam at ' + OWNER); return } await formPost(req, res, b); return }
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
