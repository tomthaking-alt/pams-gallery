"""Add a Content Security Policy to a built page: only this page's own scripts (by fingerprint), the site's own files,
Google Fonts and Google sign-in may run or load. usage: python3 csp.py <page.html> [out.html]"""
import re, sys, hashlib, base64
src = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else src
s = open(src).read()
s = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?', '', s)
hashes = []
for m in re.finditer(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', s, re.S):
    attrs, body = m.group(1), m.group(2)
    if 'application/ld+json' in attrs: continue
    hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'")
G = 'https://accounts.google.com/gsi/'
pol = ("default-src 'self'; script-src 'self' " + ' '.join(hashes) + " " + G + "client; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com " + G + "style; font-src 'self' https://fonts.gstatic.com data:; "
       "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' " + G + "; frame-src " + G + "; worker-src 'self' blob:; "
       "object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests")
meta = '<meta http-equiv="Content-Security-Policy" content="' + pol + '">'
i = s.index('<meta charset="utf-8">') + len('<meta charset="utf-8">')
s = s[:i] + '\n' + meta + s[i:]
open(out, 'w').write(s); print('csp: %d scripts fingerprinted' % len(hashes))
