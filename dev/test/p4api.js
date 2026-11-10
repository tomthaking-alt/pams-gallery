// Phase 4 server checks: buying details drive the wording, no points, reply time only when set
const B='http://localhost:8794',U=B+'/api/app';
async function P(b,tok){const r=await fetch(U,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));j._s=r.status;return j}
async function G(u){const r=await fetch(B+u);return r.text()}
function ok(c,m){console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1}
(async()=>{
 const OT=(await P({a:'login',email:'pts98@hotmail.co.uk',password:'testpass123'})).token,BT=(await P({a:'login',email:'bob@example.com',password:'bobpass123'})).token;
 const cat0=(await P({a:'catGet'},OT)).cat;
 const c=JSON.parse(JSON.stringify(cat0));c.site.buy={};await P({a:'catSave',cat:c},OT);
 let w=await G('/works'),a=await G('/art/violet-garden');
 ok(!/certificate|insured|working days|within a day|worldwide/i.test(w+a),'nothing unconfirmed is claimed on All works or a painting page');
 ok(/Original works by Pam · Nothing to pay until you’ve agreed · 14-day returns/.test(a),'trust line uses only safe facts');
 ok(/Pam replies personally to every message/.test(w)&&/Pam replies personally to every message/.test(a),'no reply time promised until Pam sets one');
 ok(!/points|loyalty/i.test(w+a),'no loyalty points on the pages');
 const cfg=(await (await fetch(U+'?cat=1')).json()).cfg;ok(cfg&&'mail' in cfg&&'pay' in cfg,'page is told whether emails and card payments are on');
 c.site.buy={ukCost:'£15',ukTime:'3–5 working days',intl:'quote',tracked:'yes',pack:'Wrapped and boxed <script>x</script>',retDays:30,retPost:'buyer',cert:'yes',frame:'Oils ready to hang',reply:'two working days',junk:'x'};
 let r=await P({a:'catSave',cat:c},OT);const sb=r.cat.site.buy;
 ok(sb.ukCost==='£15'&&sb.retDays===30&&sb.cert==='yes'&&!sb.junk&&!/[<>]/.test(sb.pack),'buying details saved, cleaned ('+JSON.stringify(sb).slice(0,80)+')');
 w=await G('/works');a=await G('/art/violet-garden');
 ok(/with a certificate of authenticity/.test(w)&&/Certificate of authenticity · /.test(a)&&/Tracked, insured delivery · 30-day returns/.test(a),'confirmed details appear');
 ok(/usually within two working days/.test(w)&&/usually within two working days/.test(a),'reply time shown once set');
 c.site.buy.retDays=99;r=await P({a:'catSave',cat:c},OT);ok(r.cat.site.buy.retDays===14,'odd returns window falls back to 14 days');
 // points gone from accounts and enquiries
 const me=(await P({a:'me'},BT)).me;ok(me&&me.rewards&&!('points' in me.rewards),'accounts no longer carry a points balance');
 r=await P({a:'order',id:'p2',message:'Hello',useCredit:true,ft:9000},BT);ok(r.ok&&'mailed' in r,'enquiry ok and says whether a copy was emailed');
 const d=await P({a:'dash'},OT),o=d.orders.find(x=>x.id===r.id);ok(o&&o.useCredit===false,'“use my points” can’t be requested');
 r=await P({a:'dashOrder',id:o.id,status:'completed',amount:'850'},OT);ok(r.ok&&r.order.awarded&&r.order.amount===850&&!('pointsUsed' in r.order),'marking a sale records it without points');
 const me2=(await P({a:'me'},BT)).me;ok(me2.rewards.sets.some(s=>s.pieces.some(p=>p.owned)),'the sale still counts towards the signed-print reward');
 const pv=await G('/privacy');ok(!/loyalty/i.test(pv),'privacy page no longer mentions points');
 await P({a:'catSave',cat:cat0},OT);console.log('restored');
})();
