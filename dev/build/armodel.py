"""Makes the AR models of a painting for phones' own AR viewers: <out>.glb (Android Scene Viewer) and <out>.usdz (iPhone AR Quick Look).
A framed painting the size the gallery hangs it: the canvas, a linen liner and a carved gilt frame (the same moulding and
textures as before), with a dark backing. Every surface faces the viewer (the earlier models' frames faced the wall, so phones
hid them). The painting picture is the site's own watermarked copy.
usage: python3 armodel.py <painting.jpg> <width m> <height m> <out path without extension>
       python3 armodel.py --all <built app.js> <lib dir> <ar dir>      (every built-in work: ar/p1 ... from the catalogue)
Needs numpy. The frame textures are dev/src/ar/gold.jpg and linen.jpg."""
import json, os, re, struct, sys, zipfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, '..', 'src', 'ar')
Z_CANVAS = .022
# moulding profiles: (distance beyond the canvas edge, height above the wall) in metres, from the canvas outwards
LINER = [(0, .022), (.003, .0245), (.027, .0245), (.0295, .024)]
GILT = [(.0295, .024), (.0305, .03), (.032, .036), (.036, .04), (.040, .036), (.045, .03), (.050, .029), (.056, .033), (.064, .042),
        (.072, .049), (.079, .051), (.086, .049), (.091, .043), (.094, .034), (.095, .02), (.0952, 0)]
REPEAT = 25        # texture repeats per metre along the moulding


def moulding(w, h, prof):
    """Quads along all four sides, mitred at the corners; each faces the way its slope does (towards the viewer or outwards)."""
    P, N, UV, I = [], [], [], []
    seg = [np.hypot(prof[i + 1][0] - prof[i][0], prof[i + 1][1] - prof[i][1]) for i in range(len(prof) - 1)]
    cum = np.concatenate([[0], np.cumsum(seg)]) / sum(seg)
    # each side: outward direction o and the direction along it t (so that o x t points to +z)
    sides = [((0, 1), (-1, 0), w / 2, h / 2), ((1, 0), (0, 1), h / 2, w / 2), ((0, -1), (1, 0), w / 2, h / 2), ((-1, 0), (0, -1), h / 2, w / 2)]
    for o, t, half_along, half_across in sides:
        o3, t3 = np.array([o[0], o[1], 0.]), np.array([t[0], t[1], 0.])
        for i in range(len(prof) - 1):
            (d0, z0), (d1, z1) = prof[i], prof[i + 1]
            n2 = np.array([-(z1 - z0), d1 - d0]); n2 /= np.linalg.norm(n2)      # normal in the (outwards, up) plane
            n3 = o3 * n2[0] + np.array([0, 0, 1.]) * n2[1]
            quad = []
            for d, z, u in ((d0, z0, cum[i]), (d1, z1, cum[i + 1])):
                for sgn in (-1, 1):
                    a = sgn * (half_along + d)
                    quad.append((o3 * (half_across + d) + t3 * a + np.array([0, 0, z]), u, 1 - REPEAT * a))
            b = len(P)
            for p, u, v in quad:
                P.append(p); N.append(n3); UV.append((u, v))
            # corners: 0 = inner start, 1 = inner end, 2 = outer start, 3 = outer end; wind so the face looks along n3
            tri = [(b, b + 1, b + 3), (b, b + 3, b + 2)]
            g = np.cross(P[b + 1] - P[b], P[b + 3] - P[b])
            if np.dot(g, n3) < 0:
                tri = [(x, z, y) for x, y, z in tri]
            I += [k for tr in tri for k in tr]
    return np.array(P, np.float32), np.array(N, np.float32), np.array(UV, np.float32), np.array(I, np.uint16)


def quad(x0, y0, x1, y1, z, nz):
    P = np.array([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], np.float32)
    N = np.tile(np.array([0, 0, nz], np.float32), (4, 1))
    UV = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], np.float32)
    I = np.array([0, 1, 2, 0, 2, 3] if nz > 0 else [0, 2, 1, 0, 3, 2], np.uint16)
    return P, N, UV, I


def parts(w, h):
    e = GILT[-1][0]
    return [('Canvas', quad(-w / 2, -h / 2, w / 2, h / 2, Z_CANVAS, 1)), ('Liner', moulding(w, h, LINER)),
            ('Gilt', moulding(w, h, GILT)), ('Backing', quad(-w / 2 - e, -h / 2 - e, w / 2 + e, h / 2 + e, 0, -1))]


