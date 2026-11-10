const U='http://localhost:8794/api/app';
async function P(b,tok){const r=await fetch(U,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));j._s=r.status;return j}
function ok(c,m){console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1}
(async()=>{
 const OT=(await P({a:'login',email:'pts98@hotmail.co.uk',password:'testpass123'})).token, BT=(await P({a:'login',email:'bob@example.com',password:'bobpass123'})).token;
 ok(OT&&BT,'signed in as owner and as a member');
 const ownerOnly=['dash','catGet','catSave','payLink','dashOrder','dashMsg','aucClose','catHist','catRestore','growGet','growSave','imgUpload'];
 const [h,p]=OT.split('.'),forged=Buffer.from(JSON.stringify({e:'pts98@hotmail.co.uk',x:Date.now()+1e9})).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_')+'.'+p;
 for(const a of ownerOnly){
  const r0=await P({a,cat:{arts:[]},grow:{},id:'x',data:'AAAA'}),r1=await P({a,cat:{arts:[]},grow:{},id:'x',data:'AAAA'},BT),r2=await P({a,cat:{arts:[]},grow:{},id:'x'},forged);
  ok(r0._s===403&&r1._s===403&&r2._s===403&&!r0.cat&&!r1.orders,'refused '+a+' for visitor / member / forged sign-in ('+r0._s+','+r1._s+','+r2._s+')');
 }
 const d0=(await P({a:'dash'},OT)),n0=d0.orders.length,m0=d0.msgs.length;
 let r=await P({a:'order',id:'p2',name:'Bot',email:'bot@spam.example',message:'buy cheap',hp:'http://spam.example'});ok(r.ok,'honeypot gets a quiet "ok"');
 r=await P({a:'order',id:'p2',name:'Fast Bot',email:'fast@spam.example',message:'hi',ft:150});ok(r.ok,'too-fast form gets a quiet "ok"');
 r=await P({a:'message',name:'Bot',email:'bot@spam.example',message:'spam',hp:'x'});ok(r.ok,'message honeypot quiet ok');
 let d1=await P({a:'dash'},OT);ok(d1.orders.length===n0&&d1.msgs.length===m0,'spam was not stored ('+d1.orders.length+' vs '+n0+')');
 r=await P({a:'order',id:'p2',name:'Real Person',email:'real@example.com',message:'Is it still available?',ft:8000,hp:''});ok(r.ok&&r.id,'a real enquiry goes through');
 r=await P({a:'message',name:'Real Person',email:'real@example.com',message:'Hello Pam',ft:6000,hp:''});ok(r.ok,'a real message goes through');
 r=await P({a:'signup',name:'Bot',email:'botsign@spam.example',password:'password123',consent:true,hp:'x'});ok(r._s===400,'sign-up honeypot refused');
 const px='data:image/jpeg;base64,'+require('fs').readFileSync(require('path').join(__dirname,'fixtures')+'/wm_p7.jpg').toString('base64');
 r=await P({a:'commission',name:'Cara Client',email:'cara@example.com',idea:'A portrait of my dog in your style',photos:[px],ft:30000});ok(r.ok,'commission with a photo');
 d1=await P({a:'dash'},OT);ok(d1.orders.length===n0+2&&d1.msgs.length===m0+1,'real enquiry, commission and message stored');
 const co=d1.orders.find(o=>o.kind==='commission'&&o.name==='Cara Client'),su=co.photos[0],key=/img=([a-z0-9]+)/.exec(su)[1];
 ok(/&x=\d+&sig=/.test(su)&&key.length===32,'dashboard gets a signed link with an unguessable name');
 const g=async u=>(await fetch('http://localhost:8794'+u)).status;
 ok(await g(su)===200,'signed link opens the photo');ok(await g('/api/app?img='+key)===404,'plain link refused');
 ok(await g(su.replace(/sig=.{4}/,'sig=AAAA'))===404,'tampered link refused');ok(await g('/api/app?img='+key+'&x=1000&sig='+/sig=(.*)$/.exec(su)[1])===404,'expired link refused');
 const pub=(await P({a:'imgUpload',data:px,type:'image/jpeg'},OT)).url;ok(pub&&await g(pub)===200,'paintings Pam uploads stay public');
})();
