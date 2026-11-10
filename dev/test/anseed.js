// 40 days of believable visit totals, written straight into the test database, to look at the Visitors tab
const DB='http://127.0.0.1:8793';async function pipe(c){const r=await fetch(DB+'/pipeline',{method:'POST',headers:{Authorization:'Bearer testtoken'},body:JSON.stringify(c)});return r.json()}
const hk=t=>new Date(t).toISOString().slice(0,13).replace(/[-T]/g,'');
const refs=[['direct',.38],['google.com',.24],['instagram.com',.18],['pinterest.com',.08],['facebook.com',.06],['saatchiart.com',.03],['newsletter',.03]];
const cc=[['GB',.62],['US',.12],['IE',.06],['FR',.05],['DE',.04],['AU',.03],['CA',.03],['NL',.02],['ES',.02],['XX',.01]];
const dev=[['Phone',.58],['Computer',.34],['Tablet',.08]],br=[['Safari',.41],['Chrome',.38],['Samsung Internet',.07],['Firefox',.05],['Edge',.06],['Other',.03]];
const pages=['/','/collections','/art/violet-garden','/art/the-hall-of-many-stairs','/art/the-paper-nest','/press','/commission','/buying','/prints'];
const pick=L=>{let r=Math.random(),a=0;for(const [k,w] of L){a+=w;if(r<=a)return k}return L[0][0]};
(async()=>{let cmds=[],n=0,vis=0;const now=Date.now();
 for(let t=now-40*864e5;t<now;t+=36e5){const h=new Date(t).getUTCHours(),day=Math.floor((t-(now-40*864e5))/864e5);
  const base=(0.6+day/40)*(h>=7&&h<=22?(h>=18&&h<=21?6:3.2):0.6),ses=Math.max(0,Math.round(base*(0.6+Math.random()*0.8)));const K='an:h:'+hk(t);
  for(let i=0;i<ses;i++){const id='s'+(vis++);const pv=Math.random()<.42?1:1+Math.ceil(Math.random()*5);const r=pick(refs);
   cmds.push(['HINCRBY',K,'ses','1'],['HINCRBY',K,'r:'+r,'1'],['HINCRBY',K,'c:'+pick(cc),'1'],['HINCRBY',K,'d:'+pick(dev),'1'],['HINCRBY',K,'b:'+pick(br),'1'],['HINCRBY',K,'pv',String(pv)],
    ['HINCRBY',K,'dms',String(Math.round(pv===1?Math.random()*25e3:pv*(30e3+Math.random()*60e3)))],['PFADD','an:u:'+hk(t),Math.random()<.25?'ret'+(vis%40):id]);
   if(pv>1)cmds.push(['HINCRBY',K,'nb','1']);for(let q=0;q<pv;q++)cmds.push(['HINCRBY',K,'p:'+pages[Math.min(pages.length-1,Math.floor(Math.random()*Math.random()*pages.length))],'1']);
   if(Math.random()<(r==='newsletter'?.12:r==='instagram.com'?.05:.025))cmds.push(['HINCRBY',K,'cv','1'],['HINCRBY',K,'cr:'+r,'1'])}
  if(Math.random()<.3)cmds.push(['HINCRBY','an:x:'+hk(t).slice(0,8),'bots',String(1+Math.floor(Math.random()*6))]);
  if(cmds.length>2000){await pipe(cmds);n+=cmds.length;cmds=[]}}
 await pipe(cmds);n+=cmds.length;await pipe([['SET','an:since',String(now-40*864e5)]]);console.log('seeded',vis,'visits,',n,'writes')})();
