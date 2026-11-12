/* ---------- rendering: three.js scene graph, physically based materials, image-based lighting and custom shaders ---------- */
var mobile=Math.min(innerWidth,innerHeight)<700||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
/* the lighter setting: after the browser stopped the 3D earlier in this visit (it ran short of graphics memory), or on a device with very little memory */
var LITE=false;try{LITE=sessionStorage.getItem('pgLite')==='1'}catch(e){}if(navigator.deviceMemory&&navigator.deviceMemory<=2)LITE=true;
/* quality adapts to the device: starts high, then steps down if frames are slow */
var GPU='';try{var dri=gl.getExtension('WEBGL_debug_renderer_info');GPU=dri?String(gl.getParameter(dri.UNMASKED_RENDERER_WEBGL)):''}catch(e){}
var LOWGPU=/[?&]q=high/.test(location.search)?false:/[?&]q=low/.test(location.search)||/Intel|Mali-(T\d+|G[1-6]\d\b)|Adreno[^\d]*[3-5]\d\d|PowerVR|SwiftShader|llvmpipe|Software/i.test(GPU)&&!/Iris\(R\) Xe|Arc/i.test(GPU);
var Q=LOWGPU?{dpr:mobile?1.3:1.25,samples:2,refl:false,bloom:true,dof:false,ao:true,rays:true,level:2,spotSh:false}:{dpr:mobile?1.7:2,samples:4,refl:!mobile,bloom:true,dof:!mobile,ao:true,rays:true,level:0,spotSh:!mobile};
if(typeof LOOKTOG!=='undefined'&&LOOKTOG)Q.dof=false;
if(LITE)Q={dpr:1,samples:0,refl:false,bloom:true,dof:false,ao:false,rays:false,level:5,spotSh:false};   // the ink and painted looks: everything in focus (a drawing has no depth of field), so Pam's statues stay sharp
var T3T={boot:performance.now()};
var DG={prev:0,stuck:0,snaps:[]};
function degrade(e){
 if(Q.level>=99)return false;
 if(DG.prev&&e>DG.prev*.88){if(++DG.stuck>=2){var back=DG.snaps[DG.snaps.length-2];if(back){for(var k in back)Q[k]=back[k];resize()}Q.level=99;return true}}else DG.stuck=0;   // two steps in a row made no difference: restore and stop
 DG.prev=e;DG.snaps.push(JSON.parse(JSON.stringify(Q)));Q.level++;
 if(Q.level===1){Q.refl=false}
 else if(Q.level===2){Q.dpr=Math.max(1,Q.dpr*.8)}
 else if(Q.level===3){Q.samples=Math.min(Q.samples,2);Q.dof=false}
 else if(Q.level===4){Q.ao=false;if(MOTES)MOTES.geometry.setDrawRange(0,MOTES.geometry.attributes.position.count>>1)}
 else if(Q.level===5){Q.bloom=false;Q.rays=false}
 else if(Q.level<=8){Q.dpr=Math.max(mobile?.85:1,Q.dpr*.85)}
 else{Q.level=99;return false}
 resize();return true}
var SHS=LITE?1024:2048,RT={w:2,h:2},dirty=2;

/* ---------- lighting: low evening sun through the opening ---------- */
var SUN=v3.norm([-.6,.26,-.76]),SUNCOL=[4.4,3.6,2.7],SKY=lin('#eef0f2').map(function(v){return v*.44}),GROUND=lin('#8a6a52').map(function(v){return v*.2}),FAR=60,SKYSUN=v3.norm([-.6,.06,-.76]);
var EXPOSURE=.95,BLOOMK=.022,BLOOMT=3.5,RAYK=1.,cam={x:0,y:1.62,z:-2.4,yaw:0,pitch:0,fov:1};
var DRM=(typeof DREAM!=='undefined'&&DREAM);
   // the dream look: a rose sun, lavender sky light, teal light from below, a softer, wider glow
if(DRM){SUNCOL=[3.0,2.4,2.1];SKY=lin('#d0cbdc').map(function(v){return v*.26});GROUND=lin('#2c2830').map(function(v){return v*.18});BLOOMK=.035;BLOOMT=2.8;EXPOSURE=1.08}
var LK0={exp:EXPOSURE,ray:RAYK,bloom:BLOOMK};   // the colour switch (setLook) sets these for the ink drawing or the painted colour version
function fovFor(as){var deg=as>=1.2?46:as>=.8?54:64;return deg*Math.PI/180}   // vertical field of view, like a 35-50mm film lens
function camDir(){var cp=Math.cos(cam.pitch);return[-Math.sin(cam.yaw)*cp,Math.sin(cam.pitch),-Math.cos(cam.yaw)*cp]}

var LINEAR=THREE.LinearSRGBColorSpace;function c3(a){return new THREE.Color().setRGB(a[0],a[1],a[2],LINEAR)}
var S3=new THREE.Scene(),C3=new THREE.PerspectiveCamera(50,1,.05,200);S3.matrixWorldAutoUpdate=true;
var G3={uPass:{value:0},uFar:{value:FAR},uRes:{value:new THREE.Vector2(1,1)},uReflTex:{value:null},uRoom:{value:new THREE.Vector4(X0,X1,ZB,ZF)},uRH:{value:RH},uSecs:{value:0},uCalm:{value:0},uEnvD:{value:.15},uDomeC:{value:new THREE.Vector3(0,1.6,-10)}};

/* the painted sky and land, ported from the original renderer */
var ENVBAKE=__ENVBAKE__;if(DRM||ZB>1)ENVBAKE=null;   // the dream, and the deeper hall, capture their own room's light at load   // the dream captures its own room's light at load
var SKYFUNCS=__SKYFUNCS__;
var SKYBASE=__SKYBASE__;
var SKYM=new THREE.ShaderMaterial({uniforms:{uSecs:G3.uSecs,uFar:G3.uFar,uDomeC:G3.uDomeC,uPass:G3.uPass},side:THREE.DoubleSide,
 vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
 fragmentShader:'uniform float uSecs,uFar,uPass;uniform vec3 uDomeC;varying vec3 vW;\n'+SKYFUNCS+'\nvoid main(){if(uPass>.5&&uPass<1.5&&vW.y<0.)discard;vec3 d=normalize(vW-uDomeC);vec3 c=(d.y>=0.?skyCol(d):seaCol(d))*.85;gl_FragColor=vec4(c,length(vW-cameraPosition)/uFar);}'});

/* the dream sky: Pam's painted night sky (nebula, spiral sun, orb, stars) with an eight-fold kaleidoscope of flowing ink over it,
   turning once every 17 minutes; a still mirror lake below. SKYW draws the same sky through the welcome hall's ceiling. */
var DSKY='vec3 dpal(float t){return .5+.5*cos(6.2832*(t+vec3(0.,.33,.67)));}\n'+
 'vec3 dreamSky(vec3 d){vec3 c=skyCol(d);float e=max(d.y,0.);\n'+
 ' float az=atan(d.x,-d.z)+uSecs*.003;az=abs(mod(az,1.5708)-.7854);vec2 p=vec2(cos(az),sin(az))*(1.-e)*2.6;\n'+
 ' float w=fb3(p*1.3+vec2(uSecs*.01,0.))*4.;vec2 q=p+vec2(sin(w),cos(w))*.35;float n1=fb3(q*2.2);\n'+
 '#ifndef DLITE\n n1=n1*.7+fb3(q*4.7+3.)*.3;\n#endif\n'+
 ' vec3 ink=mix(vec3(.85,.78,1.),dpal(n1*1.3+uSecs*.0042),.18);float fil=pow(.5+.5*sin(n1*22.),10.);float m=smoothstep(.04,.3,e)*smoothstep(.12,.4,acos(clamp(dot(d,normalize(vec3(-.45,.2,-.87))),-1.,1.)));\n'+
 ' c+=ink*smoothstep(.4,.76,n1)*.28*m+ink*fil*.06*m;return c;}\n'+
 'vec3 dreamSea(vec3 d){float e=-d.y;vec2 sp=d.xz/(e+.004);float rp=sin(length(sp-vec2(0.,-30.))*.8-uSecs*.6)*.004*smoothstep(0.,.2,e);\n'+
 ' vec3 c=dreamSky(normalize(vec3(d.x+rp,max(e,.003),d.z)))*.55;return mix(c,skyBase(vec3(d.x,0.,d.z))*.9,smoothstep(.06,0.,e)*.5);}\n';
