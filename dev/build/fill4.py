"""Give the server the built-in artworks (titles, details, and the image files made by split4.py).
usage: python3 fill4.py <split page.html> <app.js source> <out app.js>"""
import re, sys, json
page, src, out = sys.argv[1:4]
s = open(page).read(); i = s.index('var ART=['); j = s.index('\n];', i)
emb = {}
for L in s[i:j].split('\n'):
    if 'img:"/lib/' not in L: continue
    g = lambda k: (re.search(r'[{,]%s:"([^"]*)"' % k, L) or [None, ''])[1]
    num = lambda k: float(re.search(r'[{,]%s:([0-9.]+)' % k, L).group(1))
    pid = 'p%d' % (len(emb) + 1)
    emb[pid] = {'t': g('t'), 'm': g('m'), 'd': g('d'), 'w': num('w'), 'h': num('h'), 'img': g('img'), 'tn': g('tn'), 'wm': g('wm')}
    assert emb[pid]['img'].startswith('/lib/') and emb[pid]['wm'].startswith('/lib/'), emb[pid]
assert len(emb) >= 6, emb
a = open(src).read(); assert a.count('__EMB__') == 1
open(out, 'w').write(a.replace('__EMB__', json.dumps(emb, ensure_ascii=False)))
for k, v in emb.items(): print(k, v['t'], '|', v['m'], '|', v['wm'])
