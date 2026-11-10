const U='http://localhost:8794/api/app';
async function P(b,tok){const r=await fetch(U,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:JSON.stringify(b)});const j=await r.json();j._s=r.status;return j}
async function G(q){const r=await fetch(U+'?'+q);return r.headers.get('content-type').includes('json')?r.json():r.text()}
function ok(c,m){console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1}
(async()=>{
 const own=await P({a:'signup',name:'Pam',email:'pts98@hotmail.co.uk',password:'testpass123',consent:true});const OT=own.token||(await P({a:'login',email:'pts98@hotmail.co.uk',password:'testpass123'})).token;ok(!!OT,'owner token');
 const bob=await P({a:'signup',name:'Bob Buyer',email:'bob@example.com',password:'bobpass123',consent:true});const BT=bob.token||(await P({a:'login',email:'bob@example.com',password:'bobpass123'})).token;ok(!!BT,'member token');
 const arts=[1,2,3,4,5,6].map(i=>({id:'p'+i,t:'Art '+i,m:'Oil on board',s:'',year:'',d:'',p:i===2?'£450':'',mode:i===2?'price':i===3?'auction':'request',status:'Available',w:.5,h:.7,bg:'#cfc6d6',img:'emb:p'+i,ar:true,auc:i===3?{start:200,step:20,ends:Date.now()+864e5}:undefined}));
 const cat={arts,favs:['p1','p2','p3'],colls:[{t:'C1',d:'',works:['p1','p2'],soon:3}],prints:[],texts:{'hero.title':'Hello Gallery','about.text':'Line one\n\nLine two','bad key':'x'},site:{email:'pam@example.com',social:{instagram:'https://www.instagram.com/pam',tiktok:'javascript:alert(1)'},banner:{on:true,text:'New collection now showing'},offers:true,cur:'GBP'}};
 let r=await P({a:'catSave',cat},OT);ok(!r.error,'catSave '+(r.error||''));ok(r.cat&&r.cat.texts['hero.title']==='Hello Gallery'&&!r.cat.texts['bad key'],'texts kept, bad key dropped');
 ok(r.cat.site.social.instagram&&!r.cat.site.social.tiktok,'social links validated');ok(r.cat.arts[2].mode==='auction'&&r.cat.arts[2].auc.start===200,'auction saved');
 const pub=await G('cat=1');ok(pub.cat.site.banner.text==='New collection now showing'&&pub.cfg&&pub.cfg.pay===false,'public catalogue has site + cfg');
 r=await P({a:'like',id:'p1',vid:'v1'});r=await P({a:'like',id:'p1',vid:'v2'});r=await P({a:'like',id:'p1',vid:'v1',on:false});ok(r.n===1,'likes count '+r.n);
 r=await P({a:'bid',id:'p3',amount:'500'});ok(r._s===401,'anon bid needs account');
 r=await P({a:'bid',id:'p3',amount:'150'},BT);ok(r._s===400&&/£200/.test(r.error),'bid below start rejected: '+r.error);
 r=await P({a:'bid',id:'p3',amount:'250'},BT);ok(r.ok&&r.top===250,'bid accepted');
 r=await P({a:'bid',id:'p3',amount:'260'},OT);ok(r._s===400&&/£270/.test(r.error),'step enforced: '+r.error);
 r=await P({a:'bid',id:'p1',amount:'260'},BT);ok(r._s===400,'non-auction bid rejected');
 const live=await G('live=1');ok(live.likes.p1===1&&live.bids.p3.top===250&&live.bids.p3.n===1,'live endpoint '+JSON.stringify(live));
 r=await P({a:'order',id:'p2',name:'Cara',email:'cara@example.com',offer:'£400',message:'Hi'});ok(r.ok,'enquiry with offer');
 r=await P({a:'sub',email:'fan@example.com',consent:true});ok(r.ok,'subscribe');r=await P({a:'sub',email:'nope'});ok(r._s===400,'bad email rejected');
 const me=await P({a:'me'},BT);ok(me.bids&&me.bids[0]&&me.bids[0].state==='leading','member sees leading bid');
 let d=await P({a:'dash'},OT);const o=d.orders.find(x=>x.name==='Cara');ok(o&&o.offer===400,'dash order offer '+(o&&o.offer));
 ok(d.auctions[0]&&d.auctions[0].bids[0].amount===250,'dash auctions');ok(d.likes[0]&&d.likes[0].n===1,'dash likes');ok(d.subs.count===1,'dash subs');ok(d.pay===false&&d.google===false,'flags off');
 r=await P({a:'payLink',id:o.id,amount:400},OT);ok(r._s===400&&/Stripe/.test(r.error),'payLink explains: '+r.error);
 r=await P({a:'google',credential:'x'});ok(r._s===400,'google off: '+r.error);
 r=await P({a:'dashOrder',id:o.id,status:'awaiting'},OT);ok(r.order&&r.order.status==='awaiting','new status saved');
 cat.arts[2].auc.ends=Date.now()-1000;r=await P({a:'catSave',cat},OT);r=await P({a:'bid',id:'p3',amount:'999'},BT);ok(r._s===400&&/closed/.test(r.error),'closed auction rejects bids');
 r=await P({a:'aucClose',id:'p3'},OT);ok(r.ok,'aucClose');const r2=await P({a:'aucClose',id:'p3'},OT);ok(r2.id===r.id,'aucClose idempotent');
 const me2=await P({a:'me'},BT);ok(me2.bids[0].state==='won'&&me2.orders.some(x=>/Auction/.test(x.title)),'winner sees win + order');
 r=await P({a:'catHist'},OT);ok(r.list&&r.list.length>=2,'history '+(r.list&&r.list.length));
 const v0=r.list[1].v;r=await P({a:'catRestore',v:v0},OT);ok(r.ok&&r.cat.arts[2].auc.ends>Date.now(),'restore earlier version');
 r=await P({a:'growSave',grow:{done:['pay','bad id!'],notes:{pay:'call stripe'}}},OT);r=await P({a:'growGet'},OT);ok(r.grow.done.length===1&&r.grow.notes.pay==='call stripe','grow saved');
 r=await P({a:'growGet'},BT);ok(r._s===403,'grow owner only');
 const sh=await G('s=p3');ok(/og:image/.test(sh)&&/#art-p3/.test(sh),'share page');
})();