var SKYD=null,SKYW=null;
if(DRM){var skyHead='uniform float uSecs,uFar,uPass;uniform vec3 uDomeC;varying vec3 vW;\n'+SKYFUNCS+'\n'+DSKY;
 SKYD=new THREE.ShaderMaterial({uniforms:SKYM.uniforms,side:THREE.DoubleSide,defines:mobile||LOWGPU?{DLITE:''}:{},vertexShader:SKYM.vertexShader,
  fragmentShader:skyHead+'void main(){if(uPass>.5&&uPass<1.5&&vW.y<0.)discard;vec3 d=normalize(vW-uDomeC);vec3 c=(d.y>=0.?dreamSky(d):dreamSea(d))*.85;gl_FragColor=vec4(c,length(vW-cameraPosition)/uFar);}'});
 SKYW=new THREE.ShaderMaterial({uniforms:SKYM.uniforms,side:THREE.DoubleSide,defines:mobile||LOWGPU?{DLITE:''}:{},vertexShader:SKYM.vertexShader,
  fragmentShader:skyHead+'void main(){vec3 r=vW-cameraPosition,rd=normalize(r);vec2 q=vW.xz-vec2(0.,-5.2),sq=rd.xz/max(rd.y,.05);float rr=length(q),a=atan(q.y,q.x)+uSecs*.008;\n'+
   ' vec3 c=mix(vec3(.04,.032,.085),vec3(.012,.01,.035),smoothstep(0.,2.5,length(sq)));float nb=fb3(sq*.6+vec2(uSecs*.004,0.)),nb2=fb3(sq*1.3-vec2(0.,uSecs*.003));c+=vec3(.16,.09,.30)*smoothstep(.45,.85,nb)*(.6+.4*nb2);\n'+
   ' float bd=dot(sq,vec2(.6,.8))+.2,mw=exp(-bd*bd/.35)*(.55*fb3(sq*2.2)+.45*fb3(sq*5.3+3.));c+=vec3(.26,.2,.4)*mw*.55+vec3(.5,.4,.3)*pow(mw,3.)*.5;c+=vec3(1.,.82,.55)*.12*exp(-rr*1.6);\n'+
   ' float sn=floor(uSecs/23.),sp=fract(uSecs/23.)/.07;if(sp<1.){vec2 s0=(vec2(hsh(vec2(sn,1.3)),hsh(vec2(sn,7.1)))-.5)*1.6,sd=normalize(vec2(hsh(vec2(sn,3.3))-.5,-.6));vec2 hd=s0+sd*sp*.9;\n'+
   '  vec2 pa=sq-s0,ba=hd-s0;float tt=clamp(dot(pa,ba)/max(dot(ba,ba),1e-4),0.,1.);float dl=length(pa-ba*tt);c+=vec3(1.,.92,.8)*smoothstep(.006,.0,dl)*tt*tt*sin(3.1416*sp)*1.2;}\n'+
 ' vec2 g=floor(sq*13.),f=fract(sq*13.)-.5;float h=hsh(g);float st=step(.88,h)*smoothstep(.07,.0,length(f-(vec2(hsh(g+3.1),hsh(g+7.7))-.5)*.6));\n'+
   ' vec2 g2=floor(sq*31.),f2=fract(sq*31.)-.5;float h2=hsh(g2+19.);st+=step(.9,h2)*smoothstep(.09,.0,length(f2))*.35;\n'+
   ' c+=vec3(1.,.95,.88)*st*(.55+.45*sin(uSecs*(.4+h)+h*30.));gl_FragColor=vec4(c,length(r)/uFar);}'})}

/* paintings and plaques show their true colours, untouched by the grade */
var ARTV='varying vec2 vU;varying vec3 vWp;void main(){vU=uv;vec4 w=modelMatrix*vec4(position,1.);vWp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
var ARTF='uniform sampler2D map;uniform float uFar,uPaint;varying vec2 vU;varying vec3 vWp;vec4 art(vec2 u){vec2 dx=dFdx(u)*.25,dy=dFdy(u)*.25;return .25*(texture2D(map,u+dx+dy,-1.)+texture2D(map,u+dx-dy,-1.)+texture2D(map,u-dx+dy,-1.)+texture2D(map,u-dx-dy,-1.));}void main(){vec4 t=art(vU);vec3 c=t.rgb;'+   // paintings and plaques: four reads a quarter-pixel around each pixel, a step sharper (the brushwork shows without sparkling as you walk; the colours stay the same)
 'if(uPaint>.5){c*=mix(.82,1.,smoothstep(0.,.04,vU.y))*mix(.93,1.,smoothstep(0.,.018,min(vU.x,1.-vU.x)))*mix(.96,1.,smoothstep(0.,.02,1.-vU.y));}'+   // the frame's soft shadow from the picture light above
 'gl_FragColor=vec4(c,-max(length(vWp-cameraPosition)/uFar,.0005));}';
function artMat(m){return new THREE.ShaderMaterial({uniforms:{map:{value:m.tex},uFar:G3.uFar,uPaint:{value:m.isPaint?1:0}},vertexShader:ARTV,fragmentShader:ARTF,side:THREE.DoubleSide})}

/* shader patches applied to three's physically based materials */
var ROOMAO='float roomAO(vec3 p,vec3 N){float X0=uRoom.x,X1=uRoom.y,ZB=uRoom.z,ZF=uRoom.w;\n'+
 ' if(p.x<X0-.1){X1=X0-'+T.toFixed(3)+';X0='+XL.toFixed(3)+';}\n'+   // in the collections hall
 ' if(p.z<ZF-.05)return mix(1.,mix(.75,1.,smoothstep(0.,.4,p.y)),1.-abs(N.y));float a=1.;\n'+
 ' a*=mix(1.,mix(.5,1.,smoothstep(0.,.55,p.y)),1.-abs(N.y));\n'+
 ' a*=mix(1.,mix(.72,1.,smoothstep(0.,.6,uRH-p.y)),1.-abs(N.y));\n'+
 ' a*=mix(1.,mix(.6,1.,smoothstep(0.,.6,p.x-X0)),1.-abs(N.x));\n'+
 ' a*=mix(1.,mix(.6,1.,smoothstep(0.,.6,X1-p.x)),1.-abs(N.x));\n'+
 ' a*=mix(1.,mix(.62,1.,smoothstep(0.,.6,ZB-p.z)),1.-abs(N.z));\n'+
 ' a*=mix(1.,mix(.85,1.,smoothstep(0.,.6,p.z-ZF)),1.-abs(N.z));return a;}\n'+
 'float sunIn(vec3 p){if(p.x>'+(X1-.04).toFixed(3)+'&&p.z>'+(ZF-.05).toFixed(3)+'&&p.z<'+(ZB+.05).toFixed(3)+'&&p.y<'+(RH+.05).toFixed(3)+')return 0.;\n'+   /* the hall's right-hand wall: no raking sun stripes beside the column (they read as stains) */
 ' return (p.x<-13.15&&p.z>'+(ZF-.05).toFixed(3)+'&&p.z<'+(ZB+.05).toFixed(3)+'&&p.y<'+(RH+.05).toFixed(3)+')?0.:1.;}\n';
