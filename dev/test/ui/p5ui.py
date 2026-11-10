import os
import time
from playwright.sync_api import sync_playwright
SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','out','shots')+'/'
URL='http://localhost:8794/lab/dbg.html?q=low'
GL=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
def wait_loaded(pg,limit=900):
    t0=time.time()
    while time.time()-t0<limit:
        try:
            if pg.evaluate("(function(){var l=document.getElementById('loading');return !!l&&l.style.display==='none'})()"):return time.time()-t0
        except Exception: pass
        time.sleep(.25)
AUDIT="""(function(){var out={};function vis(e){var r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width>0&&r.height>0&&c.visibility!=='hidden'}
 function name(e){return (e.getAttribute('aria-label')||'').trim()||(e.getAttribute('aria-labelledby')&&document.getElementById(e.getAttribute('aria-labelledby'))?'x':'')||(e.textContent||'').trim()||(e.getAttribute('title')||'').trim()||(e.querySelector('img[alt]:not([alt=""])')?'x':'')}
 out.unnamedButtons=[].filter.call(document.querySelectorAll('button,a[href],[role=button]'),function(e){return !name(e)}).map(function(e){return e.outerHTML.slice(0,90)});
 out.imgNoAlt=[].filter.call(document.querySelectorAll('img'),function(e){return !e.hasAttribute('alt')}).map(function(e){return (e.id||e.className||e.src.slice(0,40))});
 out.unlabelledInputs=[].filter.call(document.querySelectorAll('input:not([type=hidden]):not([type=submit]),select,textarea'),function(e){if(e.closest('label'))return false;if(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby'))return false;if(e.id&&document.querySelector('label[for="'+e.id+'"]'))return false;if(e.closest('.hp,[aria-hidden=true]'))return false;return true}).map(function(e){return e.outerHTML.slice(0,90)});
 out.dialogsNoLabel=[].filter.call(document.querySelectorAll('dialog'),function(d){return !d.getAttribute('aria-labelledby')&&!d.getAttribute('aria-label')}).map(function(d){return d.id});
 var ids={},dup=[];[].forEach.call(document.querySelectorAll('[id]'),function(e){if(ids[e.id])dup.push(e.id);ids[e.id]=1});out.dupIds=dup;
 out.lang=document.documentElement.lang;return out})()"""
with sync_playwright() as p:
    b=p.chromium.launch(args=GL)
    # first visit and a return visit: how long the opening takes
    ctx=b.new_context(viewport={'width':1100,'height':760});ctx.add_init_script("try{localStorage.setItem('georgeIntro','done');localStorage.setItem('georgeAway','1')}catch(e){}")
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL,wait_until='commit');time.sleep(1.2)
    print('loading text',pg.evaluate("document.querySelector('#loading .lmsg').textContent"),'| progressbar',pg.evaluate("document.getElementById('ldpb').getAttribute('aria-valuenow')"))
    t=wait_loaded(pg);print('first visit opening: %.1fs (SwiftShader is slow; minimum is now 3.6s)'%t)
    pg.evaluate("window.__freeze=true");a=pg.evaluate(AUDIT);print('audit',a)
    # music: nothing on a first click; on when asked; remembered
    pg.mouse.click(550,400);time.sleep(.5);print('music after a click on the page:',pg.evaluate("$('music').getAttribute('aria-pressed')"))
    pg.evaluate("$('music').click()");time.sleep(.5);print('music after pressing Music:',pg.evaluate("$('music').getAttribute('aria-pressed')"),pg.evaluate("localStorage.getItem('pgMusic')"))
    pg.goto(URL,wait_until='commit');t=wait_loaded(pg);print('return visit opening: %.1fs'%t)
    pg.mouse.click(550,400);time.sleep(.6);print('music on return, after first click:',pg.evaluate("$('music').getAttribute('aria-pressed')"))
    print('skip link',pg.evaluate("(function(){var a=document.querySelector('.skiplink');a.focus();return a.getBoundingClientRect().top>0&&a.getAttribute('href')})()"))
    print('errors',errs[:3]);ctx.close()
    # the wall, on a phone with the camera refused
    ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,permissions=[])
    ctx.add_init_script("try{localStorage.setItem('georgeIntro','done');localStorage.setItem('georgeAway','1');localStorage.setItem('pgFilm','1')}catch(e){};if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=function(){return Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}))}")
    pg=ctx.new_page();pg.goto(URL,wait_until='commit');wait_loaded(pg);pg.evaluate("window.__freeze=true")
    pg.evaluate("wallCam(1)");time.sleep(1)
    print('wall message:',pg.evaluate("$('wallMsg').innerText.replace(/\\n+/g,' | ')"))
    x0=pg.evaluate("$('wallArt').getBoundingClientRect().left")
    pg.evaluate("""(function(){var w=$('wall');function ev(t,x,y,id){w.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,clientY:y,pointerId:id,pointerType:'touch',isPrimary:id===1}))}
      ev('pointerdown',60,700,1);ev('pointermove',100,700,1);ev('pointermove',140,700,1)})()""");time.sleep(.3)
    x1=pg.evaluate("$('wallArt').getBoundingClientRect().left");print('drag from outside the painting moved it by',round(x1-x0),'px')
    pg.evaluate("""(function(){var w=$('wall');function ev(t,x,y,id){w.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,clientY:y,pointerId:id,pointerType:'touch'}))}
      ev('pointerup',140,700,1);var w0=parseFloat($('wallArt').style.width);window.__w0=w0;ev('pointerdown',150,300,2);ev('pointerdown',250,300,3);ev('pointermove',100,300,2);ev('pointermove',300,300,3)})()""");time.sleep(.3)
    print('pinch resized: %s -> %s'%(pg.evaluate("Math.round(window.__w0)"),pg.evaluate("Math.round(parseFloat($('wallArt').style.width))")))
    pg.screenshot(path=SH+'p5_wall_denied.png',timeout=300000);ctx.close();b.close()
    # a browser with no 3D graphics: straight to the simple view
    b=p.chromium.launch(args=['--disable-webgl','--disable-3d-apis','--disable-gpu'])
    pg=b.new_page();pg.goto(URL,wait_until='commit');time.sleep(1.2)
    print('no-3D message:',pg.evaluate("document.querySelector('#loading .lmsg').textContent"))
    time.sleep(3.2);print('no-3D now at:',pg.url)
    b.close()
