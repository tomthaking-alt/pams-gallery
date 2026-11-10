import os
import time, sys
from playwright.sync_api import sync_playwright
SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','out','shots')+'/'
BT,OT=sys.argv[1],sys.argv[2]
def ready(pg):
    t0=time.time()
    while time.time()-t0<900:
        try:
            if pg.evaluate("(function(){var l=document.getElementById('loading');return !!l&&l.style.display==='none'})()"):return
        except Exception: pass
        time.sleep(.5)
def page(b,tok,w=1100,h=800):
    ctx=b.new_context(viewport={'width':w,'height':h})
    ctx.add_init_script("try{localStorage.setItem('georgeIntro','done');localStorage.setItem('georgeAway','1');"+("localStorage.setItem('pgTok','%s');"%tok if tok else "")+"}catch(e){}")
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8794/lab/dbg.html?q=low',wait_until='commit');ready(pg);pg.evaluate("window.__freeze=true");return ctx,pg,errs
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx,pg,errs=page(b,None)
    print('points anywhere',pg.evaluate("/loyalty|points/i.test(document.body.innerText)||/500 points|Loyalty points/.test(document.documentElement.innerHTML)"))
    pg.evaluate("location.hash='buying'");time.sleep(1.2)
    t=pg.evaluate("$('buying').innerText")
    print('buying page: unconfirmed claims',[w for w in ['certificate of authenticity signed','insured','worldwide','acid-free','ready to hang','working days'] if w.lower() in t.lower()],'| auth heading',pg.evaluate("$('byAuthH').textContent"))
    print('  delivery:',pg.evaluate("document.querySelector('[data-p=\"trust.deliver\"]').textContent"))
    print('  line:',pg.evaluate("document.querySelector('[data-p=\"trust.line\"]').textContent"))
    pg.screenshot(path=SH+'p4_buying.png',timeout=300000)
    pg.evaluate("location.hash='';closePage&&closePage(true)") if pg.evaluate("typeof closePage==='function'") else None
    k=pg.evaluate("ART.findIndex(function(a){return a.id==='p2'})")
    pg.evaluate("openBuy(%d)"%k);time.sleep(.8)
    print('offer help shown',pg.evaluate("!$('buyOfferL').hidden&&getComputedStyle($('offerHow')).display!=='none'"))
    pg.evaluate("var f=$('fBuy');f.dataset.t0=Date.now()-12000;f.name.value='Test Buyer';f.email.value='tb@example.com';f.offer.value='700';f.message.value='Lovely'")
    pg.evaluate("$('fBuy').requestSubmit()");time.sleep(2)
    print('after enquiry:',pg.evaluate("$('buyNext').innerText").replace('\n',' / '))
    pg.screenshot(path=SH+'p4_enquiry_next.png',timeout=300000);print('errors',errs[:3]);ctx.close()
    ctx,pg,errs=page(b,BT)
    k=pg.evaluate("ART.findIndex(function(a){return a.mode==='auction'&&aucLive(a)})");print('auction index',k)
    if k>=0:
        pg.evaluate("openBid(%d)"%k);time.sleep(.8)
        print('how bidding works:',pg.evaluate("$('bidHow').textContent"))
        pg.evaluate("var a=aucOf(ART[%d]);$('fBid').amount.value=String((a.n?a.top+a.step:a.start)+25);$('fBid').requestSubmit()"%k);time.sleep(2)
        print('after bid:',pg.evaluate("$('bidNext').innerText").replace('\n',' / '))
        pg.screenshot(path=SH+'p4_bid_next.png',timeout=300000)
    print('account cards',pg.evaluate("showAcct(),1"));time.sleep(2);print('  ',pg.evaluate("[].map.call(document.querySelectorAll('#acIn .card h3'),function(h){return h.textContent}).join(' | ')"))
    print('errors',errs[:3]);ctx.close()
    ctx,pg,errs=page(b,OT)
    pg.evaluate("openDash()");time.sleep(2);pg.evaluate("dTab='s';drawTab()");time.sleep(2)
    print('settings:',pg.evaluate("(function(){var h=[].find.call(document.querySelectorAll('#dBody .edsec h3'),function(x){return /Buying/.test(x.textContent)});if(!h)return 'missing';h.scrollIntoView();var sec=h.parentNode;return [].map.call(sec.querySelectorAll('input,select'),function(i){return i.placeholder||i.value}).slice(0,4).join(' | ')+' || '+sec.querySelector('.bstat').textContent})()"))
    pg.screenshot(path=SH+'p4_dash_buying.png',timeout=300000)
    pg.evaluate("dTab='a';drawTab()");time.sleep(1.5);print('missing note:',pg.evaluate("(document.querySelector('.edmiss')||{}).textContent||'none'"))
    print('errors',errs[:3]);b.close()