var DFLOW='vec3 dpal(float t){return .5+.5*cos(6.2832*(t+vec3(0.,.33,.67)));}\n'+
 'float dh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\n'+
 'float dn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(dh(i),dh(i+vec2(1.,0.)),f.x),mix(dh(i+vec2(0.,1.)),dh(i+vec2(1.,1.)),f.x),f.y);}\n'+
 'float dsg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.));}\n'+
 'vec3 dreamGlow(vec3 p,vec3 n,vec3 v){float k=1.-.6*uCalm;vec3 e=vec3(0.);\n'+
 '#if DREAM_FLOW==1\n'+   // oil-on-water sheen, calmer where the paintings hang
 ' float s=uDS*6.,w=sin(p.x*s+p.z*s*.7+uSecs*.05+2.*sin(p.y*s*.8-uSecs*.04));float fr=1.-abs(dot(n,v));\n'+
 ' e=mix(vec3(.8,.76,.95),dpal(w*.22+(p.x+p.z)*.03+p.y*.05+uSecs*.01),.5)*(.55+.45*w)*(.3+fr*fr)*uDK;if(p.y>.55&&p.y<2.95)e*=.35;\n'+
 '#elif DREAM_FLOW==2\n'+   // soft warm ripples spreading slowly across the floor from under each light cluster
 ' float d1=length(p.xz-vec2(0.,-5.2)),d2=length(p.xz-vec2('+XM.toFixed(3)+',-5.));\n'+
 ' float r=pow(.5+.5*sin(d1*4.-uSecs*.22),12.)*smoothstep(3.5,.8,d1)+pow(.5+.5*sin(d2*4.-uSecs*.22),12.)*smoothstep(3.,.8,d2);\n'+
 ' e=mix(vec3(1.,.85,.62),vec3(.8,.74,.95),.25)*r*uDK;\n'+
 '#elif DREAM_FLOW==3\n'+   // the frieze: a band of night clouds drifting slowly round the room, lit at their edges, with a few small stars
 ' vec2 b=vec2(p.x+p.z,(p.y-'+CT.toFixed(3)+')*3.2);float t=uSecs*.02;\n'+
 ' float cl=.55*dn(b*vec2(.9,1.)+vec2(t,0.))+.3*dn(b*vec2(2.1,2.3)+vec2(t*1.6,5.))+.15*dn(b*vec2(4.7,5.)+vec2(t*2.3,9.));\n'+
 ' float edge=smoothstep(.42,.62,cl)*(1.-smoothstep(.62,.9,cl));vec3 cc=mix(vec3(.16,.11,.26),vec3(.42,.32,.55),smoothstep(.35,.75,cl))+vec3(.95,.74,.52)*edge*.7;\n'+
 ' vec2 g=floor(b*vec2(9.,9.)),f=fract(b*vec2(9.,9.))-.5;float st=step(.93,dh(g))*smoothstep(.16,.0,length(f))*(.6+.4*sin(uSecs*.8+dh(g+2.)*40.));\n'+
 ' e=(cc*smoothstep(.3,.6,cl)+vec3(1.,.93,.82)*st*(1.-smoothstep(.45,.7,cl)))*uDK;\n'+
 '#elif DREAM_FLOW==5\n'+   // mother-of-pearl: a soft, pale shimmer that shifts with the angle you look from
 ' float fr=1.-abs(dot(n,v));float t=fr*1.6+(p.x+p.y+p.z)*.08+uSecs*.008;e=mix(vec3(.85,.82,.95),dpal(t),.35)*(.25+fr*fr)*uDK;\n'+
 '#elif DREAM_FLOW==4\n'+   // the collections room: an antique celestial chart (Milky Way, stars, a few fine constellations) turning slowly round Pam's spiral sun
 ' if(p.x<uRoom.x-.1&&p.y>uRH-.05){vec2 q0=p.xz-vec2('+XM.toFixed(3)+',-5.);float an=uSecs*.004,ca=cos(an),sa=sin(an);vec2 q=vec2(ca*q0.x-sa*q0.y,sa*q0.x+ca*q0.y);float r=length(q);\n'+
 '  float bd=dot(q,vec2(.8,.6)),band=exp(-bd*bd/1.3);float mw=band*(.5*dn(q*1.3)+.3*dn(q*2.9+4.)+.2*dn(q*6.1+9.));e+=vec3(.30,.24,.46)*mw*.7+vec3(.55,.42,.32)*pow(mw,3.)*.6;\n'+
 '  vec2 g=floor(q*6.),f=fract(q*6.)-.5,o=vec2(dh(g+3.1),dh(g+7.7))-.5;float h=dh(g);float st=step(.8,h)*smoothstep(.055+.05*h,.0,length(f-o*.6))*(.55+.45*sin(uSecs*(.3+h)+h*40.));\n'+
 '  vec2 g2=floor(q*15.),f2=fract(q*15.)-.5;st+=step(.86-band*.12,dh(g2+21.))*smoothstep(.1,.0,length(f2))*.45;e+=vec3(1.,.94,.84)*st*1.3;\n'+
 '  float ln=9.,nd=9.;\n'+
 '  vec4 S[15];S[0]=vec4(-2.6,1.4,-2.,1.9);S[1]=vec4(-2.,1.9,-1.5,1.6);S[2]=vec4(-1.5,1.6,-1.,2.2);S[3]=vec4(-1.5,1.6,-1.6,.9);\n'+
 '  S[4]=vec4(1.2,2.4,1.8,2.);S[5]=vec4(1.8,2.,2.5,2.3);S[6]=vec4(2.5,2.3,2.9,1.7);S[7]=vec4(2.9,1.7,2.3,1.3);\n'+
 '  S[8]=vec4(-2.2,-1.8,-1.6,-1.3);S[9]=vec4(-1.6,-1.3,-.9,-1.7);S[10]=vec4(-.9,-1.7,-.4,-1.1);\n'+
 '  S[11]=vec4(1.,-2.6,1.6,-1.9);S[12]=vec4(1.6,-1.9,2.4,-2.2);S[13]=vec4(2.4,-2.2,2.,-1.5);S[14]=vec4(2.,-1.5,1.6,-1.9);\n'+
 '  for(int i=0;i<15;i++){ln=min(ln,dsg(q,S[i].xy,S[i].zw));nd=min(nd,min(length(q-S[i].xy),length(q-S[i].zw)));}\n'+
 '  e+=vec3(.92,.76,.52)*smoothstep(.011,.004,ln)*smoothstep(.03,.07,nd)*.8+vec3(1.,.9,.72)*(smoothstep(.04,.0,nd)*1.6+exp(-nd*22.)*.35);\n'+
 '  float a=atan(q.y,q.x),s1=.5+.5*sin(a+log(r+.02)*7.-uSecs*.05);e+=mix(vec3(.45,.16,.06),vec3(1.,.6,.28),s1)*smoothstep(.42,.08,r)*.9;e*=uDK;}\n'+
 '#endif\n'+
 ' return e*k;}\n';
var HEADF='varying vec3 vWPos;\nuniform float uPass,uFar,uRH,uEnvD;uniform vec4 uRoom;uniform vec2 uRes;\n'+
 '#if defined(DREAM_FLOW)||defined(DREAM_PULSE)||defined(DREAM_MIST)\nuniform float uSecs,uCalm;\n#endif\n#ifdef DREAM_FLOW\nuniform float uDK,uDS;uniform vec3 uDC;\n'+DFLOW+'#endif\n'+
 '#ifdef PLANAR_REFL\nuniform sampler2D uReflTex;uniform float uReflAmt;\n#endif\n'+
 '#ifdef WALK_FOG\nuniform float uFog;\n'+SKYBASE+'\n#endif\n'+ROOMAO;
var NBEGIN='float faceDirection=dot(vNormal,vViewPosition)>=0.?1.:-1.;\nvec3 normal=normalize(vNormal)*faceDirection;\nvec3 nonPerturbedNormal=normal;\n';
var BUMPF='#ifdef USE_BUMPMAP\nuniform sampler2D bumpMap;uniform float bumpScale;\n'+
 'vec2 dHdxy_fwd(){float h=texture2D(bumpMap,vBumpMapUv).x;return vec2(dFdx(h),dFdy(h))*bumpScale;}\n'+
 'vec3 perturbNormalArb(vec3 surf_pos,vec3 surf_norm,vec2 dHdxy,float faceDirection){vec3 dx=dFdx(surf_pos),dy=dFdy(surf_pos);vec3 r1=cross(dy,surf_norm),r2=cross(surf_norm,dx);float det=dot(dx,r1);vec3 g=sign(det)*(dHdxy.x*r1+dHdxy.y*r2);return normalize(abs(det)*surf_norm-g);}\n#endif\n';
var REFLF='#ifdef PLANAR_REFL\n{vec3 wn=inverseTransformDirection(normal,viewMatrix);vec2 su=gl_FragCoord.xy/uRes+wn.xz*.04;\n'+
 ' radiance=mix(radiance,textureLod(uReflTex,su,material.roughness*6.).rgb,uReflAmt);\n'+
 ' #ifdef USE_CLEARCOAT\n clearcoatRadiance=mix(clearcoatRadiance,textureLod(uReflTex,su,material.clearcoatRoughness*6.).rgb,uReflAmt);\n #endif\n}\n#endif\n';
var AOF='#ifdef STANDARD\n{vec3 wN=inverseTransformDirection(normal,viewMatrix);float rao=roomAO(vWPos,wN);reflectedLight.indirectDiffuse*=rao;reflectedLight.indirectSpecular*=mix(1.,rao,.7);\n'+
 ' #ifdef USE_CLEARCOAT\n clearcoatSpecularIndirect*=mix(1.,rao,.7);\n #endif\n}\n#endif\n';
