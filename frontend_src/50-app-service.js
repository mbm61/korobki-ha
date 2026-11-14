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
    /* Проверка файла копии до применения: тип и поля записей, родители и дерево, категории, фото.
       Ничего не меняет. Возвращает отчёт; в doImport попадают только записи из rep.ok. */
    var REC_TYPES = { home: 1, place: 1, box: 1, item: 1, cat: 1, settings: 1 };
    function validateImport(d) {
      var rep = { ok: {}, bad: [], n: 0, ph: 0, date: typeof d.created === 'string' ? d.created : '', tgDrop: 0, phMiss: 0, phBad: {}, phBadN: 0, fatal: '' };
      var ir = d.recs, ids = Object.keys(ir);
      if (!ids.length) { rep.fatal = 'В файле нет записей'; return rep; }
      if (ids.length > 100000) { rep.fatal = 'Слишком много записей (' + ids.length + ')'; return rep; }
      function why(id, t) { rep.bad.push({ id: id, why: t }); }
      var basic = {};
      ids.forEach(function (id) {                                    // 1. поля каждой записи
        var r = ir[id];
        if (!r || typeof r !== 'object') return why(id, 'не запись');
        if (r.id !== id || !okId(id)) return why(id, 'недопустимый id (разрешены буквы, цифры, _ и -, до 64)');
        if (r.c != null && !okCol(r.c)) return why(id, 'цвет не в формате #RRGGBB');
        if (r.p != null && !okId(r.p)) return why(id, 'недопустимый id родителя');
        if (!REC_TYPES[r.t]) return why(id, 'неизвестный тип «' + r.t + '»');
        if (r.n != null && typeof r.n !== 'string') return why(id, 'название не строка');
        if (r.note != null && typeof r.note !== 'string') return why(id, 'заметка не строка');
        if (r.u != null && (typeof r.u !== 'number' || !isFinite(r.u))) return why(id, 'неверная метка времени');
        if (r.o != null && (typeof r.o !== 'number' || !isFinite(r.o))) return why(id, 'неверный порядок');
        if (r.d != null && typeof r.d !== 'boolean') return why(id, 'признак удаления не логический');
        if ((r.qr != null && typeof r.qr !== 'string') || (r.base != null && typeof r.base !== 'string')) return why(id, 'служебное поле не строка');
        if (r.tg != null && !Array.isArray(r.tg)) return why(id, 'категории не список');
        if (r.ph != null && !Array.isArray(r.ph)) return why(id, 'фото не список');
        if (r.t === 'item' && r.q != null && (typeof r.q !== 'number' || !isFinite(r.q) || r.q < 0)) return why(id, 'неверное количество');
        if ((r.t === 'place' || r.t === 'box' || r.t === 'item') && !(r.n || '').trim() && !r.d) return why(id, 'пустое название');
        basic[id] = 1;
      });
      function get(id) { return basic[id] ? ir[id] : (recs[id] && !ir[id] ? recs[id] : null); }   // запись из файла, иначе текущая
      function parentOk(r) {                                           // 2. родитель существует и подходит по типу
        if (r.t === 'cat' || r.t === 'settings' || r.t === 'home') return true;
        var p = get(r.p);
        if (!p || p.d || !r.p) return false;
        if (r.t === 'place') return p.t === 'home';
        return p.t === 'place' || p.t === 'box';                       // коробка и вещь: внутри места или коробки
      }
      var state = {};                                                  // 3. цепочка родителей доходит до корня без петель
      function reach(id, depth) {
        if (state[id] != null) return state[id];
        var r = get(id);
        if (!r) return (state[id] = false);
        if (r.t === 'home') return (state[id] = (id === 'root'));
        if (r.t === 'cat' || r.t === 'settings') return (state[id] = true);
        if (depth > 200) return (state[id] = false);
        state[id] = false;                                             // пока считаем, считаем недостижимой: так ловятся циклы
        if (!parentOk(r)) return false;
        return (state[id] = reach(r.p, depth + 1));
      }
      Object.keys(basic).forEach(function (id) {
        var r = ir[id];
        if (r.d) { rep.ok[id] = 1; return; }                           // удалённые (корзина) проверять глубже не нужно
        if (reach(id, 0)) rep.ok[id] = 1; else why(id, 'нет родителя или цикл в дереве');
      });
      var photos = d.photos && typeof d.photos === 'object' ? d.photos : {};
      Object.keys(rep.ok).forEach(function (id) {                      // 4. категории и ссылки на фото
        var r = ir[id];
        if (!r.d && r.t !== 'cat' && r.t !== 'settings') {
          (r.tg || []).forEach(function (t) { var c = get(t); if (!c || c.t !== 'cat' || c.d) rep.tgDrop++; });
          (r.ph || []).forEach(function (pid) { if (!/^[0-9a-f]{16}$/.test(pid) || !photos[pid]) rep.phMiss++; });
        }
        if (r.t !== 'cat' && r.t !== 'settings' && r.t !== 'home' && !r.d) rep.n++;
      });
      Object.keys(photos).forEach(function (pid) {                     // 5. сами фото: id, JPEG, base64
        var ph = photos[pid], okp = /^[0-9a-f]{16}$/.test(pid) && ph && typeof ph === 'object';
        if (okp) ['f', 't'].forEach(function (k) {
          if (ph[k] == null || ph[k] === '') return;
          if (typeof ph[k] !== 'string' || ph[k].slice(0, 4) !== '/9j/' || /[^A-Za-z0-9+\/=]/.test(ph[k].slice(0, 200))) okp = false;
        });
        if (okp && !ph.f && !ph.t) okp = false;
        if (okp) rep.ph++; else { rep.phBad[pid] = 1; rep.phBadN++; }
      });
      if (!rep.n && !Object.keys(rep.ok).length) rep.fatal = 'В файле нет ни одной подходящей записи';
      return rep;
    }
    function readImport(file) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var d = JSON.parse(fr.result);
          if (!d || d.app !== 'korobki' || !d.recs || typeof d.recs !== 'object' || Array.isArray(d.recs)) throw new Error('bad');
          if (d.format != null && d.format !== 1) { impData = null; S.svc.imp = { fatal: 'Копия новее приложения (формат ' + d.format + '). Обновите приложение.' }; render(); return; }
          var rep = validateImport(d);
          impData = rep.fatal ? null : d;
          if (impData) impData.__rep = rep;
          S.svc.imp = rep;
        } catch (e) { impData = null; S.svc.imp = null; toast('Это не файл копии «Коробок»'); }
        render();
      };
      fr.readAsText(file);
    }
    function doImport() {
      if (!impData || !impData.__rep) return;
      var rep = impData.__rep, now = Date.now(), cnt = 0;
      Object.keys(rep.ok).forEach(function (id) {
        var r = impData.recs[id], x = norm(r);
        if (x.t !== 'cat' && x.t !== 'settings') x.tg = x.tg.filter(function (t) { var c = impData.recs[t] || recs[t]; return c && c.t === 'cat' && !c.d; });
        x.d = !!r.d; x.u = Math.max(now, (recs[id] ? recs[id].u + 1 : 0)); recs[id] = x; dirty[id] = 1; cnt++;
      });
      var ph = impData.photos || {};
      Object.keys(ph).forEach(function (pid) {
        if (rep.phBad[pid] || !/^[0-9a-f]{16}$/.test(pid)) return;
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
      S.svc.bk = null; S.svc.bkErr = false;
      call('GET', '/api/korobki/backup').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (j) { S.svc.bk = j; refreshSvc(); }).catch(function () { S.svc.bkErr = true; refreshSvc(); });
      call('GET', '/api/korobki/stats').then(function (r) { return r.json(); }).then(function (j) { S.svc.stats = j; refreshSvc(); }).catch(function () { S.svc.statsErr = true; refreshSvc(); });
    }
    function refreshSvc() { if (S.sheet && S.sheet.type === 'svc') render(); }
    function runBackup() {
      S.svc.busy = 'Делаю копию…'; render();
      call('POST', '/api/korobki/backup', {}).then(function (r) { return r.json(); }).then(function (j) {
        S.svc.busy = ''; toast(j.last && j.last.ok ? 'Копия сохранена на сервере' : 'Копия не создана: ' + ((j.last && j.last.error) || 'ошибка')); loadSvc(); render();
      }).catch(function () { S.svc.busy = ''; toast('Нет связи с Home Assistant'); render(); });
    }
    function doCleanup() {
      S.svc.busy = 'Очищаю…'; render();
      call('POST', '/api/korobki/cleanup', {}).then(function (r) { return r.json(); }).then(function (j) {
        S.svc.busy = ''; toast('Удалено лишних фото: ' + j.removed + ' (' + mb(j.freed) + ')'); loadSvc(); render();
      }).catch(function () { S.svc.busy = ''; toast('Нет связи с Home Assistant'); render(); });
    }
    function mb(b) { return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' КБ' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' МБ'; }