def glb(path, w, h, painting):
    imgs = [painting, open(os.path.join(TEX, 'linen.jpg'), 'rb').read(), open(os.path.join(TEX, 'gold.jpg'), 'rb').read()]
    binb, views, accs, prims = bytearray(), [], [], []

    def add(data, target=None):
        while len(binb) % 4:
            binb.append(0)
        views.append(dict(buffer=0, byteOffset=len(binb), byteLength=len(data), **({'target': target} if target else {})))
        binb.extend(data)
        return len(views) - 1

    def acc(arr, typ, comp, target, mm=False):
        a = dict(bufferView=add(arr.tobytes(), target), componentType=comp, count=int(arr.shape[0]) if typ != 'SCALAR' else int(arr.size), type=typ)
        if mm:
            a['min'], a['max'] = arr.min(0).tolist(), arr.max(0).tolist()
        accs.append(a)
        return len(accs) - 1
    for mi, (name, (P, N, UV, I)) in enumerate(parts(w, h)):
        prims.append(dict(attributes=dict(POSITION=acc(P, 'VEC3', 5126, 34962, True), NORMAL=acc(N, 'VEC3', 5126, 34962),
                                          TEXCOORD_0=acc(UV * np.array([1, -1], np.float32) + np.array([0, 1], np.float32), 'VEC2', 5126, 34962)),
                          indices=acc(I, 'SCALAR', 5123, 34963), material=mi))
    images = [dict(bufferView=add(d), mimeType='image/jpeg') for d in imgs]
    js = dict(asset=dict(version='2.0', generator="Pam's Gallery"), scene=0, scenes=[dict(nodes=[0])], nodes=[dict(mesh=0, name='Painting')],
              meshes=[dict(primitives=prims)],
              materials=[dict(name='Painting', pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicFactor=0, roughnessFactor=.7)),
                         dict(name='Linen liner', pbrMetallicRoughness=dict(baseColorTexture=dict(index=1), metallicFactor=0, roughnessFactor=.95)),
                         dict(name='Carved gilt', pbrMetallicRoughness=dict(baseColorTexture=dict(index=2), metallicFactor=.85, roughnessFactor=.34)),
                         dict(name='Backing', pbrMetallicRoughness=dict(baseColorFactor=[.18, .14, .1, 1], metallicFactor=0, roughnessFactor=.9))],
              textures=[dict(source=0, sampler=0), dict(source=1, sampler=1), dict(source=2, sampler=2)],
              samplers=[dict(magFilter=9729, minFilter=9987, wrapS=33071, wrapT=33071), dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497),
                        dict(magFilter=9729, minFilter=9987, wrapS=33071, wrapT=10497)],
              images=images, accessors=accs, bufferViews=views, buffers=[dict(byteLength=0)])
    while len(binb) % 4:
        binb.append(0)
    js['buffers'][0]['byteLength'] = len(binb)
    jb = json.dumps(js, separators=(',', ':')).encode()
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(jb) + 8 + len(binb)) + struct.pack('<I4s', len(jb), b'JSON') + jb + struct.pack('<I4s', len(binb), b'BIN\x00') + bytes(binb)
    open(path, 'wb').write(out)


