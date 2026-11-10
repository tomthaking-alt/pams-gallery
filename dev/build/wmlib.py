"""Watermarked copies (for anything that can leave the site) and copyright details inside every artwork file.
The look matches wmCanvas() in the page, which does the same for photos Pam uploads herself."""
import math, io
from PIL import Image, ImageDraw, ImageFont
FONT = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
MARK = '© PAM’S GALLERY  ·  ITSAMEPAMEO.COM'
BADGE = '© Pam’s Gallery · itsamepameo.com'
COPY = "(c) Pam's Gallery - itsamepameo.com. All rights reserved. No reproduction without permission."

def watermark(im, L=1600):
    im = im.convert('RGB'); W0, H0 = im.size; k = min(1, L / max(W0, H0))
    if k < 1: im = im.resize((round(W0 * k), round(H0 * k)), Image.LANCZOS)
    W, H = im.size
    fs = max(14, round(max(W, H) * .022)); f = ImageFont.truetype(FONT, fs)
    D = int(math.hypot(W, H)) + 4 * fs
    lay = Image.new('RGBA', (D, D), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    tw = d.textlength(MARK, font=f); gap = fs * 3.2; rh = fs * 5.5; o = max(1, round(fs * .08))
    r = 0; y = 0.0
    while y < D:
        x = -(r % 2) * (tw + gap) / 2
        while x < D:
            d.text((x + o, y + o), MARK, font=f, fill=(0, 0, 0, 41))
            x += tw + gap
        r += 1; y += rh
    sh = lay; lay2 = Image.new('RGBA', (D, D), (0, 0, 0, 0)); d2 = ImageDraw.Draw(lay2)
    r = 0; y = 0.0
    while y < D:
        x = -(r % 2) * (tw + gap) / 2
        while x < D:
            d2.text((x, y), MARK, font=f, fill=(255, 255, 255, 66))
            x += tw + gap
        r += 1; y += rh
    base = im.convert('RGBA')
    for L_ in (sh, lay2):
        rot = L_.rotate(24, resample=Image.BICUBIC)
        cx, cy = (D - W) // 2, (D - H) // 2
        base = Image.alpha_composite(base, rot.crop((cx, cy, cx + W, cy + H)))
    # the corner credit
    bs = max(12, round(min(W, H) * .03)); bf = ImageFont.truetype(FONT, bs)
    bd = ImageDraw.Draw(base, 'RGBA'); bw = bd.textlength(BADGE, font=bf); p = bs * .6; m = round(bs * .8)
    x0, y0 = W - bw - 2 * p - m, H - bs - 2 * p - m
    badge = Image.new('RGBA', base.size, (0, 0, 0, 0)); bdd = ImageDraw.Draw(badge)
    bdd.rounded_rectangle((x0, y0, x0 + bw + 2 * p, y0 + bs + 2 * p), radius=bs * .4, fill=(20, 14, 10, 158))
    bdd.text((x0 + p, y0 + p + bs / 2), BADGE, font=bf, fill=(255, 255, 255, 240), anchor='lm')
    base = Image.alpha_composite(base, badge)
    return base.convert('RGB')

def exif_bytes(title=''):
    e = Image.Exif(); e[0x013B] = 'Pam'; e[0x8298] = COPY
    t = title.encode('ascii', 'ignore').decode()
    if t: e[0x010E] = t + ' - by Pam, itsamepameo.com'
    return e.tobytes()

def add_exif(jpeg, ex):
    """put the copyright details into a JPEG without re-compressing it"""
    assert jpeg[:2] == b'\xff\xd8'
    seg = b'\xff\xe1' + (len(ex) + 2).to_bytes(2, 'big') + ex
    i = 2
    if jpeg[2:4] == b'\xff\xe0': i = 4 + int.from_bytes(jpeg[4:6], 'big')   # after the JFIF header
    return jpeg[:i] + seg + jpeg[i:]

def jpg(im, q, ex=b''):
    o = io.BytesIO(); im.convert('RGB').save(o, 'JPEG', quality=q, optimize=True, progressive=True, exif=ex); return o.getvalue()
