    /* --- обмен с Home Assistant --- */
    function call(method, path, body, type) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var tm = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
      return env.request(method, path, body, type, ctl ? ctl.signal : undefined).then(function (r) {
        clearTimeout(tm);
        if (r.status === 401 || r.status === 403) { var e = new Error('auth'); e.auth = true; throw e; }
        if (!r.ok && r.status !== 404) { var e2 = new Error('http ' + r.status); e2.http = r.status; throw e2; }
        return r;
      }, function (err) { clearTimeout(tm); throw err; });
    }
    function pendingCount() { return Object.keys(dirty).length + upq.length + delq.length; }
    function scheduleSync(ms) { clearTimeout(syncT); syncT = setTimeout(sync, ms || 800); }
    function save() { reconcile(); if (pendingCount() && !dsince) dsince = Date.now(); persist(); renderSync(); scheduleSync(900); }

    /* Пакетная синхронизация: отправляем по BATCH записей, забираем чужие порциями (more + курсор since),
       повторяем, пока не останется неотправленного и непринятого. Защита от зацикливания: нужен прогресс. */
    var BATCH = 500;
    function pushPull() {
      var tot = { nc: 0, fixes: 0 }, steps = 0;
      function step() {
        var held = heldIds(), ids = Object.keys(dirty).filter(function (id) { return recs[id] && !held[id]; }), sent = {};
        var left = ids.length;
        var list = ids.slice(0, BATCH).map(function (id) {
          var x = Object.assign({}, recs[id]);
          sent[id] = sig(x); x.dv = device; x.us = ++useq;   // кто правил и порядковый номер правки на этом устройстве
          if (x.br == null) delete x.br;                      // br: ревизия записи на сервере, на которой основана правка
          return x;
        });
        var prevSince = since;
        return call('POST', '/api/korobki/sync', { since: since, records: list, device: device, label: deviceLabel() }).then(function (r) { return r.json(); }).then(function (j) {
          var changed = applyRemote(j.records || [], sent);
          since = j.rev; everSynced = true; nconf = j.nconf || 0;
          S.stale = !!(j.version && VERSION.indexOf('__') !== 0 && j.version !== VERSION);
          tot.nc += (j.conflicts || []).length; tot.fixes += j.fixes || 0;
          if (changed) { buildTree(); render(); }
          doPersist();
          var held2 = heldIds(), more = !!j.more, leftNow = Object.keys(dirty).filter(function (id) { return recs[id] && !held2[id]; }).length;
          var progress = more ? since !== prevSince : leftNow < left;
          if ((more || leftNow > 0) && progress && ++steps < 200) {
            if (leftNow > 0 || more) { net = 'sync'; renderSync(); }
            return step();
          }
        });
      }
      return step().then(function () {
        if (tot.nc) toast('Конфликт правок: ' + tot.nc + '. Подробности в Сервисе.');
        else if (tot.fixes) toast('Сервер поправил структуру: записей ' + tot.fixes + '. Подробности в журнале.');
      });
    }
    /* Фото: сначала загружаем файлы, потом отправляем записи (но не те, что ссылаются на ещё не загруженное фото),
       и только после успешной отправки всех записей удаляем ненужные файлы с сервера. */
    var upFail = {};                              // фото, которое сервер отверг (4xx): id -> {code, t}; остаётся в очереди
    function stripPhotoRef(pid) {                 // запись ссылается на фото, которого нет ни на устройстве, ни на сервере
      Object.keys(recs).forEach(function (id) {
        var r = recs[id];
        if ((r.ph || []).indexOf(pid) < 0) return;
        r.ph = r.ph.filter(function (x) { return x !== pid; }); r.u = Math.max(Date.now(), r.u + 1); dirty[id] = 1;
      });
    }
    function uploadPhotos(force) {
      return upq.slice().reduce(function (p, id) {
        return p.then(function () {
          if (!force && upFail[id] && Date.now() - upFail[id].t < 60000) return null;   // не долбим сервер каждую секунду
          return new Promise(function (res) { dbGet('photos', id, res); }).then(function (rec) {
            if (!rec || !rec.full) {
              // файла на устройстве нет: если и на сервере его нет, ссылку убираем (не оставляем «битое» фото)
              return call('GET', '/api/korobki/photo/' + id + '/thumb').then(function (r) {
                if (r.status === 404) stripPhotoRef(id);
                upq = upq.filter(function (x) { return x !== id; }); doPersist();
              });
            }
            return call('PUT', '/api/korobki/photo/' + id, abToBlob(rec.full), 'image/jpeg')
              .then(function () { return rec.thumb ? call('PUT', '/api/korobki/photo/' + id + '/thumb', abToBlob(rec.thumb), 'image/jpeg') : null; })
              .then(function () { delete upFail[id]; upq = upq.filter(function (x) { return x !== id; }); rec.up = 1; dbPut('photos', id, rec); doPersist(); }, function (e) {
                if (e && e.http && e.http < 500) { upFail[id] = { code: e.http, t: Date.now() }; return null; }   // 4xx: фото остаётся в очереди
                throw e;
              });
          });
        });
      }, Promise.resolve());
    }
    function photoRefd(pid) {
      return Object.keys(recs).some(function (id) { return (recs[id].ph || []).indexOf(pid) > -1; });
    }
    function deletePhotos() {
      if (Object.keys(dirty).length) return Promise.resolve();   // на сервере ещё могут быть записи со ссылкой: удалим позже
      return delq.slice().reduce(function (p, id) {
        return p.then(function () {
          if (photoRefd(id)) { delq = delq.filter(function (x) { return x !== id; }); doPersist(); return null; }   // фото снова нужно
          return call('DELETE', '/api/korobki/photo/' + id).then(function () { delq = delq.filter(function (x) { return x !== id; }); doPersist(); });
        });
      }, Promise.resolve());
    }
    /* записи, которые пока нельзя отправлять: ссылаются на не загруженное фото, и всё их потомство (иначе на сервере
       потомки окажутся без родителя) */
    function heldIds() {
      var pend = {}, held = {}, any = false;
      upq.forEach(function (x) { pend[x] = 1; });
      Object.keys(dirty).forEach(function (id) {
        var r = recs[id]; if (r && (r.ph || []).some(function (x) { return pend[x]; })) { held[id] = 1; any = true; }
      });
      if (!any) return held;
      var out = {};
      Object.keys(dirty).forEach(function (id) {
        for (var cur = recs[id], n = 0; cur && n < 60; cur = recs[cur.p], n++) if (held[cur.id]) { out[id] = 1; break; }
      });
      return out;
    }
    function sync(manual) {
      if (destroyed || !booted) return Promise.resolve();
      if (syncing) { again = true; return syncing; }
      var manualSync = manual === true;
      var was = everSynced;
      net = 'sync'; renderSync();
      syncing = uploadPhotos(manualSync).then(pushPull).then(deletePhotos).then(function () {
        net = 'ok'; lastSync = Date.now(); if (!pendingCount()) dsince = 0; retryPhotos(); prefetchThumbs(); gcLocalPhotos();
      }).catch(function (e) {
        net = e && e.auth ? 'auth' : 'offline';
      }).then(function () {
        syncing = null;
        if (!was) render(); else { renderSync(); renderFoot(); }
        if (again) { again = false; return sync(); }
      });
      return syncing;
    }

