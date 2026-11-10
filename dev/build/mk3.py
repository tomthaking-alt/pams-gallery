"""Build the three.js 'lab' version of Pam's Gallery from the master page.
usage: python3 mk3.py <master.html> <out.html>"""
import sys, json, re
import os
SP = os.path.dirname(os.path.abspath(__file__)) + '/'
src, out = sys.argv[1], sys.argv[2]
s = open(src).read()

def rep(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (a[:80], c)
    s = s.replace(a, b)

def between(a, b, start=0):
    i = s.index(a, start); j = s.index(b, i + len(a)); return i, j

# ---- pull the GLSL we keep out of the old renderer
i, j = between('var FS=`', '`;')
FS = s[i + len('var FS=`'):j]
sky = FS[FS.index('float hsh(vec2 p)'):FS.index('uniform int uHasTex')]
skybase = FS[FS.index('vec3 skyBase(vec3 d){'):FS.index('vec3 skyCol(vec3 d)')]
def tmpl(name):
    i, j = between('var ' + name + '=`', '`;')
    return '`' + s[i + len('var ' + name + '=`'):j] + '`'
AOFS, DOF, COMP = tmpl('AOFS'), tmpl('DOF'), tmpl('COMP')
assert COMP.count('texture(uB,vU).rgb*.15') == 1
COMP = COMP.replace('texture(uB,vU).rgb*.15;', 'texture(uB,vU).rgb*uBK;c+=vec3(1.,.66,.42)*texture(uRy,vU).r*uRayK;').replace('uniform float uExp,', 'uniform float uBK,uRayK,uExp,', 1).replace('uniform sampler2D uT,uB,uS,uA;', 'uniform sampler2D uT,uB,uS,uA,uRy;', 1)
assert 'uRy' in COMP and 'uRayK,' in COMP and 'c+=vec3(1.,.66' in COMP
be = open(SP + 'backend.js').read()
import os, base64
EB = None
if os.path.exists(SP + 'env_in.png') and '--nobake' not in sys.argv:
    EB = {k: 'data:image/png;base64,' + base64.b64encode(open(SP + 'env_%s.png' % k, 'rb').read()).decode() for k in ('in', 'out')}
be = be.replace('__ENVBAKE__', json.dumps(EB))
be = be.replace('__SKYFUNCS__', json.dumps(sky)).replace('__SKYBASE__', json.dumps(skybase)).replace('__AOFS__', AOFS).replace('__DOF__', DOF).replace('__COMP__', COMP)
assert '__' not in re.sub(r'__(dbg|ct|freeze|house|G|fixedQuality|t3)\b', '', be).replace('__proto__', ''), 'unfilled placeholder'

# ---- the new renderer replaces shaders, render targets, lighting and draw code
i, j = between('/* ---------- shaders ---------- */', '/* ---------- camera path')
s = s[:i] + be + '\n' + s[j:]

# ---- context: three's WebGLRenderer on the same canvas
rep("var gl=canvas.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});\nif(!gl||!gl.getExtension('EXT_color_buffer_float')){fallback();return}\nvar ANISO=gl.getExtension('EXT_texture_filter_anisotropic');",
    "var THREE=window.THREE;if(!THREE){fallback();return}\n"
    "var R3;try{R3=new THREE.WebGLRenderer({canvas:canvas,antialias:false,alpha:false,depth:true,stencil:false,powerPreference:'high-performance'})}catch(e){fallback();return}\n"
    "var gl=R3.getContext();if(!R3.capabilities.isWebGL2||!gl.getExtension('EXT_color_buffer_float')){fallback();return}\n"
    "R3.autoClear=false;R3.outputColorSpace=THREE.LinearSRGBColorSpace;R3.toneMapping=THREE.NoToneMapping;R3.shadowMap.enabled=true;R3.shadowMap.type=THREE.PCFShadowMap;R3.shadowMap.autoUpdate=false;R3.shadowMap.needsUpdate=true;R3.debug.checkShaderErrors=/[?&]debug/.test(location.search);\n"
    "var MAXANISO=R3.capabilities.getMaxAnisotropy();")

# ---- textures become three textures (same orientation, colour space and wrapping as before)
i, j = between('function texFrom(c,o){', 'return{p:p,u:u}}')
s = s[:i] + ("function texFrom(c,o){o=o||{};var t=new THREE.Texture(c);t.flipY=false;t.colorSpace=o.lin?THREE.NoColorSpace:THREE.SRGBColorSpace;"
             "t.wrapS=o.clamp?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;t.wrapT=(o.clampT||o.clamp)?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;"
             "t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.anisotropy=Math.min(16,MAXANISO);t.needsUpdate=true;return t}") + s[j + len('return{p:p,u:u}}'):]

# ---- paintings: mark them, and swap to true-colour once the photo arrives
rep("rough:.45,bump:.9}); /* photographed works skip the painted stand-in */ ", "rough:.45,bump:.9});pm.isPaint=1; /* photographed works skip the painted stand-in */ ")
rep("pm.art=1;dirty=2};im.src=p.img", "pm.art=1;matChanged(pm);dirty=2};im.src=p.img")

# ---- the pigeon and the walking figure are drawn as posed meshes
rep("function dm(list,M){gl.uniformMatrix4fv(u.uM,false,M);list.forEach(function(m){drawMatU(u,m)})}\n dm(PIGP.legs,W);dm(PIGP.body,Bd);dm(PIGP.tail,Tl);dm(PIGP.head,Hd);gl.uniformMatrix4fv(u.uM,false,IDM)}",
    "function dm(list,M){list.forEach(function(m){dynDraw(m,M)})}\n dm(PIGP.legs,W);dm(PIGP.body,Bd);dm(PIGP.tail,Tl);dm(PIGP.head,Hd)}")
i, j = between('function drawMatU(u,m){', 'gl.drawArrays(gl.TRIANGLES,0,m.n)}')
s = s[:i] + 'function drawMatU(){}' + s[j + len('gl.drawArrays(gl.TRIANGLES,0,m.n)}'):]
i, j = between('function drawWalker(u){', 'gl.uniformMatrix4fv(u.uM,false,IDM)}')
s = s[:i] + ("function drawWalker(){var tt=window.__ct!=null?window.__ct:NOWS,st=crState(tt);gripRail(st,((tt%CRT0)+CRT0)%CRT0);var W=mm(mT(st.x,st.b,st.z),mRy(st.ry),mS(CRS));\n"
             " crPose(st.P).forEach(function(q){var Mq=mm(W,q[1]);CR[q[0]].forEach(function(m){dynDraw(m,Mq)})})}") + s[j + len('gl.uniformMatrix4fv(u.uM,false,IDM)}'):]
i, j = between('function upload(){', 'm.vao=vao;m.v=null})}')
s = s[:i] + s[j + len('m.vao=vao;m.v=null})}'):]       # (the new upload lives in the renderer section)
i, j = between('function drawBirds(u){', 'gl.drawArrays(gl.TRIANGLES,0,birdN)}')
s = s[:i] + 'function drawBirds(){}' + s[j + len('gl.drawArrays(gl.TRIANGLES,0,birdN)}'):]

# ---- start-up: compile shaders and capture the room's lighting while the loading screen is up
rep(" scrollTo(0,0);cur=0;camAt(0);render(0);dirty=0;openDoors(George.start);\n requestAnimationFrame(frame);\n});",
    " prep3(function(){scrollTo(0,0);cur=0;camAt(0);render(0);dirty=0;openDoors(George.start);\n requestAnimationFrame(frame)});\n});")
rep("requestAnimationFrame(function(){setTimeout(function(){Promise.all([loadMats(),CATP]).then(function(){try{boot3D()}catch(e){console.error(e);fallback()}})},30)});",
    "function whenThree(){return new Promise(function(res){if(window.THREE)return res();addEventListener('three-ready',function(){res()},{once:true});setTimeout(res,20000)})}\n"
    "requestAnimationFrame(function(){setTimeout(function(){Promise.all([loadMats(),CATP,whenThree()]).then(function(){try{boot3D()}catch(e){console.error(e);fallback()}})},30)});")
rep('</head>', '<script type="module">import * as T from "/lib/three-r160.module.min.js";window.THREE=T;dispatchEvent(new Event("three-ready"))</script>\n</head>')
rep("a.href='ar/p'", "a.href='/ar/p'")

rep('if(ema>26&&!window.__fixedQuality&&degrade())ema=18', 'if(ema>26&&!window.__fixedQuality&&degrade(ema))ema=18')
# ---- no stray raw-GL calls may remain
left = [m.start() for m in re.finditer(r'\bgl\.(?!getExtension|getParameter)', s)]
assert not left, [s[k-60:k+60] for k in left[:5]]
if '--dream' in sys.argv:   # the dream-look preview build
    rep('var DREAM_DEFAULT=false;', 'var DREAM_DEFAULT=true;')
if '--lab' in sys.argv:
    rep('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">')
open(out, 'w').write(s)
print('ok', len(s))
