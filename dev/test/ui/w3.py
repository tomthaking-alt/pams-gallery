import os
import time,sys
from playwright.sync_api import sync_playwright
SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','out','shots')+'/'
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
    for label,kw in [('phone',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)),('desktop',dict(viewport={'width':1280,'height':800}))]:
        ctx=b.new_context(permissions=['camera'],**kw);ctx.add_init_script("try{localStorage.setItem('georgeIntro','done');localStorage.setItem('georgeAway','1');localStorage.setItem('pgFilm','1')}catch(e){}")
        pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]));pg.on('console',lambda m:errs.append('console '+m.text[:150]) if m.type=='error' and 'fonts' not in m.text and 'TUNNEL' not in m.text else None)
        pg.goto('http://localhost:8794/lab/dbg.html?q=low',wait_until='commit')
        t0=time.time()
        while time.time()-t0<600:
            try:
                if pg.evaluate("(function(){var l=document.getElementById('loading');return !!l&&l.style.display==='none'})()"):break
            except Exception: pass
            time.sleep(.5)
        pg.evaluate("window.__freeze=true")
        k=pg.evaluate("ART.findIndex(function(a){return a.id==='p1'})")
        pg.evaluate("openArt(%d);$('arBtn').click()"%k);time.sleep(.6)
        pg.set_input_files('#wallFile',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','fixtures')+'/wall_sample.jpg');time.sleep(2.5)
        print(label,'3D on:',pg.evaluate("W3.on"),'| chips:',pg.evaluate("[].map.call(document.querySelectorAll('#wallFrames .wchip'),function(b){return b.textContent}).join(' / ')"))
        print(label,'box:',pg.evaluate("(function(){var a=$('wallArt');return a.clientWidth+'x'+a.clientHeight+' aspect '+a.style.aspectRatio})()"))
        pg.screenshot(path=SH+'w3_%s_pam.png'%label,timeout=300000)
        if label=='phone':
            for key in ['deco','walnut','maple','black','none']:
                pg.evaluate("[].find.call(document.querySelectorAll('#wallFrames .wchip'),function(b){return b.textContent.indexOf(%s)>=0}).click()"%repr({'deco':'Art deco','walnut':'Walnut','maple':'maple','black':'Slim black','none':'No frame'}[key]));time.sleep(1.5)
                pg.screenshot(path=SH+'w3_phone_%s.png'%key,timeout=300000)
            pg.evaluate("$('wallTurn').value=28;$('wallTurn').dispatchEvent(new Event('input'))");time.sleep(1)
            pg.evaluate("[].find.call(document.querySelectorAll('#wallFrames .wchip'),function(b){return b.textContent.indexOf('Gilded')>=0}).click()");time.sleep(1.5)
            pg.screenshot(path=SH+'w3_phone_turned.png',timeout=300000)
            pg.evaluate("$('wallCamB').click()");time.sleep(2)
            print(label,'camera mode keeps 3D:',pg.evaluate("[wallEl.dataset.mode,W3.on,!!$('wallV').srcObject].join(' / ')"))
            pg.screenshot(path=SH+'w3_phone_cam.png',timeout=300000)
        print(label,'errors:',errs[:4] or 'none');ctx.close()
    b.close()
