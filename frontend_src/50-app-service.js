    /* --- сервис: копии, хранилище, фото на сервере --- */
    function requestPersist() {
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function (v) { S.svc.persisted = v; }); } catch (e) {}
    }
    function gcLocalPhotos() {
      if (!DB) return;
      var used = {}; upq.forEach(function (x) { used[x] = 1; });
      Object.keys(recs).forEach(function (id) { (recs[id].ph || []).forEach(function (pid) { used[pid] = 1; }); });
      try {
        var st = DB.transaction('photos', 'readwrite').objectStore('photos'), rq = st.getAllKeys();
        rq.onsuccess = function () { (rq.result || []).forEach(function (k) { if (!used[k]) st.delete(k); }); };
      } catch (e) {}
    }
    function abToB64(ab) {
      var u = new Uint8Array(ab), s2 = '';
      for (var i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s2);
    }
    function b64ToAb(b) {
      var bin = atob(b), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    }
    function getPhotoBuf(pid, full) {
      return new Promise(function (res) { dbGet('photos', pid, res); }).then(function (rec) {
        var ab = rec && (full ? rec.full : rec.thumb);
        if (ab) return ab;
        return call('GET', '/api/korobki/photo/' + pid + (full ? '' : '/thumb')).then(function (r) { return r.ok ? r.blob() : null; })
          .then(function (b) {
            if (!b) return null;
            return blobToAb(b).then(function (buf) {
              dbGet('photos', pid, function (cur) { cur = cur || { up: 1 }; if (full) cur.full = buf; else cur.thumb = buf; dbPut('photos', pid, cur); });
              return buf;
            });
          }).catch(function () { return null; });
      });
    }
    function doExport(withPh) {
      S.svc.busy = 'Готовлю копию…'; S.svc.exp = null; expBlob = null; render();
      var data = { app: 'korobki', format: 1, version: VERSION, created: new Date().toISOString(), recs: recs };
      var ids = [], photos = {}, i = 0;
      if (withPh) Object.keys(recs).forEach(function (id) { (recs[id].ph || []).forEach(function (pid) { if (ids.indexOf(pid) < 0) ids.push(pid); }); });
      return ids.reduce(function (pr, pid) {
        return pr.then(function () {
          S.svc.busy = 'Фото ' + (++i) + ' из ' + ids.length; render();
          return Promise.all([getPhotoBuf(pid, true), getPhotoBuf(pid, false)]).then(function (r) {
            if (r[0] || r[1]) photos[pid] = { f: r[0] ? abToB64(r[0]) : '', t: r[1] ? abToB64(r[1]) : '' };
          });
        });
      }, Promise.resolve()).then(function () {
        if (withPh) data.photos = photos;
        expBlob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        var d = new Date(), ds = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        S.svc.exp = { name: 'korobki-' + ds + (withPh ? '-s-foto' : '') + '.json', size: expBlob.size, missing: ids.length - Object.keys(photos).length };
        S.svc.busy = ''; render();
      }).catch(function () { S.svc.busy = ''; toast('Не удалось подготовить копию'); render(); });
    }
    function saveExp() {
      if (!expBlob || !S.svc.exp) return;
      var name = S.svc.exp.name, file = null;
      try { file = new File([expBlob], name, { type: 'application/json' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(function () {}); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(expBlob); a.download = name; sr.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
    function readImport(file) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var d = JSON.parse(fr.result);
          if (!d || d.app !== 'korobki' || !d.recs || typeof d.recs !== 'object') throw new Error('bad');
          var n = Object.keys(d.recs).filter(function (id) { var r = d.recs[id]; return r && typeof r.id === 'string' && !r.d; }).length;
          impData = d; S.svc.imp = { n: n, ph: d.photos ? Object.keys(d.photos).length : 0, date: d.created || '' };
        } catch (e) { impData = null; S.svc.imp = null; toast('Это не файл копии «Коробок»'); }
        render();
      };
      fr.readAsText(file);
    }
    function doImport() {
      if (!impData) return;
      var now = Date.now(), cnt = 0;
      Object.keys(impData.recs).forEach(function (id) {
        var r = impData.recs[id];
        if (!r || typeof r.id !== 'string' || r.id !== id) return;
        var x = norm(r); x.d = !!r.d; x.u = Math.max(now, (recs[id] ? recs[id].u + 1 : 0)); recs[id] = x; dirty[id] = 1; cnt++;
      });
      var ph = impData.photos || {};
      Object.keys(ph).forEach(function (pid) {
        if (!/^[0-9a-f]{16}$/.test(pid)) return;
        try {
          var full = ph[pid].f ? b64ToAb(ph[pid].f) : null, th = ph[pid].t ? b64ToAb(ph[pid].t) : null;
          dbPut('photos', pid, { full: full || th, thumb: th || full, up: 0 });
          if (upq.indexOf(pid) < 0) upq.push(pid);
        } catch (e) {}
      });
      impData = null; S.svc.imp = null;
      buildTree(); if (!dsince) dsince = now; persist(); renderSync(); scheduleSync(300);
      toast('Восстановлено записей: ' + cnt); render();
    }
    function loadSvc() {
      S.svc.stats = null; S.svc.statsErr = false;
      try { if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(function (v) { S.svc.persisted = v; refreshSvc(); }); } catch (e) {}
      try { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { S.svc.est = e; refreshSvc(); }); } catch (e) {}
      S.svc.log = null;
      call('GET', '/api/korobki/log').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) { j.conflicts = j.conflicts || []; j.log = j.log || []; j.devices = j.devices || {}; nconf = j.conflicts.length; } S.svc.log = j; refreshSvc(); renderSync(); }).catch(function () {});
      call('GET', '/api/korobki/stats').then(function (r) { return r.json(); }).then(function (j) { S.svc.stats = j; refreshSvc(); }).catch(function () { S.svc.statsErr = true; refreshSvc(); });
    }
    function refreshSvc() { if (S.sheet && S.sheet.type === 'svc') render(); }
    function doCleanup() {
      S.svc.busy = 'Очищаю…'; render();
      call('POST', '/api/korobki/cleanup', {}).then(function (r) { return r.json(); }).then(function (j) {
        S.svc.busy = ''; toast('Удалено лишних фото: ' + j.removed + ' (' + mb(j.freed) + ')'); loadSvc(); render();
      }).catch(function () { S.svc.busy = ''; toast('Нет связи с Home Assistant'); render(); });
    }
    function mb(b) { return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' КБ' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' МБ'; }
