// Visitors analytics: counting, filtering, de-duplication, conversions and the owner report
const U='http://localhost:8794/api/app';
const UA={chrome:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
 iphone:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
 bot:'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'};
async function P(b,{ip='9.9.9.9',ua=UA.chrome,tok}={}){const h={'Content-Type':'application/json','x-forwarded-for':ip,'user-agent':ua};if(tok)h.Authorization='Bearer '+tok;const r=await fetch(U,{method:'POST',headers:h,body:JSON.stringify(b)});const j=await r.json().catch(()=>({}));j._s=r.status;return j}
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)process.exitCode=1};const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const OT=(await P({a:'login',email:'pts98@hotmail.co.uk',password:'testpass123'},{ip:'5.5.5.5'})).token;
 const t0=Date.now();
 await P({a:'hit',ev:'view',p:'/'},{ip:'7.7.7.7',ua:UA.bot});
 await P({a:'hit',ev:'view',p:'/',o:1},{ip:'8.8.8.8'});
 await P({a:'anIgnore',ip:'3.3.3.3'},{tok:OT});
 await P({a:'hit',ev:'view',p:'/'},{ip:'3.3.3.3'});
 await P({a:'hit',ev:'view',p:'/',wd:true},{ip:'6.6.6.6'});
 // visitor A: Google, desktop Chrome, two pages and some time on site, then sends a message
 await P({a:'hit',ev:'view',p:'/',r:'www.google.co.uk'},{ip:'1.1.1.1'});await wait(1300);
 await P({a:'hit',ev:'ping'},{ip:'1.1.1.1'});await wait(1300);
 await P({a:'hit',ev:'view',p:'/art/violet-garden',r:'www.google.co.uk'},{ip:'1.1.1.1'});
 const m=await P({a:'message',name:'Ann A',email:'ann@example.com',message:'Hello there Pam',ft:9000},{ip:'1.1.1.1'});
 // visitor B: Instagram, iPhone, one page (a bounce)
 await P({a:'hit',ev:'view',p:'/',r:'l.instagram.com'},{ip:'2.2.2.2',ua:UA.iphone});
 // visitor A again within 30 minutes: same visit, same unique visitor
 await P({a:'hit',ev:'view',p:'/collections'},{ip:'1.1.1.1'});
 const R=await P({a:'analytics',from:t0-3600e3,to:Date.now()+1,buckets:[[t0-3600e3,Date.now()+3600e3]]},{tok:OT});
 const k=R.kpi||{};console.log('   kpi',JSON.stringify(k),'excluded',JSON.stringify(R.excluded));
 ok(m.ok,'message sent');
 ok(k.uv===2&&k.ses===2&&k.pv===4,'2 unique visitors, 2 visits, 4 page views (bots, own visits, ignored network and automated browsers left out)');
 ok(k.bounce===50,'bounce rate 50% (one of two visits saw one page)');
 ok(k.avg>=1&&k.avg<=4,'average visit counts real time on site ('+k.avg+'s)');
 ok(R.excluded.bots>=2&&R.excluded.internal>=2,'bots and own visits are counted separately as excluded');
 const g=R.refs.find(r=>r.src==='google.com'),ig=R.refs.find(r=>r.src==='instagram.com');
 ok(g&&g.visits===1&&g.conv===1&&g.rate===100&&ig&&ig.visits===1&&ig.rate===0,'sources tidied (google.co.uk → google.com, l.instagram.com → instagram.com) with conversion');
 ok(R.devices.some(d=>d[0]==='Computer')&&R.devices.some(d=>d[0]==='Phone')&&R.browsers.some(b=>b[0]==='Chrome')&&R.browsers.some(b=>b[0]==='Safari'),'devices and browsers recognised');
 ok(R.pages.find(p=>p[0]==='/')[1]===2&&R.pages.some(p=>p[0]==='/art/violet-garden'),'most viewed pages');
 ok(R.series.length===1&&R.series[0].uv===2&&R.series[0].pv===4,'trend buckets add up');
 ok(R.active>=2,'active now ('+R.active+')');
 ok(R.ignore.includes('3.3.3.3')&&R.yourIp==='9.9.9.9','ignored networks listed, your own network shown');
 ok((await P({a:'analytics',from:t0,to:t0+1}))._s>=401,'visitors can’t see the report');
 ok((await P({a:'analytics',from:t0-100*864e5,to:t0},{tok:OT}))._s===400,'ranges over 93 days refused');
 const A=await P({a:'anActive'},{tok:OT});ok(A.active>=2,'active-now check');
 await P({a:'anIgnore',ip:'3.3.3.3',remove:true},{tok:OT});
 // previous period comparison: an empty earlier hour gives no change figure, not a crash
 ok(R.prev&&R.prev.uv===0&&R.prev.bounce===null,'previous period with no visits handled');
})();
