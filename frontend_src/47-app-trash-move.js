    /* --- корзина, перенос, копия --- */
    var TRASH_MS = 30 * 86400000, WIN = 10000;
    function trashList() {
      var now = Date.now(), out = [];
      Object.keys(recs).forEach(function (id) {
        var r = recs[id];
        if (!r.d || !r.n || (r.t !== 'place' && r.t !== 'box' && r.t !== 'item')) return;
        if (now - r.u > TRASH_MS) return;
        var par = r.p && recs[r.p];
        if (par && par.d && par.n && Math.abs(par.u - r.u) <= WIN) return;
        out.push(r);
      });
      return out.sort(function (a, b) { return b.u - a.u; });
    }
    function trashKids(r) {
      var k = 0;
      (function walk(id) {
        Object.keys(recs).forEach(function (cid) {
          var c = recs[cid];
          if (c.p === id && c.d && c.n && Math.abs(c.u - r.u) <= WIN) { k++; walk(cid); }
        });
      })(r.id);
      return k;
    }
    function restoreRec(id) {
      var r = recs[id]; if (!r || !r.d) return;
      var now = Date.now(), base = r.u, list = [];
      function revive(x) { x.d = false; x.u = Math.max(now, x.u + 1); dirty[x.id] = 1; }
      var par = r.p && recs[r.p];
      while (par && par.d && par.n) { list.push(par); par = par.p && recs[par.p]; }
      if (!r.p || !recs[r.p] || (recs[r.p].d && !recs[r.p].n)) r.p = 'root';
      list.forEach(revive);
      (function walk(x) {
        Object.keys(recs).forEach(function (cid) {
          var c = recs[cid];
          if (c.p === x && c.d && c.n && Math.abs(c.u - base) <= WIN) { revive(c); walk(cid); }
        });
      })(id);
      revive(r);
      buildTree(); persist(); renderSync(); scheduleSync(600);
    }
    function emptyTrash() {
      var now = Date.now(), live = {};
      Object.keys(recs).forEach(function (id) { if (!recs[id].d) (recs[id].ph || []).forEach(function (p) { live[p] = 1; }); });
      Object.keys(recs).forEach(function (id) {
        var r = recs[id];
        if (!r.d || !r.n || (r.t !== 'place' && r.t !== 'box' && r.t !== 'item')) return;
        (r.ph || []).forEach(function (pid) {
          if (live[pid]) return;
          if (delq.indexOf(pid) < 0) delq.push(pid);
          upq = upq.filter(function (x) { return x !== pid; }); dbDel('photos', pid);
        });
        r.n = ''; r.note = ''; r.tg = []; r.ph = []; r.q = null; r.c = null; r.u = Math.max(now, r.u + 1); dirty[id] = 1;
      });
      if (!dsince && pendingCount()) dsince = now;
      persist(); renderSync(); scheduleSync(600);
    }
    function parentOf(id) {
      var found = null;
      (function walk(n) { (n.ch || []).forEach(function (c) { if (c.id === id) found = n; else if (c.t !== 'item') walk(c); }); })(root);
      return found;
    }
    function moveTargets(n) {
      var out = [], bad = {}, par = parentOf(n.id);
      (function mark(x) { bad[x.id] = 1; (x.ch || []).forEach(mark); })(n);
      (function walk(c, names) {
        if (c.t === 'item') return;
        if (!bad[c.id] && ALLOW[c.t].indexOf(n.t) > -1) out.push({ node: c, path: names, cur: !!par && par.id === c.id });
        (c.ch || []).forEach(function (k) { walk(k, names.concat(k.n)); });
      })(root, [root.n]);
      return out;
    }
    function doMove(id, to) {
      var n = findNode(root, id), t = findNode(root, to);
      if (!n || !t) return;
      removeNode(root, id); t.ch.push(n);
      S.sheet = null; save(); render(); toast('Перемещено: ' + n.n + ' → ' + t.n);
    }
    function cloneNode(n) {
      var c = { id: uid(), t: n.t, n: n.n, ph: [], o: nextO() };
      if (n.c) c.c = n.c;
      if (n.t === 'item') { c.q = n.q; c.tg = (n.tg || []).slice(); c.note = n.note || ''; }
      else c.ch = (n.ch || []).map(cloneNode);
      return c;
    }
    function doDup(id) {
      var n = findNode(root, id), par = parentOf(id);
      if (!n || !par) return;
      var c = cloneNode(n); c.n = n.n + ' (копия)';
      par.ch.push(c); S.sheet = null; save(); render(); toast('Копия создана (без фото)');
    }

