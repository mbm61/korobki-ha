// п.1: Stored XSS. Сервер (подменённый) и файл импорта подсовывают опасные id, цвета, названия
const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs');
const path=require('path'); const D=path.join(__dirname,'..','..','custom_components','korobki')+'/'; const now=Date.now();
const mk=(id,t,p,n,x={})=>Object.assign({id,t,p,n,c:null,q:t==='item'?1:null,tg:[],note:'',ph:[],o:1,qr:'',base:'',u:now,d:false,r:1,dv:''},x);
const evil=[mk('root','home',null,'Дом'),mk('p1','place','root','Гараж',{c:'#FFA000'}),
 mk('x" onfocus="window.__x=1" autofocus="','place','root','id-атака'),
 mk('p2','place','root','<img src=x onerror=window.__x=3>',{c:'red;}</style><img src=x onerror=window.__x=2>'}),
 mk('cat1','cat',null,'<b>кат</b>',{c:'javascript:window.__x=5'}),
 mk('b1','box','p1','Ящик',{tg:['"><img src=x onerror=window.__x=4>','cat1']}),
 mk('i1','item','b1','Дрель <script>window.__x=6</script>',{tg:['cat1'],note:'<img src=x onerror=window.__x=7>'}),
 mk('settings','settings',null,'',{base:'javascript:window.__x=8'})];
const server=http.createServer((req,res)=>{ const u=req.url.split('?')[0];
 res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','authorization,content-type'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
 if(u==='/api/korobki/backup'){res.setHeader('content-type','application/json');res.end('{}');return;}
 if(u.startsWith('/api/')){ req.resume(); req.on('end',()=>{res.setHeader('content-type','application/json'); res.end(JSON.stringify({rev:9,head:9,more:false,rest:0,version:'0.10.0',records:evil.map(r=>({...r})),conflicts:[],nconf:0,fixes:0}));}); return;}
 if(u==='/korobki_app/index.html'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
 if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__','0.10.0'));return;}
 res.statusCode=404;res.end();});
(async()=>{ await new Promise(r=>server.listen(0,r)); const base='http://localhost:'+server.address().port+'/korobki_app/index.html';
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:440,height:956},hasTouch:true,isMobile:true});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>{errs.push('dialog '+d.message());d.dismiss();});
 await p.addInitScript(()=>{try{localStorage.setItem('korobki-token','t')}catch(e){}});
 const sh=(s)=>p.evaluate(`(()=>{const r=document.querySelector('korobki-panel').shadowRoot;${s}})()`);
 const html=()=>sh("return r.innerHTML");
 await p.goto(base); await p.waitForTimeout(2000);
 let h=await html(); console.log('home rendered:', /Гараж/.test(h), '| id-attack dropped:', !/id-атака/.test(h), '| name escaped:', /&lt;img src=x onerror/.test(h) && !/<img src=x/.test(h));
 console.log('bad color not in style:', !/red;\\}/.test(h) && !/javascript:window/.test(h));
 await sh("r.querySelector('[data-open=\"p1\"]').click()"); await p.waitForTimeout(500);
 await sh("r.querySelector('[data-open=\"b1\"]').click()"); await p.waitForTimeout(500); h=await html();
 console.log('box opened, item name escaped:', /Дрель &lt;script&gt;/.test(h) && !/<script>window/.test(h), '| bad tag dropped:', !/onerror=window.__x=4/.test(h.replace(/&lt;[^>]*/g,'')));
 // импорт опасного файла
 const bad={app:'korobki',format:1,recs:{root:evil[0],p1:evil[1],'x" y':{...evil[2],id:'x" y'},p3:mk('p3','place','root','цвет',{c:'url(javascript:1)'}),p4:mk('p4','place','root','ok',{c:'#00FF00'})}};
 fs.writeFileSync('/tmp/imp_bad.json',JSON.stringify(bad));
 await p.goto(base); await p.waitForTimeout(1500); await sh("r.querySelector('[data-svc]').click()"); await p.waitForTimeout(500);
 await p.locator('#impick').setInputFiles('/tmp/imp_bad.json'); await p.waitForTimeout(700);
 const rep=await sh("return [...r.querySelectorAll('.hint,.warn2')].map(x=>x.textContent).filter(t=>/Проверка|пропущ|Например/.test(t)).join(' || ')");
 console.log('import report:', rep.slice(0,300));
 console.log('x executed:', await p.evaluate(()=>window.__x), '| errors', JSON.stringify(errs));
 await b.close(); server.close(); process.exit(0); })();
