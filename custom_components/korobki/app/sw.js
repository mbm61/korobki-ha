/* Сервис-воркер: приложение открывается без сети, но пока связь есть, всегда берётся свежий код.
   Версия подставляется сервером из manifest.json: с новым релизом меняется сам файл sw.js, браузер ставит
   новый воркер, старый кэш удаляется, страница узнаёт об обновлении (событие controllerchange). */
var VERSION = '__KOROBKI_VERSION__';
var CACHE = 'korobki-app-' + VERSION;
var WAIT_MS = 3000; /* сколько ждать сеть, прежде чем открыть копию из кэша (медленная связь) */
var SHELL = ['/korobki_app/', '/korobki_app/index.html', '/korobki_app/manifest.json', '/korobki_app/apple-touch-icon.png', '/korobki_static/korobki-panel.js'];

function isShell(p) { return p === '/korobki_app/' || p === '/korobki_app' || p === '/korobki_app/index.html' || p === '/korobki_static/korobki-panel.js'; }

self.addEventListener('install', function (e) {
  /* cache: 'reload' — мимо HTTP-кэша браузера, иначе в новый кэш попал бы старый файл */
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return fetch(u, { cache: 'reload' }).then(function (res) { if (res.ok) return c.put(u, res); }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== CACHE; }).map(function (x) { return caches.delete(x); })); }).then(function () { return self.clients.claim(); }));
});

/* Код и страница: сначала сеть (с проверкой на сервере), копия из кэша только если сети нет, она вернула ошибку или не ответила за WAIT_MS */
function networkFirst(c, key, url) {
  return new Promise(function (resolve) {
    var done = false;
    function finish(res) { if (!done) { done = true; clearTimeout(t); resolve(res); } }
    function fromCache(fallback) { return c.match(key).then(function (hit) { finish(hit || fallback || Response.error()); }); }
    var t = setTimeout(function () { c.match(key).then(function (hit) { if (hit) finish(hit); }); }, WAIT_MS);
    fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      if (res.ok) { c.put(key, res.clone()); finish(res); } else fromCache(res);
    }, function () { fromCache(); });
  });
}
/* Иконки и манифест: из кэша, обновляются в фоне */
function cacheFirst(c, key, r) {
  return c.match(key).then(function (hit) {
    var net = fetch(r).then(function (res) { if (res.ok) c.put(key, res.clone()); return res; }).catch(function () { return hit; });
    return hit || net;
  });
}
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.indexOf('/api/') === 0) return; /* данные и фото: через само приложение */
  if (u.pathname.indexOf('/korobki_app') !== 0 && u.pathname.indexOf('/korobki_static') !== 0) return;
  if (u.pathname === '/korobki_app/sw.js') return; /* сам воркер браузер обновляет напрямую */
  var key = u.pathname === '/korobki_app' ? '/korobki_app/' : u.pathname; /* ?v= в ключ не входит */
  e.respondWith(caches.open(CACHE).then(function (c) { return isShell(u.pathname) ? networkFirst(c, key, r.url) : cacheFirst(c, key, r); }));
});
