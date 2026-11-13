    /* --- фильтры и поиск --- */
    function findView() {
      var q = S.q.trim().toLowerCase().replace(/^#/, ''), f = S.f, hits = [], finding = S.mode === 'find';
      var onlyItems = f.cats.length || f.nocat || f.nophoto;
      walkAll(function (c, ids, names, a) {
        if (q && !matches(c, q)) return;
        if (onlyItems) {
          if (c.t !== 'item') return;
          var has = (c.tg || []).filter(catById);
          if (f.nocat && has.length) return;
          if (f.cats.length && !f.cats.some(function (id) { return (c.tg || []).indexOf(id) > -1; })) return;
          if (f.nophoto && (c.ph || []).length) return;
        } else if (finding && !q && c.t !== 'item') return;
        hits.push({ c: c, path: c.t === 'item' ? ids : ids.concat(c.id), where: names, a: a });
      });
      if (f.sort === 'name') hits.sort(function (x, y) { return x.c.n.localeCompare(y.c.n, 'ru'); });
      else if (f.sort === 'new') hits.sort(function (x, y) { return (y.c.o || 0) - (x.c.o || 0); });
      else if (f.sort === 'old') hits.sort(function (x, y) { return (x.c.o || 0) - (y.c.o || 0); });
      var h = '<div class="head"><h1>' + (finding ? 'Фильтры' : 'Поиск') + '</h1><div class="stat">' + (hits.length ? 'Найдено: ' + hits.length : 'Ничего не найдено') + '</div></div>';
      if (finding) {
        h += '<div class="form fgroup" style="--a:' + DEF + '">';
        if (settings.cats.length) {
          h += '<div class="sec">Категории (любая из выбранных)</div><div class="chips">' + settings.cats.map(function (c) {
            var on = f.cats.indexOf(c.id) > -1;
            return '<button type="button" class="chip' + (on ? ' on' : '') + '" style="--c:' + c.c + '" data-fcat="' + c.id + '" aria-pressed="' + on + '">#' + esc(c.n) + '</button>';
          }).join('') + '</div>';
        }
        h += '<div class="chips"><button type="button" class="chip' + (f.nocat ? ' on' : '') + '" style="--c:#8d6e63" data-fnocat aria-pressed="' + f.nocat + '">Без категории</button>' +
          '<button type="button" class="chip' + (f.nophoto ? ' on' : '') + '" style="--c:#42a5f5" data-fnophoto aria-pressed="' + f.nophoto + '">Без фото</button></div>' +
          '<label class="tgl">Порядок <select class="sel" data-fsort aria-label="Порядок">' +
          [['path', 'По расположению'], ['name', 'По названию'], ['new', 'Сначала новые'], ['old', 'Сначала старые']].map(function (o) { return '<option value="' + o[0] + '"' + (f.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select></label>' +
          '<div class="actions"><button class="btn" data-freset>Сбросить</button></div></div>';
      }
      if (!hits.length) return h + '<div class="empty">' + (q ? 'По запросу «' + esc(S.q.trim()) + '» ничего нет. Проверьте написание.' : 'Под такие условия ничего не подходит.') + '</div>';
      return h + '<div class="list">' + hits.map(hitCard).join('') + '</div>';
    }