var METF='#if defined(RE_IndirectSpecular)\n{vec3 Rw=inverseTransformDirection(reflect(-geometryViewDir,geometryNormal),viewMatrix);radiance*=mix(1.,mix(.22,1.3,smoothstep(-.35,.8,Rw.y)),metalnessFactor);}\n#endif\n';
var MISTF='#ifdef DREAM_MIST\n{float dd=length(vWPos-cameraPosition);float fm=(1.-exp(-dd*.045))*.45;float gm=exp(-max(vWPos.y,0.)*2.4)*(.6+.4*sin(vWPos.x*.7+uSecs*.05)*sin(vWPos.z*.6-uSecs*.04))*.09;gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.16,.12,.24),clamp(fm+gm,0.,.5));}\n#endif\n';
var FOGF='#ifdef WALK_FOG\n{vec3 hz=skyBase(normalize(vec3(vWPos.x,max(vWPos.y,0.)*.3,vWPos.z+10.)))*.92;gl_FragColor.rgb=mix(gl_FragColor.rgb,hz,uFog*smoothstep(4.,60.,length(vWPos-cameraPosition)));}\n#endif\n';
var SUNCUT=THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );','getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color*=sunIn(vWPos);');
function patchShader(sh,extra){var U=sh.uniforms;U.uPass=G3.uPass;U.uFar=G3.uFar;U.uRH=G3.uRH;U.uRoom=G3.uRoom;U.uRes=G3.uRes;U.uReflTex=G3.uReflTex;U.uEnvD=G3.uEnvD;U.uSecs=G3.uSecs;U.uCalm=G3.uCalm;for(var k in extra)U[k]=extra[k];
 sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;').replace('#include <project_vertex>','#include <project_vertex>\nvWPos=(modelMatrix*vec4(transformed,1.)).xyz;');
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\n'+HEADF)
  .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(uPass>.5&&uPass<1.5&&vWPos.y<.002)discard;')
  .replace('#include <color_fragment>','#include <color_fragment>\n#ifdef DREAM_FLOW\nif(vWPos.x<uRoom.x-.1)diffuseColor.rgb*=uDC;\n#if DREAM_FLOW==1\ndiffuseColor.rgb*=mix(1.,.55,smoothstep(1.9,uRH,vWPos.y));\n#endif\n#endif\n')
  .replace('#include <normal_fragment_begin>',NBEGIN)
  .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#ifdef DREAM_FLOW\ntotalEmissiveRadiance+=dreamGlow(vWPos,normal,normalize(vViewPosition));\n#endif\n')
  .replace('#include <bumpmap_pars_fragment>',BUMPF)
  .replace('#include <lights_fragment_begin>',SUNCUT)
  .replace('#include <lights_fragment_maps>','#include <lights_fragment_maps>\n#if defined(RE_IndirectDiffuse)\niblIrradiance*=uEnvD;\n#endif\n'+METF)
  .replace('#include <lights_fragment_end>',REFLF+'#include <lights_fragment_end>')
  .replace('#include <aomap_fragment>','#include <aomap_fragment>\n'+AOF)
  .replace('#include <opaque_fragment>','#include <opaque_fragment>\n#ifdef OPAQUE\ngl_FragColor.a=length(vWPos-cameraPosition)/uFar;\n#endif\n')
  .replace('#include <dithering_fragment>','#include <dithering_fragment>\n#ifdef DREAM_PULSE\ngl_FragColor.rgb*=.8+.2*sin(uSecs*.8+vWPos.y*7.+vWPos.x*3.);\n#endif\n'+MISTF+FOGF+'if(uPass>1.5)gl_FragColor.rgb=min(gl_FragColor.rgb,vec3(4.));\n#ifdef KEEP_COLOUR\nif(uPass<.5){const vec3 LW=vec3(.2126,.7152,.0722);float sh=dot(outgoingLight,LW)/max(dot(diffuseColor.rgb,LW),.02);vec3 kc=diffuseColor.rgb*sh;float lm=dot(kc,LW);kc=clamp(mix(vec3(lm),kc,1.05)*1.2/(1.+lm*.75),0.,1.);gl_FragColor=vec4(kc,-max(length(vWPos-cameraPosition)/uFar,.0005));}\n#endif\n')}   // Pam's statues: their own colours, lit by the light's brightness only (no warm cast from the sun, the clay walls or the sheen)
function mkBC(extra){return function(sh){patchShader(sh,extra)}}
function blendOpts(m,o){if(!m.blend)return;o.transparent=true;o.opacity=m.alpha;o.depthWrite=false;o.polygonOffset=true;o.polygonOffsetFactor=-1;o.polygonOffsetUnits=-4;
 o.blending=THREE.CustomBlending;o.blendSrc=THREE.SrcAlphaFactor;o.blendDst=THREE.OneMinusSrcAlphaFactor;o.blendSrcAlpha=THREE.ZeroFactor;o.blendDstAlpha=THREE.OneFactor}
var REFLU=[];
function mat3(m,env){
 if(m.isSky)return m.win&&SKYW?SKYW:(SKYD||SKYM);
 if(m.art)return artMat(m);
 var e=m.emis,em=Math.max(e[0],e[1],e[2]),M,o;
 if(m.unlit||m.flat){o={color:m.flat?c3([0,0,0]):c3([m.col[0]*e[0],m.col[1]*e[1],m.col[2]*e[2]]),side:THREE.DoubleSide};if(m.tex)o.map=m.tex;blendOpts(m,o);M=new THREE.MeshBasicMaterial(o);if(m.pulse){M.defines=M.defines||{};M.defines.DREAM_PULSE=''}M.onBeforeCompile=mkBC({});return M}
 o={color:c3(m.col),roughness:Math.max(.035,m.rough),metalness:m.metal,side:THREE.DoubleSide,envMap:env,envMapIntensity:m.envK||1};
 if(m.tex)o.map=m.tex;if(m.cut)o.alphaTest=m.cut;   /* (not alpha-to-coverage: this renderer keeps depth in the alpha channel) */   /* cut-out pictures (clay frames): see-through where the picture is clear */
 if(m.bump>0){o.bumpMap=m.htex||m.tex;o.bumpScale=m.bump*.02}
 if(em>0){o.emissive=c3([e[0]/em,e[1]/em,e[2]/em]);o.emissiveIntensity=em}
 blendOpts(m,o);
 if(m.x3){for(var k in m.x3)o[k]=m.x3[k];M=new THREE.MeshPhysicalMaterial(o)}else M=new THREE.MeshStandardMaterial(o);
 var ex={};
 if(m.refl){M.defines.PLANAR_REFL='';ex.uReflAmt={value:m.refl};REFLU.push([m,ex.uReflAmt])}
 if(m.fog){M.defines.WALK_FOG='';ex.uFog={value:m.fog}}
 if(m.mist&&DRM)M.defines.DREAM_MIST='';
 if(m.keep)M.defines.KEEP_COLOUR='';   /* Pam's statues in the ink look: shaded here and passed through the ink finish untouched, like the paintings */
 if(m.dream){M.defines.DREAM_FLOW=m.dream[0];ex.uDK={value:m.dream[1]};ex.uDS={value:m.dream[2]||.35};ex.uDC={value:new THREE.Vector3().fromArray(m.dreamC||[1,1,1])}}
 M.onBeforeCompile=mkBC(ex);return M}

/* ---------- geometry: every material's triangles become one mesh (split inside / outside for the right reflections) ---------- */
function geoFrom(v){var g=new THREE.BufferGeometry(),ib=new THREE.InterleavedBuffer(v,8);
 g.setAttribute('position',new THREE.InterleavedBufferAttribute(ib,3,0));g.setAttribute('normal',new THREE.InterleavedBufferAttribute(ib,3,3));g.setAttribute('uv',new THREE.InterleavedBufferAttribute(ib,2,6));
 g.computeBoundingSphere();return g}
function splitIO(v){var n=v.length/24,fl=new Uint8Array(n),nb=0,t;for(t=0;t<n;t++){var i=t*24;if((v[i+2]+v[i+10]+v[i+18])/3<ZF-.4){fl[t]=1;nb++}}
 if(nb===0)return[[v,0]];if(nb===n)return[[v,1]];
 var A=new Float32Array((n-nb)*24),Bv=new Float32Array(nb*24),ia=0,ib=0;for(t=0;t<n;t++){var s=v.subarray(t*24,t*24+24);if(fl[t]){Bv.set(s,ib);ib+=24}else{A.set(s,ia);ia+=24}}
 return[[A,0],[Bv,1]]}
