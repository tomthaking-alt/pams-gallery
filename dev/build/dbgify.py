import sys
s=open(sys.argv[1]).read()
s=s.replace("window.__house={","window.__dbg={cam:cam,set:function(t){window.__ct=t},raw:function(){render(performance.now())},art:function(){return ARTPOS.map(function(a){return{c:a.c,n:a.n,ax:a.ax,t:ART[a.k].t}})},stops:function(){return{SF:SF.map(function(s){return s.k+String.fromCharCode(32)+s.label}),SC:SC.map(function(s){return s.k+String.fromCharCode(32)+s.label}),nF:KF.length,nC:KC.length,over:MAINW?MAINW.over:null,ZB:ZB}}};window.__house={",1)
a="requestAnimationFrame(frame);"
i=s.index("function frame(time){");j=s.index(a,i)+len(a)
s=s[:j]+"if(window.__freeze)return;"+s[j:]
open(sys.argv[2],'w').write(s)
