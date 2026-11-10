"""Makes the gallery's clay surface: smooth, fine-grained, unglazed fired clay (no thumbprints or lumps).
usage: python3 claytex.py <out_dir> <version>      e.g. claytex.py dev/src/clay 2   ->  clay-v2.webp (colour) and clay-h-v2.webp (relief)
Both tile seamlessly (the noise is made in frequency space, so it wraps). The colour file is nearly white: the page tints it
per surface (walls, floor, ...). Raise the version when it changes, because /lib files are cached for a year. Needs numpy, pillow."""
import sys, numpy as np
from PIL import Image

out, ver = sys.argv[1], sys.argv[2]
N = 1024; rng = np.random.default_rng(1998)
fy, fx = np.meshgrid(np.fft.fftfreq(N), np.fft.fftfreq(N), indexing='ij'); f = np.hypot(fx, fy)

def noise(px):   # smooth periodic noise with features about px pixels across, scaled to -1..1
    n = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((N, N))) * np.exp(-(f * px) ** 2 * 2)))
    return n / np.abs(n).max()

def norm(a): a = a - a.mean(); return a / np.abs(a).max()

# relief: a very fine grain, a soft trowelled undulation, and a few tiny pores
grain = noise(1.2) * .55 + noise(3) * .45
trowel = noise(70)
pores = noise(2.5); pores = -np.clip(pores - .55, 0, None) * 4      # small sparse dips
height = norm(grain * .45 + trowel * .4 + pores * .35)
Image.fromarray(np.uint8(np.clip(128 + height * 70, 0, 255))).save(f'{out}/clay-h-v{ver}.webp', quality=92, method=6)

# colour: nearly white, with a gentle fired-clay mottle and fine specks of grog, very low contrast
mottle = noise(160) * .6 + noise(45) * .4
specks = noise(1.5); specks = np.clip(np.abs(specks) - .62, 0, None) * 3 * np.sign(specks)
v = 1 - .035 + mottle * .03 + specks * .05 + grain * .012
rgb = np.stack([v * 1.0, v * .992, v * .982], -1)                  # a touch warm, like buff clay
Image.fromarray(np.uint8(np.clip(rgb * 255, 0, 255))).save(f'{out}/clay-v{ver}.webp', quality=92, method=6)
print(f'clay-v{ver}.webp, clay-h-v{ver}.webp written to {out}')