var HEMI=null,ENVPH=null,ENVINM=[],ENVOUTM=[],REFLHIDE=[],BLENDL=[],DYNL=[],LIT=false,ENVRT={},PM=null,cubeRT=null,cubeCam=null,envAt=0;
function build3(m){var v=new Float32Array(m.v);m.v=null;m._3=[];
 var parts=(m.isSky||m.art||m.unlit||m.blend||m.flat)?[[v,0]]:splitIO(v);
 parts.forEach(function(pv){if(!pv[0].length)return;var M=mat3(m,ENVPH);if(M.isMeshStandardMaterial){(pv[1]?ENVOUTM:ENVINM).push(M);var er=ENVRT[pv[1]?'out':'in'];if(er)M.envMap=er.texture}
  var x=new THREE.Mesh(geoFrom(pv[0]),M);x.matrixAutoUpdate=false;
  x.castShadow=!m.blend&&!m.isSky&&!m.unlit&&!m.art&&!m.flat&&NOSHADOW.indexOf(m)<0;x.receiveShadow=!m.isSky&&!m.unlit&&!m.art;
  if(m.refl||m===Mx.blob||m===Mx.seaPlane)REFLHIDE.push(x);if(m.blend)BLENDL.push([m,x]);
  S3.add(x);m._3.push(x)})}
function matChanged(m){if(!m._3)return;m._3.forEach(function(x){var old=x.material;x.material=mat3(m,ENVPH);if(x.material.isMeshStandardMaterial)(x.position.z<ZF-.4?ENVOUTM:ENVINM).push(x.material);x.castShadow=false;x.receiveShadow=!m.art;if(old&&old!==SKYM&&old!==SKYD&&old!==SKYW)old.dispose()});if(!ENVBAKE)envAt=Date.now()+700;dirty=2}
function dynDraw(m,M){var d=m._dyn;if(!d)return;var x=d.pool[d.n];
 if(!x){x=new THREE.Mesh(d.g,d.M);x.matrixAutoUpdate=false;x.receiveShadow=true;S3.add(x);d.pool.push(x)}
 d.n++;x.matrix.fromArray(M);x.matrixWorldNeedsUpdate=true;x.visible=true}
function hideDyn(){DYNL.forEach(function(d){d.pool.forEach(function(x){x.visible=false})})}

/* physical upgrades for particular surfaces */
function upgradeMats(){
 if(DRM){Mx.floor.refl=.55;Mx.floor.rough=.22;Mx.floor.x3={clearcoat:.5,clearcoatRoughness:.04};   // the dream: a dark, glassy lake floor; iridescent rose gold and pearl
  if(!mobile&&!LOWGPU){Mx.gold.x3={iridescence:.6,iridescenceIOR:1.35,iridescenceThicknessRange:[200,600]};Mx.colD.x3={iridescence:.35,iridescenceIOR:1.3,iridescenceThicknessRange:[150,500]}}}
 else if(typeof CLAY!=='undefined'&&CLAY){var sh=function(c){return{sheen:.45,sheenRoughness:.8,sheenColor:c3(c)}};   // clay: a soft, velvety sheen instead of a glaze
  Mx.floor.x3=sh([1,.93,.82]);   /* (the colour switch turns it to a plum satin in the painted version) */Mx.marble.x3=sh([1,.95,.88]);Mx.wall.x3=sh([1,.94,.84]);Mx.ceiling.x3=sh([1,.95,.88]);Mx.coffer.x3=sh([1,.95,.88]);if(Mx.dado)Mx.dado.x3=sh([.8,.68,.78])}
 else{
 Mx.floor.x3={clearcoat:.65,clearcoatRoughness:.035};Mx.floor.rough=.3;Mx.floor.refl=.9;            // honed marble under a polished glaze
 Mx.marble.x3={clearcoat:.3,clearcoatRoughness:.12};                                                  // polished columns and balustrade
 }
 Mx.crystal.x3={ior:2.1,specularIntensity:1,iridescence:.22,iridescenceIOR:1.5,iridescenceThicknessRange:[180,520]};Mx.crystal.rough=.07;Mx.crystal.metal=0;Mx.crystal.envK=2.;Mx.crystal.col=[.32,.32,.35];Mx.crystal.emis=[.28,.26,.22];   // clear glass: almost no diffuse, all sparkle and reflection
 [Mx.gold,Mx.gold24,Mx.steel].forEach(function(m){m.envK=1.25});
 Mx.blob.flat=1;
 [Mx.candle,Mx.lantern,Mx.flame,Mx.lens,Mx.ring].forEach(function(m){m.unlit=1});   // light sources glow; they are not lit by themselves
 ['torso','neck','head','uarm','farm','hand','handG','thigh','shin','foot'].forEach(function(k){CR[k].forEach(function(m){m.fog=.2;m.x3={sheen:.35,sheenRoughness:.55,sheenColor:c3([.95,.82,.62])}})});
 PIGALL.forEach(function(m){if(m.tex)m.x3={sheen:.6,sheenRoughness:.75,sheenColor:c3([.8,.82,.9])}})}

/* ---------- lights ---------- */
function buildLights(){
 var sun=new THREE.DirectionalLight(0xffffff,4.4);sun.color.setRGB(SUNCOL[0]/4.4,SUNCOL[1]/4.4,SUNCOL[2]/4.4,LINEAR);
 var tg=[-4.6,1.5,-6.5];sun.position.set(tg[0]+SUN[0]*35,tg[1]+SUN[1]*35,tg[2]+SUN[2]*35);sun.target.position.set(tg[0],tg[1],tg[2]);S3.add(sun,sun.target);
 sun.castShadow=true;var S=sun.shadow;S.mapSize.set(SHS,SHS);S.camera.left=-17;S.camera.right=17;S.camera.top=17;S.camera.bottom=-17;S.camera.near=1;S.camera.far=80;S.bias=-.00035;S.normalBias=.012;S.radius=mobile?1.5:2.2;
 LIGHTS.spot.forEach(function(l,i){var pk=Math.max(l.c[0],l.c[1],l.c[2]),out=Math.acos(l.cos[1]),inn=Math.acos(l.cos[0]),tg=l.t||(ARTPOS[i]?ARTPOS[i].c:v3.add(l.p,l.d)),lp=[l.p[0],RH-.3,l.p[2]];   // hung just below the ceiling beams so they light the wall cleanly
  var s=new THREE.SpotLight(0xffffff,pk,0,out,1-inn/out,2);s.color.setRGB(l.c[0]/pk,l.c[1]/pk,l.c[2]/pk,LINEAR);s.position.set(lp[0],lp[1],lp[2]);s.target.position.set(tg[0],tg[1],tg[2]);S3.add(s,s.target);
  if(Q.spotSh&&l.sh!==false){s.castShadow=true;s.shadow.mapSize.set(1024,1024);s.shadow.camera.near=.25;s.shadow.camera.far=9;s.shadow.bias=-.0006;s.shadow.normalBias=.015;s.shadow.radius=3.2}});
 LIGHTS.point.forEach(function(l){var pk=Math.max(l.c[0],l.c[1],l.c[2]),p=new THREE.PointLight(0xffffff,pk,8,2);p.color.setRGB(l.c[0]/pk,l.c[1]/pk,l.c[2]/pk,LINEAR);p.position.set(l.p[0],l.p[1],l.p[2]);S3.add(p)});
 var h=HEMI=new THREE.HemisphereLight(0xffffff,0xffffff,1);h.color.setRGB(SKY[0]*Math.PI,SKY[1]*Math.PI,SKY[2]*Math.PI,LINEAR);
 if(typeof CLAY!=='undefined'&&CLAY){var wk=lin('#ffe8e0');h.color.setRGB(wk[0]*.42*Math.PI,wk[1]*.42*Math.PI,wk[2]*.42*Math.PI,LINEAR)}   /* clay: warm studio fill light */
h.groundColor.setRGB(GROUND[0]*Math.PI,GROUND[1]*Math.PI,GROUND[2]*Math.PI,LINEAR);S3.add(h)}

