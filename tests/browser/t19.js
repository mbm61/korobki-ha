// п.2: правка во время сетевого запроса не теряется; фиксированные часы (одинаковые timestamp)
const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs');
const path=require('path'); const D=path.join(__dirname,'..','..','custom_components','korobki')+'/'; const F=Date.now()+100000; let rev=1, delay=0, inject=false; const srv={};
const mk=(id,t,p,n,x={})=>Object.assign({id,t,p,n,c:null,q:t==='item'?1:null,tg:[],note:'',ph:[],o:1,qr:'',base:'',u:F-5000,d:false,dv:''},x);
for(const r of [mk('root','home',null,'Дом'),mk('p1','place','root','Гараж'),mk('b1','box','p1','Ящик'),mk('i1','item','b1','Дрель',{q:1}),mk('i2','item','b1','Пила',{q:1})]) srv[r.id]={...r,r:1};
const server=http.createServer((req,res)=>{ const u=req.url.split('?')[0];
 res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','authorization,content-type'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
 if(u==='/api/korobki/backup'){res.setHeader('content-type','application/json');res.end('{}');return;}
 if(u.startsWith('/api/')){ let c=[];req.on('data',d=>c.push(d));req.on('end',()=>{ let b={};try{b=JSON.parse(Buffer.concat(c).toString()||'{}')}catch(e){}
   const inc=b.records||[]; let ch=false; for(const r of inc){const x=srv[r.id]; if(!x||r.u>=x.u){ if(!ch){rev++;ch=true;} srv[r.id]={...r,r:rev,dv:r.dv||''}; }}
   const out=Object.values(srv).filter(r=>r.r>(b.since||0)); const d=inc.length?delay:0;
   setTimeout(()=>{ if(inject&&inc.length){inject=false; rev++; srv.i1={...srv.i1,q:7,u:srv.i1.u+1,r:rev,dv:'other'};} const out2=Object.values(srv).filter(r=>r.r>(b.since||0)); out.length=0; out2.forEach(x=>out.push(x)); res.setHeader('content-type','application/json'); res.end(JSON.stringify({rev,head:rev,more:false,rest:0,version:'0.10.0',records:out,conflicts:[],nconf:0,fixes:0}));},d); }); return;}
 if(u==='/korobki_app/index.html'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
 if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__','0.10.0'));return;}
 res.statusCode=404;res.end();});
(async()=>{ await new Promise(r=>server.listen(0,r)); const base='http://localhost:'+server.address().port+'/korobki_app/index.html';
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:440,height:956},hasTouch:true,isMobile:true});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript((F)=>{try{localStorage.setItem('korobki-token','t')}catch(e){} Date.now=()=>F;},F);   // одинаковые метки времени
 const sh=(s)=>p.evaluate(`(()=>{const r=document.querySelector('korobki-panel').shadowRoot;${s}})()`);
 await p.goto(base); await p.waitForTimeout(1500);
 await sh("r.querySelector('[data-open=\"p1\"]').click()"); await p.waitForTimeout(400);
 await sh("r.querySelector('[data-open=\"b1\"]').click()"); await p.waitForTimeout(400);
 delay=1500;
 await sh("r.querySelector('[data-step=\"i1\"][data-d=\"1\"]').click()");   // q: 1 -> 2, уйдёт в запросе
 await p.waitForTimeout(1300);                                              // запрос уже в полёте (задержка ответа 1.5 с)
 await sh("r.querySelector('[data-step=\"i1\"][data-d=\"1\"]').click()");   // q: 2 -> 3 во время запроса
 await p.waitForTimeout(1200);
 console.log('UI qty right after response:', await sh("return r.querySelector('.qty').textContent"), '(ожидается 3)');
 delay=0; await p.waitForTimeout(3500);
 console.log('server q after next sync:', srv.i1.q, '(ожидается 3) | UI:', await sh("return r.querySelector('.qty').textContent"));
 // равные timestamp: чужая правка i1 (q=7, тот же u) приходит, когда у нас есть неотправленная правка i1
 inject=true; delay=1500;
 await sh("r.querySelector('[data-step=\"i2\"][data-d=\"1\"]').click()"); await p.waitForTimeout(1300);
 await sh("r.querySelector('[data-step=\"i1\"][data-d=\"-1\"]').click()");   // локально i1: 3 -> 2 (dirty, не в этом запросе)
 await p.waitForTimeout(1200); delay=0; await p.waitForTimeout(4000);
 const ui=await sh("return [...r.querySelectorAll('.qty')].map(x=>x.textContent).join(',')");
 console.log('equal-u: server i1.q =', srv.i1.q, '| UI qtys =', ui, '| converged:', ui.split(',')[0]===String(srv.i1.q) || ui.split(',')[1]===String(srv.i1.q));
 console.log('errors', JSON.stringify(errs)); await b.close(); server.close(); process.exit(0); })();
