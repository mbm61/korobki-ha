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

    function pushPull() {
      var ids = Object.keys(dirty).filter(function (id) { return recs[id]; }), sent = {};
      var list = ids.map(function (id) {
        var x = Object.assign({}, recs[id]);
        sent[id] = sig(x); x.dv = device; x.us = ++useq;   // кто правил и порядковый номер правки на этом устройстве
        if (x.br == null) delete x.br;                      // br: ревизия записи на сервере, на которой основана правка
        return x;
      });
      return call('POST', '/api/korobki/sync', { since: since, records: list, device: device, label: deviceLabel() }).then(function (r) { return r.json(); }).then(function (j) {
        var changed = applyRemote(j.records || [], sent);
        since = j.rev; everSynced = true; nconf = j.nconf || 0;
        S.stale = !!(j.version && VERSION.indexOf('__') !== 0 && j.version !== VERSION);
        var nc = (j.conflicts || []).length;
        if (nc) toast('Конфликт правок: ' + nc + '. Подробности в Сервисе.');
        else if (j.fixes) toast('Сервер поправил структуру: записей ' + j.fixes + '. Подробности в журнале.');
        if (changed) { buildTree(); render(); }
        doPersist();
      });
    }
    function uploadPhotos() {
      return upq.slice().reduce(function (p, id) {
        return p.then(function () {
          return new Promise(function (res) { dbGet('photos', id, res); }).then(function (rec) {
            if (!rec || !rec.full) { upq = upq.filter(function (x) { return x !== id; }); return null; }
            return call('PUT', '/api/korobki/photo/' + id, abToBlob(rec.full), 'image/jpeg')
              .then(function () { return rec.thumb ? call('PUT', '/api/korobki/photo/' + id + '/thumb', abToBlob(rec.thumb), 'image/jpeg') : null; })
              .then(function () { upq = upq.filter(function (x) { return x !== id; }); rec.up = 1; dbPut('photos', id, rec); doPersist(); }, function (e) {
                if (e && e.http && e.http < 500) { upq = upq.filter(function (x) { return x !== id; }); return null; }
                throw e;
              });
          });
        });
      }, Promise.resolve());
    }
    function deletePhotos() {
      return delq.slice().reduce(function (p, id) {
        return p.then(function () {
          return call('DELETE', '/api/korobki/photo/' + id).then(function () { delq = delq.filter(function (x) { return x !== id; }); doPersist(); });
        });
      }, Promise.resolve());
    }
    function sync() {
      if (destroyed || !booted) return Promise.resolve();
      if (syncing) { again = true; return syncing; }
      var was = everSynced;
      net = 'sync'; renderSync();
      syncing = uploadPhotos().then(deletePhotos).then(pushPull).then(function () {
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

