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
const EMB = __EMB__;
const SECRET = crypto.createHash('sha256').update(process.env.SESSION_SECRET ? 'pams-gallery-session|' + process.env.SESSION_SECRET : 'pams-gallery-session|' + (DB_TOKEN || '')).digest();

// ---- rewards (easy to change) ----
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

// ---- members' early access: until its date a painting is shown to everyone else only as a blurred teaser ----
// members-only pictures are locked, so Pam's editor gets short-lived links to show them
function ownerPv(cat) { const pv = {}; (cat && cat.arts || []).forEach(a => { if (isEarly(a)) [a.img, a.wm].forEach(u => { if (/^\/api\/app\?img=/.test(u || '')) pv[u] = signedImg(u, 1) }) }); return pv }
const isEarly = a => !!(a && a.early && a.early > Date.now());
function publicCat(cat) {
  if (!cat) return cat;
  return Object.assign({}, cat, { arts: cat.arts.map(a => isEarly(a) ? { id: a.id, t: a.t, m: a.m, s: a.s, year: a.year, mode: a.mode === 'auction' ? 'auction' : 'request', status: a.status, w: a.w, h: a.h, bg: a.bg, fr: a.fr, img: a.tz || '', ea: a.early } : a) });
}
function memberArts(cat) {     // the full details, with picture links that only work for a couple of days
  return (cat && cat.arts || []).filter(isEarly).map(a => Object.assign({}, a, { ea: a.early, img: signedImg(a.img, 2), full: signedImg(a.img, 2), wm: a.wm ? signedImg(a.wm, 2) : undefined, tz: undefined, tzOf: undefined }));
}
async function gateImages(prev, next) {     // a painting's own pictures stay private while it is members-only
  const want = {}; (next.arts || []).forEach(a => { [a.img, a.wm].forEach(u => { const m = /img=([a-z0-9]{6,40})/i.exec(u || ''); if (m) want[m[1]] = isEarly(a) ? a.early : 0 }) });
  (prev && prev.arts || []).forEach(a => { [a.img, a.wm].forEach(u => { const m = /img=([a-z0-9]{6,40})/i.exec(u || ''); if (m && !(m[1] in want)) want[m[1]] = 0 }) });
  const keys = Object.keys(want); if (!keys.length) return;
  const metas = await pipe(keys.map(k => ['GET', 'img:' + k])), set = [];
  metas.forEach((v, i) => { const m = J(v); if (!m) return; const u = want[keys[i]] || undefined; if ((m.until || undefined) !== u) { if (u) m.until = u; else delete m.until; set.push(['SET', 'img:' + keys[i], JSON.stringify(m)]) } });
  if (set.length) await pipe(set);
}
// tokens in email links: confirm a sign-up, or unsubscribe with one click
function mailTok(email, why) { const e = b64u(email); return e + '.' + b64u(crypto.createHmac('sha256', SECRET).update(why + '|' + email).digest()).slice(0, 22) }
function mailTokOk(t, why) { const m = /^([A-Za-z0-9_-]{4,400})\.([A-Za-z0-9_-]{22})$/.exec(String(t || '')); if (!m) return ''; const email = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
  return okEmail(email) && mailTok(email, why) === t ? email : '' }
