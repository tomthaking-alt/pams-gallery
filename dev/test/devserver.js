// Local copy of the site on http://localhost:8794 (gallery at /, test copy without tracking at /lab/dbg.html), using the
// pretend database in mockredis.py (python3 dev/test/mockredis.py 8793). Same rewrites as vercel.json.
process.env.KV_REST_API_URL='http://127.0.0.1:8793';process.env.KV_REST_API_TOKEN='testtoken';
const http=require('http'),fs=require('fs'),path=require('path'),url=require('url');
const DEV=path.resolve(__dirname,'..'),REPO=path.resolve(DEV,'..'),app=require(path.join(DEV,'out','app.js'));
const TYPES={'.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.txt':'text/plain','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.json':'application/json','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary','.usdz':'model/vnd.usdz+zip','.mp4':'video/mp4','.webm':'video/webm'};
http.createServer((req,res)=>{
 const u=url.parse(req.url,true);let m;
 if((m=/^\/art\/([^/?#]+)$/.exec(u.pathname))){u.pathname='/api/app';u.query=Object.assign({},u.query,{page:'art',slug:m[1]})}
 else if({'/works':1,'/sitemap.xml':1,'/privacy':1,'/404':1}[u.pathname]){const pg={'/works':'works','/sitemap.xml':'sitemap','/privacy':'privacy','/404':'404'}[u.pathname];u.pathname='/api/app';u.query=Object.assign({},u.query,{page:pg})}
 if(u.pathname==='/api/app'){let b=[];req.on('data',c=>b.push(c));req.on('end',()=>{const s=Buffer.concat(b).toString();req.body=!s?{}:/x-www-form-urlencoded/.test(req.headers['content-type']||'')?Object.fromEntries(new URLSearchParams(s)):JSON.parse(s);req.query=u.query;
   const geo=[['GB','London','ENG','51.51','-0.13'],['GB','Manchester','ENG','53.48','-2.24'],['US','New York','NY','40.71','-74.01'],['FR','Paris','IDF','48.86','2.35']][Math.floor(Math.random()*4)];   // pretend to be Vercel's edge
   Object.assign(req.headers,{'x-vercel-ip-country':geo[0],'x-vercel-ip-city':encodeURIComponent(geo[1]),'x-vercel-ip-country-region':geo[2],'x-vercel-ip-latitude':geo[3],'x-vercel-ip-longitude':geo[4]});
   res.status=c=>{res.statusCode=c;return res};res.json=j=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(j))};app(req,res)});return}
 let f=u.pathname==='/'||u.pathname==='/lab/dbg.html'?path.join(DEV,'out','dbg.html'):path.join(REPO,u.pathname);
 if(!f.startsWith(REPO)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.statusCode=404;res.end('not found');return}
 res.setHeader('Content-Type',TYPES[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));
}).listen(8794,()=>console.log('Local site: http://localhost:8794'));
