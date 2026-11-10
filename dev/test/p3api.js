// Phase 3 server checks: members' early access, the new-work sign-up, privacy page
const B='http://localhost:8794',U=B+'/api/app';
async function P(b,tok){const r=await fetch(U,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));j._s=r.status;return j}
async function G(u){const r=await fetch(B+u,{redirect:'manual'});return {s:r.status,t:await r.text().catch(()=>''),h:r.headers}}
function ok(c,m){console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1}
const fs=require('fs');
(async()=>{
 const OT=(await P({a:'login',email:'pts98@hotmail.co.uk',password:'testpass123'})).token, BT=(await P({a:'login',email:'bob@example.com',password:'bobpass123'})).token;
 ok(OT&&BT,'signed in as owner and member');
 const px='data:image/jpeg;base64,'+fs.readFileSync(require('path').join(__dirname,'fixtures')+'/wm_p7.jpg').toString('base64');
 const img=(await P({a:'imgUpload',data:px,type:'image/jpeg'},OT)).url, tz=(await P({a:'imgUpload',data:px,type:'image/jpeg'},OT)).url;
 ok(img&&tz,'uploaded a new painting and its preview');
 const cat0=(await P({a:'catGet'},OT)).cat, until=Date.now()+48*36e5;
 const cat=JSON.parse(JSON.stringify(cat0));cat.site.earlyHours=48;
 cat.arts.push({id:'p99',t:'Secret Garden',m:'Oil on canvas',s:'40 × 50 cm',year:'2026',d:'A walled garden at dusk.',p:'£900',mode:'price',status:'Available',w:.4,h:.5,bg:'#556b4f',img,tz,tzOf:img,early:until});
 let r=await P({a:'catSave',cat},OT);ok(r.ok&&r.cat.arts.find(a=>a.id==='p99').early===until&&r.cat.site.earlyHours===48,'saved a members-only painting (emailed '+r.emailed+')');
 // visitors: a teaser only
 const pub=await (await fetch(U+'?cat=1')).json(), pa=pub.cat.arts.find(a=>a.id==='p99');
 ok(pa&&pa.ea===until&&pa.img===tz&&!pa.p&&!pa.d&&!pa.early&&!pa.full&&!pa.wm,'visitors get the blurred preview, no price, no description, no full image');
 ok((await G(img)).s>=400,'the full image is refused to visitors ('+(await G(img)).s+')');
 ok((await G(tz)).s===200,'the preview loads');
 // members: the real thing
 let e=await P({a:'early'},BT);const ma=e.arts&&e.arts.find(a=>a.id==='p99');
 ok(ma&&ma.p==='£900'&&ma.d&&/sig=/.test(ma.img)&&!ma.tz,'members get the painting, price and description');
 ok(ma&&(await G(ma.img)).s===200,'the member’s signed image link opens');
 ok((await P({a:'early'}))._s===401,'early access needs signing in');
 // enquiries
 r=await P({a:'order',id:'p99',name:'Vic Visitor',email:'vic@example.com',message:'Is this available?',ft:9000});ok(r._s===403,'visitors can’t enquire yet ('+r._s+')');
 r=await P({a:'order',id:'p99',message:'I love this one',ft:9000},BT);ok(r.ok,'members can enquire');
 // pages
 let pg=await G('/art/secret-garden');ok(pg.s===200&&/Members see this first/.test(pg.t)&&/noindex/.test(pg.t)&&!/£900/.test(pg.t)&&!/walled garden/.test(pg.t),'painting page shows a teaser, hides price and words, not indexed');
 ok(/48 hours|2 days/.test(pg.t)&&/data-count="\d+"/.test(pg.t)&&/href="\/#join"/.test(pg.t),'teaser explains the window, counts down, offers joining');
 ok(!pg.t.includes(img.split('?')[1]),'the full image isn’t on the teaser page');
 pg=await G('/works');ok(/Members see this first/.test(pg.t)&&!/£900/.test(pg.t)&&/collectors’ circle/.test(pg.t),'All works shows the teaser and the perks');
 ok(!/5%|discount|charity/i.test(pg.t),'no discount or charity wording on All works');
 pg=await G('/sitemap.xml');ok(pg.s===200&&!/secret-garden/.test(pg.t)&&/\/privacy/.test(pg.t),'sitemap leaves out the members-only work, includes privacy');
 pg=await G('/privacy');ok(pg.s===200&&/Privacy/.test(pg.t)&&/unsubscribe/i.test(pg.t)&&/Information Commissioner|ICO/.test(pg.t),'privacy page');
 pg=await G('/api/app?page=privacy');ok(/Stripe/.test(pg.t)&&/Resend/.test(pg.t),'privacy page names the services used');
 // sign-up
 r=await P({a:'sub',email:'newfan@example.com',ft:5000});ok(r._s===400,'sign-up without consent is refused');
 r=await P({a:'sub',email:'newfan@example.com',consent:true,src:'about',ft:5000});ok(r.ok,'sign-up with consent ('+(r.confirm?'confirm email':'direct, email not set up')+')');
 r=await P({a:'sub',email:'bot@example.com',consent:true,hp:'x'});ok(r.ok,'sign-up honeypot quiet ok');
 pg=await G('/api/app?confirm=nonsense');ok(pg.s>=400&&/didn’t work/i.test(pg.t),'bad confirm link explained ('+pg.s+')');
 pg=await G('/api/app?unsub=nonsense');ok(pg.s>=400,'bad unsubscribe link refused ('+pg.s+')');
 // news preference
 r=await P({a:'news',on:true},BT);ok(r.ok&&r.news===true,'member opts in to news');
 let me=await P({a:'me'},BT);ok(me.me&&me.me.news===true,'profile shows the choice');
 r=await P({a:'news',on:false},BT);me=await P({a:'me'},BT);ok(me.me&&me.me.news===false,'member opts out');
 // it opens to everyone on time
 const c2=JSON.parse(JSON.stringify(r.cat||(await P({a:'catGet'},OT)).cat));c2.arts.find(a=>a.id==='p99').early=Date.now()-1000;
 r=await P({a:'catSave',cat:c2},OT);ok(r.ok,'window ended');
 const pub2=await (await fetch(U+'?cat=1')).json(),pb=pub2.cat.arts.find(a=>a.id==='p99');
 ok(pb&&pb.p==='£900'&&pb.img===img&&!pb.ea,'after the window everyone sees the painting and price');
 ok((await G(img)).s===200,'the image is public now');
 pg=await G('/art/secret-garden');ok(/£900/.test(pg.t)&&!/noindex/.test(pg.t),'the painting page is full and indexable');
 // an expired early date in the database counts as public even without a save
 const c3=JSON.parse(JSON.stringify(c2));c3.arts.find(a=>a.id==='p99').early=Date.now()+3000;await P({a:'catSave',cat:c3},OT);
 ok((await G(img)).s>=400,'set early again: image gated');
 await new Promise(r=>setTimeout(r,3500));
 ok((await G(img)).s===200,'opens by itself when the time passes');
 const p3=await (await fetch(U+'?cat=1')).json();ok(!p3.cat.arts.find(a=>a.id==='p99').ea,'catalogue public by itself too');
 // tidy up
 r=await P({a:'catSave',cat:cat0},OT);ok(r.ok,'restored the test catalogue');
})();
