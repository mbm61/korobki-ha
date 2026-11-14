// п.3: фото. 4xx при загрузке не теряет очередь и не пускает запись с этим фото; удаление файла только после синхронизации записей
const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs');
const path=require('path'); const D=path.join(__dirname,'..','..','custom_components','korobki')+'/'; const srv={rev:0,recs:{}}; const log=[]; let putStatus=400; const photos={};
const server=http.createServer((req,res)=>{ const u=req.url.split('?')[0];
 res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','authorization,content-type'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
 if(u==='/api/korobki/backup'){res.setHeader('content-type','application/json');res.end('{}');return;}
 const m=u.match(/^\/api\/korobki\/photo\/([0-9a-f]{16})(\/thumb)?$/);
 if(m){ req.resume(); req.on('end',()=>{ log.push(req.method+' photo '+m[1].slice(0,4)+(m[2]||'')); if(req.method==='PUT'){ if(putStatus===200) photos[m[1]]=1; res.statusCode=putStatus; res.end('{}'); } else if(req.method==='DELETE'){ delete photos[m[1]]; res.end('{}'); } else { res.statusCode=photos[m[1]]?200:404; res.end(''); } }); return; }
 if(u.startsWith('/api/')){ let c=[];req.on('data',d=>c.push(d));req.on('end',()=>{ const b=JSON.parse(Buffer.concat(c).toString()||'{}'); let ch=false;
   for(const r of (b.records||[])){const x=srv.recs[r.id]; if(!x||r.u>x.u){ if(!ch){srv.rev++;ch=true;} srv.recs[r.id]={...r,r:srv.rev}; }}
   if((b.records||[]).length) log.push('POST sync '+(b.records||[]).map(r=>r.n||r.id).join(','));
   const out=Object.values(srv.recs).filter(r=>r.r>(b.since||0)); res.setHeader('content-type','application/json'); res.end(JSON.stringify({rev:srv.rev,head:srv.rev,more:false,rest:0,version:'0.10.0',records:out,conflicts:[],nconf:0,fixes:0})); }); return;}
 if(u==='/korobki_app/index.html'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
 if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__','0.10.0'));return;}
 res.statusCode=404;res.end();});
(async()=>{ await new Promise(r=>server.listen(0,r)); const base='http://localhost:'+server.address().port+'/korobki_app/index.html';
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:440,height:956},hasTouch:true,isMobile:true});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const until=async(f,ms=20000)=>{const t0=Date.now(); while(Date.now()-t0<ms){ try{ if(await f()) return true; }catch(e){} await p.waitForTimeout(200);} return false; };
 await p.addInitScript(()=>{try{localStorage.setItem('korobki-token','t')}catch(e){}});
 const sh=(s)=>p.evaluate(`(()=>{const r=document.querySelector('korobki-panel').shadowRoot;${s}})()`);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC','base64');
 await p.goto(base); await p.waitForTimeout(1200); await p.click('[data-seed]'); await p.waitForTimeout(2500);
 await p.click('.g >> nth=0'); await p.waitForTimeout(300);
 // коробка С фото, сервер отвергает фото кодом 400
 log.length=0;
 await p.click('[data-toggle-add]'); await p.locator('#addForm input#fName').fill('Коробка-с-фото');
 const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-addphoto="__new"]')]); await fc.setFiles({name:'a.png',mimeType:'image/png',buffer:png}); await p.waitForTimeout(500);
 await p.locator('#addForm button[type=submit]').click(); await p.waitForTimeout(3500);
 // вторая коробка БЕЗ фото в том же месте: должна уйти
 await p.click('[data-toggle-add]'); await p.locator('#addForm input#fName').fill('Коробка-без-фото'); await p.locator('#addForm button[type=submit]').click(); await until(()=>Object.values(srv.recs).some(r=>r.n==='Коробка-без-фото'));
 const names=()=>Object.values(srv.recs).map(r=>r.n);
 const rec=()=>Object.values(srv.recs).find(r=>r.n==='Коробка-с-фото'); console.log('A. 400 на фото: запись на сервере БЕЗ ссылки на фото:', !!rec() && (rec().ph||[]).length===0, '| коробка без фото ушла:', names().includes('Коробка-без-фото'));
 console.log('LOG', JSON.stringify(log)); console.log('A. журнал:', log.filter(x=>/PUT/.test(x)).length>0 ? 'были попытки PUT' : 'нет PUT', '| в журнале нет DELETE:', !log.some(x=>/DELETE/.test(x)));
 // сервер починился: ручная синхронизация
 putStatus=200; await p.goto(base); await p.waitForTimeout(1500); await sh("r.querySelector('[data-sync]').click()"); await p.waitForTimeout(4000);
 console.log('B. после починки запись ссылается на фото:', rec() && (rec().ph||[]).length===1, '| фото загружено:', Object.keys(photos).length);
 const lastPut=log.map((x,i)=>/PUT photo/.test(x)?i:-1).filter(i=>i>-1).pop(), iPost=log.map((x,i)=>/POST sync .*Коробка-с-фото/.test(x)?i:-1).filter(i=>i>-1).pop(), iPut=lastPut;
 console.log('B. порядок: сначала PUT фото, потом запись:', iPut>-1 && iPost>iPut);
 // C. удаление фото: DELETE файла только после отправки записи без ссылки
 await p.goto(base); await p.waitForTimeout(1500);
 await sh("r.querySelector('.g').click()"); await p.waitForTimeout(400);
 await sh("const c=[...r.querySelectorAll('[data-open]')].find(x=>/Коробка-с-фото/.test(x.textContent)); c.click()"); await p.waitForTimeout(500);
 await sh("r.querySelector('[data-edit]').click()"); await p.waitForTimeout(1500); await sh("r.querySelector('[data-view]').click()"); await p.waitForTimeout(800);
 log.length=0;
 const has=await sh("return r.querySelectorAll('[data-delphoto]').length");
 if(has){ await sh("r.querySelector('[data-delphoto]').click()"); await p.waitForTimeout(250); await sh("r.querySelector('[data-delphoto]').click()"); await p.waitForTimeout(4000);
   const iDel=log.findIndex(x=>/DELETE photo/.test(x)), iPost=log.findIndex(x=>/POST sync/.test(x));
   console.log('C. журнал:', JSON.stringify(log), '| DELETE после POST записи:', iDel>-1 && iPost>-1 && iDel>iPost, '| на сервере у записи нет фото:', (rec().ph||[]).length===0, '| файл удалён:', Object.keys(photos).length===0);
 } else console.log('C. кнопка удаления фото не найдена');
 console.log('errors', JSON.stringify(errs)); await b.close(); server.close(); process.exit(0); })();
