const U='http://localhost:8794/api/app';
async function P(b,tok){const r=await fetch(U,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:JSON.stringify(b)});return r.json()}
(async()=>{const OT=(await P({a:'login',email:'pts98@hotmail.co.uk',password:'testpass123'})).token;
 const cat=(await (await fetch(U+'?cat=1')).json()).cat;const T=['Orchid in the Clouds','Violet Garden','Three Masks in Blue','Three Masks in Green','The Messenger','White Bloom over Ember'];
 cat.arts=cat.arts.filter(a=>/^p\d+$/.test(a.id));cat.arts.forEach(a=>{const n=/^p([1-6])$/.exec(a.id);if(n){a.t=T[n[1]-1];a.m='Oil on board'}a.mode='request';a.p='';delete a.auc;a.status='Available'});
 const g=id=>cat.arts.find(a=>a.id===id);Object.assign(g('p2'),{mode:'price',p:'£850',s:'50 × 70 cm',year:'2025'});Object.assign(g('p7'),{mode:'auction',auc:{start:400,step:25,ends:Date.now()+3*864e5},s:'60 × 45 cm',year:'2026'});
 Object.assign(g('p6'),{status:'Sold'});Object.assign(g('p11'),{s:'A3 (29.7 × 42 cm)',year:'2026'});
 cat.colls=[{t:'The Dreaming Garden',d:'Soft, dreamlike worlds of flowers and clouds.',works:['p1','p2'],soon:3},{t:'The Masquerade',d:'Masks and faces in jewel colours.',works:['p3','p4','p9','p10','p7'],soon:3},
  {t:'Embers & Omens',d:'Fire, warnings and wonder.',works:['p5','p6'],soon:3},{t:'Ink & Line',d:'Pen and ink drawings.',works:['p11','p12','p13'],soon:2},{t:'Bird vacation',d:'Birds with somewhere to be.',works:['p14','p15'],soon:1}];
 cat.seen=cat.arts.map(a=>a.id);cat.favs=['p1','p2','p3','p4','p5','p6'];
 const r=await P({a:'catSave',cat},OT);console.log(r.error||'demo catalogue saved: '+r.cat.arts.length+' works, '+r.cat.colls.length+' collections')})();
