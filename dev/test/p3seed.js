// node p3seed.js on|off : put a members-only painting into the test catalogue, or take it out again
const U='http://localhost:8794/api/app',fs=require('fs'),BK=__dirname+'/cat_before_p3.json';
async function P(b,tok){const r=await fetch(U,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},tok?{Authorization:'Bearer '+tok}:{}),body:JSON.stringify(b)});return r.json()}
(async()=>{const OT=(await P({a:'login',email:'pts98@hotmail.co.uk',password:'testpass123'})).token,BT=(await P({a:'login',email:'bob@example.com',password:'bobpass123'})).token;
 if(process.argv[2]==='off'){const c=JSON.parse(fs.readFileSync(BK));console.log((await P({a:'catSave',cat:c},OT)).ok);return}
 const px='data:image/jpeg;base64,'+fs.readFileSync(__dirname+'/fixtures/wm_p7.jpg').toString('base64');
 const img=(await P({a:'imgUpload',data:px,type:'image/jpeg'},OT)).url;
 const {execSync}=require('child_process');const small=execSync('python3 -c "from PIL import Image,ImageFilter;import io,base64,sys;im=Image.open(sys.argv[1]).convert(\'RGB\');im.thumbnail((28,40));b=io.BytesIO();im.filter(ImageFilter.GaussianBlur(1)).save(b,\'JPEG\',quality=70);print(base64.b64encode(b.getvalue()).decode())" '+__dirname+'/fixtures/wm_p7.jpg').toString().trim();
 const tz=(await P({a:'imgUpload',data:'data:image/jpeg;base64,'+small,type:'image/jpeg'},OT)).url;
 const c0=(await P({a:'catGet'},OT)).cat;fs.writeFileSync(BK,JSON.stringify(c0));const c=JSON.parse(JSON.stringify(c0));c.site.earlyHours=48;
 c.arts.push({id:'p99',t:'Secret Garden',m:'Oil on canvas',s:'40 × 50 cm',year:'2026',d:'A walled garden at dusk.',p:'£900',mode:'price',status:'Available',w:.4,h:.55,bg:'#556b4f',img,tz,tzOf:img,early:Date.now()+47*36e5});
 const r=await P({a:'catSave',cat:c},OT);console.log(JSON.stringify({ok:r.ok,BT,OT}))})();
