import sys
s=open(sys.argv[1]).read()
s=s.replace("window.__house={","window.__dbg={cam:cam,set:function(t){window.__ct=t},raw:function(){render(performance.now())},art:function(){return ARTPOS.map(function(a){return{c:a.c,n:a.n,ax:a.ax,t:ART[a.k].t}})},stops:function(){return{SF:SF.map(function(s){return s.k+String.fromCharCode(32)+s.label}),SC:SC.map(function(s){return s.k+String.fromCharCode(32)+s.label}),nF:KF.length,nC:KC.length,over:MAINW?MAINW.over:null,ZB:ZB}}};window.__house={",1)
# gpu(): what the gallery asks of the graphics chip (test copy only)
G = """gpu:function(){var tex=new Set(),list=[],bytes=0;S3.traverse(function(o){var ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];ms.forEach(function(m){for(var k in m){var v=m[k];if(v&&v.isTexture)tex.add(v)}if(m.uniforms)for(var u in m.uniforms){var w=m.uniforms[u]&&m.uniforms[u].value;if(w&&w.isTexture)tex.add(w)}})});
 tex.forEach(function(t){var im=t.image||{},w=im.width||im.videoWidth||0,h=im.height||im.videoHeight||0,b=w*h*4*(t.generateMipmaps?1.33:1);if(t.isRenderTargetTexture)b=0;bytes+=b;list.push([w,h,Math.round(b/104857.6)/10,(t.name||(im.src||im.currentSrc||'').slice(-40)||t.constructor.name)])});
 list.sort(function(a,b){return b[2]-a[2]});
 return{Q:Q,mobile:mobile,LOWGPU:LOWGPU,GPU:GPU,look:typeof LOOKNOW!=='undefined'?LOOKNOW:null,spots:LIGHTS.spot.length,shSpots:LIGHTS.spot.filter(function(l){return l.sh!==false}).length,points:LIGHTS.point.length,
  programs:R3.info.programs.length,geoms:R3.info.memory.geometries,ntexR3:R3.info.memory.textures,calls:R3.info.render.calls,tris:R3.info.render.triangles,T3T:T3T,RT:[RT.w,RT.h],SHS:SHS,texMB:Math.round(bytes/1048576),ntex:list.length,big:list.slice(0,30),maxTex:R3.capabilities.maxTextures,maxSamples:R3.capabilities.maxSamples}},"""
s = s.replace("window.__dbg={", "window.__dbg={" + G.replace(chr(10), ''), 1)
a="requestAnimationFrame(frame);"
i=s.index("function frame(time){");j=s.index(a,i)+len(a)
s=s[:j]+"if(window.__freeze)return;"+s[j:]
open(sys.argv[2],'w').write(s)
