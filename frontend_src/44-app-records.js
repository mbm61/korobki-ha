    /* --- записи для синхронизации: каждая вещь, коробка, категория это отдельная запись с меткой времени --- */
    function norm(r) {
      return {
        id: r.id, p: okId(r.p) ? r.p : null, t: r.t, n: r.n == null ? '' : String(r.n), c: okCol(r.c) ? r.c : null,
        q: r.q == null ? null : Number(r.q), tg: Array.isArray(r.tg) ? r.tg.filter(okId) : [], note: r.note || '',
        ph: Array.isArray(r.ph) ? r.ph.filter(okPh) : [], o: r.o || 0, qr: r.qr || '', base: r.base || ''
      };
    }
    function sig(r) { var x = norm(r); return JSON.stringify([x.p, x.t, x.n, x.c, x.q, x.tg, x.note, x.ph, x.o, x.qr, x.base]); }
    function flatten() {
      var out = {};
      (function walk(n, parent) {
        out[n.id] = norm({ id: n.id, p: parent, t: n.t, n: n.n, c: n.c, q: n.t === 'item' ? (n.q == null ? 1 : n.q) : null, tg: n.tg, note: n.note, ph: n.ph, o: n.o || 0 });
        (n.ch || []).forEach(function (c) { if (!c.o) c.o = nextO(); walk(c, n.id); });
      })(root, null);
      settings.cats.forEach(function (c) {
        if (!c.o) c.o = nextO();
        out[c.id] = norm({ id: c.id, p: null, t: 'cat', n: c.n, c: c.c, o: c.o });
      });
      out.settings = norm({ id: 'settings', p: null, t: 'settings', n: '', qr: settings.qr, base: settings.base });
      return out;
    }
    function reconcile() {
      var flat = flatten(), now = Date.now(), any = false;
      Object.keys(flat).forEach(function (id) {
        var f = flat[id], r = recs[id];
        if (!r || r.d || sig(r) !== sig(f)) {
          var rec = norm(f); rec.u = Math.max(now, r ? r.u + 1 : 0); rec.d = false; if (r && r.br != null) rec.br = r.br;
          recs[id] = rec; dirty[id] = 1; any = true;
        }
      });
      Object.keys(recs).forEach(function (id) {
        var r = recs[id];
        if (!r.d && !flat[id]) {
          var t = norm(r); t.u = Math.max(now, r.u + 1); t.d = true; if (r.br != null) t.br = r.br;
          recs[id] = t; dirty[id] = 1; any = true;
        }
      });
      return any;
    }
    function byO(a, b) { return (a.o - b.o) || (a.id < b.id ? -1 : 1); }
    function buildTree() {
      var kids = {};
      Object.keys(recs).forEach(function (id) {
        var r = recs[id];
        if (r.d || r.t === 'cat' || r.t === 'settings' || id === 'root') return;
        (kids[r.p] = kids[r.p] || []).push(r);
      });
      function node(r) {
        var n = { id: r.id, t: r.t, n: r.n, o: r.o, ph: (r.ph || []).slice() };
        if (r.c) n.c = r.c;
        if (r.t === 'item') { n.q = r.q == null ? 1 : r.q; n.tg = (r.tg || []).slice(); n.note = r.note || ''; }
        else n.ch = (kids[r.id] || []).sort(byO).map(node);
        return n;
      }
      var rr = recs.root && !recs.root.d ? recs.root : null;
      root = rr ? { id: 'root', t: 'home', n: rr.n || 'Дом', o: 0, ph: (rr.ph || []).slice(), ch: (kids.root || []).sort(byO).map(node) } : emptyRoot();
      var cats = Object.keys(recs).map(function (id) { return recs[id]; }).filter(function (r) { return r.t === 'cat' && !r.d; })
        .sort(byO).map(function (r) { return { id: r.id, n: r.n, c: r.c, o: r.o }; });
      var st = recs.settings && !recs.settings.d ? recs.settings : null;
      settings = { qr: (st && st.qr) || 'app', base: (st && st.base) || '', cats: cats };
    }
    /* sent: {id: подпись записи в момент отправки}. Ответ сервера по отправленным записям главный,
       кроме случая, когда запись успели изменить, пока шёл запрос. */
    /* Применение ответа сервера. Правила (меткам времени не доверяем, они могут совпадать):
       1. Запись, которую мы только что отправили: если за время запроса её снова правили, локальная версия
          остаётся и остаётся в очереди (dirty); если нет, берём версию сервера (она могла выиграть конфликт).
       2. Чужая запись, а у нас есть неотправленная правка (dirty): при совпадающем содержимом принимаем серверную,
          при разном НЕ трогаем локальную: она уйдёт со старым br, сервер увидит одновременную правку и запишет
          конфликт в журнал. Теряться не должна ни одна из версий.
       3. Чужая запись, локальной правки нет: сервер главный, берём его версию. Устаревшие ответы (ревизия меньше
          уже известной) пропускаем. */
    function sameRec(a, b) { return sig(a) === sig(b) && !!a.d === !!b.d; }
    function applyRemote(list, sent, stale) {
      var changed = false, st = {};
      (stale || []).forEach(function (id) { st[id] = 1; });
      list.forEach(function (r) {
        if (!r || !okId(r.id)) return;          // чужая запись с недопустимым id не принимается
        var nr = norm(r); r.p = nr.p; r.c = nr.c; r.tg = nr.tg; r.ph = nr.ph;   // и сервер не считаем безусловно доверенным
        var l = recs[r.id], rv = r.r;
        delete r.r; r.br = rv;
        function take() {
          if (!l || !sameRec(l, r)) changed = true;
          recs[r.id] = r; delete dirty[r.id];
        }
        if (st[r.id] && l) {                      // сервер счёл отправку устаревшей (счётчик откатился): правку не теряем,
          if (!sameRec(l, r)) { l.br = rv; dirty[r.id] = 1; return; }   // пересылаем поверх текущей версии сервера с новым номером
        }
        if (sent && sent[r.id] != null && l) {
          if (sig(l) !== sent[r.id]) {           // правили во время запроса: локальная версия остаётся в очереди
            if (sig(r) === sent[r.id] && !r.d === !l.d) l.br = rv;   // сервер принял именно нашу отправку: новая правка поверх неё
            return;
          }
          take(); return;
        }
        if (!l) { take(); return; }
        if (l.br != null && rv != null && rv < l.br && !dirty[r.id]) return;   // устаревший ответ
        if (dirty[r.id]) {
          if (sameRec(l, r) || (l.d && r.d)) take();   // то же содержимое: правка уже на сервере
          return;                                      // иначе локальная правка остаётся и разрешится на сервере
        }
        take();
      });
      return changed;
    }
    function deviceLabel() {
      var ua = navigator.userAgent || '', pl = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Браузер';
      return pl + (env.kind === 'pwa' ? ', приложение' : ', панель');
    }