/* ---------- image-based lighting: the room itself, captured into a cube map and prefiltered ---------- */
function initEnv(){PM=new THREE.PMREMGenerator(R3);var res=ENVBAKE||mobile||LOWGPU?128:256,W=res*4,H=res*2,d=new Uint8Array(W*H*4);
 for(var i=0;i<W*H;i++){var y=Math.floor(i/W)/H;d[i*4]=y<.5?120:70;d[i*4+1]=y<.5?110:58;d[i*4+2]=y<.5?100:48;d[i*4+3]=255}
 var t=new THREE.DataTexture(d,W,H);t.mapping=THREE.EquirectangularReflectionMapping;t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;ENVPH=PM.fromEquirectangular(t).texture;t.dispose();
 cubeRT=new THREE.WebGLCubeRenderTarget(res,{type:THREE.HalfFloatType});cubeCam=new THREE.CubeCamera(.05,200,cubeRT)}
function syncBlend(){if(SKYTEXT.m)SKYTEXT.m.alpha=0;BLENDL.forEach(function(q){q[1].material.opacity=q[0].alpha;q[1].visible=q[0].alpha>.002})}
function captureEnv(){var pp=G3.uPass.value;hideDyn();syncBlend();G3.uPass.value=2;
 [[[0,1.55,-4.6],ENVINM,'in'],[[0,1.45,-11.6],ENVOUTM,'out']].forEach(function(q){
  for(var b=0;b<(mobile||LOWGPU?1:2);b++){var crt=new THREE.WebGLCubeRenderTarget(cubeRT.width,{type:THREE.HalfFloatType}),cc=new THREE.CubeCamera(.05,200,crt);cc.position.set(q[0][0],q[0][1],q[0][2]);cc.updateMatrixWorld(true);cc.update(R3,S3);   // a fresh cube camera per capture
   var rt=PM.fromCubemap(crt.texture);crt.dispose();q[1].forEach(function(M){M.envMap=rt.texture});if(ENVRT[q[2]])ENVRT[q[2]].dispose();ENVRT[q[2]]=rt}});
 G3.uPass.value=pp;dirty=2}

/* the dream: motes of light drifting slowly upwards, high in both rooms (above the paintings) and over the balcony */
var MOTES=null;
function dreamMotes(){var N=LOWGPU?90:(mobile?160:320),AT=typeof TOPM!=='undefined'?TOPM:2.6,CTP=typeof TOPS!=='undefined'?TOPS:2.6;
 var bands=[[X0+.9,X1-.9,ZF+.9,ZB-.9,Math.max(2.3,AT+.35),3.4,.45],[XL+.9,XW-.9,ZF+.9,ZB-.9,Math.max(2.95,CTP+.35),3.45,.3],[-6,6,-20,-11,1.2,6,.25]].filter(function(b){return b[4]<b[5]-.08});
 var tot=bands.reduce(function(a,b){return a+b[6]},0),P=[],S=[],BA=[],CO=[],pal=['#ffe2b0','#fff4e6','#e2d6ff','#ffd29a'].map(lin);
 bands.forEach(function(b){var n=Math.round(N*b[6]/tot);for(var i=0;i<n;i++){P.push(b[0]+(b[1]-b[0])*rnd(),b[4]+(b[5]-b[4])*rnd(),b[2]+(b[3]-b[2])*rnd());S.push(rnd()*100);BA.push(b[4],b[5]);var c=pal[(i*7+3)%4];CO.push(c[0],c[1],c[2])}});
 var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('aSeed',new THREE.Float32BufferAttribute(S,1));g.setAttribute('aBand',new THREE.Float32BufferAttribute(BA,2));g.setAttribute('aCol',new THREE.Float32BufferAttribute(CO,3));
 var M=new THREE.ShaderMaterial({uniforms:{uSecs:G3.uSecs,uCalm:G3.uCalm,uPass:G3.uPass,uScale:{value:600}},transparent:true,depthWrite:false,
  blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
  vertexShader:'attribute float aSeed;attribute vec2 aBand;attribute vec3 aCol;uniform float uSecs,uCalm,uScale;varying vec3 vC;varying float vA;\n'+
   'void main(){float H=aBand.y-aBand.x,sp=.02+.03*fract(aSeed*.37),f=fract((position.y-aBand.x)/H+uSecs*sp/H);vec3 p=position;p.y=aBand.x+f*H;\n'+
   ' p.x+=.25*sin(uSecs*.11+aSeed);p.z+=.25*cos(uSecs*.09+aSeed*1.3);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;\n'+
   ' gl_PointSize=clamp(uScale*.026/-mv.z,1.,18.);vC=aCol;vA=smoothstep(0.,.12,f)*smoothstep(1.,.88,f)*(1.-uCalm)*smoothstep(.9,1.8,-mv.z)*(.6+.4*sin(uSecs*.7+aSeed*6.));}',
  fragmentShader:'uniform float uPass;varying vec3 vC;varying float vA;void main(){if(uPass>.5||vA<.003)discard;vec2 q=gl_PointCoord-.5;float a=exp(-dot(q,q)*18.)*vA;gl_FragColor=vec4(vC*a*3.,0.);}'});
 MOTES=new THREE.Points(g,M);MOTES.frustumCulled=false;S3.add(MOTES)}
function upload(){
 if(!LIT){LIT=true;upgradeMats();initEnv();buildLights();if(DRM)dreamMotes()}
 MATS.forEach(function(m){if(m._3||!m.v||!m.v.length)return;build3(m)});
 R3.localClippingEnabled=true;
 WALKM.forEach(function(m){if(m._dyn||!m.v||!m.v.length)return;var M=mat3(m,ENVPH);if(PIGALL.indexOf(m)<0)M.clippingPlanes=[CRCLIP];if(M.isMeshStandardMaterial)ENVOUTM.push(M);m._dyn={g:geoFrom(new Float32Array(m.v)),M:M,pool:[],n:0};DYNL.push(m._dyn);m.v=null})}
function loadBakedEnv(cb){var left=2,ok=true;
 ['in','out'].forEach(function(k){fetch(ENVBAKE[k]).then(function(r){return r.blob()}).then(function(b){return createImageBitmap(b,{premultiplyAlpha:'none',colorSpaceConversion:'none'})}).then(function(bm){
  var t=new THREE.Texture(bm);t.colorSpace=THREE.NoColorSpace;t.premultiplyAlpha=false;t.flipY=false;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;
  var rt=mkRT(bm.width,bm.height);RGBMD.uniforms.uT.value=t;pass(RGBMD,rt);rt.texture.mapping=THREE.EquirectangularReflectionMapping;
  var pm=PM.fromEquirectangular(rt.texture);(k==='in'?ENVINM:ENVOUTM).forEach(function(M){M.envMap=pm.texture});if(ENVRT[k])ENVRT[k].dispose();ENVRT[k]=pm;t.dispose();rt.dispose();if(bm.close)bm.close()
 }).catch(function(e){console.error(e);ok=false}).then(function(){if(--left===0)cb(ok)})})}
function prep3(cb){var done=false;T3T.built=performance.now();
 function fin(){T3T.env=performance.now();cb()}
 function go(){if(done)return;done=true;T3T.compiled=performance.now();
  if(ENVBAKE)loadBakedEnv(function(ok){if(!ok){try{captureEnv()}catch(e){console.error(e)}}fin()});
  else{try{captureEnv()}catch(e){console.error(e)}fin()}}
 camAt(0);var as=innerWidth/Math.max(1,innerHeight);C3.aspect=as;C3.fov=fovFor(as)*180/Math.PI;C3.updateProjectionMatrix();C3.position.set(cam.x,cam.y,cam.z);C3.updateMatrixWorld();
 setTimeout(function(){var ms=null;try{ms=R3.compile(S3,C3)}catch(e){console.error(e)}
  // where the browser can compile shaders in the background, wait until they are ready before the first frame (kinder to slower graphics chips)
  var bg=false;try{bg=R3.extensions.has('KHR_parallel_shader_compile')}catch(e){}if(!bg||!ms||!ms.forEach){go();return}
  var t0=performance.now();(function wait(){var left=0;ms.forEach(function(m){try{var pr=R3.properties.get(m).currentProgram;if(pr&&!pr.isReady())left++}catch(e){}});if(!left||performance.now()-t0>15000)go();else setTimeout(wait,40)})()},0)}
