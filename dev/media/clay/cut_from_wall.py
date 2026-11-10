"""Cut a clay frame out of a picture where it hangs on a clay wall (with a flat green opening), using GrabCut seeded from the opening.
usage: python3 cut_from_wall.py <in.png> <painting h/w> <out_name>  ->  <out_name>.webp (frame + alpha) and <out_name>.json"""
import sys, json, cv2, numpy as np
src,ar,name=sys.argv[1],float(sys.argv[2]),sys.argv[3]
im=cv2.imread(src);H,W=im.shape[:2];b,g,r=[im[...,i].astype(int) for i in range(3)]
grn=(g>170)&(r<110)&(b<110)
c=grn.sum(0);rw=grn.sum(1);cx=np.nonzero(c>c.max()*.6)[0];ry=np.nonzero(rw>rw.max()*.6)[0]
ox0,ox1,oy0,oy1=int(cx.min()),int(cx.max()),int(ry.min()),int(ry.max());ow=ox1-ox0
m=int(ow*.32)                                     # generous box: liner + moulding are well inside this
rx0,ry0,rx1,ry1=max(0,ox0-m),max(0,oy0-m),min(W-1,ox1+m),min(H-1,oy1+m)
mask=np.full((H,W),cv2.GC_BGD,np.uint8);mask[ry0:ry1,rx0:rx1]=cv2.GC_PR_BGD
k=int(ow*.07);mask[oy0-k:oy1+k,ox0-k:ox1+k]=cv2.GC_FGD   # the liner right round the opening is certainly frame
mask[oy0:oy1+1,ox0:ox1+1]=cv2.GC_BGD               # the opening itself is not frame
# the frame's colour band: pixels within the box that differ clearly from the wall's typical colour are probably frame
wall=np.median(im[ry0:ry0+12,rx0:rx1].reshape(-1,3),0);d=np.linalg.norm(im.astype(float)-wall,axis=2)
pf=(d>38)&(mask==cv2.GC_PR_BGD);mask[pf]=cv2.GC_PR_FGD
bg=np.zeros((1,65),np.float64);fg=np.zeros((1,65),np.float64)
cv2.grabCut(im,mask,None,bg,fg,6,cv2.GC_INIT_WITH_MASK)
fgm=((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD)).astype(np.uint8)
n,lab,st,_=cv2.connectedComponentsWithStats(fgm);big=1+np.argmax(st[1:,cv2.CC_STAT_AREA]);fgm=(lab==big).astype(np.uint8)
fgm=cv2.morphologyEx(fgm,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
# fill holes inside the frame's outline except the opening
cs,_=cv2.findContours(fgm,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);solid=np.zeros_like(fgm);cv2.drawContours(solid,cs,-1,1,-1)
solid[oy0:oy1+1,ox0:ox1+1]=0
alpha=cv2.GaussianBlur((solid*255).astype(np.uint8),(5,5),0)
ys,xs=np.nonzero(solid);fx0,fx1,fy0,fy1=xs.min(),xs.max(),ys.min(),ys.max()
rgba=cv2.cvtColor(im,cv2.COLOR_BGR2BGRA);rgba[...,3]=alpha
crop=rgba[fy0:fy1+1,fx0:fx1+1]
# stretch so the opening is exactly the painting's shape (a few percent at most)
oh,owd=oy1-oy0,ox1-ox0;f=ar/(oh/owd);sx,sy=(1,f) if f>1 else (1/f,1)
crop=cv2.resize(crop,(round(crop.shape[1]*sx),round(crop.shape[0]*sy)),interpolation=cv2.INTER_AREA)
cv2.imwrite(name+'.png',crop)
from PIL import Image;Image.open(name+'.png').save(name+'.webp',quality=90,method=6)
op=[round((ox0-fx0)*sx),round((oy0-fy0)*sy),round((ox1-fx0)*sx),round((oy1-fy0)*sy)]
meta={'w':crop.shape[1],'h':crop.shape[0],'open':op};json.dump(meta,open(name+'.json','w'));print(name,meta,f'shape fix x{sx:.3f} y{sy:.3f}')
