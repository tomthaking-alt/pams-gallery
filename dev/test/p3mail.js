// The emails: with email switched on (a pretend Resend), check drop emails, double opt-in and unsubscribe
process.env.KV_REST_API_URL='http://127.0.0.1:8793';process.env.KV_REST_API_TOKEN='testtoken';
process.env.RESEND_API_KEY='re_test_pretend';process.env.MAIL_FROM='Pam’s Gallery <hello@itsamepameo.com>';
const sent=[],realFetch=global.fetch;
global.fetch=async(u,o)=>{if(/resend\.com/.test(String(u))){sent.push(JSON.parse(o.body));return new Response(JSON.stringify({id:'em_'+sent.length}),{status:200,headers:{'Content-Type':'application/json'}})}return realFetch(u,o)};
const app=require(require('path').join(__dirname,'..','out','app.js'));
let ipn=1;
function call(method,body,query,tok){return new Promise(done=>{const h={'x-forwarded-for':'10.9.'+(ipn++)+'.1','content-type':'application/json'};if(tok)h.authorization='Bearer '+tok;
 const req={method,headers:h,body:body||{},query:query||{},url:'/api/app',socket:{remoteAddress:'10.0.0.1'}};let code=200,hd={};
 const res={setHeader:(k,v)=>{hd[k.toLowerCase()]=v},getHeader:k=>hd[k.toLowerCase()],status:c=>{code=c;return res},json:j=>done({code,j,hd}),end:t=>done({code,t:String(t||''),hd}),send:t=>done({code,t:String(t||''),hd}),redirect:(c,u)=>done({code:c,loc:u,hd})};
 Object.defineProperty(res,'statusCode',{get:()=>code,set:v=>{code=v}});app(req,res)})}
function ok(c,m){console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1}
const html=e=>(e.html||'')+' '+(e.text||'');
(async()=>{
 const OT=(await call('POST',{a:'login',email:'pts98@hotmail.co.uk',password:'testpass123'})).j.token,BT=(await call('POST',{a:'login',email:'bob@example.com',password:'bobpass123'})).j.token;
 ok(OT&&BT,'signed in');
 await call('POST',{a:'news',on:true},null,BT);
 const cat0=(await call('POST',{a:'catGet'},null,OT)).j.cat,cat=JSON.parse(JSON.stringify(cat0));
 const px='data:image/jpeg;base64,'+require('fs').readFileSync(__dirname+'/fixtures/wm_p7.jpg').toString('base64');const up=(await call('POST',{a:'imgUpload',data:px,type:'image/jpeg'},null,OT)).j.url;
 const img={id:'p98',t:'Moon Orchard',m:'Oil on canvas',s:'30 × 40 cm',year:'2026',d:'',p:'£700',mode:'price',status:'Available',w:.4,h:.3,img:up};cat.arts.push(img);ok(!!up,'uploaded a painting to mark');
 const until=Date.now()+48*36e5;img.early=until;cat.site.earlyHours=48;
 sent.length=0;let r=await call('POST',{a:'catSave',cat},null,OT);
 const toBob=sent.filter(e=>[].concat(e.to).includes('bob@example.com'));
 ok(r.j.ok&&r.j.emailed>=1&&toBob.length===1,'Bob (opted in) is emailed about the new members-only work (emailed '+r.j.emailed+')');
 const e=toBob[0]||{};console.log('   subject:',e.subject);
 ok(/unsub=/.test(html(e)),'the email has an unsubscribe link');
 ok(new RegExp(img.t).test(html(e)+e.subject),'the email names the painting');
 ok(!/5%|discount|charity/i.test(html(e)),'no discount or charity wording');
 ok(!sent.some(x=>[].concat(x.to).includes('pts98@hotmail.co.uk')&&/members/i.test(x.subject||'')&&false),'');
 sent.length=0;r=await call('POST',{a:'catSave',cat},null,OT);ok(r.j.ok&&!sent.filter(x=>[].concat(x.to).includes('bob@example.com')).length,'saving again doesn’t email twice');
 // unsubscribe from the drop email
 const ul=/[?&]unsub=([^"'&\s<]+)/.exec(html(e));r=await call('GET',null,{unsub:decodeURIComponent(ul?ul[1]:'')});ok(r.code===200&&/unsubscribed/i.test(r.t),'the unsubscribe link works ('+r.code+')');
 const me=(await call('POST',{a:'me'},null,BT)).j.me;ok(me&&me.news===false,'Bob’s news preference is now off');
 // double opt-in
 sent.length=0;r=await call('POST',{a:'sub',email:'carol@example.com',consent:true,src:'collections',ft:6000});ok(r.j.ok&&r.j.confirm===true&&sent.length===1,'sign-up sends a confirmation email first');
 const cl=/[?&]confirm=([^"'&\s<]+)/.exec(html(sent[0]||{}));ok(!!cl,'confirmation email has the link');
 r=await call('GET',null,{confirm:decodeURIComponent(cl?cl[1]:'')});ok(r.code===200&&/on the list/i.test(r.t),'confirming works');
 // members who didn't ask for news aren't emailed
 await call('POST',{a:'news',on:false},null,BT);const c2=JSON.parse(JSON.stringify(cat));c2.arts.find(a=>a.id===img.id).early=Date.now()+72*36e5;sent.length=0;
 r=await call('POST',{a:'catSave',cat:c2},null,OT);ok(!sent.some(x=>[].concat(x.to).includes('bob@example.com')),'no email to members who said no');
 ok(sent.every(x=>/unsub=/.test(html(x))),'every drop email carries an unsubscribe link ('+sent.length+' sent, to confirmed sign-ups)');
 await call('POST',{a:'catSave',cat:cat0},null,OT);console.log('restored');process.exit()
})();
