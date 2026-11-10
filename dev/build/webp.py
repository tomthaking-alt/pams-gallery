"""WebP copies of the gallery's card and page pictures (same name, .webp), keeping the copyright details. usage: webp.py <built app.js> <libdir> [<libdir>...]"""
import sys, json, re, os
from PIL import Image
app, libs = sys.argv[1], sys.argv[2:]
EMB = json.loads(re.search(r'const EMB = (\{.*?\});\n', open(app).read(), re.S).group(1))
want = sorted({os.path.basename(e[k]) for e in EMB.values() for k in ('img', 'tn') if e.get(k, '').startswith('/lib/')})
made = 0
for n in want:
    src = os.path.join(libs[0], n); out = n[:-4] + '.webp'
    if not os.path.exists(src): continue
    if all(os.path.exists(os.path.join(L, out)) for L in libs): continue
    im = Image.open(src); ex = im.info.get('exif')
    kw = dict(quality=80, method=6)
    if ex: kw['exif'] = ex
    im.convert('RGB').save(os.path.join(libs[0], out), 'WEBP', **kw); made += 1
    for L in libs[1:]:
        if L != libs[0]: open(os.path.join(L, out), 'wb').write(open(os.path.join(libs[0], out), 'rb').read())
tot_j = sum(os.path.getsize(os.path.join(libs[0], n)) for n in want if os.path.exists(os.path.join(libs[0], n)))
tot_w = sum(os.path.getsize(os.path.join(libs[0], n[:-4] + '.webp')) for n in want if os.path.exists(os.path.join(libs[0], n[:-4] + '.webp')))
print('webp: %d made, %d total; %.0f KB jpg -> %.0f KB webp' % (made, len(want), tot_j / 1024, tot_w / 1024))
