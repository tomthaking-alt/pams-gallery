// Pam's Gallery: members, rewards, buy requests, messages, visit counts and the owner dashboard.
// One Vercel function; data lives in Upstash Redis (Vercel Marketplace), reached over its REST API.
const crypto = require('crypto');

const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const OWNER = 'pts98@hotmail.co.uk';
const SECRET = crypto.createHash('sha256').update('pams-gallery-session|' + (DB_TOKEN || '')).digest();

// ---- rewards (easy to change) ----
const WELCOME = { pct: 5, text: '5% off your first painting' };
const POINTS = { per: 1, every: 500, worth: 50, text: '1 point for every £1 spent · every 500 points = £50 off' };
const ARTS = ['Orchid in the Clouds', 'Violet Garden', 'Three Masks in Blue', 'Three Masks in Green', 'The Messenger', 'White Bloom over Ember'];
const SETS = [
  { name: 'The Masks', arts: [2, 3], reward: 'a signed print of your choice' },
  { name: 'The Flower Spirits', arts: [0, 4, 5], reward: 'a signed print of your choice' }
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

async function limit(req, key, max, secs) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || 'x').split(',')[0].trim();
  const k = 'rl:' + key + ':' + ip; const n = await db('INCR', k); if (n === 1) await db('EXPIRE', k, String(secs));
  if (n > max) { const e = new Error('Too many attempts — please try again a little later.'); e.code = 429; throw e }
}

