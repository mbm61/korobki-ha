const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs');
const path=require('path'); const D=path.join(__dirname,'..','..','custom_components','korobki')+'/';
const srv={rev:0,recs:{}}; const hits={main:0,local:0,photo:0};
const mk=(name)=>http.createServer((req,res)=>{ const u=req.url.split('?')[0];
 res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','authorization,content-type'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
 if(u.startsWith('/api/korobki/photo/')){ hits.photo++; req.resume(); req.on('end',()=>{res.end('{}')}); return;}
 if(u.startsWith('/api/')){ hits[name]++; let c=[];req.on('data',d=>c.push(d));req.on('end',()=>{ const b=JSON.parse(Buffer.concat(c).toString()||'{}'); let ch=false; for(const r of (b.records||[])){const x=srv.recs[r.id]; if(!x||r.u>x.u){if(!ch){srv.rev++;ch=true;} srv.recs[r.id]={...r,r:srv.rev};}} res.setHeader('content-type','application/json'); res.end(JSON.stringify({rev:srv.rev,version:'0.10.0',records:Object.values(srv.recs).filter(r=>r.r>(b.since||0)||(b.records||[]).some(x=>x.id===r.id))}));}); return;}
 if(u==='/korobki_app/manifest.json'){res.setHeader('content-type','application/json');res.end('{}');return;}
 if(u==='/korobki_app/index.html'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
 if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__','0.10.0'));return;}
 res.statusCode=404;res.end();});
(async()=>{ const main=mk('main'), loc=mk('local'); await new Promise(r=>main.listen(0,r)); await new Promise(r=>loc.listen(0,r));
 const base='http://localhost:'+main.address().port+'/korobki_app/index.html', lurl='http://localhost:'+loc.address().port; const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:440,height:956},deviceScaleFactor:2,hasTouch:true,isMobile:true});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('korobki-token','t')}catch(e){}});
 const sh=(s)=>p.evaluate(`(()=>{const r=document.querySelector('korobki-panel').shadowRoot;${s}})()`);
 await p.goto(base); await p.waitForTimeout(1200); await p.click('[data-seed]'); await p.waitForTimeout(2500);
 await p.click('.g >> nth=0'); await p.waitForTimeout(250);
 console.log('bar slots:', await sh("return [...r.querySelectorAll('.bar .ib')].map(b=>b.getAttribute('aria-label')).join(' | ')"), '| camera in header:', await sh("return r.querySelectorAll('.h1row [data-addphoto], .h1row .th').length"));
 // добавление коробки с фото
 await p.click('[data-toggle-add]'); await p.waitForTimeout(200);
 console.log('form buttons order:', await sh("return [...r.querySelectorAll('#addForm .actions button')].map(b=>b.textContent).join(' , ')+' justify='+getComputedStyle(r.querySelector('#addForm .actions')).justifyContent"));
 await p.locator('#addForm input#fName').fill('Тест-коробка');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC','base64');
 const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-addphoto="__new"]')]); await fc.setFiles({name:'a.png',mimeType:'image/png',buffer:png}); await p.waitForTimeout(500);
 console.log('new-photo thumbs in form:', await sh("return r.querySelectorAll('#addForm [data-newphdel]').length+' | note field: '+r.querySelectorAll('#fNote').length"));
 await p.locator('#addForm button[type=submit]').click(); await p.waitForTimeout(2500);
 console.log('box created with photo:', JSON.stringify(Object.values(srv.recs).filter(r=>r.n==='Тест-коробка').map(r=>({ph:(r.ph||[]).length}))), 'photo uploads:', hits.photo);
 // вещь с пометкой
 await p.locator('.g >> nth=-1').click(); await p.waitForTimeout(300);
 await p.click('[data-toggle-add]'); await p.locator('#addForm input#fName').fill('Кабель'); await p.locator('#fNote').fill('HDMI 2 м'); await p.locator('#addForm button[type=submit]').click(); await p.waitForTimeout(2500);
 console.log('item note saved:', JSON.stringify(Object.values(srv.recs).filter(r=>r.n==='Кабель').map(r=>r.note)));
 // шторка коробки: фото
 await p.goBack().catch(()=>{}); 
 await p.goto(base); await p.waitForTimeout(1200); await p.click('.g >> nth=0'); await p.click('h1 .h1btn'); await p.waitForTimeout(300);
 console.log('node sheet has photo section:', await sh("return r.querySelectorAll('.panel [data-addphoto]').length"));
 await p.keyboard.press('Escape');
 console.log('errors',JSON.stringify(errs)); await b.close(); main.close(); process.exit(0); })();
