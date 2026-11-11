import json,http.server,sys,time
D={};E={}
def alive(k):
    if k in E and E[k]<time.time(): D.pop(k,None);E.pop(k,None)
    return k in D
FAILW=['']   # test-only: writes to this key are refused the way a full Upstash database refuses them ('' = off, '*' = every write, 'img:*' = keys starting img:)
WRITES={'SET','SETNX','INCR','EXPIRE','DEL','HINCRBY','HSETNX','LPUSH','LTRIM','SADD','SREM','ZADD','ZINCRBY','ZREM','ZREMRANGEBYSCORE','PFADD'}
class Refused(Exception): pass
def run(c):
    c=[str(x) for x in c];op=c[0].upper();a=c[1:]
    if op=='MOCK.FAILWRITES': FAILW[0]=a[0] if a else '';return 'OK'
    f=FAILW[0]
    if f and op in WRITES and (f=='*' or (a[0].startswith(f[:-1]) if f.endswith('*') else a[0]==f)): raise Refused("OOM command not allowed when used memory > 'maxmemory'.")
    [alive(k) for k in list(E)]
    if op=='GET': v=D.get(a[0]);return v if isinstance(v,str) else None
    if op=='SET':
        if 'NX' in a[2:] and a[0] in D: return None
        D[a[0]]=a[1];E.pop(a[0],None)
        if 'EX' in a[2:]: E[a[0]]=time.time()+int(a[a.index('EX')+1])
        return 'OK'
    if op=='SETNX':
        if a[0] in D: return 0
        D[a[0]]=a[1];return 1
    if op=='HINCRBY': h=D.setdefault(a[0],{});h[a[1]]=str(int(h.get(a[1],'0'))+int(a[2]));return int(h[a[1]])
    if op=='HGETALL': h=D.get(a[0],{});o=[];[o.extend([k,v]) for k,v in h.items()];return o
    if op=='ZREMRANGEBYSCORE':
        z=D.get(a[0],{});lo=float('-inf') if a[1]=='-inf' else float(a[1]);hi=float('inf') if a[2] in('+inf','inf') else float(a[2]);ks=[k for k,v in z.items() if lo<=v<=hi];[z.pop(k) for k in ks];return len(ks)
    if op=='SISMEMBER': return int(a[1] in D.get(a[0],set()))
    if op=='SMEMBERS': return list(D.get(a[0],set()))
    if op=='INCR': D[a[0]]=str(int(D.get(a[0],'0'))+1);return int(D[a[0]])
    if op=='EXPIRE': return 1
    if op=='PFADD': s=D.setdefault(a[0],set());n=len(s);s.update(a[1:]);return int(len(s)>n)
    if op=='PFCOUNT':
        u=set()
        for k in a: u|=D.get(k,set())
        return len(u)
    if op=='ZADD': z=D.setdefault(a[0],{});z[a[2]]=float(a[1]);return 1
    if op=='ZINCRBY': z=D.setdefault(a[0],{});z[a[2]]=z.get(a[2],0)+float(a[1]);return str(z[a[2]])
    if op=='ZCARD': return len(D.get(a[0],{}))
    if op=='ZREVRANGE':
        z=D.get(a[0],{});ks=sorted(z,key=lambda k:-z[k])[int(a[1]):int(a[2])+1]
        if 'WITHSCORES' in a[3:]:
            o=[];[o.extend([k,('%.17g'%z[k])]) for k in ks];return o
        return ks
    if op=='HSETNX': h=D.setdefault(a[0],{});
    if op=='HSETNX':
        if a[1] in h: return 0
        h[a[1]]=a[2];return 1
    if op=='HMGET': h=D.get(a[0],{});return [h.get(k) for k in a[1:]]
    if op=='LPUSH': l=D.setdefault(a[0],[]);[l.insert(0,x) for x in a[1:]];return len(l)
    if op=='LRANGE': l=D.get(a[0],[]);return l[int(a[1]):int(a[2])+1]
    if op=='LTRIM': l=D.get(a[0],[]);D[a[0]]=l[int(a[1]):int(a[2])+1];return 'OK'
    if op=='SADD': st=D.setdefault(a[0],set());n=len(st);st.update(a[1:]);return len(st)-n
    if op=='SREM': st=D.setdefault(a[0],set());n=len(st);[st.discard(x) for x in a[1:]];return n-len(st)
    if op=='SCARD': return len(D.get(a[0],set()))
    if op=='DEL': return int(D.pop(a[0],None) is not None)
    if op=='ZREM': z=D.get(a[0],{});return sum(1 for k in a[1:] if z.pop(k,None) is not None)
    raise Exception('unsupported '+op)
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        assert self.headers['Authorization']=='Bearer testtoken'
        n=int(self.headers['Content-Length']);assert n<1_100_000,'request too big for upstash free: %d'%n
        b=json.loads(self.rfile.read(n))
        def one(c):
            try: return {'result':run(c)}
            except Refused as e: return {'error':str(e)}
        pl=self.path.endswith('/pipeline');out=[one(c) for c in b] if pl else one(b)
        d=json.dumps(out).encode();self.send_response(400 if not pl and 'error' in out else 200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(d)));self.end_headers();self.wfile.write(d)
    def log_message(self,*a):pass
http.server.ThreadingHTTPServer(('127.0.0.1',int(sys.argv[1])),H).serve_forever()
