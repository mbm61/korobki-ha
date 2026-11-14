    /* --- категории и поиск --- */
    var PAL = ['#ffc107', '#03a9f4', '#2196f3', '#9c27b0', '#f44336', '#4caf50', '#00bcd4', '#ff7043', '#8d6e63'];
    var CATPAL = ['#ff7043', '#26a69a', '#7e57c2', '#ffa726', '#42a5f5', '#ec407a', '#66bb6a', '#8d6e63'];
    function catById(id) { return settings.cats.filter(function (c) { return c.id === id; })[0] || null; }
    function addCat(name) {
      name = String(name || '').replace(/^#+/, '').trim();
      if (!name) return null;
      var low = name.toLowerCase();
      var ex = settings.cats.filter(function (c) { return c.n.toLowerCase() === low; })[0];
      if (ex) return ex;
      var c = { id: uid(), n: name, c: CATPAL[settings.cats.length % CATPAL.length], o: nextO() };
      settings.cats.push(c);
      return c;
    }
    function dropCat(id) {
      settings.cats = settings.cats.filter(function (c) { return c.id !== id; });
      (function walk(n) { if (n.tg) n.tg = n.tg.filter(function (t) { return t !== id; }); (n.ch || []).forEach(walk); })(root);
    }
    function catCount(id) {
      var k = 0;
      (function walk(n) { if (n.t === 'item' && (n.tg || []).indexOf(id) > -1) k++; (n.ch || []).forEach(walk); })(root);
      return k;
    }
    function walkAll(cb) {
      (function walk(n, ids, names, acc) {
        (n.ch || []).forEach(function (c) {
          var a = c.c || acc;
          cb(c, ids, names, a);
          if (c.t !== 'item') walk(c, ids.concat(c.id), names.concat(c.n), a);
        });
      })(root, [], [], DEF);
    }
    function matches(c, q) {
      if (c.n.toLowerCase().indexOf(q) > -1) return true;
      if (c.t !== 'item') return false;
      if ((c.note || '').toLowerCase().indexOf(q) > -1) return true;
      return (c.tg || []).some(function (id) { var k = catById(id); return k && k.n.toLowerCase().indexOf(q) > -1; });
    }
    function metaHtml(it) {
      var tg = (it.tg || []).map(catById).filter(Boolean), h = '';
      if (tg.length) h += '<div class="rmeta">' + tg.map(function (c) { return '<span class="mini" style="--c:' + esc(c.c) + '">#' + esc(c.n) + '</span>'; }).join('') + '</div>';
      if (it.note) h += '<div class="rnote">' + esc(it.note) + '</div>';
      return h;
    }
    function hitCard(x) {
      var c = x.c, title = esc(c.n) + (c.t === 'item' ? ' × ' + c.q : '');
      return '<div class="card" style="--a:' + esc(x.a) + '" data-hit="' + esc(x.path.join(',')) + '"' + (c.t === 'item' ? ' data-hitid="' + esc(c.id) + '"' : '') + ' tabindex="0" role="button">' +
        tileHtml(c) +
        '<div class="t"><div class="name">' + title + '</div><div class="sub">' + esc([root.n].concat(x.where).join(' › ')) + '</div>' + (c.t === 'item' ? metaHtml(c) : '') + '</div>' +
        '<span class="chev">' + svg('chev', 20) + '</span></div>';
    }

