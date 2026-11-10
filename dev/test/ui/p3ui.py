import os
import time, sys, json
from playwright.sync_api import sync_playwright
SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','out','shots')+'/'
BT=sys.argv[1]
def ready(pg):
    t0=time.time()
    while time.time()-t0<900:
        try:
            if pg.evaluate("(function(){var l=document.getElementById('loading');return !!l&&l.style.display==='none'})()"):return True
        except Exception: pass
        time.sleep(.5)
def run(b,label,tok):
    msgs=[]
    ctx=b.new_context(viewport={'width':1100,'height':760})
    init="try{localStorage.setItem('georgeIntro','done');localStorage.setItem('georgeAway','1');"+("localStorage.setItem('pgTok','%s');"%tok if tok else "")+"}catch(e){}"
    ctx.add_init_script(init)
    pg=ctx.new_page();pg.on('pageerror',lambda e:msgs.append('ERR '+str(e)));pg.on('console',lambda m:msgs.append(m.type+' '+m.text[:200]) if m.type in ('error',) else None)
    pg.goto('http://localhost:8794/lab/dbg.html?q=low',wait_until='commit');ready(pg);pg.evaluate("window.__freeze=true")
    k=pg.evaluate("ART.findIndex(function(a){return a.id==='p99'})")
    print(label,'p99 index',k,'teaser',pg.evaluate("teaser(ART[%d])"%k),'price',pg.evaluate("ART[%d].p"%k))
    pg.evaluate("openCollection()");time.sleep(1)
    card=pg.evaluate("""(function(){var h=[].find.call(document.querySelectorAll('#collection h3'),function(x){return x.textContent==='Secret Garden'});if(!h)return null;var li=h.closest('li');li.scrollIntoView({block:'center'});
      return {ribbon:(li.querySelector('.ribbon')||{}).textContent||'',early:li.querySelector('.ph').classList.contains('early'),price:li.querySelector('.price').textContent,meta:li.querySelector('.meta').textContent,btn:(li.querySelector('.cbuy')||{}).textContent||''}})()""")
    print(label,'card',card);time.sleep(.6);pg.screenshot(path=SH+'p3_%s_card.png'%label,timeout=300000)
    pg.evaluate("closeCollection();openArt(%d)"%k);time.sleep(.8)
    d=pg.evaluate("({p:$('dp').textContent,d:$('dd').textContent.slice(0,140),buy:$('buyBtn').textContent,blur:$('dimg').classList.contains('teaser'),zoom:$('dzoom').hidden,share:$('dShare').hidden,perks:$('dPerks').hidden?'hidden':$('dPerks').textContent.slice(0,160)})")
    print(label,'dialog',d);pg.screenshot(path=SH+'p3_%s_dialog.png'%label,timeout=300000)
    if not tok:
        pg.evaluate("$('buyBtn').click()");time.sleep(1)
        a=pg.evaluate("({open:acct.open,up:!$('fUp').hidden||getComputedStyle($('fUp')).display!=='none',perks:$('acPerks').textContent,early:$('acEarlyTx').textContent.slice(0,80)})")
        print(label,'join',a);pg.screenshot(path=SH+'p3_%s_join.png'%label,timeout=300000)
        print(label,'5% anywhere',pg.evaluate("document.body.innerText.indexOf('5%')>=0||document.documentElement.innerHTML.indexOf('5% off')>=0"))
        pg.evaluate("acct.close()")
        pg.evaluate("openAbout&&openAbout()") if pg.evaluate("typeof openAbout==='function'") else None
        sub=pg.evaluate("[].map.call(document.querySelectorAll('form[data-sub]'),function(f){return f.dataset.src+':'+!!f.querySelector('[name=consent]')})")
        print(label,'sign-up forms with consent box',sub)
    else:
        pg.evaluate("showAcct()");time.sleep(2)
        print(label,'account',pg.evaluate("[].map.call(document.querySelectorAll('#acIn .card h3'),function(h){return h.textContent}).join(' | ')"),'|',pg.evaluate("(function(){var c=[].find.call(document.querySelectorAll('#acIn .card'),function(c){return c.querySelector('h3').textContent==='Early access'});return c?c.textContent.slice(0,240):'none'})()"))
        pg.screenshot(path=SH+'p3_%s_acct.png'%label,timeout=300000)
    print(label,'errors',msgs[:5]);ctx.close()
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    run(b,'visitor',None)
    run(b,'member',BT)
    b.close()
