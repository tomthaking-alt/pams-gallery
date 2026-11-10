import os
import time, sys
from playwright.sync_api import sync_playwright
SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','out','shots')+'/'
def ready(pg):
    t0=time.time()
    while time.time()-t0<900:
        try:
            if pg.evaluate("(function(){var l=document.getElementById('loading');return !!l&&l.style.display==='none'})()"):return time.time()-t0
        except Exception: pass
        time.sleep(.5)
STEPS=[
 ("open every painting window","(function(){var bad=[];for(var k=0;k<ART.length;k++){openArt(k);if(!dlg.open||!$('dt').textContent)bad.push(k)}dlg.close();return bad.length?'missing '+bad:'ok '+ART.length})()"),
 ("zoom view","(function(){openZoom(0);var o=document.getElementById('zv').open;document.getElementById('zv').close();return o?'ok':'not opened'})()"),
 ("collections page","(function(){openCollection();var n=document.querySelectorAll('#collection .card').length;closeCollection();return n?'ok '+n+' cards':'no cards'})()"),
 ("press page","(function(){openPage('press');var v=!PAGES.press.hidden;closePage(true);return v?'ok':'not shown'})()"),
 ("commissions page","(function(){openPage('commission');var v=!PAGES.commission.hidden;closePage(true);return v?'ok':'not shown'})()"),
 ("buying page","(function(){openPage('buying');var v=!PAGES.buying.hidden&&/Delivery|delivery/.test(PAGES.buying.innerText);closePage(true);return v?'ok':'not shown'})()"),
 ("prints","(function(){try{openPrints();var v=!document.getElementById('prints').hidden;closePrints();return v?'ok':'not shown'}catch(e){return 'ERR '+e.message}})()"),
 ("enquiry window","(function(){openBuy(1);var o=document.getElementById('buy').open;document.getElementById('buy').close();return o?'ok':'not opened'})()"),
 ("message window","(function(){openMsg();var d=document.querySelector('dialog[open]');var ok=!!d;if(d)d.close();return ok?'ok':'not opened'})()"),
 ("account window","(function(){showAcct();var o=document.getElementById('acct').open;acct.close();return o?'ok':'not opened'})()"),
 ("wall view","(function(){viewOnWall(0);var o=!wallEl.hidden;wallClose();return o?'ok':'not opened'})()"),
 ("broken images","(function(){var b=[].filter.call(document.images,function(i){return i.complete&&i.naturalWidth===0&&i.getAttribute('src')&&!/^data:/.test(i.src)&&i.loading!=='lazy'}).map(function(i){return i.src.slice(-30)});return b.length?'BROKEN '+b.join(', '):'ok'})()"),
]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    for label,kw in [('desktop',dict(viewport={'width':1280,'height':800})),('phone',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True))]:
        ctx=b.new_context(**kw);ctx.add_init_script("try{localStorage.setItem('georgeIntro','done');localStorage.setItem('georgeAway','1');localStorage.setItem('pgFilm','1')}catch(e){}")
        pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append('ERR '+str(e)[:160]));pg.on('console',lambda m:errs.append('console '+m.text[:160]) if m.type=='error' and 'fonts.g' not in m.text and 'ERR_TUNNEL' not in m.text and 'ERR_CONNECTION' not in m.text else None)
        pg.goto('http://localhost:8794/lab/dbg.html?q=low',wait_until='commit');t=ready(pg);pg.evaluate("window.__freeze=true")
        print(label,'opened in %.0fs'%t)
        for name,js in STEPS:
            try: r=pg.evaluate(js)
            except Exception as e: r='EXCEPTION '+str(e)[:140]
            print('  %-26s %s'%(name,r));time.sleep(.2)
        # page fits the screen (no sideways scrolling)
        print('  %-26s %s'%('no sideways scroll',pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1")))
        print('  errors:',errs[:6] or 'none');ctx.close()
    # the server pages, on a phone
    ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:160]))
    for u in ['/works','/art/violet-garden','/privacy','/art/nothing-here','/offline.html']:
        r=pg.goto('http://localhost:8794'+u);time.sleep(.6)
        print('  %-24s %s  sideways-ok=%s  broken-img=%s'%(u,r.status,pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),pg.evaluate("[].filter.call(document.images,function(i){return i.complete&&i.naturalWidth===0&&i.loading!=='lazy'}).length")))
    print('  page errors:',errs[:4] or 'none');b.close()
