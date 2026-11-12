    /* --- структура --- */
    function stats(n) {
      var b = 0, i = 0;
      (n.ch || []).forEach(function (c) {
        if (c.t === 'item') i++;
        else { if (c.t === 'box') b++; var s = stats(c); b += s.b; i += s.i; }
      });
      return { b: b, i: i };
    }
    function summary(n) {
      var s = stats(n), parts = [];
      if (n.t === 'home') parts.push(pl(n.ch.length, W.place));
      if (s.b) parts.push(pl(s.b, W.box));
      if (s.i) parts.push(pl(s.i, W.item));
      return parts.length ? parts.join(' · ') : 'Пусто';
    }
    function findNode(n, id) {
      if (n.id === id) return n;
      var ch = n.ch || [];
      for (var k = 0; k < ch.length; k++) { var r = findNode(ch[k], id); if (r) return r; }
      return null;
    }
    function pathTo(n, id, acc) {
      if (n.id === id) return acc;
      var ch = n.ch || [];
      for (var k = 0; k < ch.length; k++) { var r = pathTo(ch[k], id, acc.concat(ch[k].id)); if (r) return r; }
      return null;
    }
    function removeNode(n, id) {
      var ch = n.ch || [];
      for (var k = 0; k < ch.length; k++) {
        if (ch[k].id === id) { ch.splice(k, 1); return true; }
        if (removeNode(ch[k], id)) return true;
      }
      return false;
    }
    function collectPhotos(n, out) { (n.ph || []).forEach(function (p) { out.push(p); }); (n.ch || []).forEach(function (c) { collectPhotos(c, out); }); return out; }
    function accOf(id) {
      var p = pathTo(root, id, []) || [], n = root, acc = DEF;
      p.forEach(function (k) { n = (n.ch || []).filter(function (x) { return x.id === k; })[0] || n; if (n.c) acc = n.c; });
      return acc;
    }
    function namesTo(id) {
      var p = pathTo(root, id, []) || [], n = root, names = [];
      p.slice(0, -1).forEach(function (k) { n = (n.ch || []).filter(function (x) { return x.id === k; })[0]; if (n) names.push(n.n); });
      return names;
    }
    function trail() {
      var nodes = [root], acc = DEF, n = root, ok = [];
      for (var k = 0; k < S.path.length; k++) {
        var next = (n.ch || []).filter(function (x) { return x.id === S.path[k]; })[0];
        if (!next) break;
        n = next; nodes.push(n); ok.push(n.id);
        if (n.c) acc = n.c;
      }
      S.path = ok;
      return { nodes: nodes, cur: n, acc: acc };
    }

