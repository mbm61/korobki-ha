    /* --- события --- */
    sr.addEventListener('click', function (e) {
      var t = e.target, el;
      var q = function (sel) { return t.closest ? t.closest(sel) : null; };

      if (q('#menu')) { host.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true })); return; }
      if (q('[data-close]')) { closeSheet(); return; }
      if (q('#back') || q('[data-goback]')) { goBack(); return; }
      if (q('[data-home]')) { goHome(); return; }
      if (q('#filtBtn')) { S.mode = S.mode === 'find' ? null : 'find'; S.adding = false; S.edit = false; S.conf = null; render(); toTop(); return; }
      if (q('[data-trash]')) { S.sheet = null; S.mode = 'trash'; S.adding = false; S.edit = false; S.conf = null; clearSearch(); render(); toTop(); return; }
      if (q('[data-svc]')) { S.sheet = { type: 'svc', id: 'root', back: null }; S.conf = null; render(); loadSvc(); return; }
      if ((el = q('[data-emptytrash]'))) { if (S.conf === 'emptytrash') { emptyTrash(); S.conf = null; toast('Корзина очищена'); } else S.conf = 'emptytrash'; render(); return; }
      if ((el = q('[data-restore]'))) { var rn = recs[el.getAttribute('data-restore')]; restoreRec(el.getAttribute('data-restore')); toast('Возвращено: ' + (rn ? rn.n : '')); render(); return; }
      if (q('[data-export]')) { doExport(q('[data-export]').getAttribute('data-export') === '1'); return; }
      if (q('[data-saveexp]')) { saveExp(); return; }
      if (q('[data-pickimp]')) { $('impick').click(); return; }
      if (q('[data-doimport]')) { doImport(); return; }
      if (q('[data-cleanup]')) { doCleanup(); return; }
      if (q('[data-bkrun]')) { runBackup(); return; }
      if (q('[data-persist]')) { requestPersist(); setTimeout(loadSvc, 600); return; }
      if ((el = q('[data-move]'))) { S.sheet = { type: 'move', id: el.getAttribute('data-move'), back: S.sheet }; render(); return; }
      if ((el = q('[data-moveto]'))) { if (S.sheet) doMove(S.sheet.id, el.getAttribute('data-moveto')); return; }
      if ((el = q('[data-dup]'))) { doDup(el.getAttribute('data-dup')); return; }
      if ((el = q('[data-fcat]'))) { var fc = el.getAttribute('data-fcat'), fi = S.f.cats.indexOf(fc); if (fi > -1) S.f.cats.splice(fi, 1); else { S.f.cats.push(fc); S.f.nocat = false; } render(); return; }
      if (q('[data-fnocat]')) { S.f.nocat = !S.f.nocat; if (S.f.nocat) S.f.cats = []; render(); return; }
      if (q('[data-fnophoto]')) { S.f.nophoto = !S.f.nophoto; render(); return; }
      if (q('[data-freset]')) { S.f = { cats: [], nocat: false, nophoto: false, sort: 'path' }; render(); return; }
      if ((el = q('[data-bulk]'))) { var bf = $('fName') || $('fBulk'), bc = $('fNewCat'); S.draft = bf ? bf.value : ''; S.draftCat = bc ? bc.value : ''; S.bulk = el.checked; S.focus = true; render(); return; }
      if ((el = q('[data-keep]'))) { S.keep = el.checked; return; }
      if ((el = q('[data-setcolor]'))) {
        var cn = findNode(root, el.getAttribute('data-for')), cv = el.getAttribute('data-setcolor');
        if (cn) { if (cv) cn.c = cv; else delete cn.c; save(); render(); }
        return;
      }
      if (q('[data-sync]')) { sync(true); return; }
      if (q('#netBtn')) {
        toast(netInfo.msg);
        if (netInfo.act === 'sync') sync(); else if (netInfo.act === 'reauth') env.reauth(); else if (netInfo.act === 'reload') location.reload(); else if (netInfo.act === 'svc') { S.sheet = { type: 'svc', id: 'root', back: null }; S.conf = null; render(); loadSvc(); }
        return;
      }
      if (q('[data-reauth]') && env.reauth) { env.reauth(); return; }
      if (q('[data-logout]') && env.logout) {
        /* Подтверждение выхода: первое нажатие меняет подпись, второе (в течение 4 с) выходит */
        var lb = q('[data-logout]');
        if (lb.getAttribute('data-ask') === '1') { env.logout(); return; }
        lb.setAttribute('data-ask', '1'); lb.textContent = 'Точно выйти?'; lb.style.color = 'var(--danger)';
        setTimeout(function () { if (lb.isConnected) { lb.removeAttribute('data-ask'); lb.textContent = 'Выйти'; lb.style.color = ''; } }, 4000);
        return;
      }
      if ((q('[data-srvsave]') || q('[data-srvreset]')) && env.server) {
        var nu = q('[data-srvreset]') ? '' : ($('srvUrl') || {}).value;
        S.svc.srvErr = 'Проверяю…'; render();
        env.server.set(nu).then(function () {
          since = 0; Object.keys(recs).forEach(function (id) { dirty[id] = true; });
          persist(true); setTimeout(function () { location.reload(); }, 300);
        }).catch(function (x) { S.svc.srvErr = x && x.message === 'Failed to fetch' ? 'Нет связи с этим адресом или он не разрешает доступ (CORS).' : (x && x.message) || 'Ошибка'; render(); });
        return;
      }
      if ((el = q('[data-themeset]')) && env.theme) { env.theme(el.getAttribute('data-themeset')); render(); return; }
      if (q('#catsBtn')) { S.mode = 'cats'; S.catId = null; S.edit = false; S.adding = false; S.conf = null; clearSearch(); render(); toTop(); return; }
      if (q('[data-reload]')) { location.reload(); return; }
      if ((el = q('[data-addtag]'))) {
        var at = el.getAttribute('data-addtag'), ai = S.addTags.indexOf(at);
        if (ai > -1) S.addTags.splice(ai, 1); else S.addTags.push(at);
        el.classList.toggle('on', ai < 0); el.setAttribute('aria-selected', String(ai < 0));
        var ds = $('ddsum'); if (ds) ds.textContent = ddSummary();
        return;
      }
      if (q('[data-sdd]')) {
        var sid = S.sheet && S.sheet.id; S.sdd = S.sdd === sid ? null : sid;
        var sl = $('sddlist'); if (sl) sl.hidden = S.sdd !== sid;
        q('[data-sdd]').setAttribute('aria-expanded', String(S.sdd === sid));
        return;
      }
      if (q('[data-dd]')) {
        S.dd = !S.dd; var dl = $('ddlist'); if (dl) dl.hidden = !S.dd;
        var db = q('[data-dd]'); db.setAttribute('aria-expanded', String(S.dd));
        return;
      }
      if (q('[data-ddadd]')) { addCatInline(); return; }
      if ((el = q('[data-tag]'))) {
        var tn = S.sheet && findNode(root, S.sheet.id), tid = el.getAttribute('data-tag');
        if (tn) {
          tn.tg = tn.tg || [];
          var ti = tn.tg.indexOf(tid);
          if (ti > -1) tn.tg.splice(ti, 1); else tn.tg.push(tid);
          save(); S.sdd = tn.id; render();
        }
        return;
      }
      if ((el = q('[data-delcat]'))) {
        var cid = el.getAttribute('data-delcat');
        if (S.conf === 'cat:' + cid) { dropCat(cid); S.conf = null; save(); } else S.conf = 'cat:' + cid;
        render(); return;
      }
      if ((el = q('[data-del]'))) {
        var id = el.getAttribute('data-del');
        if (S.conf === id) { doDelete(id); S.conf = null; toast('Перенесено в корзину'); }
        else {
          S.conf = id;
          var dn = findNode(root, id), ds = dn && dn.t !== 'item' ? stats(dn) : null, dp = [];
          if (ds && ds.b) dp.push(pl(ds.b, W.box));
          if (ds && ds.i) dp.push(pl(ds.i, W.item));
          toast(dp.length ? 'Вместе с этим удалится: ' + dp.join(', ') + '. Вернуть можно из корзины.' : 'Нажмите ещё раз. Вернуть можно из корзины.');
        }
        render(); return;
      }
      if ((el = q('[data-delphoto]'))) {
        var pid = el.getAttribute('data-delphoto');
        if (S.conf === 'ph:' + pid) { removePhoto(S.sheet.id, pid); S.conf = null; } else S.conf = 'ph:' + pid;
        render(); return;
      }
      var hadConf = !!S.conf; S.conf = null;

      if ((el = q('[data-step]'))) {
        var n = findNode(root, el.getAttribute('data-step'));
        if (n) { n.q = Math.max(0, (n.q || 0) + Number(el.getAttribute('data-d'))); save(); }
        render();
      } else if (q('[data-seed]')) {
        root.ch = exampleChildren(); save(); render();
      } else if ((el = q('[data-qrmode]'))) {
        settings.qr = el.getAttribute('data-qrmode'); save(); render();
      } else if ((el = q('[data-edit]'))) {
        S.sheet = { type: 'node', id: el.getAttribute('data-edit'), back: null }; render();
      } else if ((el = q('[data-cat]'))) {
        S.mode = 'cat'; S.catId = el.getAttribute('data-cat'); S.edit = false; render(); toTop();
      } else if (q('[data-catsroot]')) {
        S.mode = 'cats'; render(); toTop();
      } else if ((el = q('[data-addphoto]'))) {
        S.pick = el.getAttribute('data-addphoto'); $('pick').click();
      } else if ((el = q('[data-newphdel]'))) {
        var gone = S.addFiles.splice(Number(el.getAttribute('data-newphdel')), 1)[0];
        if (gone) { try { URL.revokeObjectURL(gone.url); } catch (e0) {} }
        render();
      } else if ((el = q('[data-view]'))) {
        var parts = el.getAttribute('data-view').split(':');
        S.sheet = { type: 'viewer', id: parts[0], idx: Number(parts[1]), back: S.sheet }; render();
      } else if ((el = q('[data-nav]'))) {
        var nn = findNode(root, S.sheet.id), len = nn && nn.ph ? nn.ph.length : 0;
        S.sheet.idx = Math.min(Math.max(0, S.sheet.idx + Number(el.getAttribute('data-nav'))), Math.max(0, len - 1)); render();
      } else if ((el = q('[data-qr]'))) {
        S.sheet = { type: 'qr', id: el.getAttribute('data-qr'), back: S.sheet && (S.sheet.type === 'item' || S.sheet.type === 'node') ? S.sheet : null }; render();
      } else if ((el = q('[data-sheet]'))) {
        S.sheet = { type: 'item', id: el.getAttribute('data-sheet'), back: null }; render();
      } else if ((el = q('[data-open]'))) {
        S.path.push(el.getAttribute('data-open')); S.adding = false; S.edit = false; clearSearch(); render(); toTop();
      } else if ((el = q('[data-hit]'))) {
        S.path = el.getAttribute('data-hit').split(',').filter(Boolean); S.adding = false; S.edit = false;
        var hid = el.getAttribute('data-hitid');
        S.mode = null; clearSearch(); S.sheet = hid ? { type: 'item', id: hid, back: null } : null; render(); toTop();
      } else if ((el = q('[data-crumb]'))) {
        S.mode = null; S.path = S.path.slice(0, Number(el.getAttribute('data-crumb'))); S.adding = false; S.edit = false; clearSearch(); render(); toTop();
      } else if (q('[data-toggle-add]')) {
        clearNewFiles(); S.adding = !S.adding; S.draft = ''; S.draftNote = ''; S.draftCat = ''; S.addTags = []; S.addType = null; S.dd = false; S.focus = S.adding; render();
      } else if (q('[data-toggle-edit]')) {
        S.edit = !S.edit; render();
      } else if ((el = q('[data-type]'))) {
        var f = $('fName') || $('fBulk'), fc = $('fNewCat'); S.draft = f ? f.value : ''; S.draftCat = fc ? fc.value : ''; S.addType = el.getAttribute('data-type'); S.focus = true; render();
      } else if (hadConf) {
        render();
      }
    });

    sr.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.sheet) { closeSheet(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-open],[data-hit],[data-sheet],[data-cat]')) {
        e.preventDefault(); e.target.click();
      }
    });

    sr.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches && t.matches('[data-rename]')) {
        var n = findNode(root, t.getAttribute('data-rename')), v = t.value.trim();
        if (n && v) { n.n = v; save(); }
      } else if (t.matches && t.matches('[data-note]')) {
        var nn2 = findNode(root, t.getAttribute('data-note'));
        if (nn2) { nn2.note = t.value.trim(); save(); }
      } else if (t.matches && t.matches('[data-catname]')) {
        var cat = catById(t.getAttribute('data-catname')), cv = t.value.replace(/^#+/, '').trim();
        if (cat && cv) { cat.n = cv; save(); }
      } else if (t.matches && t.matches('[data-fsort]')) {
        S.f.sort = t.value; render();
      } else if (t.id === 'impick') {
        if (t.files && t.files[0]) readImport(t.files[0]);
        t.value = '';
      } else if (t.id === 'baseUrl') {
        settings.base = t.value.trim(); save(); render();
      }
    });

    sr.addEventListener('submit', function (e) {
      var fid = e.target.id;
      if (fid === 'catForm') {
        e.preventDefault();
        var inp = $('newCatName'), nc = addCat(inp.value);
        if (!nc) { inp.focus(); return; }
        save(); render(); return;
      }
      if (fid === 'sCatForm') {
        e.preventDefault();
        var itm = S.sheet && findNode(root, S.sheet.id), c2 = addCat($('sCatName').value);
        if (!itm || !c2) { $('sCatName').focus(); return; }
        itm.tg = itm.tg || [];
        if (itm.tg.indexOf(c2.id) < 0) itm.tg.push(c2.id);
        S.sdd = itm.id; save(); render(); return;
      }
      if (fid !== 'addForm') return;
      e.preventDefault();
      var T = trail(), cur = T.cur, allowed = ALLOW[cur.t];
      var type = S.addType && allowed.indexOf(S.addType) > -1 ? S.addType : allowed[0];
      var nodes = [];
      if (type === 'item' && S.bulk) {
        var bx = $('fBulk');
        (bx.value || '').split(/\n+/).forEach(function (line) {
          line = line.trim(); if (!line) return;
          var m = /^(.*?)(?:\s+[xXхХ*]|\s*×)\s*(\d{1,4})$/.exec(line);
          if (m && m[1].trim()) nodes.push(I(m[1].trim(), Math.max(1, parseInt(m[2], 10))));
          else nodes.push(I(line, 1));
        });
        if (!nodes.length) { bx.focus(); return; }
      } else {
        var name = $('fName').value.trim();
        if (!name) { $('fName').focus(); return; }
        var node = type === 'item'
          ? I(name, Math.max(1, parseInt(($('fQty') || {}).value, 10) || 1))
          : (type === 'place' ? P(name, null, []) : B(name, []));
        if (type === 'place') {
          var pal = ['#ffc107', '#03a9f4', '#9c27b0', '#f44336', '#4caf50', '#00bcd4', '#ff7043'];
          node.c = pal[cur.ch.length % pal.length];
        }
        if (type === 'item') node.note = ($('fNote') || {}).value ? $('fNote').value.trim() : '';
        nodes.push(node);
      }
      var newFiles = nodes.length === 1 ? S.addFiles.map(function (x) { return x.f; }) : [];
      if (type === 'item') {
        var tags = S.addTags.filter(function (t) { return catById(t); });
        var fresh = addCat(($('fNewCat') || {}).value);
        if (fresh && tags.indexOf(fresh.id) < 0) tags.push(fresh.id);
        nodes.forEach(function (nd) { nd.tg = tags.slice(); });
        S.addTags = S.keep ? tags : [];
      }
      nodes.forEach(function (nd) { cur.ch.push(nd); });
      S.addFiles.forEach(function (x) { try { URL.revokeObjectURL(x.url); } catch (e) {} }); S.addFiles = []; S.draftNote = '';
      if (type === 'item' && S.keep) { S.draft = ''; S.draftCat = ''; S.focus = true; toast('Добавлено: ' + nodes.length); }
      else { S.adding = false; S.draft = ''; S.draftCat = ''; S.addTags = []; S.addType = null; S.dd = false; }
      save(); render();
      if (newFiles.length) {
        var tn = nodes[0], left = newFiles.length;
        newFiles.forEach(function (f) {
          addPhotoLocal(f).then(function (pid) {
            if (pid) tn.ph = (tn.ph || []).concat(pid);
            if (--left === 0) { save(); render(); }
          });
        });
      }
    });

    $('pick').addEventListener('change', function () {
      var files = Array.prototype.slice.call(this.files || []);
      if (S.pick === '__new') {
        this.value = '';
        files.slice(0, Math.max(0, MAXPH - S.addFiles.length)).forEach(function (f) { S.addFiles.push({ f: f, url: URL.createObjectURL(f) }); });
        render(); return;
      }
      var node = S.pick ? findNode(root, S.pick) : null;
      this.value = '';
      if (!node || !files.length) return;
      files = files.slice(0, Math.max(0, MAXPH - (node.ph || []).length));
      if (!files.length) { toast('К одной позиции можно добавить до ' + MAXPH + ' фото'); return; }
      var pending = files.length, failed = 0;
      files.forEach(function (f) {
        addPhotoLocal(f).then(function (pid) {
          if (pid) node.ph = (node.ph || []).concat(pid); else failed++;
          if (--pending === 0) {
            if (failed) toast('Не удалось обработать фото: ' + failed);
            save(); render();
          }
        });
      });
    });

    sr.addEventListener('input', function (e) {
      var t = e.target; if (!t || !t.id) return;
      if (t.id === 'fName' || t.id === 'fBulk') S.draft = t.value;
      else if (t.id === 'fNote') S.draftNote = t.value;
      else if (t.id === 'fNewCat') S.draftCat = t.value;
    });
    $('q').addEventListener('input', function () { S.q = this.value; S.conf = null; render(); });

    function onVisible() {
      if (document.hidden) doPersist(); else scheduleSync(200);
    }
    function onOnline() { scheduleSync(300); }
    function onOffline() { net = 'offline'; renderSync(); }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pagehide', doPersist);
    /* страница-оболочка (приложение) сообщила, что установился новый воркер, то есть вышла новая версия */
    window.addEventListener('korobki-update', function () { S.stale = true; renderSync(); });
