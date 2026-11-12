    /* --- фото: сначала сохраняются на устройстве, на сервер уходят при связи --- */
    var URLS = {}, PEND = {}, rq = false;
    function later() { if (rq || destroyed) return; rq = true; requestAnimationFrame(function () { rq = false; render(); }); }
    function abToBlob(ab) { return new Blob([ab], { type: 'image/jpeg' }); }
    function blobToAb(b) {
      if (b.arrayBuffer) return b.arrayBuffer();
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsArrayBuffer(b); });
    }
    function newPhotoId() {
      var a = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }
    function photoUrl(id, full) {
      var key = id + (full ? 'f' : 't');
      if (URLS[key]) return URLS[key];
      if (!PEND[key]) {
        PEND[key] = 1;
        dbGet('photos', id, function (rec) {
          var ab = rec && (full ? rec.full : rec.thumb);
          if (ab) { URLS[key] = URL.createObjectURL(abToBlob(ab)); delete PEND[key]; later(); return; }
          fetchPhoto(id, full, key);
        });
      }
      return null;
    }
    function fetchPhoto(id, full, key) {
      call('GET', '/api/korobki/photo/' + id + (full ? '' : '/thumb')).then(function (r) {
        if (!r.ok) { var e = new Error('missing'); e.missing = true; throw e; }
        return r.blob();
      }).then(function (b) {
        return blobToAb(b).then(function (ab) {
          dbGet('photos', id, function (cur) {
            cur = cur || { up: 1 };
            if (full) cur.full = ab; else cur.thumb = ab;
            dbPut('photos', id, cur);
          });
          URLS[key] = URL.createObjectURL(b); delete PEND[key]; later();
        });
      }).catch(function (e) { PEND[key] = e && e.missing ? 3 : 2; });
    }
    function retryPhotos() {
      var any = false;
      Object.keys(PEND).forEach(function (k) { if (PEND[k] === 2) { delete PEND[k]; any = true; } });
      if (any) later();
    }
    function prefetchThumbs() {
      Object.keys(recs).forEach(function (id) {
        var r = recs[id];
        if (!r.d && r.ph) r.ph.forEach(function (pid) { photoUrl(pid); });
      });
    }
    function firstPhoto(n) { return n.ph && n.ph[0] ? photoUrl(n.ph[0]) : null; }
    function toBlob(img, max, q, cb) {
      var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(cb, 'image/jpeg', q);
    }
    function shrink(file, cb) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        toBlob(img, 1000, 0.72, function (full) {
          toBlob(img, 240, 0.7, function (thumb) { URL.revokeObjectURL(url); cb(full, thumb); });
        });
      };
      img.onerror = function () { URL.revokeObjectURL(url); cb(null, null); };
      img.src = url;
    }
    function addPhotoLocal(file) {
      return new Promise(function (resolve) {
        shrink(file, function (full, thumb) {
          if (!full || !thumb) return resolve(null);
          Promise.all([blobToAb(full), blobToAb(thumb)]).then(function (abs) {
            var pid = newPhotoId();
            dbPut('photos', pid, { full: abs[0], thumb: abs[1], up: 0 });
            URLS[pid + 'f'] = URL.createObjectURL(full); URLS[pid + 't'] = URL.createObjectURL(thumb);
            upq.push(pid); persist();
            resolve(pid);
          }).catch(function () { resolve(null); });
        });
      });
    }
    function dropPhoto(pid) {
      ['f', 't'].forEach(function (s) { if (URLS[pid + s]) { URL.revokeObjectURL(URLS[pid + s]); delete URLS[pid + s]; } delete PEND[pid + s]; });
      dbDel('photos', pid);
      upq = upq.filter(function (x) { return x !== pid; });
      if (delq.indexOf(pid) < 0) delq.push(pid);
      persist();
    }

