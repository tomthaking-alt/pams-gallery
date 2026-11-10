"""The picture shown when someone shares the home page: three paintings in gilded frames on warm paper, with the gallery's name.
usage: python3 sharecard.py <built app.js> <libdir>  -> prints the /lib/ path"""
import sys, json, re, hashlib, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
app, lib = sys.argv[1], sys.argv[2]
EMB = json.loads(re.search(r'const EMB = (\{.*?\});\n', open(app).read(), re.S).group(1))
W, H = 1200, 630
bg = Image.new('RGB', (W, H), '#f4ede1'); d = ImageDraw.Draw(bg)
for y in range(H): d.line([(0, y), (W, y)], fill=(250 - y // 40, 244 - y // 34, 233 - y // 30))
def framed(pid, hgt):
    im = Image.open(os.path.join(lib, os.path.basename(EMB[pid]['img']))).convert('RGB')
    w = round(im.width * hgt / im.height); im = im.resize((w, hgt), Image.LANCZOS)
    f = 14; out = Image.new('RGB', (w + 2 * f, hgt + 2 * f), '#c39a52'); od = ImageDraw.Draw(out)
    od.rectangle([0, 0, out.width - 1, out.height - 1], outline='#7a5a22', width=3); od.rectangle([f - 4, f - 4, f + w + 3, f + hgt + 3], outline='#8a6a2e', width=2)
    out.paste(im, (f, f)); return out
pieces = [framed('p1', 290), framed('p7', 236), framed('p9', 236)]
gap = 44; total = sum(pc.width for pc in pieces) + gap * (len(pieces) - 1); x = (W - total) // 2; cy = 228
for pc in pieces:
    hy = cy - pc.height // 2
    sh = Image.new('RGBA', (pc.width + 40, pc.height + 40), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    sd.rectangle([20, 26, pc.width + 20, pc.height + 26], fill=(40, 24, 14, 70)); sh = sh.filter(ImageFilter.GaussianBlur(10))
    bg.paste(sh, (x - 20, hy - 20), sh); bg.paste(pc, (x, hy)); x += pc.width + gap
T = ImageFont.truetype('/usr/share/fonts/truetype/google-fonts/Lora-Italic-Variable.ttf', 64)
S = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Regular.otf', 22)
d = ImageDraw.Draw(bg)
d.text((W // 2, 486), 'Pam’s Gallery', font=T, fill='#2a1c14', anchor='mm')
d.line([(W // 2 - 40, 530), (W // 2 + 40, 530)], fill='#b08d57', width=2)
d.text((W // 2, 566), 'ORIGINAL PAINTINGS  ·  ITSAMEPAMEO.COM', font=S, fill='#6b5a4e', anchor='mm')
o = os.path.join(lib, 'x.jpg'); bg.save(o, 'JPEG', quality=86, optimize=True, progressive=True)
b = open(o, 'rb').read(); name = 'g-%s.jpg' % hashlib.md5(b).hexdigest()[:12]; os.replace(o, os.path.join(lib, name)); print('/lib/' + name)