def usda(w, h):
    def f3(a):
        return ', '.join('(%.5f, %.5f, %.5f)' % tuple(x) for x in a)

    def f2(a):
        return ', '.join('(%.5f, %.5f)' % tuple(x) for x in a)
    meshes = []
    for name, (P, N, UV, I) in parts(w, h):
        meshes.append('''        def Mesh "%s" (
            prepend apiSchemas = ["MaterialBindingAPI"]
        )
        {
            int[] faceVertexCounts = [%s]
            int[] faceVertexIndices = [%s]
            rel material:binding = </Root/Materials/%s>
            normal3f[] normals = [%s] (
                interpolation = "vertex"
            )
            point3f[] points = [%s]
            texCoord2f[] primvars:st = [%s] (
                interpolation = "vertex"
            )
            uniform token subdivisionScheme = "none"
        }''' % (name, ', '.join(['3'] * (len(I) // 3)), ', '.join(str(int(i)) for i in I), name, f3(N), f3(P), f2(UV)))

    def mat(name, tex, metal, rough, ws, wt):
        if tex is None:
            return '''        def Material "%s"
        {
            token outputs:surface.connect = </Root/Materials/%s/PreviewSurface.outputs:surface>

            def Shader "PreviewSurface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = (0.18, 0.14, 0.1)
                float inputs:metallic = 0
                float inputs:roughness = 0.9
                int inputs:useSpecularWorkflow = 0
                token outputs:surface
            }
        }''' % (name, name)
        return '''        def Material "%s"
        {
            token inputs:frame:stPrimvarName = "st"
            token outputs:surface.connect = </Root/Materials/%s/PreviewSurface.outputs:surface>

            def Shader "PreviewSurface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor.connect = </Root/Materials/%s/Diffuse.outputs:rgb>
                float inputs:metallic = %s
                float inputs:roughness = %s
                int inputs:useSpecularWorkflow = 0
                token outputs:surface
            }

            def Shader "uvReader_st"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                float2 inputs:fallback = (0, 0)
                token inputs:varname.connect = </Root/Materials/%s.inputs:frame:stPrimvarName>
                float2 outputs:result
            }

            def Shader "Diffuse"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @textures/%s@
                float2 inputs:st.connect = </Root/Materials/%s/uvReader_st.outputs:result>
                token inputs:sourceColorSpace = "sRGB"
                token inputs:wrapS = "%s"
                token inputs:wrapT = "%s"
                float3 outputs:rgb
            }
        }''' % (name, name, name, metal, rough, name, tex, name, ws, wt)
    mats = [mat('Canvas', 'painting.jpg', 0, .7, 'clamp', 'clamp'), mat('Liner', 'linen.jpg', 0, .95, 'repeat', 'repeat'),
            mat('Gilt', 'gold.jpg', .85, .34, 'clamp', 'repeat'), mat('Backing', None, 0, .9, '', '')]
    return '''#usda 1.0
(
    customLayerData = {
        string creator = "Pam's Gallery"
    }
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root" (
    assetInfo = {
        string name = "Painting"
    }
    kind = "component"
)
{
    def Scene "Scene" (
        prepend apiSchemas = ["Preliminary_AnchoringAPI"]
    )
    {
        string sceneName = "Scene"
        token preliminary:anchoring:type = "plane"
        token preliminary:planeAnchoring:alignment = "vertical"

        def Xform "Painting"
        {
%s
        }
    }

    def "Materials"
    {
%s
    }
}
''' % ('\n'.join(meshes), '\n\n'.join(mats))


def usdz(path, w, h, painting):
    """An uncompressed zip whose files each start on a 64-byte boundary, as USDZ requires (model first)."""
    files = [('model.usda', usda(w, h).encode()), ('textures/painting.jpg', painting),
             ('textures/gold.jpg', open(os.path.join(TEX, 'gold.jpg'), 'rb').read()), ('textures/linen.jpg', open(os.path.join(TEX, 'linen.jpg'), 'rb').read())]
    with open(path, 'wb') as fh:
        z = zipfile.ZipFile(fh, 'w', zipfile.ZIP_STORED)
        for name, data in files:
            off = fh.tell(); base = off + 30 + len(name.encode())
            pad = (64 - (base + 4) % 64) % 64       # a padding extra field (id 0x1986) sized so the data is aligned
            zi = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0)); zi.compress_type = zipfile.ZIP_STORED
            zi.extra = struct.pack('<HH', 0x1986, pad) + b'\0' * pad
            z.writestr(zi, data)
        z.close()
    zz = zipfile.ZipFile(path)                 # check the alignment
    for i in zz.infolist():
        with open(path, 'rb') as fh:
            fh.seek(i.header_offset); hdr = fh.read(30); n, e = struct.unpack('<HH', hdr[26:30])
            assert (i.header_offset + 30 + n + e) % 64 == 0, (i.filename, i.header_offset)


def make(img, w, h, out):
    painting = open(img, 'rb').read()
    glb(out + '.glb', w, h, painting); usdz(out + '.usdz', w, h, painting)
    print('%s: %.3f x %.3f m -> %s.glb (%d KB), %s.usdz (%d KB)' % (os.path.basename(img), w, h, out, os.path.getsize(out + '.glb') // 1024, out, os.path.getsize(out + '.usdz') // 1024))


if __name__ == '__main__':
    if sys.argv[1] == '--all':
        app, lib, ard = sys.argv[2:5]
        E = json.loads(re.search(r'const EMB = (\{.*?\});\n', open(app, encoding='utf-8').read(), re.S).group(1))
        for k in sorted(E, key=lambda x: int(x[1:])):
            e = E[k]; make(os.path.join(lib, os.path.basename(e['img'])), float(e['w']), float(e['h']), os.path.join(ard, k))
    else:
        make(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4])
