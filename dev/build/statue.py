"""Turn a 3D model (.glb, e.g. from Higgsfield's image-to-3D) into the gallery's compact statue files.
usage: python3 statue.py <model.glb> <out_dir> <name> [colour boost, e.g. 1.3]      e.g. statue.py dev/media/clay/statue-yellow.glb dev/src/clay statue-yellow-v1
writes <name>.bin (the shape) and <name>.webp (its colours, 1024px). Needs: pip install pygltflib numpy pillow
.bin layout, little-endian: 'PGM1', uint32 vertices, uint32 indices, float32 min[3], float32 max[3],
  int16 positions (quantised inside min..max), int8 normals (x127), padding to 2 bytes, uint16 texture coordinates (x65535),
  uint16 triangle indices. The page expands it (statueLoad in House of Pam.html)."""
import sys, io, struct
import numpy as np
from pygltflib import GLTF2
from PIL import Image, ImageEnhance

src, out, name = sys.argv[1:4]; sat = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
g = GLTF2().load(src)
assert len(g.meshes) == 1 and len(g.meshes[0].primitives) == 1, 'expects one mesh with one part'
p = g.meshes[0].primitives[0]
assert p.mode in (None, 4), 'expects triangles'
blob = g.binary_blob()
def arr(i, comps):
    a = g.accessors[i]; bv = g.bufferViews[a.bufferView]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a.componentType]
    off = (bv.byteOffset or 0) + (a.byteOffset or 0); n = a.count * comps
    stride = bv.byteStride
    if stride and stride != comps * np.dtype(dt).itemsize:
        raw = np.frombuffer(blob, np.uint8, a.count * stride, off).reshape(a.count, stride)
        return raw[:, :comps * np.dtype(dt).itemsize].copy().view(dt).reshape(a.count, comps)
    return np.frombuffer(blob, dt, n, off).reshape(a.count, comps) if comps > 1 else np.frombuffer(blob, dt, n, off)
pos = arr(p.attributes.POSITION, 3).astype(np.float64)
nor = arr(p.attributes.NORMAL, 3).astype(np.float64)
uv = arr(p.attributes.TEXCOORD_0, 2).astype(np.float64)
idx = arr(p.indices, 1).astype(np.int64)
nv, ni = len(pos), len(idx)
assert nv < 65536, 'too many points for 16-bit indices: simplify the model first'
lo, hi = pos.min(0), pos.max(0); span = np.where(hi - lo > 0, hi - lo, 1)
qp = np.clip(np.round((pos - lo) / span * 65535) - 32768, -32768, 32767).astype('<i2')
nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-9)
qn = np.clip(np.round(nor * 127), -127, 127).astype('i1')
quv = np.clip(np.round(np.clip(uv, 0, 1) * 65535), 0, 65535).astype('<u2')
b = io.BytesIO()
b.write(b'PGM1'); b.write(struct.pack('<II', nv, ni)); b.write(struct.pack('<6f', *lo, *hi))
b.write(qp.tobytes()); b.write(qn.tobytes())
if b.tell() % 2: b.write(b'\0')
b.write(quv.tobytes()); b.write(idx.astype('<u2').tobytes())
open(f'{out}/{name}.bin', 'wb').write(b.getvalue())
# colours: the model's own texture, 1024px WebP
img = g.images[g.textures[g.materials[p.material].pbrMetallicRoughness.baseColorTexture.index].source]
bv = g.bufferViews[img.bufferView]
im = Image.open(io.BytesIO(blob[(bv.byteOffset or 0):(bv.byteOffset or 0) + bv.byteLength])).convert('RGB')
im = ImageEnhance.Color(im).enhance(sat) if sat != 1 else im   # image-to-3D can mute colours: bring them back towards the photo
im.resize((1024, 1024), Image.LANCZOS).save(f'{out}/{name}.webp', quality=84, method=6)
print(f'{name}: {nv} points, {ni // 3} triangles, size {np.round(hi - lo, 3).tolist()}, '
      f'{len(b.getvalue()) // 1024} KB shape')
