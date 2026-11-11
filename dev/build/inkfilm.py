"""Turns an opening film into a pen-and-ink drawing on warm paper, to match the gallery's ink look.
Plain image processing, so it costs no Higgsfield credits: pencil-style contour lines deepened into ink, crisp outlines,
fine cross-hatching in the shadows only, a faint ink wash, and a still paper grain (the paper and hatching stay put while
the film moves, as on a real sheet).
usage: python3 inkfilm.py <in.mp4> <out.mkv>       (out is lossless FFV1; film.sh then loops and encodes it for the web)
Needs ffmpeg, numpy and opencv (cv2)."""
import json, subprocess, sys
import cv2, numpy as np

src, dst = sys.argv[1], sys.argv[2]
UP = int(sys.argv[3]) if len(sys.argv) > 3 else 0      # optional: draw at this width (e.g. 1920) for finer, crisper pen lines
info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                           'stream=width,height,r_frame_rate', '-of', 'json', src]))['streams'][0]
W, H, FPS = info['width'], info['height'], info['r_frame_rate']
S = max(W, H) / 1280                                    # sizes below are for a 1280-pixel frame
if UP and UP > W:                                       # a bigger sheet: same drawing, thinner lines (the pen does not grow with it)
    H, W = round(H * UP / W / 2) * 2, UP; S = S * 1.15

P = dict(ds=7, lk=1.9, lg=1.25, sig=1.3, phi=140, xw=.78, lo=.05, hi=.8, per=4.4, t1=.40, t2=.17, wash=.22, keep=.32)


def grain(seed=7):          # the paper: fine fibres and a gentle, uneven tone
    r = np.random.default_rng(seed)
    n = cv2.GaussianBlur(r.standard_normal((H, W)).astype(np.float32), (0, 0), 1.1) * .45 \
        + cv2.GaussianBlur(r.standard_normal((H, W)).astype(np.float32), (0, 0), 14 * S) * 2.6
    return 1 + n * .011


def hatch(period, ang, seed):   # 0 on a pen stroke, 1 between strokes; the strokes wobble a little, as by hand
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.random.default_rng(seed)
    wob = cv2.resize(cv2.GaussianBlur(r.standard_normal((H // 8 + 1, W // 8 + 1)).astype(np.float32), (0, 0), 3), (W, H)) * 2.0
    u = (x * np.cos(ang) + y * np.sin(ang) + wob) / period
    return np.abs(u - np.round(u)) * 2


PAPER = grain()[..., None]
H1, H2 = hatch(P['per'] * S, .78, 3), hatch(P['per'] * S * 1.2, -.62, 5)
PAP = np.array([226, 237, 245], np.float32) / 255      # warm paper (BGR)
INK = np.array([24, 28, 36], np.float32) / 255         # brown-black ink (BGR)


def ink_amount(bgr):
    g8 = cv2.bilateralFilter(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), 9, 28, 7)
    g = g8.astype(np.float32) / 255
    bl = cv2.GaussianBlur(1 - g, (0, 0), P['ds'] * S)                       # contours, pencil-style (colour dodge) ...
    lines = np.clip((1 - np.clip(g / np.maximum(1 - bl, 1e-3), 0, 1)) * P['lk'], 0, 1) ** P['lg']
    a = cv2.GaussianBlur(g, (0, 0), P['sig'] * S)                           # ... with crisp outlines on top (XDoG)
    d = a - .99 * cv2.GaussianBlur(g, (0, 0), P['sig'] * S * 1.6)
    xd = 1 - np.clip(np.where(d >= -.002, 1.0, 1 + np.tanh(P['phi'] * (d + .002))), 0, 1)
    lines = 1 - (1 - lines) * (1 - xd * P['xw'])
    L = np.clip((g - P['lo']) / (P['hi'] - P['lo']), 0, 1)                 # tone: hatching only where it is properly dark
    c1, c2 = np.clip((P['t1'] - L) / P['t1'], 0, 1), np.clip((P['t2'] - L) / P['t2'], 0, 1)
    k1 = np.clip((c1 * .5 - H1) * 3.2 + .5, 0, 1) * (c1 > 0)
    k2 = np.clip((c2 * .45 - H2) * 3.2 + .5, 0, 1) * (c2 > 0)
    shade = 1 - (1 - k1 * .6) * (1 - k2 * .7)
    wash = (1 - L) ** 1.6 * P['wash']
    return np.clip(1 - (1 - lines) * (1 - shade) * (1 - wash), 0, 1)


dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', 'hqdn3d=3:2:7:5,scale=%d:%d:flags=lanczos' % (W, H), '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'],
                       stdout=subprocess.PIPE)       # a little temporal denoising first, so the pen lines don't shimmer
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', '%dx%d' % (W, H), '-r', FPS,
                        '-i', '-', '-c:v', 'ffv1', dst], stdin=subprocess.PIPE)
prev, n = None, 0
while True:
    buf = dec.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    amt = ink_amount(np.frombuffer(buf, np.uint8).reshape(H, W, 3))
    if prev is not None:
        amt = amt * (1 - P['keep']) + prev * P['keep']   # a touch of the previous frame: steadier lines
    prev = amt
    out = (PAP * (1 - amt[..., None]) + INK * amt[..., None]) * PAPER
    enc.stdin.write(np.clip(out * 255, 0, 255).astype(np.uint8).tobytes())
    n += 1
enc.stdin.close(); enc.wait(); dec.wait()
print('%s: %d frames inked -> %s' % (src, n, dst))
