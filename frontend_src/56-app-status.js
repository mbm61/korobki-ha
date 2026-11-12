    /* Значок состояния связи: стоит на месте, меняются только цвет и рисунок */
    var netInfo = { msg: '', act: 'sync' };
    function renderSync() {
      var b = $('netBtn'); if (!b) return;
      var n = pendingCount(), st, icon, msg, act = 'sync', spin = false;
      var oldMs = dsince && n ? Date.now() - dsince : 0, days = Math.floor(oldMs / 86400000);
      if (net === 'auth') {
        st = '#e53935'; icon = 'lock'; act = env.reauth ? 'reauth' : 'none';
        msg = 'Нет доступа к Home Assistant. ' + (env.reauth ? 'Нажмите, чтобы ввести токен заново.' : 'Войдите в Home Assistant заново.');
      } else if (net === 'offline') {
        st = '#e53935'; icon = 'cloudoff';
        msg = n ? 'Нет связи. Изменения сохранены на устройстве: ' + n + '.' + (days >= 2 ? ' Не отправляются уже ' + days + ' дн.' : '') + ' Нажмите, чтобы повторить.' : 'Нет связи. Приложение работает без сети. Нажмите, чтобы повторить.';
      } else if (net === 'sync') {
        st = '#2196f3'; icon = 'refresh'; spin = true; act = 'none'; msg = 'Синхронизация…';
      } else if (n) {
        st = days >= 2 ? '#e53935' : '#ffa000'; icon = 'cloudup';
        msg = 'Ожидает отправки: ' + n + (days >= 2 ? '. Не уходит уже ' + days + ' дн.' : '') + '. Нажмите, чтобы отправить.';
      } else if (S.stale) {
        st = '#7e57c2'; icon = 'refresh'; act = 'reload'; msg = 'Вышла новая версия панели. Нажмите, чтобы обновить.';
      } else if (nconf) {
        st = '#fb8c00'; icon = 'cloudok'; act = 'svc'; msg = 'Синхронизировано, но есть конфликты правок: ' + nconf + '. Нажмите, чтобы посмотреть.';
      } else {
        st = '#43a047'; icon = 'cloudok';
        msg = 'Всё синхронизировано' + (lastSync ? ' в ' + new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') + '.';
      }
      netInfo.msg = msg; netInfo.act = act;
      b.style.setProperty('--st', st);
      b.classList.toggle('spin', spin);
      b.setAttribute('aria-label', msg); b.title = msg;
      var key = icon + (n && net !== 'sync' ? n : '');
      if (b.getAttribute('data-k') !== key) {
        b.setAttribute('data-k', key);
        b.innerHTML = svg(icon, 22) + (n && net !== 'sync' ? '<span class="nbadge">' + (n > 99 ? '99+' : n) + '</span>' : '');
      }
    }
    function render() {
      if (destroyed) return;
      $('menu').hidden = !(narrow && env.kind === 'panel');
      if (!loaded) { $('view').innerHTML = '<div class="head"><h1>Коробки</h1><div class="stat">Загружаю…</div></div>'; return; }
      if (!everSynced) {
        $('crumbs').innerHTML = ''; $('back').hidden = true;
        $('view').innerHTML = '<div class="head"><h1>Коробки</h1><div class="stat">' + (net === 'offline' ? 'Нет связи с Home Assistant' : net === 'auth' ? 'Нет доступа' : 'Загружаю данные…') + '</div></div>' +
          '<div class="empty"><div>При первом запуске нужна связь с Home Assistant: данные скачиваются на устройство. Дальше приложение работает и без сети.</div><button class="btn" data-sync>Повторить</button></div>';
        renderFoot(); renderSync();
        return;
      }
      var T = trail(), searching = S.q.trim() !== '';
      var finding = S.mode === 'find', onCats = (S.mode === 'cats' || S.mode === 'cat') && !searching;
      $('back').hidden = !(S.path.length || S.mode || searching);
      $('bnav').hidden = !(S.path.length || S.mode || searching);
      $('catsBtn').hidden = onCats;
      $('catsBtn').classList.toggle('on', S.mode === 'cats' || S.mode === 'cat');
      $('filtBtn').classList.toggle('on', finding);
      if (S.mode && (!searching || finding)) {
        var cc = S.mode === 'cat' ? catById(S.catId) : null;
        $('crumbs').innerHTML = S.mode === 'trash' ? '<span class="cur">Корзина</span>' : finding ? '<span class="cur">Фильтры</span>' : cc
          ? '<button class="crumb" data-catsroot>Категории</button><span class="chev">' + svg('chev', 14) + '</span><span class="cur">#' + esc(cc.n) + '</span>'
          : '<span class="cur">Категории</span>';
      } else {
        $('crumbs').innerHTML = T.nodes.map(function (n, i) {
          var last = i === T.nodes.length - 1;
          return last ? '<span class="cur">' + esc(n.n) + '</span>' : '<button class="crumb" data-crumb="' + i + '">' + esc(n.n) + '</button><span class="chev">' + svg('chev', 14) + '</span>';
        }).join('');
      }
      var crEl = $('crumbs'); crEl.scrollLeft = crEl.scrollWidth;
      $('view').innerHTML = ((searching || finding) ? findView() : S.mode === 'cats' ? catsView() : S.mode === 'cat' ? catView() : S.mode === 'trash' ? trashView() : normalView(T));
      renderFoot(); renderSync();
      var sh = $('sheet'), html = sheetHtml();
      var op = sh.querySelector('.panel'), ost = op ? op.scrollTop : 0;
      host.style.overflowY = html ? 'hidden' : '';
      sh.innerHTML = html; sh.hidden = !html;
      if (ost && html) { var np = sh.querySelector('.panel'); if (np) np.scrollTop = ost; }
      if (S.focus) { var f = $('fName'); if (f) f.focus(); S.focus = false; }
    }

    var toastT = null;
    function toast(msg) {
      var t = $('toast'); t.textContent = msg; t.hidden = false;
      clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600);
    }
    function clearNewFiles() {
      S.addFiles.forEach(function (f) { try { URL.revokeObjectURL(f.url); } catch (e) {} });
      S.addFiles = [];
    }
    function addCatInline() {
      var inp = $('fNewCat'), f = $('fName') || $('fBulk');
      var c = addCat(inp && inp.value);
      if (!c) { if (inp) inp.focus(); return; }
      if (S.addTags.indexOf(c.id) < 0) S.addTags.push(c.id);
      S.draft = f ? f.value : S.draft; S.draftCat = ''; S.dd = true;
      save(); render();
    }
    sr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'fNewCat') { e.preventDefault(); addCatInline(); }
    });
    function toTop() { host.scrollTop = 0; try { window.scrollTo(0, 0); } catch (e) {} }
    function clearSearch() { S.q = ''; $('q').value = ''; }
    function goBack() {
      if (S.sheet) { closeSheet(); return; }
      if (S.q.trim()) { clearSearch(); render(); return; }
      S.adding = false; S.edit = false; S.conf = null;
      if (S.mode === 'cat') { S.mode = 'cats'; render(); toTop(); return; }
      if (S.mode === 'cats' || S.mode === 'trash' || S.mode === 'find') { S.mode = null; render(); toTop(); return; }
      if (S.path.length) { S.path.pop(); render(); toTop(); }
    }
    function goHome() {
      S.sheet = null; S.mode = null; S.path = []; S.adding = false; S.edit = false; S.conf = null; clearSearch(); render(); toTop();
    }
    function closeSheet() { S.sdd = null; S.sheet = S.sheet && S.sheet.back ? S.sheet.back : null; S.conf = null; render(); }

    function doDelete(id) {
      var n = findNode(root, id);
      if (!n) return;
      removeNode(root, id);
      S.sheet = null; save();
    }
    function removePhoto(nodeId, pid) {
      var n = findNode(root, nodeId);
      if (!n) return;
      n.ph = (n.ph || []).filter(function (p) { return p !== pid; });
      dropPhoto(pid); save();
      if (!n.ph.length) S.sheet = S.sheet.back || null;
      else S.sheet.idx = Math.min(S.sheet.idx, n.ph.length - 1);
    }

