"""Move the big embedded images out of a built page into cached files under /lib/.
Each artwork gets: full size (zoom), a room-size copy (3D + cards), a small one (intro film), and a WATERMARKED copy
for anything that can leave the site. Every artwork file carries the copyright in its details (EXIF).
usage: python3 split4.py <built.html> <out.html> <libdir>"""
import sys, re, base64, hashlib, io, os
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wmlib import watermark, exif_bytes, add_exif, jpg
src, outp, libdir = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src).read()
os.makedirs(libdir, exist_ok=True)
made = {}
def put(b, ext):
    h = hashlib.md5(b).hexdigest()[:12]
    name = 'g-%s.%s' % (h, ext)
    open(os.path.join(libdir, name), 'wb').write(b)
    made[name] = len(b)
    return '/lib/' + name
def scaled(im, L):
    w, h = im.size; k = L / max(w, h)
    return im if k >= 1 else im.resize((round(w * k), round(h * k)), Image.LANCZOS)

# 1. the artworks
i = s.index('var ART=['); j = s.index('\n];', i)
lines = s[i:j].split('\n'); n = 0
for li, L in enumerate(lines):
    m = re.search(r'img:"data:image/jpeg;base64,([A-Za-z0-9+/=]+)"', L)
    if not m: continue
    t = re.search(r'\{t:"([^"]*)"', L).group(1)
    b = base64.b64decode(m.group(1)); im = Image.open(io.BytesIO(b)); ex = exif_bytes(t)
    full = put(add_exif(b, ex), 'jpg'); mid = put(jpg(scaled(im, 1280), 80, ex), 'jpg'); tn = put(jpg(scaled(im, 720), 78, ex), 'jpg')
    wm = put(jpg(watermark(im, 1600), 82, ex), 'jpg')
    lines[li] = L[:m.start()] + 'img:"%s",full:"%s",tn:"%s",wm:"%s"' % (mid, full, tn, wm) + L[m.end():]; n += 1
s = s[:i] + '\n'.join(lines) + s[j:]
print('artworks', n)
# 2. everything else that is big: textures, lighting, frame, portrait
def other(m):
    if len(m.group(0)) < 20000: return m.group(0)
    b = base64.b64decode(m.group(2))
    if m.group(1) == 'png': return put(b, 'png')
    im = Image.open(io.BytesIO(b)); o = io.BytesIO(); im.save(o, 'JPEG', quality=80, optimize=True, progressive=True)
    return put(o.getvalue() if len(o.getvalue()) < .8 * len(b) else b, 'jpg')
s = re.sub(r'data:image/(jpeg|png);base64,([A-Za-z0-9+/=]+)', other, s)
open(outp, 'w').write(s)
print('page KB', len(s) // 1024, '| files', len(made), 'KB', sum(made.values()) // 1024)
for k, v in sorted(made.items(), key=lambda x: -x[1])[:12]: print('  ', k, v // 1024)