const unsubLink = email => SITE + '/api/app?unsub=' + mailTok(email, 'unsub');
const CONSENT_WORDS = 'Yes, email me about new work and exhibitions. I can unsubscribe at any time.';
async function dropMail(prev, next) {      // a new members-only painting: tell members who asked for news
  if (!RESEND || !MAIL_FROM) return 0;
  const was = new Set((prev && prev.arts || []).filter(isEarly).map(a => a.id)), fresh = (next.arts || []).filter(a => isEarly(a) && !was.has(a.id));
  if (!fresh.length) return 0;
  const sent = await pipe(fresh.map(a => ['SET', 'drop:' + a.id + ':' + a.early, '1', 'NX'])), todo = fresh.filter((a, i) => sent[i] === 'OK'); if (!todo.length) return 0;
  const emails = await db('ZREVRANGE', 'members', '0', '499'), us = emails && emails.length ? await pipe(emails.map(e => ['GET', 'u:' + e])) : [];
  const to = us.map(J).filter(u => u && u.news && u.email !== OWNER).map(u => u);
  const when = new Date(Math.min(...todo.map(a => a.early))).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London' });
  const list = todo.map(a => '<b>' + esc(a.t) + '</b>' + (a.m ? ' — ' + esc(a.m) : '')).join('<br>');
  let n = 0;
  for (let i = 0; i < to.length; i += 8) {
    const r = await Promise.all(to.slice(i, i + 8).map(u => mail(u.email, 'Members first: new work from Pam', ['Dear ' + esc((u.name || '').split(' ')[0] || 'collector') + ',',
      'As a member, you get to see Pam’s newest work before anyone else:', list, 'It’s open to members only until ' + esc(when) + ' (UK time). Sign in to the gallery to see it, enquire or bid before it goes on public view.',
      '<span style="font-size:12px;color:#8a7a6c">You’re receiving this because you asked to hear about new paintings. <a href="' + unsubLink(u.email) + '" style="color:#8a7a6c">Unsubscribe</a>.</span>'],
      { url: SITE + '/#art-' + todo[0].id, label: 'See it first' }, ownerTo(next))));
    n += r.filter(Boolean).length;
  }
  return n;
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
// what Pam has confirmed about delivery, returns and so on; anything left empty is simply not claimed
/* ---------- visitor analytics ----------
   No cookies and nothing stored on the visitor's device. A visit is recognised by a scrambled code made from the
   connection and browser (with a secret, so it can't be turned back into either); the code itself is only kept for
   30 minutes (the visit) and 5 minutes (the "active now" list). Everything else is totals in hourly buckets (UTC),
   so the dashboard can show any date range in any timezone. Unique visitors use HyperLogLog counts, which de-duplicate
   across the whole range without keeping anyone's code. */
const AN_TTL = String(400 * 86400), HOUR = 36e5;
const BOT_RE = /bot\b|bot\/|crawl|spider|slurp|bingpreview|facebookexternalhit|facebot|embedly|quora link|whatsapp|telegram|discord|slack|twitterbot|linkedin|pinterest\/|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl\/|wget|python|axios|node-fetch|go-http|java\/|okhttp|httpclient|preview|scan/i;
function ipOf(req) { return String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || '').split(',')[0].trim() }
function hourKey(t) { return new Date(t).toISOString().slice(0, 13).replace(/[-T]/g, '') }
function vHash(req) { return crypto.createHmac('sha256', SECRET).update('an|' + ipOf(req) + '|' + String(req.headers['user-agent'] || '')).digest('base64url').slice(0, 16) }
function uaInfo(ua) {
  const dev = /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'Tablet' : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'Phone' : 'Computer';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  return { dev, br };
}
// where a visit came from: a tidy host name (google.co.uk → google.com, l.instagram.com → instagram.com), a campaign tag, or "direct"
function refOf(r, utm) {
  const u = String(utm || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40); if (u) return u;
  let h = String(r || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 80).replace(/^(www|m|l|lm|mobile|out)\./, '');
  if (!h || h === 'itsamepameo.com' || h === 'itsamepameo.co.uk') return 'direct';
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return 'google.com';
  if (/(^|\.)bing\.com$/.test(h)) return 'bing.com';
  if (/(^|\.)(facebook\.com|fb\.me)$/.test(h)) return 'facebook.com';
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram.com';
  if (/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/.test(h)) return 'pinterest.com';
  if (/^(t\.co|twitter\.com|x\.com)$/.test(h)) return 'x.com';
  if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(h)) return 'linkedin.com';
  if (/(^|\.)yahoo\.[a-z.]+$/.test(h)) return 'yahoo.com';
  return h;
}
async function anExclude(why) { const k = 'an:x:' + hourKey(Date.now()).slice(0, 8); await pipe([['HINCRBY', k, why, '1'], ['EXPIRE', k, AN_TTL]]); return { ok: true } }
// a visit that led to an enquiry, offer, bid, message, commission request or sign-up
async function anConvert(req) {
  try { const sk = 'an:s:' + vHash(req), sess = J(await db('GET', sk)); if (!sess || sess.cv) return; sess.cv = 1;
    await pipe([['SET', sk, JSON.stringify(sess), 'EX', '1800'], ['HINCRBY', 'an:h:' + sess.h, 'cv', '1'], ['HINCRBY', 'an:h:' + sess.h, 'cr:' + sess.ref, '1']]) } catch (e) { }
}
function sumHashes(list) {   // HGETALL replies → one object of totals
  const t = {}; (list || []).forEach(L => { if (!Array.isArray(L)) return; for (let i = 0; i + 1 < L.length; i += 2) t[L[i]] = (t[L[i]] || 0) + (+L[i + 1] || 0) }); return t;
}
function anTop(t, pre, n) { return Object.keys(t).filter(k => k.indexOf(pre) === 0).map(k => [k.slice(pre.length), t[k]]).sort((a, b) => b[1] - a[1]).slice(0, n || 10) }
function kpiOf(t, uv) { const ses = t.ses || 0; return { uv: uv || 0, pv: t.pv || 0, ses, bounce: ses ? Math.round(1000 * (ses - Math.min(ses, t.nb || 0)) / ses) / 10 : null, avg: ses ? Math.round((t.dms || 0) / 1000 / ses) : null, conv: t.cv || 0 } }
function cleanBuy(B) {
  B = B && typeof B === 'object' ? B : {}; const t = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const pick = (v, ok) => ok.indexOf(v) >= 0 ? v : '';
  return { ukCost: t(B.ukCost, 60), ukTime: t(B.ukTime, 60), intl: pick(B.intl, ['quote', 'no']), tracked: pick(B.tracked, ['yes', 'no']), pack: t(B.pack, 300),
    retDays: [14, 21, 28, 30].indexOf(+B.retDays) >= 0 ? +B.retDays : 14, retPost: pick(B.retPost, ['buyer', 'pam']), cert: pick(B.cert, ['yes', 'no']), frame: t(B.frame, 300), reply: t(B.reply, 60) };
}
function buyOf(site) { return (site && site.buy) || {} }
function replyLine(site) { const r = buyOf(site).reply; return r ? 'Pam replies personally, usually within ' + r + '.' : 'Pam replies personally to every message.' }
function trustLine(site) { const b = buyOf(site); return [b.cert === 'yes' ? 'Certificate of authenticity' : 'Original works by Pam', STRIPE ? 'Secure card payment' : 'Nothing to pay until you’ve agreed', b.tracked === 'yes' ? 'Tracked, insured delivery' : '', (+b.retDays || 14) + '-day returns'].filter(Boolean).join(' · ') }
function cleanCat(c) {
  const str = (v, n) => clean(v, n), num = (v, lo, hi, d) => { const x = parseFloat(v); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d };
  const okId = v => /^[a-z0-9]{1,24}$/i.test(String(v || ''));
  const okUp = v => typeof v === 'string' && /^\/api\/app\?img=[a-z0-9]{6,40}$/i.test(v);
  const okImg = v => typeof v === 'string' && ((/^emb:p\d{1,2}$/.test(v) && !!EMB[v.slice(4)]) || okUp(v));
  const arts = (Array.isArray(c.arts) ? c.arts : []).slice(0, 120).filter(a => a && okId(a.id) && okImg(a.img)).map(a => ({
    id: String(a.id), t: str(a.t, 90) || 'Untitled', m: str(a.m, 80), s: str(a.s, 80), year: str(a.year, 12), d: str(a.d, 1200),
    p: str(a.p, 40), mode: ['price', 'auction'].indexOf(a.mode) >= 0 ? a.mode : 'request', status: ['Available', 'On hold', 'Sold'].indexOf(a.status) >= 0 ? a.status : 'Available',
    w: num(a.w, .15, 1.6, .5), h: num(a.h, .15, 1.6, .7), img: a.img, early: okUp(a.img) && num(a.early, 0, 4e12, 0) > 0 ? Math.round(num(a.early, 0, 4e12, 0)) : undefined,
    tz: okUp(a.tz) && a.tzOf === a.img ? a.tz : undefined, tzOf: okUp(a.tz) && a.tzOf === a.img ? a.img : undefined, ar: !!a.ar && /^emb:p[1-6]$/.test(a.img), wm: okUp(a.wm) && a.wmOf === a.img ? a.wm : undefined, wmOf: okUp(a.wm) && a.wmOf === a.img ? a.img : undefined, bg: /^#[0-9a-f]{6}$/i.test(a.bg || '') ? a.bg : '#cfc6d6', fr: FR_OK.indexOf(a.fr) >= 0 ? a.fr : undefined,
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
    buy: cleanBuy(S.buy),
    share: S.share !== false, likes: S.likes !== false, earlyHours: [24, 48, 72, 168].indexOf(+S.earlyHours) >= 0 ? +S.earlyHours : 0, cur: ['GBP', 'EUR', 'USD'].indexOf(S.cur) >= 0 ? S.cur : 'GBP' };
  const seen = (Array.isArray(c.seen) ? c.seen : []).map(String).filter(x => /^p\d{1,2}$/.test(x)).slice(0, 99);
  return { v: Date.now(), arts, favs, colls, prints, texts, site, seen };
}

function rewards(u, cat) {
  const owned = (u.owned || []).map(artId);
  return {
    sets: setsOf(cat).map(s => ({ name: s.name, reward: SET_REWARD, pieces: s.arts.map(a => ({ title: titleOf(cat, a), owned: owned.indexOf(a) >= 0 })), complete: s.arts.every(a => owned.indexOf(a) >= 0) }))
  };
}
function profile(u, cat) { return { name: u.name, email: u.email, joined: u.created, owner: u.email === OWNER, news: !!u.news, rewards: rewards(u, cat) } }
async function user(email) { return J(await db('GET', 'u:' + email)) }
async function auth(req) { const e = verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')); if (!e) return null; return await user(e) }
async function owner(req) { const u = await auth(req); if (!u || u.email !== OWNER) throw err('Owner only.', 403); return u }

const hdr = (req, k) => { const v = req.headers[k]; if (!v) return ''; try { return decodeURIComponent(String(v)) } catch (e) { return String(v) } };

const actions = {
  async health() { return { ok: true, db: !!(DB_URL && DB_TOKEN) } },
  async early(req) { const u = await auth(req); if (!u) throw err('Please sign in to see members’ early access.', 401); return { arts: memberArts(await getCat()) } },
  async news(req, b) { const u = await auth(req); if (!u) throw err('Please sign in.', 401); u.news = !!b.on; if (u.news) u.newsAt = Date.now(); await db('SET', 'u:' + u.email, JSON.stringify(u)); if (!u.news) await db('ZREM', 'subs', u.email); return { ok: true, news: u.news } },

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

  // one call per page view (and a light "still here" ping while the page is in use)
  async hit(req, b) {
    await limit(req, 'hit', 900, 3600);
    const ua = String(req.headers['user-agent'] || '');
    if (!ua || b.wd || BOT_RE.test(ua)) return anExclude('bots');
    if (+b.o) return anExclude('internal');
    const ip = ipOf(req), vh = vHash(req), sk = 'an:s:' + vh, now = Date.now(), H = hourKey(now);
    const [raw, ignored] = await pipe([['GET', sk], ['SISMEMBER', 'an:ignore', ip || '-']]);
    if (+ignored) return anExclude('internal');
    const view = b.ev !== 'ping', path = clean(b.p, 100).replace(/[^\w\/.-]/g, '');
    let sess = J(raw); const cmds = [];
    if (!sess) {
      if (!view) return { ok: true };                                   // a ping after the visit ended: nothing to add
      const { dev, br } = uaInfo(ua), cc = clean(hdr(req, 'x-vercel-ip-country'), 2).toUpperCase() || 'XX', ref = refOf(b.r, b.u);
      sess = { h: H, st: now, last: now, n: 0, ref, cv: 0 };
      const hk = 'an:h:' + H;
      cmds.push(['HINCRBY', hk, 'ses', '1'], ['HINCRBY', hk, 'r:' + ref, '1'], ['HINCRBY', hk, 'c:' + cc, '1'], ['HINCRBY', hk, 'd:' + dev, '1'], ['HINCRBY', hk, 'b:' + br, '1'], ['SETNX', 'an:since', String(now)]);
      // the long-standing totals and towns list on the Visitors tab
      const d = day(), city = clean(hdr(req, 'x-vercel-ip-city'), 60), reg = clean(hdr(req, 'x-vercel-ip-country-region'), 10), lat = parseFloat(hdr(req, 'x-vercel-ip-latitude')), lon = parseFloat(hdr(req, 'x-vercel-ip-longitude')), ck = city ? city + '|' + reg + '|' + cc : '';
      cmds.push(['INCR', 'v:total'], ['INCR', 'v:d:' + d], ['EXPIRE', 'v:d:' + d, AN_TTL], ['PFADD', 'vu:d:' + d, vh], ['EXPIRE', 'vu:d:' + d, AN_TTL], ['PFADD', 'vu:all', vh],
        ['ZINCRBY', 'g:cc', '1', cc], ['ZINCRBY', 'g:cc:' + d, '1', cc], ['EXPIRE', 'g:cc:' + d, AN_TTL], ['ZINCRBY', 'g:dev', '1', dev], ['ZINCRBY', 'g:ref', '1', ref]);
      if (ck) { cmds.push(['ZINCRBY', 'g:city', '1', ck]); if (isFinite(lat) && isFinite(lon)) cmds.push(['HSETNX', 'g:ll', ck, lat.toFixed(2) + ',' + lon.toFixed(2)]) }
    }
    const hk = 'an:h:' + sess.h;                                        // visit-level numbers belong to the hour the visit began
    if (view) {
      sess.n++; cmds.push(['HINCRBY', 'an:h:' + H, 'pv', '1'], ['PFADD', 'an:u:' + H, vh], ['EXPIRE', 'an:u:' + H, AN_TTL], ['EXPIRE', 'an:h:' + H, AN_TTL]);
      if (sess.n === 2) cmds.push(['HINCRBY', hk, 'nb', '1']);          // a second page: not a bounce
      if (path) cmds.push(['HINCRBY', 'an:h:' + H, 'p:' + path, '1']);
    }
    const gap = Math.min(Math.max(0, now - sess.last), 5 * 60e3);       // time on site, from one sign of life to the next (gaps over 5 minutes count as 5)
    if (gap > 0) cmds.push(['HINCRBY', hk, 'dms', String(gap)]);
    sess.last = now;
    cmds.push(['SET', sk, JSON.stringify(sess), 'EX', '1800'], ['EXPIRE', hk, AN_TTL], ['ZADD', 'an:active', String(now), vh]);
    await pipe(cmds);
    return { ok: true };
  },

  async anActive(req) { await owner(req); const now = Date.now(); const r = await pipe([['ZREMRANGEBYSCORE', 'an:active', '-inf', String(now - 5 * 60e3)], ['ZCARD', 'an:active']]); return { active: +r[1] || 0, at: now } },

  // the owner's report: totals for a range and the one before it, a trend in the buckets the page asks for, and breakdowns
  async analytics(req, b) {
    await owner(req);
    const from = Math.floor(+b.from / HOUR) * HOUR, to = Math.ceil(Math.min(+b.to, Date.now() + HOUR) / HOUR) * HOUR, len = to - from;
    if (!(len > 0) || len > 93 * 24 * HOUR) throw Object.assign(new Error('Please choose a range of up to 93 days.'), { code: 400 });
    const hrs = (a, z) => { const o = []; for (let t = a; t < z; t += HOUR) o.push(hourKey(t)); return o };
    const cur = hrs(from, to), prev = hrs(from - len, from);
    const buckets = (Array.isArray(b.buckets) ? b.buckets : []).slice(0, 120).map(x => [Math.max(from, Math.floor(+x[0] / HOUR) * HOUR), Math.min(to, Math.ceil(+x[1] / HOUR) * HOUR)]).filter(x => x[1] > x[0]);
    const days = []; for (let t = from - len; t < to; t += 24 * HOUR) days.push(hourKey(t).slice(0, 8)); days.push(hourKey(to).slice(0, 8));
    const now = Date.now();
    const cmds = cur.map(h => ['HGETALL', 'an:h:' + h]).concat(prev.map(h => ['HGETALL', 'an:h:' + h]));
    cmds.push(['PFCOUNT'].concat(cur.map(h => 'an:u:' + h)), ['PFCOUNT'].concat(prev.map(h => 'an:u:' + h)));
    buckets.forEach(x => cmds.push(['PFCOUNT'].concat(hrs(x[0], x[1]).map(h => 'an:u:' + h))));
    [...new Set(days)].forEach(d => cmds.push(['HGETALL', 'an:x:' + d]));
    cmds.push(['ZREMRANGEBYSCORE', 'an:active', '-inf', String(now - 5 * 60e3)], ['ZCARD', 'an:active'], ['GET', 'an:since'], ['SMEMBERS', 'an:ignore']);
    const r = await pipe(cmds); let i = 0;
    const curH = r.slice(i, i += cur.length), prevH = r.slice(i, i += prev.length), uv = +r[i++] || 0, puv = +r[i++] || 0, buv = r.slice(i, i += buckets.length), xs = r.slice(i, i += new Set(days).size);
    const active = +r[i + 1] || 0, since = +r[i + 2] || 0, ignore = r[i + 3] || [];
    const T = sumHashes(curH), P = sumHashes(prevH), X = sumHashes(xs), byHour = {}; cur.forEach((h, k) => { byHour[h] = sumHashes([curH[k]]) });
    const series = buckets.map((x, k) => { const t = sumHashes(hrs(x[0], x[1]).map(h => byHour[h] ? Object.keys(byHour[h]).reduce((a, f) => a.concat([f, byHour[h][f]]), []) : [])); return { t: x[0], end: x[1], uv: +buv[k] || 0, pv: t.pv || 0, ses: t.ses || 0 } });
    const refs = anTop(T, 'r:', 12).map(([src, visits]) => ({ src, visits, conv: T['cr:' + src] || 0, rate: visits ? Math.round(1000 * (T['cr:' + src] || 0) / visits) / 10 : 0 }));
    return { from, to, kpi: kpiOf(T, uv), prev: kpiOf(P, puv), series, refs, countries: anTop(T, 'c:', 12), devices: anTop(T, 'd:', 5), browsers: anTop(T, 'b:', 8), pages: anTop(T, 'p:', 10),
      active, since, excluded: { bots: X.bots || 0, internal: X.internal || 0 }, ignore, yourIp: ipOf(req) };
  },

  // networks (IP addresses) whose visits shouldn't count, e.g. home or studio wifi
  async anIgnore(req, b) {
    await owner(req); const ip = String(b.ip || '').trim();
    if (!/^[0-9a-f:.]{3,45}$/i.test(ip)) throw Object.assign(new Error('That doesn’t look like an IP address.'), { code: 400 });
    await db(b.remove ? 'SREM' : 'SADD', 'an:ignore', ip); return { ok: true, ignore: await db('SMEMBERS', 'an:ignore') };
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
    const u = { email, name, salt, hash: hashPw(pw, salt), created: Date.now(), points: 0, owned: [], welcomeUsed: false, news: !!b.news, newsAt: b.news ? Date.now() : undefined, newsWords: b.news ? CONSENT_WORDS : undefined };
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
      const ea = cat && (cat.arts || []).find(a => a.id === aid); if (isEarly(ea) && !u) throw err('This painting is for members only until ' + new Date(ea.early).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London' }) + ' (UK time). Join free or sign in to enquire now.', 403);
      title = titleOf(cat, aid);
    }
    const offer = Math.round(Math.max(0, Math.min(1e7, parseFloat(String(b.offer || '').replace(/[^0-9.]/g, '')) || 0)) * 100) / 100;
    const o = { id: id(), ts: Date.now(), kind, artId: aid, title, name, email, phone: clean(b.phone, 40), message: clean(b.message, 2000), member: !!u, offer,
      welcome: false, useCredit: false, status: 'new' };
    await pipe([['SET', 'o:' + o.id, JSON.stringify(o)], ['LPUSH', 'orders', o.id]].concat(u ? [['LPUSH', 'u:' + email + ':orders', o.id]] : []));
    const cur = cat && cat.site && cat.site.cur;
    await Promise.all([
      mail(ownerTo(cat), (offer ? 'New offer: ' + money(offer, cur) + ' for ' : 'New enquiry: ') + title, ['<b>' + esc(name) + '</b> (' + esc(email) + (o.phone ? ', ' + esc(o.phone) : '') + ')' + (u ? ' — a member' : '') + ' ' + (offer ? 'offered <b>' + money(offer, cur) + '</b> for' : 'enquired about') + ' <b>' + esc(title) + '</b>.', o.message ? '“' + esc(o.message) + '”' : '', 'Just reply to this email to answer them. Everything is also in your dashboard under “Enquiries & sales”.'], { url: SITE, label: 'Open your gallery' }, email),
      BUYER_MAIL && mail(email, 'Thank you for your enquiry — ' + title, ['Dear ' + esc(name.split(' ')[0]) + ',', 'Thank you for your interest in <b>' + esc(title) + '</b>' + (offer ? ' and your offer of <b>' + money(offer, cur) + '</b>' : '') + '. ' + replyLine(cat.site).replace('Pam replies personally', 'Pam has your enquiry and will reply personally').replace(' to every message', ''), 'With warm wishes,<br>Pam’s Gallery'], aid ? { url: SITE + '/#art-' + aid, label: 'See the painting again' } : null, ownerTo(cat))]);
    return { ok: true, id: o.id, mailed: BUYER_MAIL };
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
      BUYER_MAIL && mail(email, 'Your commission request — Pam’s Gallery', ['Dear ' + esc(name.split(' ')[0]) + ',', 'Thank you for asking Pam to paint something for you. She has your request and will be in touch personally to talk it through' + (buyOf(cat.site).reply ? ', usually within ' + buyOf(cat.site).reply : '') + '.', 'With warm wishes,<br>Pam’s Gallery'], null, ownerTo(cat))]);
    return { ok: true, id: o.id, mailed: BUYER_MAIL };
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
    return { ok: true, top: amt, n: +n || 1, mailed: BUYER_MAIL };
  },

  async sub(req, b) {
    await limit(req, 'sub', 10, 3600);
    if (isSpam(b, 900)) return { ok: true };
    const email = clean(b.email, 200).toLowerCase(); if (!okEmail(email)) throw err('Please enter a valid email address.', 400);
    if (!b.consent) throw err('Please tick the box to say you’d like these emails.', 400);
    const rec = { email, ts: Date.now(), words: CONSENT_WORDS, src: clean(b.src, 40) || 'site' };
    if (RESEND && MAIL_FROM) {          // double opt-in: nothing is sent until they confirm
      await db('SET', 'subp:' + email, JSON.stringify(rec), 'EX', String(14 * 86400));
      await mail(email, 'Please confirm: new work from Pam’s Gallery', ['Hello,', 'Please confirm that you’d like occasional emails about Pam’s new paintings and exhibitions. If you didn’t ask for this, just ignore this email and nothing more will be sent.'],
        { url: SITE + '/api/app?confirm=' + mailTok(email, 'sub'), label: 'Yes, keep me posted' });
      return { ok: true, confirm: true };
    }
    await pipe([['ZADD', 'subs', String(rec.ts), email], ['SET', 'subc:' + email, JSON.stringify(rec)]]);
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
      BUYER_MAIL && mail(email, 'Thank you for your message — Pam’s Gallery', ['Dear ' + esc(name.split(' ')[0]) + ',', 'Thank you for getting in touch. Pam has your message and will reply personally' + (buyOf(cat.site).reply ? ', usually within ' + buyOf(cat.site).reply : '') + '.', 'Your message:', '“' + esc(text).replace(/\n/g, '<br>') + '”'], { url: SITE, label: 'Back to the gallery' }, ownerTo(cat))]);
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
    if (st === 'completed' && !o.awarded && o.member) {           // a sale: record the piece for the collection reward (a signed print)
      const m = await user(o.email);
      if (m) {
        const amt = Math.max(0, Math.min(1e6, parseFloat(b.amount) || 0));
        if (o.kind !== 'print') m.owned = Array.from(new Set((m.owned || []).map(artId).concat([o.artId || artId(o.art || 0)])));
        if (o.welcome) m.welcomeUsed = true;
        await db('SET', 'u:' + m.email, JSON.stringify(m)); o.awarded = true; o.amount = amt;
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
    return { ok: true, id: o.id, mailed: BUYER_MAIL };
  },

  async dashMsg(req, b) {
    await owner(req);
    const m = J(await db('GET', 'm:' + clean(b.id, 40))); if (!m) throw err('Message not found.', 404);
    m.read = !!b.read; await db('SET', 'm:' + m.id, JSON.stringify(m)); return { ok: true };
  },

  // ---- the catalogue ----
  async catGet(req) { await owner(req); const cat = await getCat(); return { cat, pv: ownerPv(cat) } },
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
    const prev = J(await db('GET', 'cat'));
    await gateImages(prev, c);
    await pipe([['SET', 'cat', JSON.stringify(c)], ['LPUSH', 'cat:hist', JSON.stringify(c)], ['LTRIM', 'cat:hist', '0', '9']]);   // the last ten versions are kept, just in case
    let emailed = 0; try { emailed = await dropMail(prev, c) } catch (e) { console.error('drop', e.message) }
    return { ok: true, cat: c, emailed, pv: ownerPv(c) };
  },
  // a photo, already resized in the browser; kept in pieces small enough for the database
  async imgUpload(req, b) {
    await owner(req);
    const type = /^image\/(jpeg|png|webp)$/.test(b.type) ? b.type : 'image/jpeg', data = String(b.data || '').replace(/^data:[^,]*,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw err('That file doesn’t look like a photo.', 400);
    if (data.length > 3.6e6) throw err('That photo is too large — please try a smaller one.', 413);
    const key = crypto.randomBytes(16).toString('hex'), CH = 380000, n = Math.ceil(data.length / CH);
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
  if (meta.priv || (meta.until && meta.until > Date.now())) {
    const x = +(q && q.x) || 0, sig = String(q && q.sig || '');
    if (!x || x < Date.now() || sig.length !== 32 || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(imgSig(key, x)))) { res.setHeader('Cache-Control', 'no-store'); res.status(404).end(); return }
  }
  const parts = await Promise.all(Array.from({ length: meta.n }, (_, i) => db('GET', 'img:' + key + ':' + i)));   // one piece per request keeps each reply small
  const buf = Buffer.from(parts.join(''), 'base64');
  res.setHeader('Content-Type', meta.type); res.setHeader('Cache-Control', meta.priv || (meta.until && meta.until > Date.now()) ? 'private, no-store' : 'public, max-age=31536000, s-maxage=31536000, immutable');
  res.status(200).end(buf);
}

// ---------- public pages that work without JavaScript: one page per painting, the plain gallery, the sitemap ----------
// They are made on the server from Pam's live catalogue, so search engines and link previews see real content, and anyone on
// a slow connection, an older phone or with JavaScript off can still browse, read every detail and enquire.
const FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Jost:wght@300;400;500&display=optional';
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
  const cat = publicCat(await getCat());
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
const PERKS_DEF = 'Early access to new paintings and collections, before they’re released to everyone · A signed print when you complete a collection';
function windowText(cat) { const h = cat && cat.site && cat.site.earlyHours; return !h ? 'a little while' : h <= 48 || h % 24 ? h + ' hours' : h === 168 ? 'a full week' : h / 24 + ' days' }
function perksBox(cat) {
  const items = textOf(cat, 'members.perks', PERKS_DEF).split(/\s*·\s*/).filter(Boolean);
  return '<aside class="perks" aria-labelledby="pkh"><p class="kick" id="pkh">The collectors’ circle · free to join</p><ul>' + items.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul><p><a class="btn" href="/#join">Join free</a> <a href="/#signin" class="small">Already a member? Sign in</a></p></aside>';
}
function earlyWhen(t) { return new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }) }
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
.kick{font-size:.74rem;letter-spacing:.2em;text-transform:uppercase;color:#80612c;margin:0 0 .6rem}
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
.hp{position:absolute!important;left:-10000px!important;width:1px;height:1px;overflow:hidden}picture{display:contents}
.perks{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.3rem 1.5rem;margin:0 0 2.5rem}.perks ul{margin:.2rem 0 1rem;padding-left:1.1rem}.perks li{margin:.25rem 0}
.ph.early{position:relative;overflow:hidden}.ph.early img{width:78%;height:auto;filter:blur(6px) saturate(1.05);box-shadow:0 10px 24px rgba(30,18,12,.25),0 0 0 6px #c9a35e}.ph.early::after{content:'';position:absolute;inset:0;background:radial-gradient(circle,rgba(250,247,241,0) 30%,rgba(250,247,241,.35))}
.ribbon{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;background:rgba(42,28,20,.86);color:#f7f1e8;border-radius:99px;padding:.45rem .9rem;font-size:.78rem;letter-spacing:.08em;white-space:nowrap}
.art figure.early{position:relative;overflow:hidden}.art figure.early img{width:min(100%,480px);height:auto;filter:blur(8px) saturate(1.05);box-shadow:0 12px 30px rgba(30,18,12,.25),0 0 0 8px #c9a35e}
.badge{font-family:Jost,system-ui,sans-serif}
footer.foot{border-top:1px solid var(--line);padding:2.4rem 0 3rem;color:var(--muted);font-size:.9rem}footer.foot .wrap{display:flex;flex-wrap:wrap;gap:1rem 2rem;justify-content:space-between}
img{-webkit-touch-callout:none;-webkit-user-drag:none;user-select:none}
header.top .wrap{padding-top:.55rem;padding-bottom:.55rem}
@media (max-width:820px){.art{grid-template-columns:1fr}form.f{grid-template-columns:1fr}}
@media (max-width:640px){header.top{position:static}nav.links{gap:.35rem 1rem;font-size:.9rem}.brand{font-size:1.4rem}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
` + Object.keys(RING).map(k => '.fr-' + k + '{box-shadow:0 10px 24px rgba(30,18,12,.28),' + RING[k] + '}').join('');

// a little script: turns the written-out email into a link, and asks before anyone saves a painting (the page works without it)
const PAGE_JS = "(function(){try{if(navigator.webdriver||localStorage.getItem('pgNoTrack')==='1')return;var r='';try{r=document.referrer?new URL(document.referrer).hostname:''}catch(e){}if(r===location.hostname)r='';var u=new URLSearchParams(location.search).get('utm_source')||'',d=JSON.stringify({a:'hit',ev:'view',p:location.pathname,r:r,u:u});if(!(navigator.sendBeacon&&navigator.sendBeacon('/api/app',new Blob([d],{type:'text/plain'}))))fetch('/api/app',{method:'POST',body:d,keepalive:true})}catch(e){}})();" +
  "(function(){function f(){document.querySelectorAll('[data-count]').forEach(function(e){var d=+e.getAttribute('data-count')-Date.now();if(d<=0){e.textContent='a moment — refresh to see it';return}var h=Math.floor(d/36e5),m=Math.floor(d%36e5/6e4);e.textContent=h>=48?Math.round(h/24)+' days':h?h+'h '+m+'m':m+' minutes'})}f();setInterval(f,30000)})();" +
  "document.querySelectorAll('[data-u]').forEach(function(e){var a=document.createElement('a'),m=e.getAttribute('data-u')+'@'+e.getAttribute('data-d');a.href='mailto:'+m;a.textContent=m;e.replaceWith(a)});" +
  "document.addEventListener('contextmenu',function(e){if(e.target.tagName==='IMG'){e.preventDefault();var n=document.getElementById('protN');if(n){n.hidden=false;clearTimeout(window.__pt);window.__pt=setTimeout(function(){n.hidden=true},4500)}}});";
const PAGE_JS_HASH = "'sha256-" + crypto.createHash('sha256').update(PAGE_JS).digest('base64') + "'";
// the gallery's own pictures also come as smaller WebP files; browsers that can't use them take the JPEG
const webp = u => /^\/lib\/[\w-]+\.jpg$/.test(u || '') ? u.replace(/\.jpg$/, '.webp') : '';
function pic(img, u, set, sizes) { const w = webp(u); return w ? '<picture><source type="image/webp" srcset="' + esc(set ? set(webp) : w) + '"' + (sizes ? ' sizes="' + sizes + '"' : '') + '>' + img + '</picture>' : img }
function shell(o) {
  const ogImg = o.img ? SITE + o.img : '';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src ' + PAGE_JS_HASH + '; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src \'self\' data:; form-action \'self\'; base-uri \'self\'; object-src \'none\'">' +
    '<title>' + esc(o.title) + '</title><meta name="description" content="' + esc(o.desc) + '"><link rel="canonical" href="' + esc(o.canon) + '">' +
    '<meta name="robots" content="' + (o.noindex ? 'noindex' : 'index, follow, max-image-preview:large') + '"><meta name="theme-color" content="#faf7f1">' +
    '<meta property="og:site_name" content="Pam’s Gallery"><meta property="og:type" content="' + (o.ogType || 'website') + '"><meta property="og:title" content="' + esc(o.ogTitle || o.title) + '"><meta property="og:description" content="' + esc(o.desc) + '"><meta property="og:url" content="' + esc(o.canon) + '">' +
    (ogImg ? '<meta property="og:image" content="' + esc(ogImg) + '"><meta property="og:image:alt" content="' + esc(o.imgAlt || o.title) + '">' : '') +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(o.ogTitle || o.title) + '"><meta name="twitter:description" content="' + esc(o.desc) + '">' + (ogImg ? '<meta name="twitter:image" content="' + esc(ogImg) + '">' : '') +
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#faf7f1"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="' + FONTS + '" rel="stylesheet">' +
    '<style>' + PAGE_CSS + '</style>' + (o.ld ? '<script type="application/ld+json">' + JSON.stringify(o.ld).replace(/</g, '\\u003c') + '</script>' : '') + '</head><body>' +
    '<a class="skip" href="#main">Skip to the content</a><header class="top"><div class="wrap"><a class="brand" href="/">Pam’s Gallery</a><nav class="links" aria-label="Main">' +
    '<a href="/works"' + (o.here === 'works' ? ' aria-current="page"' : '') + '>All works</a><a href="/">3D gallery</a><a href="/#commission">Commissions</a><a href="/#buying">Buying with confidence</a><a href="/works#contact">Contact</a></nav></div></header>' +
    '<main id="main" class="wrap">' + o.body + '</main>' +
    '<p id="protN" class="note" role="status" hidden style="position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#2a1c14;color:#f7f1e8;max-width:92vw;z-index:9">Pam’s artwork is protected by copyright. For a print or permission to use an image, just ask.</p>' +
    '<footer class="foot"><div class="wrap"><span>© Pam’s Gallery · Original paintings by Pam</span><span>Email: ' + o.email + '</span><span><a href="/works">All works</a> · <a href="/">The 3D gallery</a> · <a href="/#buying">Buying with confidence</a> · <a href="/privacy">Privacy</a></span></div></footer>' +
    '<script>' + PAGE_JS + '</script></body></html>';
}
function emailSpan(addr) { const i = addr.indexOf('@'); return '<span data-u="' + esc(addr.slice(0, i)) + '" data-d="' + esc(addr.slice(i + 1)) + '">' + esc(addr.slice(0, i)) + ' [at] ' + esc(addr.slice(i + 1)) + '</span>' }
function card(a, slug, cur, eager) {
  const im = imgsOf(a), W = 600, H = Math.round(W * (a.h || .7) / (a.w || .5)), st = a.status || 'Available';
  if (a.ea) return '<li><a href="/art/' + slug + '"><span class="ph early">' + (im.tn ? '<img src="' + esc(im.tn) + '" alt="A blurred preview of a new painting for members" width="' + W + '" height="' + H + '" loading="lazy" decoding="async">' : '') + '<span class="ribbon">Members see this first</span></span>' +
    '<span class="t">' + esc(a.t) + '</span><span class="m">' + esc(a.m || 'New work') + '</span><span class="pr">Public from <span data-until="' + a.ea + '">' + esc(earlyWhen(a.ea)) + '</span></span></a></li>';
  return '<li><a href="/art/' + slug + '"><span class="ph">' + pic('<img src="' + esc(im.tn) + '" alt="' + esc(altOf(a)) + '" width="' + W + '" height="' + H + '"' + (eager ? '' : ' loading="lazy"') + ' decoding="async" class="fr-' + frameKey(a) + '">', im.tn) + '</span>' +
    '<span class="t">' + esc(a.t) + '</span><span class="m">' + esc([a.m, a.s].filter(Boolean).join(' · ') || 'Original artwork') + '</span>' +
    '<span class="pr">' + esc(priceOfA(a, 0, cur)) + (st === 'Sold' ? '' : ' <span class="badge' + (st === 'On hold' ? ' hold' : '') + '">' + esc(st) + '</span>') + '</span></a></li>';
}
function notice(q, site) {
  const rl = buyOf(site).reply ? ', usually within ' + buyOf(site).reply : '';
  if (q.sent === 'order') return '<p class="note ok" role="status">Thank you — Pam has your enquiry and will reply to you personally' + rl + '. Nothing is charged until you’ve agreed the price and delivery.</p>';
  if (q.sent === 'message') return '<p class="note ok" role="status">Thank you — Pam has your message and will reply personally' + rl + '.</p>';
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
    '<p class="small wide">' + esc(replyLine(site)) + ' Nothing is charged until you’ve agreed the price and delivery. Your details are only used to answer you — nothing is shared.</p>' +
    '<div class="wide"><button class="btn main" type="submit">' + (sold ? 'Send message' : 'Send enquiry') + '</button></div></form>' + notice(q, site);
}
async function artPage(q, res) {
  const { cat, arts } = await pubArts(), { used, by } = slugMap(arts), cur = cat && cat.site && cat.site.cur || 'GBP', site = cat && cat.site || {};
  let a = used[String(q.slug || '')];
  if (!a) { const byId = arts.find(x => x.id === String(q.slug || '')); if (byId) { res.setHeader('Location', '/art/' + by[byId.id]); res.status(301).end(); return } return notFound(res) }
  const slug = by[a.id], url = SITE + '/art/' + slug, im = imgsOf(a), coll = (cat && cat.colls || []).find(c => c.works.indexOf(a.id) >= 0);
  if (a.ea) {
    const body = '<nav class="crumbs" aria-label="Breadcrumb"><a href="/works">All works</a></nav><article class="art"><figure class="early">' + (im.mid ? '<img src="' + esc(im.mid) + '" width="480" height="' + Math.round(480 * (a.h || .7) / (a.w || .5)) + '" alt="A blurred preview of ' + esc(a.t) + ', a new painting shown to members first">' : '') + '<span class="ribbon">Members see this first</span></figure>' +
      '<div class="info"><p class="kick">Members’ early access</p><h1>' + esc(a.t) + '</h1><p class="by">A new ' + kindOf(a) + ' by Pam' + (a.m ? ' · ' + esc(a.m) : '') + '</p>' +
      '<p class="price">Opens to everyone in <span class="cd" data-count="' + a.ea + '">' + esc(earlyWhen(a.ea)) + '</span></p>' +
      '<p class="desc">' + esc(textOf(cat, 'members.early', 'When Pam finishes something new, members see it first. For {window} it’s shown only to members, who can enquire about it or bid on it before it’s released to everyone. Joining is free.').replace('{window}', windowText(cat))) + '</p>' +
      '<p class="actions"><a class="btn main" href="/#join">Join free to see it now</a><a class="btn" href="/#art-' + esc(a.id) + '">Members: sign in to view</a></p><p class="trust">Public from ' + esc(earlyWhen(a.ea)) + ' (UK time).</p></div></article>' + perksBox(cat);
    html(res, shell({ title: a.t + ' — members see it first | Pam’s Gallery', desc: 'A new ' + kindOf(a) + ' by Pam, shown to members first. Join free to see it now.', canon: url, noindex: true, img: '', body, email: emailSpan(contactEmail(cat)) }), true);
    return;
  }
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
    '<article class="art"><figure>' + pic('<img src="' + esc(im.mid) + '" srcset="' + esc(im.tn) + ' 720w, ' + esc(im.mid) + ' 1280w" sizes="(min-width: 820px) 52vw, 90vw" alt="' + esc(alt) + '" class="fr-' + frameKey(a) + '" fetchpriority="high" decoding="async">', im.mid, w => w(im.tn) + ' 720w, ' + w(im.mid) + ' 1280w', '(min-width: 820px) 52vw, 90vw') + '</figure>' +
    '<div class="info">' + (coll ? '<p class="kick">' + esc(coll.t) + '</p>' : '<p class="kick">Original ' + kind + '</p>') + '<h1>' + esc(a.t) + '</h1><p class="by">An original ' + kind + ' by Pam</p>' +
    '<p class="price">' + esc(price) + (st === 'Sold' ? '' : ' <span class="badge' + (st === 'On hold' ? ' hold' : '') + '">' + esc(st) + '</span>') + '</p>' +
    '<dl class="facts">' + facts.map(f => '<dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd>').join('') + '</dl>' + (a.d ? '<p class="desc">' + esc(a.d) + '</p>' : '') +
    '<p class="actions">' + (st === 'Sold' ? '<a class="btn main" href="#enquire">Ask about similar work</a>' : a.mode === 'auction' ? '<a class="btn main" href="/#art-' + esc(a.id) + '">Place a bid in the gallery</a><a class="btn" href="#enquire">Ask a question</a>' : '<a class="btn main" href="#enquire">Enquire to buy</a>') +
    '<a class="btn" href="/#art-' + esc(a.id) + '">See it in the 3D gallery</a></p>' +
    '<p class="trust">' + esc(textOf(cat, 'trust.line', trustLine(cat && cat.site))) + '. <a href="/#buying">Buying with confidence</a></p></div></article>' +
    '<section id="enquire" class="enquire" aria-labelledby="eqh"><h2 id="eqh">' + (st === 'Sold' ? 'Ask Pam about similar work' : 'Ask Pam about “' + esc(a.t) + '”') + '</h2>' + enquiryForm(a, '/art/' + slug, q, site) + '</section>' +
    perksBox(cat) + (more.length ? '<section class="coll" aria-labelledby="mh"><h2 id="mh">' + (coll ? 'More from ' + esc(coll.t) : 'More works') + '</h2><ul class="grid">' + more.map(x => card(x, by[x.id], cur)).join('') + '</ul></section>' : '');
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
  const body = '<section class="intro"><p class="kick">The collection</p><h1>All works</h1><p class="lede">Original paintings and drawings by Pam — every one a single original' + (buyOf(cat && cat.site).cert === 'yes' ? ' with a certificate of authenticity' : '') + '. Tap any work for its size, price and story, or to ask Pam about it.</p>' +
    '<div class="btns"><a class="btn main" href="/">Walk through the 3D gallery</a><a class="btn" href="#contact">Contact Pam</a></div></section>' + secs.map(sec).join('') + perksBox(cat) +
    '<section id="contact" class="contact" aria-labelledby="ch"><h2 id="ch">Contact Pam</h2><p class="lede">For questions, viewings, commissions or press, write to ' + emailSpan(email) + ' or send a message here.</p>' +
    '<form class="f" method="post" action="/api/app"><input type="hidden" name="a" value="message"><input type="hidden" name="form" value="1"><input type="hidden" name="back" value="/works"><input type="hidden" name="ts" value="' + formTs() + '">' +
    '<label>Your name<input name="name" required maxlength="80" autocomplete="name"></label><label>Email<input type="email" name="email" required maxlength="200" autocomplete="email"></label>' +
    '<label class="wide">Message<textarea name="message" required maxlength="3000"></textarea></label><label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>' +
    '<p class="small wide">' + esc(replyLine(cat && cat.site)) + ' Your details are only used to answer you.</p><div class="wide"><button class="btn main" type="submit">Send message</button></div></form>' + notice(q, cat && cat.site) + '</section>';
  html(res, shell({ title: 'All works — original paintings by Pam | Pam’s Gallery', desc: 'Browse every original painting and drawing by Pam, with sizes, prices and availability, and enquire to buy.', canon: SITE + '/works', img: first, ld, body, here: 'works', email: emailSpan(email) }), q.sent || q.err);
}
async function confirmSub(t, res) {
  const email = mailTokOk(t, 'sub'); let ok = false;
  if (email) { const rec = J(await db('GET', 'subp:' + email)) || { email, ts: Date.now(), words: CONSENT_WORDS, src: 'site' }; rec.confirmed = Date.now(); await pipe([['ZADD', 'subs', String(Date.now()), email], ['SET', 'subc:' + email, JSON.stringify(rec)], ['DEL', 'subp:' + email]]); ok = true }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  res.status(ok ? 200 : 400).end(shell({ title: ok ? 'You’re on the list | Pam’s Gallery' : 'That link didn’t work | Pam’s Gallery', desc: 'Email updates from Pam’s Gallery.', canon: SITE + '/', noindex: true, email: emailSpan(OWNER),
    body: '<section class="intro"><p class="kick">Email updates</p><h1>' + (ok ? 'Thank you — you’re on the list' : 'That link didn’t work') + '</h1><p class="lede">' + (ok ? 'You’ll hear about Pam’s new paintings and exhibitions now and then. Every email has a one-click unsubscribe link.' : 'It may have been copied incompletely. Please sign up again from the gallery.') + '</p><div class="btns"><a class="btn main" href="/works">See the paintings</a></div></section>' }));
}
async function unsubPage(t, res) {
  const email = mailTokOk(t, 'unsub');
  if (email) { const u = J(await db('GET', 'u:' + email)); const cmds = [['ZREM', 'subs', email], ['DEL', 'subc:' + email]]; if (u && u.news) { u.news = false; cmds.push(['SET', 'u:' + email, JSON.stringify(u)]) } await pipe(cmds) }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  res.status(email ? 200 : 400).end(shell({ title: 'Unsubscribed | Pam’s Gallery', desc: 'Email updates from Pam’s Gallery.', canon: SITE + '/', noindex: true, email: emailSpan(OWNER),
    body: '<section class="intro"><p class="kick">Email updates</p><h1>' + (email ? 'You’ve been unsubscribed' : 'That link didn’t work') + '</h1><p class="lede">' + (email ? 'You won’t receive any more emails about new work. If you have an account, it stays just as it was. Changed your mind? You can sign up again from the gallery at any time.' : 'Please email Pam and she’ll remove you straight away.') + '</p><div class="btns"><a class="btn main" href="/works">Back to the paintings</a></div></section>' }));
}
async function privacyPage(res) {
  const cat = await getCat(), email = contactEmail(cat);
  const P = (h, t) => '<h2 style="font-size:1.6rem;margin-top:2rem">' + h + '</h2><p class="desc">' + t + '</p>';
  html(res, shell({ title: 'Privacy | Pam’s Gallery', desc: 'How Pam’s Gallery looks after your personal information.', canon: SITE + '/privacy', email: emailSpan(email),
    body: '<section class="intro" style="max-width:760px"><p class="kick">Privacy</p><h1>Your information</h1><p class="lede">Pam’s Gallery is run by Pam, an independent artist in the UK, who is responsible for the information you share here. If you have any questions, email ' + emailSpan(email) + '.</p>' +
      P('What is collected, and why', 'When you enquire, make an offer, bid, send a message or request a commission, your name, email address, any phone number and what you write are kept so Pam can reply and arrange a sale. If you create an account, your name, email and a securely scrambled version of your password are kept, along with the paintings you’ve bought, so a completed collection can be rewarded. Reference photos sent with a commission request are private and only Pam can open them.') +
      P('Email updates', 'If you sign up for news of new work and exhibitions (or tick the box when creating an account), your email address and the date and wording of your consent are kept. You’ll only get those emails because you asked for them, and every one has a one-click unsubscribe link. Members who opt in also hear when new work opens early for members.') +
      P('Visits', 'The site counts visits without cookies and without storing anything on your device. It notes, as totals, the rough area a visit comes from (country and town, worked out by the hosting service), the website that sent you, your type of device and browser, and how long the visit lasted, so Pam can see where interest comes from. To tell one visit from the next, it uses a scrambled code made from your connection and browser that can’t be turned back into either, kept for no longer than 30 minutes. No advertising or tracking cookies are used, and nothing identifies you personally.') +
      P('Who else is involved', 'The site is hosted by Vercel and its data is stored with Upstash. Emails are sent by Resend, and card payments, if you choose to pay by card, are handled by Stripe. They process information only to provide those services. Your details are never sold or shared for marketing.') +
      P('How long it is kept, and your rights', 'Enquiries and messages are kept for as long as they’re needed to look after your purchase and for records, and account details until you ask for your account to be deleted. You can ask to see, correct or delete your information, or withdraw consent, at any time by emailing Pam. You also have the right to complain to the Information Commissioner’s Office (ico.org.uk).') + '</section>' }));
}
async function sitemap(res) {
  const { cat, arts } = await pubArts(), { by } = slugMap(arts), d = new Date(cat && cat.v || Date.now()).toISOString().slice(0, 10);
  const u = (p, pr) => '<url><loc>' + SITE + p + '</loc><lastmod>' + d + '</lastmod><priority>' + pr + '</priority></url>';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
  res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + u('/', '1.0') + u('/works', '0.9') + arts.filter(a => !a.ea).map(a => u('/art/' + by[a.id], '0.8')).join('') + u('/privacy', '0.2') + '</urlset>');
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
      if (q.cat) { res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=30'); res.status(200).json({ cat: publicCat(await getCat()), cfg: { google: GOOGLE_ID, pay: !!STRIPE, mail: BUYER_MAIL } }); return }
      if (q.confirm) { await confirmSub(String(q.confirm), res); return }
      if (q.unsub) { await unsubPage(String(q.unsub), res); return }
      if (q.page === 'privacy') { await privacyPage(res); return }
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
    const out = await fn(req, b);
    if (out && out.ok && /^(order|bid|message|commission|sub|signup)$/.test(b.a)) await anConvert(req);
    res.status(200).json(out);
  } catch (e) {
    const code = e.code && e.code >= 400 && e.code < 600 ? e.code : 500, q = req.query || {};
    if (code === 500 && (req.method === 'GET' || req.method === 'HEAD') && (q.page || q.s || q.confirm || q.unsub)) {   // a page, not the app: a friendly page rather than an error code
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Retry-After', '60');
      res.status(503).end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Back in a moment | Pam’s Gallery</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">' +
        '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf7f1;color:#2a1c14;font:300 17px/1.6 system-ui,-apple-system,sans-serif;padding:24px 16px}main{max-width:520px;text-align:center}h1{font:italic 400 2.2rem/1.2 Georgia,serif;margin:0 0 .8rem}p{color:#5a4a3f}a{color:#80612c}</style></head>' +
        '<body><main><h1>Back in a moment</h1><p>This page couldn’t be loaded just now. Please try again in a minute — or <a href="/">walk through the gallery</a>.</p><p>You can always email Pam at ' + esc(OWNER).replace('@', ' [at] ') + '.</p></main></body></html>');
      console.error(e); return;
    }
    res.status(code).json({ error: code === 500 ? 'Something went wrong — please try again.' : e.message });
    if (code === 500) console.error(e);
  }
};