function rewards(u) {
  const owned = u.owned || [];
  return {
    welcome: { text: WELCOME.text, available: !u.welcomeUsed },
    points: { balance: u.points || 0, text: POINTS.text, every: POINTS.every, worth: POINTS.worth, credit: Math.floor((u.points || 0) / POINTS.every) * POINTS.worth },
    sets: SETS.map(s => ({ name: s.name, reward: s.reward, pieces: s.arts.map(a => ({ title: ARTS[a], owned: owned.indexOf(a) >= 0 })), complete: s.arts.every(a => owned.indexOf(a) >= 0) }))
  };
}
function profile(u) { return { name: u.name, email: u.email, joined: u.created, owner: u.email === OWNER, rewards: rewards(u) } }
async function user(email) { return J(await db('GET', 'u:' + email)) }
async function auth(req) { const e = verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')); if (!e) return null; return await user(e) }

const actions = {
  async health() { return { ok: true, db: !!(DB_URL && DB_TOKEN) } },

  async visit(req, b) {
    const vid = clean(b.vid, 40) || 'anon', d = day();
    await pipe([['INCR', 'v:total'], ['INCR', 'v:d:' + d], ['EXPIRE', 'v:d:' + d, String(400 * 86400)], ['PFADD', 'vu:d:' + d, vid], ['EXPIRE', 'vu:d:' + d, String(400 * 86400)], ['PFADD', 'vu:all', vid]]);
    return { ok: true };
  },

  async signup(req, b) {
    await limit(req, 'signup', 8, 3600);
    const email = clean(b.email, 200).toLowerCase(), name = clean(b.name, 80), pw = String(b.password || '');
    if (!name) throw Object.assign(new Error('Please tell us your name.'), { code: 400 });
    if (!okEmail(email)) throw Object.assign(new Error('Please enter a valid email address.'), { code: 400 });
    if (pw.length < 8 || pw.length > 200) throw Object.assign(new Error('Please choose a password of at least 8 characters.'), { code: 400 });
    if (!b.consent) throw Object.assign(new Error('Please agree to the privacy note to create an account.'), { code: 400 });
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { email, name, salt, hash: hashPw(pw, salt), created: Date.now(), points: 0, owned: [], welcomeUsed: false, news: !!b.news };
    const set = await db('SET', 'u:' + email, JSON.stringify(u), 'NX');
    if (set !== 'OK') throw Object.assign(new Error('There is already an account with that email — please sign in.'), { code: 409 });
    await db('ZADD', 'members', String(u.created), email);
    return { token: sign(email), me: profile(u) };
  },

  async login(req, b) {
    await limit(req, 'login', 15, 900);
    const email = clean(b.email, 200).toLowerCase(), pw = String(b.password || '');
    const u = await user(email);
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) throw Object.assign(new Error('That email and password don’t match.'), { code: 401 });
    return { token: sign(email), me: profile(u) };
  },

  async me(req) {
    const u = await auth(req); if (!u) throw Object.assign(new Error('Please sign in again.'), { code: 401 });
    const ids = await db('LRANGE', 'u:' + u.email + ':orders', '0', '49');
    const orders = (await pipe(ids.map(i => ['GET', 'o:' + i]))).map(J).filter(Boolean).map(o => ({ id: o.id, ts: o.ts, title: o.title, status: o.status }));
    return { me: profile(u), orders };
  },

  async order(req, b) {
    await limit(req, 'order', 10, 3600);
    const u = await auth(req), art = Math.max(0, Math.min(ARTS.length - 1, parseInt(b.art, 10) || 0));
    const name = u ? u.name : clean(b.name, 80), email = u ? u.email : clean(b.email, 200).toLowerCase();
    if (!name || !okEmail(email)) throw Object.assign(new Error('Please add your name and a valid email so Pam can reply.'), { code: 400 });
    const o = { id: id(), ts: Date.now(), art, title: ARTS[art], name, email, phone: clean(b.phone, 40), message: clean(b.message, 2000), member: !!u,
      welcome: !!(u && !u.welcomeUsed), useCredit: !!(u && b.useCredit && rewards(u).points.credit > 0), status: 'new' };
    await pipe([['SET', 'o:' + o.id, JSON.stringify(o)], ['LPUSH', 'orders', o.id]].concat(u ? [['LPUSH', 'u:' + email + ':orders', o.id]] : []));
    return { ok: true, id: o.id };
  },

  async message(req, b) {
    await limit(req, 'msg', 10, 3600);
    const u = await auth(req), name = u ? u.name : clean(b.name, 80), email = u ? u.email : clean(b.email, 200).toLowerCase(), text = clean(b.message, 3000);
    if (!name || !okEmail(email)) throw Object.assign(new Error('Please add your name and a valid email so Pam can reply.'), { code: 400 });
    if (text.length < 2) throw Object.assign(new Error('Please write a message.'), { code: 400 });
    const m = { id: id(), ts: Date.now(), name, email, message: text, member: !!u, read: false };
    await pipe([['SET', 'm:' + m.id, JSON.stringify(m)], ['LPUSH', 'msgs', m.id]]);
    return { ok: true };
  },

  async dash(req) {
    const u = await auth(req); if (!u || u.email !== OWNER) throw Object.assign(new Error('Owner only.'), { code: 403 });
    const days = []; for (let i = 13; i >= 0; i--) days.push(day(Date.now() - i * 864e5));
    const res = await pipe([['GET', 'v:total'], ['PFCOUNT', 'vu:all'], ['ZCARD', 'members'], ['LRANGE', 'orders', '0', '199'], ['LRANGE', 'msgs', '0', '199'], ['ZREVRANGE', 'members', '0', '299']]
      .concat(days.map(d => ['GET', 'v:d:' + d])).concat(days.map(d => ['PFCOUNT', 'vu:d:' + d])));
    const [total, uniq, nMembers, oids, mids, emails] = res, vis = res.slice(6, 20).map(x => +x || 0), uv = res.slice(20, 34).map(x => +x || 0);
    const more = await pipe(oids.map(i => ['GET', 'o:' + i]).concat(mids.map(i => ['GET', 'm:' + i])).concat(emails.map(e => ['GET', 'u:' + e])));
    const orders = more.slice(0, oids.length).map(J).filter(Boolean), msgs = more.slice(oids.length, oids.length + mids.length).map(J).filter(Boolean),
      members = more.slice(oids.length + mids.length).map(J).filter(Boolean).map(m => ({ name: m.name, email: m.email, joined: m.created, points: m.points || 0, owned: (m.owned || []).map(a => ARTS[a]), news: !!m.news }));
    return { visits: { total: +total || 0, unique: +uniq || 0, days, perDay: vis, uniquePerDay: uv }, members: { count: +nMembers || 0, list: members }, orders, msgs };
  },

  async dashOrder(req, b) {
    const u = await auth(req); if (!u || u.email !== OWNER) throw Object.assign(new Error('Owner only.'), { code: 403 });
    const o = J(await db('GET', 'o:' + clean(b.id, 40))); if (!o) throw Object.assign(new Error('Order not found.'), { code: 404 });
    const st = ['new', 'contacted', 'completed', 'cancelled'].indexOf(b.status) >= 0 ? b.status : o.status;
    if (st === 'completed' && !o.awarded && o.member) {           // a sale: award points, record the piece for set completion, use up the welcome gift
      const m = await user(o.email);
      if (m) {
        const amt = Math.max(0, Math.min(1e6, parseFloat(b.amount) || 0)), spent = Math.max(0, Math.min(m.points || 0, parseInt(b.pointsUsed, 10) || 0));
        m.points = (m.points || 0) - spent + Math.floor(amt * POINTS.per); m.owned = Array.from(new Set((m.owned || []).concat([o.art])));
        if (o.welcome) m.welcomeUsed = true;
        await db('SET', 'u:' + m.email, JSON.stringify(m)); o.awarded = true; o.amount = amt; o.pointsUsed = spent;
      }
    }
    o.status = st; o.note = clean(b.note != null ? b.note : o.note, 500);
    await db('SET', 'o:' + o.id, JSON.stringify(o));
    return { ok: true, order: o };
  },

  async dashMsg(req, b) {
    const u = await auth(req); if (!u || u.email !== OWNER) throw Object.assign(new Error('Owner only.'), { code: 403 });
    const m = J(await db('GET', 'm:' + clean(b.id, 40))); if (!m) throw Object.assign(new Error('Message not found.'), { code: 404 });
    m.read = !!b.read; await db('SET', 'm:' + m.id, JSON.stringify(m)); return { ok: true };
  }
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
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
