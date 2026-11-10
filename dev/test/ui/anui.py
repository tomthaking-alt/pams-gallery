import os
import time, sys, json
from playwright.sync_api import sync_playwright
SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','out','shots')+'/'
OT=sys.argv[1]
MODE={'v':'pass'}
def route(r):
    pd=r.request.post_data or ''
    if '"a":"analytics"' in pd and MODE['v']=='fail': return r.fulfill(status=500,content_type='application/json',body=json.dumps({'error':'Something went wrong — please try again.'}))
    if '"a":"analytics"' in pd and MODE['v']=='slow': time.sleep(2.5)
    return r.continue_()
def ready(pg):
    t0=time.time()
    while time.time()-t0<900:
        try:
            if pg.evaluate("(function(){var l=document.getElementById('loading');return !!l&&l.style.display==='none'})()"):return
        except Exception: pass
        time.sleep(.5)
def until(pg,js,limit=30):
    t0=time.time()
    while time.time()-t0<limit:
        if pg.evaluate(js):return True
        time.sleep(.3)
    return False
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    for label,kw in [('desktop',dict(viewport={'width':1280,'height':900})),('phone',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True))]:
        ctx=b.new_context(**kw);ctx.add_init_script("try{localStorage.setItem('georgeIntro','done');localStorage.setItem('georgeAway','1');localStorage.setItem('pgFilm','1');localStorage.setItem('pgTok','%s');localStorage.removeItem('pgRange')}catch(e){}"%OT)
        pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]));pg.route('**/api/app',route)
        pg.goto('http://localhost:8794/lab/dbg.html?q=low',wait_until='commit');ready(pg);pg.evaluate("window.__freeze=true")
        pg.evaluate("openDash()");time.sleep(2);MODE['v']='slow'
        pg.evaluate("dTab='v';drawTab()");time.sleep(.8)
        print(label,'loading skeletons:',pg.evaluate("document.querySelectorAll('.va .vaskel').length"),'busy:',pg.evaluate("$('vaK1').getAttribute('aria-busy')"))
        if label=='desktop': pg.screenshot(path=SH+'an_loading.png',timeout=300000)
        until(pg,"VA.st==='ok'");MODE['v']='pass';time.sleep(.5)
        print(label,'7 days:',pg.evaluate("[].map.call(document.querySelectorAll('.vakpi'),function(c){return c.innerText.replace(/\\n+/g,' ')}).join(' | ')"))
        print(label,'chart:',pg.evaluate("(function(){var s=document.querySelector('#vaTrend svg');return s?('points '+VA.data.series.length+', paths '+s.querySelectorAll('path').length):'none'})()"),
              '| sources rows:',pg.evaluate("document.querySelectorAll('#vaRefs tbody tr').length"),'| countries:',pg.evaluate("document.querySelectorAll('#vaGeo .vb').length"),'| pages:',pg.evaluate("document.querySelectorAll('#vaPages .vb').length"))
        print(label,'period line:',pg.evaluate("$('vaPer').textContent"),'| active:',pg.evaluate("$('vaAct').textContent"))
        print(label,'not counted:',pg.evaluate("$('vaFilt').querySelector('p').textContent"))
        pg.evaluate("document.querySelector('#vaTrend svg').focus()");pg.keyboard.press('ArrowRight');pg.keyboard.press('ArrowRight');time.sleep(.2)
        print(label,'keyboard on chart:',pg.evaluate("document.querySelector('.vatip').hidden?'no tooltip':document.querySelector('.vatip').innerText.replace(/\\n/g,' · ')"))
        pg.evaluate("document.querySelector('.va').scrollIntoView()");time.sleep(.3)
        pg.screenshot(path=SH+'an_%s_7d.png'%label,timeout=300000)
        if label=='desktop':
            for pre in ['today','30d','90d']:
                pg.evaluate("[].find.call(document.querySelectorAll('.va .seg button'),function(b){return b.textContent==='%s'}).click()"%({'today':'Today','30d':'30 days','90d':'90 days'}[pre]));until(pg,"VA.st==='ok'");time.sleep(.3)
                print(label,pre+':',pg.evaluate("'buckets '+VA.data.series.length+(VA.hourly?' (hourly)':' (daily)')+', visitors '+VA.data.kpi.uv+', views '+VA.data.kpi.pv+', bounce '+VA.data.kpi.bounce+'%, avg '+mmss(VA.data.kpi.avg)"),'|',pg.evaluate("$('vaK1').querySelector('.vadelta')?$('vaK1').querySelector('.vadelta').innerText:''"))
                if pre=='30d': pg.screenshot(path=SH+'an_desktop_30d.png',timeout=300000)
            pg.evaluate("[].find.call(document.querySelectorAll('.va .seg button'),function(b){return b.textContent==='Custom'}).click()");time.sleep(.5)
            d1=pg.evaluate("new Date(Date.now()-10*864e5).toISOString().slice(0,10)");d2=pg.evaluate("new Date(Date.now()-3*864e5).toISOString().slice(0,10)")
            pg.fill('.vacustom input >> nth=0',d1);pg.fill('.vacustom input >> nth=1',d2);pg.evaluate("[].find.call(document.querySelectorAll('.vacustom button'),function(b){return b.textContent==='Show'}).click()");until(pg,"VA.st==='ok'");time.sleep(.3)
            print(label,'custom %s to %s:'%(d1,d2),pg.evaluate("VA.data.series.length+' days, '+$('vaPer').textContent"))
            pg.fill('.vacustom input >> nth=0',d2);pg.fill('.vacustom input >> nth=1',d1);pg.evaluate("[].find.call(document.querySelectorAll('.vacustom button'),function(b){return b.textContent==='Show'}).click()");time.sleep(.3)
            print(label,'custom backwards:',pg.evaluate("$('vaCustErr').textContent"))
            pg.evaluate("[].find.call(document.querySelectorAll('.va .seg button'),function(b){return b.textContent==='7 days'}).click()");until(pg,"VA.st==='ok'")
            uk=pg.evaluate("VA.data.series.map(function(s){return s.uv}).join(',')")
            pg.select_option('.vatz select','America/Los_Angeles');until(pg,"VA.st==='ok'&&VA.tz==='America/Los_Angeles'");time.sleep(.3)
            print(label,'timezone switch: UK days',uk,'| LA days',pg.evaluate("VA.data.series.map(function(s){return s.uv}).join(',')"),'| first day starts',pg.evaluate("new Date(VA.data.series[0].t).toISOString()"))
            pg.select_option('.vatz select','Europe/London');until(pg,"VA.st==='ok'&&VA.tz==='Europe/London'")
            MODE['v']='fail';pg.evaluate("vaLoad()");until(pg,"VA.st==='error'");time.sleep(.3)
            print(label,'error state:',pg.evaluate("document.querySelectorAll('.va .vaerr').length+' widgets show an error with a Try again button'"))
            pg.screenshot(path=SH+'an_error.png',timeout=300000)
            MODE['v']='pass';pg.evaluate("document.querySelector('.va .vaerr button').click()");until(pg,"VA.st==='ok'");print(label,'retry recovers:',pg.evaluate("VA.st"))
        print(label,'sideways scroll:',pg.evaluate("(function(){var d=document.querySelector('#dash');return d.scrollWidth>d.clientWidth+1})()"),'errors:',errs[:3] or 'none');ctx.close()
    b.close()
