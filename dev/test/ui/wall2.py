import os
import time
from playwright.sync_api import sync_playwright
SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','out','shots')+'/'
def ready(pg):
    t0=time.time()
    while time.time()-t0<900:
        try:
            if pg.evaluate("(function(){var l=document.getElementById('loading');return !!l&&l.style.display==='none'})()"):return
        except Exception: pass
        time.sleep(.5)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
    for label,kw in [('desktop',dict(viewport={'width':1200,'height':800})),('phone',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True))]:
        ctx=b.new_context(permissions=['camera'],**kw);ctx.add_init_script("try{localStorage.setItem('georgeIntro','done');localStorage.setItem('georgeAway','1');localStorage.setItem('pgFilm','1')}catch(e){}")
        pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto('http://localhost:8794/lab/dbg.html?q=low',wait_until='commit');ready(pg);pg.evaluate("window.__freeze=true")
        k=pg.evaluate("ART.findIndex(function(a){return a.id==='p7'})")
        pg.evaluate("openArt(%d)"%k);time.sleep(.6)
        print(label,'button visible:',pg.evaluate("!$('arBtn').hidden&&$('arBtn').offsetParent!==null"))
        pg.evaluate("$('arBtn').click()");time.sleep(.6)
        print(label,'chooser:',pg.evaluate("$('wallMsg').innerText.replace(/\\n+/g,' | ')"),'| bottom bar hidden:',pg.evaluate("getComputedStyle(document.querySelector('#wall .wbot')).display==='none'"))
        pg.screenshot(path=SH+'wall_%s_choose.png'%label,timeout=300000)
        pg.set_input_files('#wallFile',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','fixtures')+'/wall_sample.jpg');time.sleep(1)
        print(label,'photo mode:',pg.evaluate("[wallEl.dataset.mode,!$('wallBg').hidden,!$('wallArt').hidden,$('wallMsg').hidden,!$('wallCamB').hidden,$('wallHint').textContent].join(' / ')"))
        w0=pg.evaluate("parseFloat($('wallArt').style.width)")
        if label=='desktop':
            pg.mouse.move(600,400);pg.mouse.wheel(0,-300);time.sleep(.3)
            print(label,'scroll to resize: %d -> %d'%(w0,pg.evaluate("parseFloat($('wallArt').style.width)")))
            x0=pg.evaluate("$('wallArt').getBoundingClientRect().left");pg.mouse.move(300,300);pg.mouse.down();pg.mouse.move(380,320,steps=5);pg.mouse.up();time.sleep(.2)
            print(label,'drag moved by',round(pg.evaluate("$('wallArt').getBoundingClientRect().left")-x0))
        pg.screenshot(path=SH+'wall_%s_photo.png'%label,timeout=300000)
        pg.evaluate("$('wallCamB').click()");time.sleep(1.5)
        print(label,'camera mode:',pg.evaluate("[wallEl.dataset.mode,!$('wallV').hidden,!!$('wallV').srcObject,$('wallBg').hidden,!$('wallArt').hidden,$('wallCamB').hidden].join(' / ')"))
        pg.screenshot(path=SH+'wall_%s_cam.png'%label,timeout=300000)
        pg.keyboard.press('Escape');time.sleep(.3);print(label,'Escape closes:',pg.evaluate("wallEl.hidden"),'camera stopped:',pg.evaluate("!$('wallV').srcObject"))
        pg.evaluate("openArt(%d)"%k);time.sleep(.4);pg.evaluate("$('arBtn').click()");time.sleep(.4)
        pg.evaluate("[].find.call(document.querySelectorAll('#wallMsg button'),function(b){return /camera/.test(b.textContent)}).click()");time.sleep(1.5)
        print(label,'chooser -> camera:',pg.evaluate("[wallEl.dataset.mode,!!$('wallV').srcObject,!$('wallArt').hidden].join(' / ')"))
        pg.evaluate("wallClose()");print(label,'errors',errs[:3]);ctx.close()
    ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    ctx.add_init_script("try{localStorage.setItem('georgeIntro','done');localStorage.setItem('georgeAway','1');localStorage.setItem('pgFilm','1')}catch(e){};if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=function(){return Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}))}")
    pg=ctx.new_page();pg.goto('http://localhost:8794/lab/dbg.html?q=low',wait_until='commit');ready(pg);pg.evaluate("window.__freeze=true")
    k=pg.evaluate("ART.findIndex(function(a){return a.id==='p7'})");pg.evaluate("openArt(%d)"%k);time.sleep(.4);pg.evaluate("$('arBtn').click()");time.sleep(.4)
    pg.evaluate("[].find.call(document.querySelectorAll('#wallMsg button'),function(b){return /camera/.test(b.textContent)}).click()");time.sleep(1)
    print('refused camera:',pg.evaluate("$('wallMsg').innerText.replace(/\\n+/g,' | ')"))
    b.close()
