    /* --- запуск: сначала данные с устройства, потом синхронизация --- */
    function afterDb() {
      if (booted) return;
      booted = true; clearTimeout(bootT);
      dbGet('kv', 'state', function (st) {
        if (st && st.recs) {
          recs = {};
          Object.keys(st.recs).forEach(function (k) { var r = st.recs[k]; if (okId(k) && r && r.id === k) { var x = Object.assign({}, r, norm(r)); recs[k] = x; } });   // очистка старых данных на устройстве
          dirty = {};
          (st.dirty || []).forEach(function (i) { dirty[i] = 1; });
          upq = st.upq || []; delq = st.delq || []; since = st.since || 0; device = st.device || ''; useq = st.useq || 0; nconf = st.nconf || 0; everSynced = !!st.synced; dsince = st.dsince || 0;
        }
        if (!device) device = uid() + uid();
        buildTree(); loaded = true; render(); requestPersist();
        if (pendingRoute) { var pr = pendingRoute; pendingRoute = null; applyRoute(pr, true); }
        sync();
        pollT = setInterval(function () { if (!document.hidden) sync(); }, env.kind === 'pwa' ? 45000 : 90000);
        if (env.subscribe) {
          try { env.subscribe(function () { scheduleSync(300); }).then(function (u) { if (destroyed) u(); else unsub = u; }).catch(function () {}); } catch (e) {}
        }
      });
    }
    render();
    var bootT = setTimeout(function () { memOnly = true; afterDb(); }, 3000);
    $('sheet').addEventListener('touchmove', function (e) {
      if (e.target.closest && !e.target.closest('.panel') && e.cancelable) e.preventDefault();
    }, { passive: false });
