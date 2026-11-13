/* Сервис-воркер: приложение открывается без сети. Код берётся из кэша и обновляется в фоне. */
var CACHE = 'korobki-app-v7';
var SHELL = ['/korobki_app/', '/korobki_app/index.html', '/korobki_app/manifest.json', '/korobki_app/apple-touch-icon.png', '/korobki_static/korobki-panel.js'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== CACHE; }).map(function (x) { return caches.delete(x); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.indexOf('/api/') === 0) return; /* данные и фото: через само приложение */
  if (u.pathname.indexOf('/korobki_app') !== 0 && u.pathname.indexOf('/korobki_static') !== 0) return;
  var key = u.pathname === '/korobki_app' ? '/korobki_app/' : u.pathname; /* ?v= в ключ не входит */
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(key).then(function (hit) {
      var net = fetch(r).then(function (res) { if (res.ok) c.put(key, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
