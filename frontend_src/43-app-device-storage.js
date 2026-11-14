    /* --- хранилище на устройстве --- */
    var DB = null, DBNAME = 'korobki-local-' + env.kind;
    function dbOpen(cb) {
      try {
        var r = indexedDB.open(DBNAME, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); r.result.createObjectStore('photos'); };
        r.onsuccess = function () { DB = r.result; cb(true); };
        r.onerror = function () { cb(false); };
        r.onblocked = function () { cb(false); };
      } catch (e) { cb(false); }
    }
    function dbGet(store, key, cb) {
      if (!DB) return cb(null);
      try {
        var rq = DB.transaction(store, 'readonly').objectStore(store).get(key);
        rq.onsuccess = function () { cb(rq.result || null); };
        rq.onerror = function () { cb(null); };
      } catch (e) { cb(null); }
    }
    function dbPut(store, key, val) { if (!DB) return; try { DB.transaction(store, 'readwrite').objectStore(store).put(val, key); } catch (e) {} }
    function dbDel(store, key) { if (!DB) return; try { DB.transaction(store, 'readwrite').objectStore(store).delete(key); } catch (e) {} }
    function persist(now) { clearTimeout(persistT); persistT = setTimeout(doPersist, now ? 0 : 250); }
    function stateObj() {
      return { recs: recs, dirty: Object.keys(dirty), upq: upq, delq: delq, since: since, device: device, useq: useq, nconf: nconf, synced: everSynced, dsince: dsince };
    }
    function doPersist() { clearTimeout(persistT); dbPut('kv', 'state', stateObj()); }
    /* Запись состояния с ожиданием подтверждения от базы: счётчик правок useq должен быть на диске ДО запроса,
       иначе после сбоя он откатится назад, а сервер уже мог принять правки с большими номерами. */
    function persistWait() {
      clearTimeout(persistT);
      return new Promise(function (res) {
        if (!DB) { res(); return; }
        try {
          var tx = DB.transaction('kv', 'readwrite'); tx.objectStore('kv').put(stateObj(), 'state');
          tx.oncomplete = function () { res(); }; tx.onerror = tx.onabort = function () { res(); };
        } catch (e) { res(); }
      });
    }

