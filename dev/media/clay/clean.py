import sys, json, numpy as np
from PIL import Image
name=sys.argv[1]
im=np.array(Image.open(name+'.png').convert('RGBA')); a=im[...,3]>128; H,W=a.shape
rows=a.mean(1); cols=a.mean(0)
r=np.where(rows>.75)[0]; c=np.where(cols>.75)[0]
t,b,l,rr=r[0],r[-1],c[0],c[-1]
print(name,'frame box',l,t,rr,b,'of',W,H)
m=np.zeros_like(a); m[t:b+1,l:rr+1]=1
im[...,3]=np.where(m,im[...,3],0)
# crop to box
im=im[t:b+1,l:rr+1]; j=json.load(open(name+'.json')); o=j['open']
j={'w':int(rr-l+1),'h':int(b-t+1),'open':[int(o[0]-l),int(o[1]-t),int(o[2]-l),int(o[3]-t)]}
Image.fromarray(im).save(name+'-c.png'); Image.fromarray(im).save(name+'-c.webp',quality=88,method=6)
json.dump(j,open(name+'-c.json','w')); print(j)
