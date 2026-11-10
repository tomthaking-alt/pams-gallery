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
function notFound(res) { res.setHeader('Location', '/404'); res.status(302).end() }
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
