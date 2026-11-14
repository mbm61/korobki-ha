const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs');
const path=require('path'); const D=path.join(__dirname,'..','..','custom_components','korobki')+'/';
const srv={rev:0,recs:{}};
const web=http.createServer((req,res)=>{ const u=req.url.split('?')[0];
 if(u.startsWith('/api/')){ let c=[];req.on('data',d=>c.push(d));req.on('end',()=>{ const b=JSON.parse(Buffer.concat(c).toString()||'{}'); let ch=false; for(const r of (b.records||[])){const x=srv.recs[r.id]; if(!x||r.u>x.u){if(!ch){srv.rev++;ch=true;} srv.recs[r.id]={...r,r:srv.rev};}} res.setHeader('content-type','application/json'); res.end(JSON.stringify({rev:srv.rev,version:'0.10.0',records:Object.values(srv.recs).filter(r=>r.r>(b.since||0)||(b.records||[]).some(x=>x.id===r.id))}));}); return;}
 if(u==='/korobki_app/index.html'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
 if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__','0.10.0'));return;}
 res.statusCode=404;res.end();});
(async()=>{ await new Promise(r=>web.listen(0,r)); const base='http://localhost:'+web.address().port+'/korobki_app/index.html'; const b=await chromium.launch();
 for (const scheme of ['light','dark']) {
  const ctx=await b.newContext({viewport:{width:440,height:956},deviceScaleFactor:2,colorScheme:scheme,hasTouch:true,isMobile:true});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{try{localStorage.setItem('korobki-token','t')}catch(e){}});
  await p.goto(base); await p.waitForTimeout(1200);
  const sh=(s)=>p.evaluate(`(()=>{const r=document.querySelector('korobki-panel').shadowRoot;${s}})()`);
  if(scheme==='light'){ await p.click('[data-seed]'); await p.waitForTimeout(1500); }
  console.log(scheme,'bg:',await p.evaluate(()=>getComputedStyle(document.querySelector('korobki-panel').shadowRoot.host).backgroundColor), 'footer on home visible:', await sh("return !r.getElementById('foot').hidden && r.getElementById('foot').innerText.length>0"));
  await p.screenshot({path:require('os').tmpdir()+'/'+`s12_home_${scheme}.png`});
  if(scheme==='light'){
    await p.click('.g >> nth=0'); await p.waitForTimeout(300);
    console.log('footer on subpage hidden:', await sh("return r.getElementById('foot').hidden && r.getElementById('foot').innerHTML===''"));
    await p.click('.g >> nth=0'); await p.waitForTimeout(300);
    console.log('icon buttons sizes:', JSON.stringify(await sh("return [...r.querySelectorAll('.bar .ib')].map(b=>b.getAttribute('aria-label')+':'+Math.round(b.getBoundingClientRect().width)+'x'+Math.round(b.getBoundingClientRect().height))")));
    await p.click('[data-toggle-add]'); await p.waitForTimeout(300);
    await p.screenshot({path:require('os').tmpdir()+'/'+'s12_add_closed.png'});
    await p.click('[data-dd]'); await p.waitForTimeout(200);
    console.log('dd open, rows:', await sh("return r.querySelectorAll('.ddrow').length+' hidden='+r.getElementById('ddlist').hidden"));
    await p.fill('#fNewCat'.replace('#','#'), 'Хрупкое').catch(async()=>{});
    await p.evaluate(()=>{});
    await p.locator('input#fNewCat').fill('Хрупкое'); await p.click('[data-ddadd]'); await p.waitForTimeout(300);
    console.log('after add, summary:', await sh("return r.getElementById('ddsum').textContent+' | list open='+!r.getElementById('ddlist').hidden"));
    await p.locator('input#fName').fill('Шапка'); 
    await p.screenshot({path:require('os').tmpdir()+'/'+'s12_add_open.png'});
    await p.locator('#addForm button[type=submit]').click(); await p.waitForTimeout(2500);
    console.log('item tags:', JSON.stringify(Object.values(srv.recs).filter(r=>r.n==='Шапка').map(r=>r.tg)));
    // шит вещи: иконки
    await p.locator('.rmain >> nth=0').click(); await p.waitForTimeout(300);
    console.log('sheet icons:', JSON.stringify(await sh("return [...r.querySelectorAll('.panel .actions .ib')].map(b=>b.getAttribute('aria-label'))")));
    await p.screenshot({path:require('os').tmpdir()+'/'+'s12_sheet.png'});
    await p.click('.panel .x'); await p.waitForTimeout(200);
    // тема из сервиса
    await p.click('[data-home]'); await p.waitForTimeout(300); await p.click('[data-svc]'); await p.waitForTimeout(300);
    await p.click('[data-themeset=dark]'); await p.waitForTimeout(300);
    console.log('forced dark attr:', await p.evaluate(()=>document.documentElement.getAttribute('data-theme')), 'host bg:', await p.evaluate(()=>getComputedStyle(document.querySelector('korobki-panel').shadowRoot.host).backgroundColor));
    await p.screenshot({path:require('os').tmpdir()+'/'+'s12_svc_dark.png'});
  }
  console.log('doc scroll size ok:', await p.evaluate(()=>[document.documentElement.scrollHeight<=innerHeight, document.documentElement.scrollWidth<=innerWidth]));
  console.log(scheme,'errors',JSON.stringify(errs)); await ctx.close(); }
 await b.close(); web.close(); })();
