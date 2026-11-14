const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs');
const path=require('path'); const D=path.join(__dirname,'..','..','custom_components','korobki')+'/';
const srv={rev:0,recs:{}}; let down=false;
const web=http.createServer((req,res)=>{ const u=req.url.split('?')[0];
 if(u.startsWith('/api/')){ if(down){res.statusCode=503;res.end();return;} let c=[];req.on('data',d=>c.push(d));req.on('end',()=>{ const b=JSON.parse(Buffer.concat(c).toString()||'{}'); let ch=false; for(const r of (b.records||[])){const x=srv.recs[r.id]; if(!x||r.u>x.u){if(!ch){srv.rev++;ch=true;} srv.recs[r.id]={...r,r:srv.rev};}} res.setHeader('content-type','application/json'); res.end(JSON.stringify({rev:srv.rev,version:'0.10.0',records:Object.values(srv.recs).filter(r=>r.r>(b.since||0)||(b.records||[]).some(x=>x.id===r.id))}));}); return;}
 if(u==='/korobki_app/index.html'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
 if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__','0.10.0'));return;}
 res.statusCode=404;res.end();});
(async()=>{ await new Promise(r=>web.listen(0,r)); const base='http://localhost:'+web.address().port+'/korobki_app/index.html'; const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:440,height:956},deviceScaleFactor:2,hasTouch:true,isMobile:true});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('korobki-token','t')}catch(e){}});
 const cdp=await ctx.newCDPSession(p);
 const swipe=async(x0,y0,x1,y1,steps=8)=>{ await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y:y0}]}); for(let i=1;i<=steps;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/steps,y:y0+(y1-y0)*i/steps}]}); await p.waitForTimeout(12);} await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await p.waitForTimeout(450); };
 const sh=(s)=>p.evaluate(`(()=>{const r=document.querySelector('korobki-panel').shadowRoot;${s}})()`);
 await p.goto(base); await p.waitForTimeout(1200); await p.click('[data-seed]'); await p.waitForTimeout(2500);
 const net=()=>sh("const b=r.getElementById('netBtn');return getComputedStyle(b).color+' | '+b.getAttribute('aria-label')+' | rect='+Math.round(b.getBoundingClientRect().x)+','+Math.round(b.getBoundingClientRect().width)");
 console.log('net ok:', await net());
 await p.screenshot({path:require('os').tmpdir()+'/'+'s13_home.png'});
 // навигация в коробку
 await p.click('.g >> nth=0'); await p.click('.g >> nth=0'); await p.waitForTimeout(300);
 console.log('camera btn next to pen:', await sh("const h=r.querySelector('.h1row');return [...h.querySelectorAll('.pen')].map(b=>Math.round(b.getBoundingClientRect().width)+'x'+Math.round(b.getBoundingClientRect().height)+':'+b.getAttribute('aria-label')).join(', ')+' strip='+r.querySelectorAll('.strip').length"));
 await p.screenshot({path:require('os').tmpdir()+'/'+'s13_box.png'});
 // Оффлайн: значок красный, позиция та же
 down=true; await p.click('#netBtn').catch(async()=>{ await p.evaluate(()=>{}); }); await p.waitForTimeout(100);
 await sh("r.getElementById('netBtn').click()"); await p.waitForTimeout(800);
 console.log('net offline:', await net());
 down=false; await sh("r.getElementById('netBtn').click()"); await p.waitForTimeout(1500);
 console.log('net back:', await net());
 // вещь: категории
 await p.locator('.rmain >> nth=0').click(); await p.waitForTimeout(300);
 console.log('chips before:', await sh("return r.querySelectorAll('.panel .chips .chip').length+' cats total='+r.querySelectorAll('.panel .ddrow').length"));
 await p.click('.panel [data-sdd]'); await p.locator('.panel input#sCatName').fill('Зима'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
 console.log('chips after new cat:', await sh("return [...r.querySelectorAll('.panel .chips .chip')].map(c=>c.textContent.trim()).join(',')+' open='+!r.getElementById('sddlist').hidden"));
 await p.screenshot({path:require('os').tmpdir()+'/'+'s13_sheet.png'});
 // свайп вниз по шторке
 const y=await sh("return Math.round(r.querySelector('.panel').getBoundingClientRect().top)+20");
 await swipe(220,y,220,y+260);
 console.log('sheet closed by swipe down:', await sh("return r.getElementById('sheet').hidden"));
 // свайп назад от края
 console.log('path before back:', await sh("return r.getElementById('crumbs').innerText.replace(/\\n/g,' ')"));
 await swipe(6,500,330,520);
 console.log('path after edge swipe:', await sh("return r.getElementById('crumbs').innerText.replace(/\\n/g,' ')"), 'wrap transform:', await sh("return r.querySelector('.wrap').style.transform||'none'"));
 // свайп из середины левой половины экрана срабатывает
 await swipe(200,500,430,505);
 console.log('swipe from x=200 goes back:', await sh("return r.getElementById('crumbs').innerText.replace(/\\n/g,' ')"));
 // короткий свайп не срабатывает
 await swipe(6,500,60,505);
 console.log('short swipe keeps page:', await sh("return r.getElementById('crumbs').innerText.replace(/\\n/g,' ')"));
 // свайп не от края не срабатывает
 await swipe(300,500,430,505);
 console.log('right-half swipe keeps page:', await sh("return r.getElementById('crumbs').innerText.replace(/\\n/g,' ')"));
 console.log('errors',JSON.stringify(errs)); await b.close(); web.close(); })();