/* if the browser takes the 3D away part-way through a visit (usually: the device ran short of graphics memory), say so plainly; reopening uses the lighter setting */
canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();try{sessionStorage.setItem('pgLite','1')}catch(_){}var L=document.getElementById('lost');if(L&&L.hidden){L.hidden=false;var b=document.getElementById('lostGo');if(b)b.focus()}},false);
/* build-time helper: the room's lighting as an equirectangular float image (used to make the baked environment) */
function bakeEq(k){var pp=G3.uPass.value;hideDyn();syncBlend();G3.uPass.value=2;var P=k==='in'?[0,1.55,-4.6]:[0,1.45,-11.6];
 var crt=new THREE.WebGLCubeRenderTarget(512,{type:THREE.HalfFloatType}),cc=new THREE.CubeCamera(.05,200,crt);cc.position.set(P[0],P[1],P[2]);cc.updateMatrixWorld(true);cc.update(R3,S3);
 var eq=mkRT(512,256,{type:THREE.FloatType});EQM.uniforms.uC.value=crt.texture;pass(EQM,eq);crt.dispose();
 var buf=new Float32Array(512*256*4);R3.readRenderTargetPixels(eq,0,0,512,256,buf);eq.dispose();G3.uPass.value=pp;
 var u8=new Uint8Array(buf.buffer),s='';for(var i=0;i<u8.length;i+=32768)s+=String.fromCharCode.apply(null,u8.subarray(i,i+32768));return btoa(s)}
