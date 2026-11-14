    /* --- отрисовка --- */
    function tileHtml(n) {
      var p = firstPhoto(n);
      if (p) return '<div class="tile ph" style="background-image:url(' + esc(p) + ')"></div>';
      return n.t === 'item' ? '<div class="tile ini">' + esc(initial(n.n)) + '</div>' : '<div class="tile">' + svg(n.t) + '</div>';
    }
    function initial(name) { var m = /[A-Za-zА-Яа-яЁё0-9]/.exec(name || ''); return m ? m[0].toUpperCase() : '•'; }
    function gridHtml(n, acc) {
      var a = n.c || acc, p = firstPhoto(n), st = stats(n);
      return '<div class="g" style="--a:' + esc(a) + '" data-open="' + esc(n.id) + '" tabindex="0" role="button" aria-label="Открыть: ' + esc(n.n) + '">' +
        '<div class="cover" style="' + (p ? 'background-image:url(' + esc(p) + ')' : '') + '">' + (p ? '' : svg(n.t)) +
        (S.edit ? delHtml(n.id) : '<span class="badge" title="Вещей внутри">' + st.i + '</span>') + '</div>' +
        '<div class="gb"><div class="name">' + esc(n.n) + '</div></div></div>';
    }
    function compactHtml(n, acc) {
      var a = n.c || acc;
      return '<div class="card cs" style="--a:' + esc(a) + '" data-open="' + esc(n.id) + '" tabindex="0" role="button" aria-label="Открыть: ' + esc(n.n) + '">' +
        tileHtml(n) + '<div class="t"><div class="name">' + esc(n.n) + '</div></div>' +
        (S.edit ? delHtml(n.id) : '<span class="chev">' + svg('chev', 18) + '</span>') + '</div>';
    }
    function delHtml(id) {
      var ask = S.conf === id;
      return '<button class="del' + (ask ? ' ask' : '') + '" data-del="' + esc(id) + '" aria-label="Удалить">' + (ask ? 'Удалить?' : svg('x', 16)) + '</button>';
    }
    function cardHtml(n, acc) {
      var a = n.c || acc;
      return '<div class="card" style="--a:' + esc(a) + '" data-open="' + esc(n.id) + '" tabindex="0" role="button" aria-label="Открыть: ' + esc(n.n) + '">' +
        tileHtml(n) +
        '<div class="t"><div class="name">' + esc(n.n) + '</div></div>' +
        (S.edit ? delHtml(n.id) : '<span class="chev">' + svg('chev', 20) + '</span>') + '</div>';
    }
    function thumbsHtml(n, addToo) {
      var h = '';
      (n.ph || []).forEach(function (id, i) {
        var u = photoUrl(id);
        h += u ? '<button class="th" data-view="' + esc(n.id) + ':' + i + '" style="background-image:url(' + esc(u) + ')" aria-label="Фото ' + (i + 1) + '"></button>'
               : '<div class="th wait"></div>';
      });
      if (addToo && (n.ph || []).length < MAXPH) h += '<button class="th add" data-addphoto="' + esc(n.id) + '">' + svg('cam', 22) + '<span>Фото</span></button>';
      return h;
    }

    function normalView(T) {
      var cur = T.cur, acc = T.acc;
      var conts = cur.ch.filter(function (c) { return c.t !== 'item'; });
      var items = cur.ch.filter(function (c) { return c.t === 'item'; });
      var allowed = ALLOW[cur.t];
      var type = S.addType && allowed.indexOf(S.addType) > -1 ? S.addType : allowed[0];
      var addLabel = cur.t === 'home' ? 'Добавить место' : cur.t === 'place' ? 'Добавить в место' : 'Добавить в коробку';

      var h = '<div class="head"><div class="h1row"><h1><button type="button" class="h1btn" data-edit="' + esc(cur.id) + '" aria-label="Изменить название: ' + esc(cur.n) + '">' + esc(cur.n) + '</button></h1></div></div>';
      /* Панель кнопок: слоты всегда на одних местах, недоступные гаснут */
      h += '<div class="bar" style="--a:' + esc(acc) + '">' +
        ib('data-toggle-add', 'plus', addLabel, 'primary' + (S.adding ? ' on' : '')) +
        ib(cur.t !== 'home' ? 'data-qr="' + esc(cur.id) + '"' : 'disabled', 'qr', 'QR-этикетка') +
        ib(cur.ch.length ? 'data-toggle-edit' : 'disabled', S.edit ? 'check' : 'pen', S.edit ? 'Готово' : 'Править', S.edit ? 'on' : '') +
        '</div>';

      if (S.adding) {
        h += '<form class="form" id="addForm" style="--a:' + esc(acc) + '">';
        if (allowed.length > 1) {
          h += '<div class="seg" role="group" aria-label="Что добавить">' + allowed.map(function (t) {
            return '<button type="button" data-type="' + esc(t) + '" class="' + (t === type ? 'on' : '') + '">' + TLABEL[t] + '</button>';
          }).join('') + '</div>';
        }
        if (type === 'item' && S.bulk) {
          h += '<textarea class="field ta bulk" id="fBulk" rows="5" placeholder="Каждая вещь с новой строки.&#10;Количество: Шапки x4" aria-label="Список вещей">' + esc(S.draft) + '</textarea>';
        } else {
          h += '<input id="fName" type="text" autocomplete="off" placeholder="' + HINT[type] + '" value="' + esc(S.draft) + '" aria-label="Название">';
          if (type === 'item') h += '<label class="qrow" for="fQty">Количество <input id="fQty" type="number" min="1" value="1" inputmode="numeric"></label>';
        }
        if (type === 'item') h += '<label class="tgl"><input type="checkbox" data-bulk' + (S.bulk ? ' checked' : '') + '> Списком, по одной вещи в строке</label>' +
          '<label class="tgl"><input type="checkbox" data-keep' + (S.keep ? ' checked' : '') + '> Добавлять подряд, категории запоминаются</label>';
        if (type === 'item') h += addCatsHtml();
        if (type === 'item' && !S.bulk) h += '<label class="sec" for="fNote">Пометка</label><textarea class="field ta" id="fNote" rows="2" placeholder="Срок годности, размер, где купили">' + esc(S.draftNote) + '</textarea>';
        if (!(type === 'item' && S.bulk)) {
          h += '<div class="sec">Фото</div><div class="grid">' + S.addFiles.map(function (f, i) {
            return '<button type="button" class="th" data-newphdel="' + esc(i) + '" style="background-image:url(' + esc(f.url) + ')" aria-label="Убрать фото ' + (i + 1) + '"><span class="thx">' + svg('x', 14) + '</span></button>';
          }).join('') + (S.addFiles.length < MAXPH ? '<button type="button" class="th add" data-addphoto="__new">' + svg('cam', 22) + '<span>Фото</span></button>' : '') + '</div>';
        }
        h += '<div class="actions right"><button class="btn" type="button" data-toggle-add>Отмена</button><button class="btn primary" type="submit">Добавить</button></div></form>';
      }

      if (conts.length) {
        if (cur.t === 'box') h += '<div class="list" style="gap:6px">' + conts.map(function (c) { return compactHtml(c, acc); }).join('') + '</div>';
        else h += '<div class="gridc">' + conts.map(function (c) { return gridHtml(c, acc); }).join('') + '</div>';
      }

      if (items.length) {
        h += '<div class="label">Вещи</div><div class="items" style="--a:' + esc(acc) + '">' + items.map(function (it) {
          var p = firstPhoto(it);
          return '<div class="row"><div class="rmain" data-sheet="' + esc(it.id) + '" tabindex="0" role="button" aria-label="Открыть: ' + esc(it.n) + '">' +
            (p ? '<div class="rthumb" style="background-image:url(' + esc(p) + ')"></div>' : '<div class="rthumb ini">' + esc(initial(it.n)) + '</div>') +
            '<div class="rtext"><div class="rname">' + esc(it.n) + '</div>' + metaHtml(it) + '</div></div>' +
            '<div class="step"><button data-step="' + esc(it.id) + '" data-d="-1" aria-label="Меньше">−</button><span class="qty">' + it.q + '</span><button data-step="' + esc(it.id) + '" data-d="1" aria-label="Больше">+</button></div>' +
            (S.edit ? delHtml(it.id) : '') + '</div>';
        }).join('') + '</div>';
      }

      if (!cur.ch.length && !S.adding) {
        if (cur.t === 'home') {
          h += '<div class="empty" style="--a:' + esc(acc) + '"><div class="eico">' + svg('place') + '</div><div>Пока нет ни одного места. Начните с кладовки, балкона или антресоли.</div><button class="btn primary" data-toggle-add>' + svg('plus', 18) + 'Добавить место</button><button class="btn" data-seed>Заполнить примером</button></div>';
        } else h += '<div class="empty" style="--a:' + esc(acc) + '"><div class="eico">' + svg(cur.t === 'place' ? 'box' : 'item') + '</div><div>Здесь пока пусто.</div><button class="btn primary" data-toggle-add>' + svg('plus', 18) + addLabel + '</button></div>';
      }
      return h;
    }

    function searchView() {
      var q = S.q.trim().toLowerCase().replace(/^#/, ''), hits = [];
      (function walk(n, ids, names, acc) {
        (n.ch || []).forEach(function (c) {
          var a = c.c || acc;
          if (matches(c, q)) hits.push({ c: c, path: c.t === 'item' ? ids : ids.concat(c.id), where: names, a: a });
          if (c.t !== 'item') walk(c, ids.concat(c.id), names.concat(c.n), a);
        });
      })(root, [], [], DEF);

      var h = '<div class="head"><h1>Поиск</h1><div class="stat">' + (hits.length ? 'Найдено: ' + hits.length : 'Ничего не найдено') + '</div></div>';
      if (!hits.length) return h + '<div class="empty">По запросу «' + esc(S.q.trim()) + '» ничего нет. Проверьте написание.</div>';
      return h + '<div class="list">' + hits.map(hitCard).join('') + '</div>';
    }

    function catsView() {
      var n = settings.cats.length;
      var h = '<div class="head"><h1>Категории</h1><div class="stat">' + (n ? pl(n, ['категория', 'категории', 'категорий']) : 'Пока нет ни одной категории') + '</div></div>';
      h += '<form class="form" id="catForm" style="--a:' + esc(DEF) + '"><input id="newCatName" type="text" autocomplete="off" placeholder="Новая категория, например: хрупкое" aria-label="Название категории">' +
        '<div class="actions"><button class="btn primary" type="submit">Добавить</button>' +
        (n ? ib('data-toggle-edit', S.edit ? 'check' : 'pen', S.edit ? 'Готово' : 'Править', S.edit ? 'on' : '') : '') + '</div></form>';
      if (!n) return h + '<div class="empty">Категории помогают отмечать вещи: хрупкое, зимнее, документы, на выброс. Создайте категорию здесь, потом выбирайте её в карточке вещи.</div>';
      return h + '<div class="list">' + settings.cats.map(function (c) {
        var cnt = catCount(c.id);
        if (S.edit) {
          var ask = S.conf === 'cat:' + c.id;
          return '<div class="card" style="--a:' + esc(c.c) + ';cursor:default"><div class="tile">' + svg('tag') + '</div>' +
            '<div class="t"><input class="field" data-catname="' + esc(c.id) + '" value="' + esc(c.n) + '" aria-label="Название категории"></div>' +
            '<button class="del' + (ask ? ' ask' : '') + '" data-delcat="' + esc(c.id) + '" aria-label="Удалить категорию">' + (ask ? 'Удалить?' : svg('x', 16)) + '</button></div>';
        }
        return '<div class="card" style="--a:' + esc(c.c) + '" data-cat="' + esc(c.id) + '" tabindex="0" role="button">' +
          '<div class="tile">' + svg('tag') + '</div>' +
          '<div class="t"><div class="name">#' + esc(c.n) + '</div></div>' +
          '<span class="chev">' + svg('chev', 20) + '</span></div>';
      }).join('') + '</div>';
    }

    function catView() {
      var c = catById(S.catId);
      if (!c) { S.mode = 'cats'; return catsView(); }
      var hits = [];
      walkAll(function (n, ids, names, a) { if (n.t === 'item' && (n.tg || []).indexOf(c.id) > -1) hits.push({ c: n, path: ids, where: names, a: a }); });
      var h = '<div class="head"><h1>#' + esc(c.n) + '</h1><div class="stat">' + (hits.length ? pl(hits.length, W.item) : 'Нет вещей') + '</div></div>';
      if (!hits.length) return h + '<div class="empty">В этой категории пока ничего нет. Откройте вещь и выберите категорию.</div>';
      return h + '<div class="list">' + hits.map(hitCard).join('') + '</div>';
    }

