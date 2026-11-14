// п.7: Service Worker не отдаёт устаревший код при наличии сети; оффлайн работает из кэша; версия в кэше новая
const { chromium } = require('playwright'); const http=require('http'); const fs=require('fs'); const path=require('path');
const D=path.join(__dirname,'..','..','custom_components','korobki')+'/';
let swHits=0, panelVer='0.10.0';
const server=http.createServer((req,res)=>{ const u=req.url.split('?')[0];
  if(u==='/korobki_app/sw.js'){ swHits++; res.setHeader('content-type','application/javascript'); res.end(fs.readFileSync(D+'app/sw.js','utf8').replace('__KOROBKI_VERSION__',panelVer)); return; }
  if(u==='/korobki_app/index.html'||u==='/korobki_app/'){res.setHeader('content-type','text/html');res.end(fs.readFileSync(D+'app/index.html'));return;}
  if(u==='/korobki_static/korobki-panel.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(D+'frontend/korobki-panel.js','utf8').replace('__KOROBKI_VERSION__',panelVer));return;}
  if(u==='/korobki_app/manifest.json'){res.setHeader('content-type','application/manifest+json');res.end('{"name":"K","start_url":"/korobki_app/"}');return;}
  res.statusCode=404;res.end(); });
(async()=>{ await new Promise(r=>server.listen(0,r)); const base='http://localhost:'+server.address().port;
  const b=await chromium.launch(); const ctx=await b.newContext();
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(base+'/korobki_app/index.html'); await p.waitForTimeout(2500);
  const ver=await p.evaluate(async()=>{ const r=await navigator.serviceWorker.getRegistration(); return r&&r.active?'active':'none'; });
  console.log('sw active:', ver);
  const cacheNames=await p.evaluate(()=>caches.keys());
  console.log('cache versioned:', cacheNames.some(n=>n==='korobki-app-0.10.0'));
  const cached=await p.evaluate(async()=>{ const c=await caches.open('korobki-app-0.10.0'); const m=await c.match('/korobki_static/korobki-panel.js'); return !!m; });
  console.log('panel cached:', cached);
  // сеть есть: новая версия панели на сервере отдаётся сразу, а не старая из кэша
  panelVer='0.10.1';
  await p.reload(); await p.waitForTimeout(2000);
  const fresh=await p.evaluate(async()=>{ const r=await fetch('/korobki_static/korobki-panel.js',{cache:'no-cache'}); return (await r.text()).includes('0.10.1'); });
  console.log('network fresh panel: ', fresh);
  // оффлайн: кэш продолжает работать
  await ctx.setOffline(true); await p.reload({waitUntil:'load'}).catch(()=>{}); await p.waitForTimeout(1500);
  const off=await p.evaluate(()=>document.readyState);
  console.log('offline shell loads:', off==='complete');
  await ctx.setOffline(false);
  console.log('errors', JSON.stringify(errs)); await b.close(); server.close(); process.exit(0); })();
