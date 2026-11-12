    /* --- переход по ссылке /korobki/<id> --- */
    function applyRoute(r, force) {
      if (!loaded) { pendingRoute = r; return; }
      var path = (r && r.path) || '';
      if (!force && path === lastRoutePath) return;
      lastRoutePath = path;
      var m = /^\/?([A-Za-z0-9]+)\/?$/.exec(path);
      if (!m) return;
      var id = m[1], p = id === 'root' ? [] : pathTo(root, id, []);
      if (!p) { toast('Этой коробки нет в данных'); return; }
      var n = findNode(root, id);
      S.adding = false; S.edit = false; S.conf = null; clearSearch();
      if (n.t === 'item') { S.path = p.slice(0, -1); S.sheet = { type: 'item', id: id }; }
      else { S.path = p; S.sheet = null; }
      render(); toTop();
    }

