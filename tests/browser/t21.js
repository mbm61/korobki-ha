// п.6: счётчик правок useq сохраняется ДО запроса; «устаревшая» отправка не теряет правку; повтор запроса безопасен
const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs'); const path=require('path');
const D=path.join(__dirname,'..','..','custom_components','korobki')+'/'; const F=Date.now()+100000;
let rev=1, mode='stale'; const srv={}; const posts=[]; let page=null;
const mk=(id,t,p,n,x={})=>Object.assign({id,t,p,n,c:null,q:t==='item'?1:null,tg:[],note:'',ph:[],o:1,qr:'',base:'',u:F-5000,d:false,dv:''},x);
for(const r of [mk('root','home',null,'Дом'),mk('p1','place','root','Гараж'),mk('b1','box','p1','Ящик'),mk('i1','item','b1','Дрель',{q:1})]) srv[r.id]={...r,r:1};
const server=http.createServer((req,res)=>{ const u=req.url.split('?')[0];
 res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','authorization,content-type'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
 if(u==='/api/korobki/backup'){res.setHeader('content-type','application/json');res.end('{}');return;}
 if(u.startsWith('/api/')){ let c=[];req.on('data',d=>c.push(d));req.on('end',async()=>{ let b={};try{b=JSON.parse(Buffer.concat(c).toString()||'{}')}catch(e){}
   const inc=b.records||[]; const stale=[]; let ushi=0;
   if(inc.length){
     const maxUs=Math.max(...inc.map(r=>r.us||0));
     // что лежит на диске устройства в момент запроса
     const persisted=await page.evaluate(()=>new Promise(res=>{const q=indexedDB.open('korobki-local-pwa');q.onsuccess=()=>{try{const g=q.result.transaction('kv').objectStore('kv').get('state');g.onsuccess=()=>res(g.result&&g.result.useq);g.onerror=()=>res(null);}catch(e){res(null)}};q.onerror=()=>res(null);}));
     posts.push({maxUs,persisted,ids:inc.map(r=>r.id),br:inc.map(r=>r.br)});
     for(const r of inc){ const x=srv[r.id];
       if(mode==='stale'&&r.id==='i1'&&x&&(r.us||0)<=50){ stale.push(r.id); ushi=50; continue; }   // сервер уже видел номера до 50
       if(!x||r.u>=x.u||r.us>(x.us||0)){ rev++; srv[r.id]={...r,r:rev,dv:'dev'}; } }
   }
   const out=Object.values(srv).filter(r=>r.r>(b.since||0)||stale.includes(r.id)||inc.some(i=>i.id===r.id));
   res.setHeader('content-type','application/json'); res.end(JSON.stringify({rev,head:rev,more:false,rest:0,version:'0.10.0',records:out,conflicts:[],nconf:0,fixes:0,stale,ushi})); }); return;}
 if(u==='/korobki_app/index.html'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
 if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__','0.10.0'));return;}
 res.statusCode=404;res.end();});
(async()=>{ await new Promise(r=>server.listen(0,r)); const base='http://localhost:'+server.address().port+'/korobki_app/index.html';
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:440,height:956},hasTouch:true,isMobile:true});
 const p=await ctx.newPage(); page=p; const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{try{localStorage.setItem('korobki-token','t')}catch(e){}});
 const sh=(s)=>p.evaluate(`(()=>{const r=document.querySelector('korobki-panel').shadowRoot;${s}})()`);
 await p.goto(base); await p.waitForTimeout(1500);
 await sh("r.querySelector('[data-open=\"p1\"]').click()"); await p.waitForTimeout(400);
 await sh("r.querySelector('[data-open=\"b1\"]').click()"); await p.waitForTimeout(400);
 await sh("r.querySelector('[data-step=\"i1\"][data-d=\"1\"]').click()");   // q: 1 -> 2
 await p.waitForTimeout(5000);
 const sendPosts=posts.filter(x=>x.ids.includes('i1'));
 console.log('A. useq на диске до каждого запроса:', sendPosts.every(x=>x.persisted>=x.maxUs), JSON.stringify(sendPosts.map(x=>[x.maxUs,x.persisted])));
 console.log('B. первый запрос признан устаревшим, правка отправлена повторно:', sendPosts.length>=2);
 console.log('C. повтор с номером выше серверного и ревизией сервера:', sendPosts.length>=2 && sendPosts[sendPosts.length-1].maxUs>50 && sendPosts[sendPosts.length-1].br[0]!=null);
 console.log('D. правка не потеряна: сервер q =', srv.i1.q, '| UI =', await sh("return r.querySelector('.qty').textContent"));
 mode='ok'; const n0=posts.length; await p.waitForTimeout(2500);
 console.log('E. после успеха лишних отправок нет:', posts.filter(x=>x.ids.includes('i1')).length===sendPosts.length);
 console.log('errors', JSON.stringify(errs)); await b.close(); server.close(); process.exit(0); })();