/* ---------- post-processing: bloom, ambient occlusion, depth of field and the film grade ---------- */
var FSQ=new THREE.Mesh(new THREE.BufferGeometry(),null),PS3=new THREE.Scene(),OC=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
FSQ.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));FSQ.frustumCulled=false;PS3.add(FSQ);
var QV='in vec3 position;out vec2 vU;void main(){vU=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}';
function pmat(fs,u,bl){return new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:QV,fragmentShader:fs.replace(/^#version 300 es\s*/,''),uniforms:u,depthTest:false,depthWrite:false,blending:bl||THREE.NoBlending})}
function pass(M,target){FSQ.material=M;M.uniformsNeedUpdate=true;R3.setRenderTarget(target);R3.render(PS3,OC)}
var BLACK=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);BLACK.needsUpdate=true;
var BDOWN='precision highp float;in vec2 vU;out vec4 o;uniform sampler2D uT;uniform vec2 uPx;uniform float uFirst,uThr;\n'+
 (DRM?'vec3 s(vec2 d){vec4 t=texture(uT,vU+uPx*d);return (uFirst>.5&&t.a<0.)?vec3(0.):t.rgb;}\n':'vec3 s(vec2 d){return texture(uT,vU+uPx*d).rgb;}\n')+
 'void main(){vec3 a=s(vec2(-2.,2.)),b=s(vec2(0.,2.)),c=s(vec2(2.,2.)),d=s(vec2(-2.,0.)),e=s(vec2(0.)),f=s(vec2(2.,0.)),g=s(vec2(-2.,-2.)),h=s(vec2(0.,-2.)),i=s(vec2(2.,-2.)),j=s(vec2(-1.,1.)),k=s(vec2(1.,1.)),l=s(vec2(-1.,-1.)),m=s(vec2(1.,-1.));\n'+
 ' vec3 r=e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125;\n'+
 ' if(uFirst>.5){r=min(r,vec3(48.));float br=max(r.r,max(r.g,r.b)),kn=uThr*.5,rq=clamp(br-uThr+kn,0.,2.*kn);rq=rq*rq/(4.*kn+1e-4);r*=max(rq,br-uThr)/max(br,1e-4);}\n'+
 ' o=vec4(r,1.);}';
var BUP='precision highp float;in vec2 vU;out vec4 o;uniform sampler2D uT;uniform vec2 uPx;\n'+
 'void main(){vec2 d=uPx;vec3 c=texture(uT,vU+vec2(-d.x,d.y)).rgb+2.*texture(uT,vU+vec2(0.,d.y)).rgb+texture(uT,vU+d).rgb+2.*texture(uT,vU+vec2(-d.x,0.)).rgb+4.*texture(uT,vU).rgb+2.*texture(uT,vU+vec2(d.x,0.)).rgb+texture(uT,vU-d).rgb+2.*texture(uT,vU+vec2(0.,-d.y)).rgb+texture(uT,vU+vec2(d.x,-d.y)).rgb;o=vec4(c/16.,1.);}';
var RAYS='precision highp float;in vec2 vU;out vec4 o;uniform sampler2D uT;uniform vec2 uSun;\n'+
 'float m(vec2 uv){vec4 s=texture(uT,uv);if(s.a<1.2)return 0.;return clamp(dot(s.rgb,vec3(.5,.35,.15))-.3,0.,2.5)*1.6;}\n'+
 'void main(){vec2 d=uSun-vU;vec2 st=d/56.;vec2 uv=vU+st*fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);float acc=0.,w=1.;\n'+
 ' for(int i=0;i<56;i++){acc+=m(uv)*w;w*=.97;uv+=st;}o=vec4(vec3(acc/56.),1.);}';
var RGBMDEC='precision highp float;in vec2 vU;out vec4 o;uniform sampler2D uT;void main(){vec4 t=texture(uT,vec2(vU.x,1.-vU.y));o=vec4(t.rgb*t.a*6.,1.);}';
var EQFS='precision highp float;in vec2 vU;out vec4 o;uniform samplerCube uC;void main(){float a=(vU.x-.5)*6.2831853,e=(vU.y-.5)*3.1415927;vec3 d=vec3(cos(a)*cos(e),sin(e),sin(a)*cos(e));o=vec4(texture(uC,d).rgb,1.);}';
var AOFS=__AOFS__,DOF=__DOF__,COMP=__COMP__;
var BDM=pmat(BDOWN,{uT:{value:null},uPx:{value:new THREE.Vector2()},uFirst:{value:1},uThr:{value:1.6}}),
 BUM=pmat(BUP,{uT:{value:null},uPx:{value:new THREE.Vector2()}},THREE.AdditiveBlending),
 AOM=pmat(AOFS,{uT:{value:null},uTan:{value:new THREE.Vector2()},uPx:{value:new THREE.Vector2()},uFar:{value:FAR},uR:{value:.42},uAsp:{value:1}}),
 DOFM=pmat(DOF,{uT:{value:null},uFocus:{value:4},uFar:{value:FAR},uK:{value:1},uMax:{value:4},uPx:{value:new THREE.Vector2()}}),
 RGBMD=pmat(RGBMDEC,{uT:{value:null}}),EQM=pmat(EQFS,{uC:{value:null}}),
 RAYM=pmat(RAYS,{uT:{value:null},uSun:{value:new THREE.Vector2()}}),
 COMPM=pmat(COMP,{uRy:{value:BLACK},uRayK:{value:0},uT:{value:null},uB:{value:BLACK},uS:{value:BLACK},uA:{value:BLACK},uExp:{value:1},uTime:{value:0},uBurn:{value:1},uSec:{value:0},uSA:{value:1600/1100},uAOK:{value:0},uRes:{value:new THREE.Vector2()},uAPx:{value:new THREE.Vector2()},uBK:{value:.05}});
var sceneRT=null,reflRT=null,aoRT=null,dofRT=null,rayRT=null,BL=[],SUNV=new THREE.Vector3(),SKYSD=v3.norm([-.45,.2,-.87]);
function mkRT(w,h,o){return new THREE.WebGLRenderTarget(w,h,Object.assign({type:THREE.HalfFloatType,depthBuffer:false,stencilBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false},o||{}))}
function resize(){
 var cap=Math.sqrt((mobile?1.7e6:4.2e6)/Math.max(1,innerWidth*innerHeight)),dpr=Math.min(devicePixelRatio||1,Q.dpr,Math.max(1,cap)),w=Math.max(2,Math.round(innerWidth*dpr)),h=Math.max(2,Math.round(innerHeight*dpr));   // a pixel budget: big high-resolution screens no longer ask for 7-15 million pixels
 R3.setPixelRatio(1);R3.setSize(w,h,false);RT.w=w;RT.h=h;
 [sceneRT,reflRT,aoRT,dofRT,rayRT].concat(BL).forEach(function(t){if(t)t.dispose()});BL=[];
 sceneRT=mkRT(w,h,{depthBuffer:true,samples:(typeof LOOKNOW!=='undefined'&&LOOKNOW==='ink')?0:Math.min(Q.samples,dpr>=1.5?2:4,R3.capabilities.maxSamples||4)});   // on sharp screens 2x edge smoothing is plenty (4x used several times the memory); the ink look uses none: the pen draws its edges, and exact depth keeps them clean
 reflRT=Q.refl&&REFLU.length?mkRT(w>>1,h>>1,{depthBuffer:true,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter}):null;   // a mirror target only when something in the room reflects (the dream look's floor; nothing does in the ink or colour look)
 aoRT=mkRT(Math.max(1,w>>1),Math.max(1,h>>1));dofRT=Q.dof?mkRT(w,h):null;rayRT=mkRT(Math.max(1,w>>1),Math.max(1,h>>1));
 var bw=w>>1,bh=h>>1;for(var i=0;i<5&&bw>=4&&bh>=4;i++){BL.push(mkRT(bw,bh));bw>>=1;bh>>=1}
 dirty=2}
function bloomPass(){var n=BL.length,u=BDM.uniforms,i;
 u.uT.value=sceneRT.texture;u.uPx.value.set(1/RT.w,1/RT.h);u.uFirst.value=1;u.uThr.value=BLOOMT;pass(BDM,BL[0]);
 for(i=1;i<n;i++){u.uT.value=BL[i-1].texture;u.uPx.value.set(1/BL[i-1].width,1/BL[i-1].height);u.uFirst.value=0;pass(BDM,BL[i])}
 for(i=n-2;i>=0;i--){BUM.uniforms.uT.value=BL[i+1].texture;BUM.uniforms.uPx.value.set(1/BL[i+1].width,1/BL[i+1].height);pass(BUM,BL[i])}}

// the balcony figure is only seen above the rail: whatever of him a solid rail would hide stays hidden (his legs showed between the balusters)
var CRCLIP=new THREE.Plane(new THREE.Vector3(0,1,0),1e4);
var VC=new THREE.PerspectiveCamera();VC.matrixAutoUpdate=false;var SYM=new THREE.Matrix4().makeScale(1,-1,1),CLR=new THREE.Color().setRGB(.02,.015,.012,LINEAR);
var PERFI=/[?&]perf\b/.test(location.search)?{calls:0,tris:0}:null;   // ?perf only: draw calls and triangles of the scene pass, for the speed label
function render(time){
 var as=RT.w/RT.h;cam.fov=fovFor(as);
 var eye=[cam.x,cam.y,cam.z],dd=camDir();
 var V=M4.look(eye,v3.add(eye,dd),[0,1,0]),Pm=M4.persp(cam.fov,as,.05,200),VP=M4.mul(Pm,V);
 C3.fov=cam.fov*180/Math.PI;C3.aspect=as;C3.near=.05;C3.far=200;C3.updateProjectionMatrix();C3.position.set(eye[0],eye[1],eye[2]);C3.up.set(0,1,0);C3.lookAt(eye[0]+dd[0],eye[1]+dd[1],eye[2]+dd[2]);C3.updateMatrixWorld();
 G3.uSecs.value=DRM&&reduce?37.:NOWS%3600;if(MOTES)MOTES.material.uniforms.uScale.value=RT.h/(2*Math.tan(cam.fov/2));
 if(envAt&&Date.now()>envAt){envAt=0;captureEnv()}
 var rz=BAL+.12,vy=eye[1]-1.11,vz=eye[2]-rz;if(vz>.05&&!(typeof CLAY!=='undefined'&&CLAY)){var nl=Math.hypot(vy,vz);CRCLIP.normal.set(0,vz/nl,-vy/nl);CRCLIP.constant=-(CRCLIP.normal.y*1.11+CRCLIP.normal.z*rz)}else CRCLIP.constant=1e4;
 DYNL.forEach(function(d){d.n=0});drawPigeon();if(crVisible(VP))drawWalker();
 if(typeof titleSplit==='function')titleSplit(VP);
 DYNL.forEach(function(d){for(var i=d.n;i<d.pool.length;i++)d.pool[i].visible=false});
 syncBlend();
 R3.setClearColor(CLR,1);
 if(Q.refl&&reflRT&&REFLU.length){var keep=[];REFLHIDE.forEach(function(x){keep.push(x.visible);x.visible=false});var dv=[];DYNL.forEach(function(d){d.pool.forEach(function(x){dv.push(x.visible);x.visible=false})});
  VC.projectionMatrix.copy(C3.projectionMatrix);VC.projectionMatrixInverse.copy(C3.projectionMatrixInverse);VC.matrix.multiplyMatrices(SYM,C3.matrixWorld);VC.matrixWorldNeedsUpdate=true;
  G3.uPass.value=1;R3.setRenderTarget(reflRT);R3.clear(true,true,false);R3.render(S3,VC);G3.uPass.value=0;
  REFLHIDE.forEach(function(x,i){x.visible=keep[i]});var j=0;DYNL.forEach(function(d){d.pool.forEach(function(x){x.visible=dv[j++]})})}
 G3.uReflTex.value=reflRT?reflRT.texture:null;REFLU.forEach(function(q){q[1].value=(Q.refl&&reflRT)?q[0].refl:0});
 G3.uRes.value.set(RT.w,RT.h);
 R3.setRenderTarget(sceneRT);R3.clear(true,true,false);R3.render(S3,C3);if(PERFI){PERFI.calls=R3.info.render.calls;PERFI.tris=R3.info.render.triangles}
 var finalTex=sceneRT.texture,cu=COMPM.uniforms;if(cu.uDraw)cu.uDraw.value=typeof drawAmt==='function'?drawAmt():1;if(cu.uLw)cu.uLw.value=.4245/Math.tan(cam.fov/2);   // the pen's reach follows the view angle: 1 on computers, .68 on portrait phones
 if(Q.bloom&&BL.length&&BLOOMK>0){bloomPass();cu.uB.value=BL[0].texture;cu.uBK.value=BLOOMK}else{cu.uB.value=BLACK;cu.uBK.value=0}
 if(Q.ao){var au=AOM.uniforms,ty=Math.tan(cam.fov/2);au.uT.value=sceneRT.texture;au.uTan.value.set(ty*as,ty);au.uPx.value.set(1/RT.w,1/RT.h);au.uAsp.value=as;pass(AOM,aoRT);cu.uA.value=aoRT.texture;cu.uAOK.value=.85}else{cu.uA.value=BLACK;cu.uAOK.value=0}
 SUNV.set(eye[0]+SKYSD[0]*120,eye[1]+SKYSD[1]*120,eye[2]+SKYSD[2]*120).project(C3);var front=v3.dot(dd,SKYSD)>.05;
 if(Q.rays&&front&&RAYK>0){RAYM.uniforms.uT.value=sceneRT.texture;RAYM.uniforms.uSun.value.set(SUNV.x*.5+.5,SUNV.y*.5+.5);pass(RAYM,rayRT);cu.uRy.value=rayRT.texture;cu.uRayK.value=RAYK*Math.min(1,(v3.dot(dd,SKYSD)-.05)*3)}else{cu.uRy.value=BLACK;cu.uRayK.value=0}   // the ink look has no glow and no light shafts (BLOOMK, RAYK 0): their passes are skipped instead of drawn and thrown away
 if(Q.dof){var du=DOFM.uniforms;du.uT.value=sceneRT.texture;du.uFocus.value=focus;du.uK.value=cam.z<ZF?.25:1.4;du.uMax.value=Math.max(3,RT.h/150);du.uPx.value.set(1/RT.w,1/RT.h);pass(DOFM,dofRT);finalTex=dofRT.texture}
 cu.uT.value=finalTex;cu.uExp.value=EXPOSURE;cu.uTime.value=(time||0)%100;cu.uBurn.value=burnAmt();cu.uSec.value=((time||0)/1000)%600;cu.uRes.value.set(RT.w,RT.h);cu.uAPx.value.set(1/aoRT.width,1/aoRT.height);cu.uS.value=SCROLLTEX||BLACK;
 pass(COMPM,null)}

window.__t3={bakeEq:bakeEq,cube:function(){return cubeCam},T:T3T,GPU:GPU,RAYM:RAYM,ev:function(c){return eval(c)},Q:Q,R3:R3,S3:S3,G3:G3,ENVINM:ENVINM,ENVOUTM:ENVOUTM,hemi:function(){return HEMI},COMPM:COMPM,BDM:BDM,captureEnv:captureEnv,MATS:MATS,Mx:Mx};
