// 0.10.0: нет локального адреса, фильтр «любая из категорий», подтверждение выхода, проверка импорта, пакетная синхронизация
const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs');
const path=require('path'); const D=path.join(__dirname,'..','..','custom_components','korobki')+'/'; const srv={rev:0,recs:{}}; const reqs=[];
const server=http.createServer((req,res)=>{ const u=req.url.split('?')[0];
 res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','authorization,content-type'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
 if(u.startsWith('/api/korobki/photo/')){req.resume();req.on('end',()=>res.end('{}'));return;}
 if(u==='/api/korobki/backup'){res.setHeader('content-type','application/json');res.end(JSON.stringify({last:{t:Date.now(),ok:true,size:2048,recs:7},files:[],count:3,keep:14,hours:24,dir:'/config/korobki_backups'}));return;}
 if(u.startsWith('/api/')){ let c=[];req.on('data',d=>c.push(d));req.on('end',()=>{ let b={}; try{b=JSON.parse(Buffer.concat(c).toString()||'{}')}catch(e){}
   const inc=(b.records||[]); reqs.push(inc.length);
   if(inc.length>500){res.statusCode=400;res.end('too many');return;}
   let ch=false; for(const r of inc){const x=srv.recs[r.id]; if(!x||r.u>x.u){if(!ch){srv.rev++;ch=true;} srv.recs[r.id]={...r,r:srv.rev};}}
   // постранично: не больше 300 записей за ответ, курсор = ревизия последней
   const fresh=Object.values(srv.recs).filter(r=>r.r>(b.since||0)).sort((a,b)=>a.r-b.r); let more=false, cur=srv.rev;
   let out=fresh; if(fresh.length>300){ cur=fresh[299].r; out=fresh.filter(r=>r.r<=cur); more=true; }
   res.setHeader('content-type','application/json'); res.end(JSON.stringify({rev:cur,head:srv.rev,more,rest:0,version:'0.10.0',records:out,conflicts:[],nconf:0,fixes:0})); }); return;}
 if(u==='/korobki_app/manifest.json'){res.setHeader('content-type','application/json');res.end('{}');return;}
 if(u==='/korobki_app/index.html'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
 if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__','0.10.0'));return;}
 res.statusCode=404;res.end();});
(async()=>{ await new Promise(r=>server.listen(0,r)); const base='http://localhost:'+server.address().port+'/korobki_app/index.html';
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:440,height:956},hasTouch:true,isMobile:true});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('korobki-token','t');localStorage.setItem('korobki-local','http://old.local')}catch(e){}});
 const sh=(s)=>p.evaluate(`(()=>{const r=document.querySelector('korobki-panel').shadowRoot;${s}})()`);
 await p.goto(base); await p.waitForTimeout(1200); await p.click('[data-seed]'); await p.waitForTimeout(2500);
 console.log('old local key cleaned:', await p.evaluate(()=>localStorage.getItem('korobki-local')===null));
 // сервис: нет локального адреса, есть автокопия
 await p.locator('[data-svc]').click(); await p.waitForTimeout(600);
 console.log('no local field:', await sh("return r.querySelectorAll('#srvLocal,[data-lsave]').length")===0, '| server field:', await sh("return r.querySelectorAll('#srvUrl').length"));
 console.log('autobackup text:', await sh("return [...r.querySelectorAll('.hint')].map(x=>x.textContent).filter(t=>/Последняя|Home Assistant сам/.test(t)).join(' || ')"));
 // импорт: 3 вещи (категории К1, К2, без), + битые записи
 const ph='/9j/'+'A'.repeat(20);
 const recs={root:{id:'root',t:'home',p:null,n:'Дом',u:1,d:false},pl:{id:'pl',t:'place',p:'root',n:'Гараж',u:1,d:false},bx:{id:'bx',t:'box',p:'pl',n:'Ящик',u:1,d:false},
  c1:{id:'c1',t:'cat',p:null,n:'Зима',c:'#2196f3',u:1,d:false},c2:{id:'c2',t:'cat',p:null,n:'Лето',c:'#ffc107',u:1,d:false},
  i1:{id:'i1',t:'item',p:'bx',n:'Лыжи',q:1,tg:['c1'],u:1,d:false},i2:{id:'i2',t:'item',p:'bx',n:'Мяч',q:1,tg:['c2','zzz'],u:1,d:false},i3:{id:'i3',t:'item',p:'bx',n:'Верёвка',q:1,tg:[],u:1,d:false},
  bad1:{id:'bad1',t:'item',p:'nope',n:'Сирота',q:1,u:1,d:false},bad2:{id:'bad2',t:'zzz',p:'bx',n:'Тип',u:1,d:false},bad3:{id:'bad3',t:'box',p:'bad4',n:'Ц1',u:1,d:false},bad4:{id:'bad4',t:'box',p:'bad3',n:'Ц2',u:1,d:false},
  bad5:{id:'bad5',t:'place',p:'bx',n:'Место в коробке',u:1,d:false},bad6:{id:'bad6',t:'item',p:'bx',n:42,u:1,d:false}};
 fs.writeFileSync('/tmp/imp.json',JSON.stringify({app:'korobki',format:1,created:'2026-11-01T10:00:00Z',recs,photos:{'0123456789abcdef':{f:ph,t:ph},'fedcba9876543210':{f:'not-a-jpeg',t:''}}}));
 await p.locator('#impick').setInputFiles('/tmp/imp.json'); await p.waitForTimeout(700);
 console.log('import report:', await sh("return [...r.querySelectorAll('.hint,.warn2')].map(x=>x.textContent).filter(t=>/Проверка|пропущ|категори|повреж|Например/.test(t)).join(' || ')"));
 await p.locator('[data-doimport]').click(); await p.waitForTimeout(2500);
 const names=Object.values(srv.recs).map(r=>r.n);
 console.log('restored ok:', ['Лыжи','Мяч','Верёвка','Гараж'].every(n=>names.includes(n)), '| bad skipped:', !['Сирота','Тип','Ц1','Ц2','Место в коробке'].some(n=>names.includes(n)));
 console.log('unknown cat dropped:', JSON.stringify(srv.recs.i2&&srv.recs.i2.tg));
 // фильтр: любая из выбранных категорий
 await p.keyboard.press('Escape'); await p.waitForTimeout(300);
 await sh("r.querySelector('#filtBtn').click()"); await p.waitForTimeout(400);
 const view=()=>sh("return r.querySelector('#view').textContent");
 await sh("r.querySelector('[data-fcat=\"c1\"]').click()"); await p.waitForTimeout(250); let t1=await view();
 await sh("r.querySelector('[data-fcat=\"c2\"]').click()"); await p.waitForTimeout(250); let t2=await view();
 console.log('filter c1:', /Лыжи/.test(t1), !/Мяч/.test(t1), '| c1+c2 (any):', /Лыжи/.test(t2), /Мяч/.test(t2), !/Верёвка/.test(t2), '| label ok:', /любая из выбранных/.test(t2));
 // выход: подтверждение
 await sh("r.querySelector('#filtBtn').click()"); await p.waitForTimeout(300); await p.goto(base); await p.waitForTimeout(1200);
 await sh("r.querySelector('[data-logout]').click()"); await p.waitForTimeout(200);
 console.log('after 1st tap: still in app:', await sh("return !!r.querySelector('[data-logout]')"), '| label:', await sh("return r.querySelector('[data-logout]').textContent"));
 await p.waitForTimeout(4400); console.log('label resets:', await sh("return r.querySelector('[data-logout]').textContent"));
 let loads=0; p.on('load',()=>loads++);
 await sh("r.querySelector('[data-logout]').click()"); await p.waitForTimeout(300); console.log('1 tap after reset: no reload:', loads===0);
 await sh("r.querySelector('[data-logout]').click()"); await p.waitForTimeout(1500);
 console.log('2nd tap logs out (page reloaded):', loads===1);
 // пакетная синхронизация: 1300 новых записей, запрос не больше 500, сервер отдаёт по 300
 await p.evaluate(()=>{try{localStorage.setItem('korobki-token','t')}catch(e){}}); await p.goto(base); await p.waitForTimeout(1200);
 const big={}; for(let i=0;i<1300;i++){big['b'+i]={id:'b'+i,t:'item',p:'bx',n:'Вещь'+i,q:1,tg:[],u:1,d:false};}
 fs.writeFileSync('/tmp/big.json',JSON.stringify({app:'korobki',format:1,recs:big}));
 reqs.length=0; await p.locator('[data-svc]').click(); await p.waitForTimeout(500);
 await p.locator('#impick').setInputFiles('/tmp/big.json'); await p.waitForTimeout(800); await p.locator('[data-doimport]').click(); await p.waitForTimeout(6000);
 const n=Object.keys(srv.recs).filter(k=>/^b\d+$/.test(k)).length;
 console.log('big import: server has', n, 'of 1300 (parent bx exists?', !!srv.recs.bx, ') | requests sizes:', JSON.stringify(reqs), '| max:', Math.max(...reqs));
 console.log('errors',JSON.stringify(errs)); await b.close(); server.close(); process.exit(0); })();
