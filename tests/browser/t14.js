const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs');
const path=require('path'); const D=path.join(__dirname,'..','..','custom_components','korobki')+'/';
const srv={rev:0,recs:{}};
const web=http.createServer((req,res)=>{ const u=req.url.split('?')[0];
 if(u.startsWith('/api/')){ let c=[];req.on('data',d=>c.push(d));req.on('end',()=>{ const b=JSON.parse(Buffer.concat(c).toString()||'{}'); let ch=false; for(const r of (b.records||[])){const x=srv.recs[r.id]; if(!x||r.u>x.u){if(!ch){srv.rev++;ch=true;} srv.recs[r.id]={...r,r:srv.rev};}} res.setHeader('content-type','application/json'); res.end(JSON.stringify({rev:srv.rev,version:'0.10.0',records:Object.values(srv.recs).filter(r=>r.r>(b.since||0)||(b.records||[]).some(x=>x.id===r.id))}));}); return;}
 if(u==='/korobki_app/index.html'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
 if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__','0.10.0'));return;}
 res.statusCode=404;res.end();});
(async()=>{ await new Promise(r=>web.listen(0,r)); const base='http://localhost:'+web.address().port+'/korobki_app/index.html'; const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:440,height:956},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('korobki-token','t')}catch(e){}});
 const sh=(s)=>p.evaluate(`(()=>{const r=document.querySelector('korobki-panel').shadowRoot;${s}})()`);
 await p.goto(base); await p.waitForTimeout(1200); await p.click('[data-seed]'); await p.waitForTimeout(2500);
 const bar=()=>sh("return [...r.querySelectorAll('.bar .ib')].map(b=>Math.round(b.getBoundingClientRect().x)+(b.disabled?'d':'')).join(' ')");
 console.log('home bar:', await bar());
 await p.click('.g >> nth=0'); await p.waitForTimeout(200); console.log('place bar:', await bar());
 await p.click('.g >> nth=0'); await p.waitForTimeout(200); console.log('box bar:  ', await bar());
 console.log('toprow visible:', await sh("return getComputedStyle(r.querySelector('.toprow')).display"), '| stat count:', await sh("return r.querySelectorAll('.head .stat').length"), '| pen in title row:', await sh("return r.querySelectorAll('.h1row .pen').length+' (camera)'"));
 await p.goto(base); await p.waitForTimeout(1200);
 await p.click('.g >> nth=0'); await p.waitForTimeout(300);
 await p.click('[data-toggle-edit]'); await p.waitForTimeout(300);
 console.log('del x center offset:', await sh("const d=r.querySelector('.g .del');const s=d.querySelector('svg').getBoundingClientRect(),q=d.getBoundingClientRect();return [Math.round((s.x+s.width/2)-(q.x+q.width/2)),Math.round((s.y+s.height/2)-(q.y+q.height/2)),Math.round(q.width)+'x'+Math.round(q.height)]"));
 await p.screenshot({path:require('os').tmpdir()+'/'+'s14_edit.png'});
 await p.click('[data-toggle-edit]'); await p.click('h1 .h1btn'); await p.waitForTimeout(300);
 const pr=await sh("const q=r.querySelector('.panel').getBoundingClientRect();return [Math.round(q.left),Math.round(innerWidth-q.right),Math.round(innerHeight-q.bottom)]");
 console.log('panel margins l/r/b:', pr, '| host overflow:', await sh("return r.host.style.overflowY"));
 await p.screenshot({path:require('os').tmpdir()+'/'+'s14_sheet.png'});
 await p.keyboard.press('Escape'); await p.waitForTimeout(200);
 await p.goto(base); await p.waitForTimeout(1000); await p.locator('[data-svc]').click(); await p.waitForTimeout(500);
 console.log('server field:', await sh("const i=r.getElementById('srvUrl');return i? i.placeholder+' btns='+r.querySelectorAll('[data-srvsave],[data-srvreset]').length:'none'"));
 await p.locator('#srvUrl').fill('ftp://x'); await p.locator('[data-srvsave]').click(); await p.waitForTimeout(500);
 console.log('bad url msg:', await sh("const w=r.querySelector('.warn2');return w?w.textContent:'none'"));
 await p.screenshot({path:require('os').tmpdir()+'/'+'s14_svc.png'});
 console.log('errors',JSON.stringify(errs)); await b.close(); web.close(); })();
