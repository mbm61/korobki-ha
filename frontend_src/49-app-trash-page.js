    /* --- корзина (страница) --- */
    function trashView() {
      var list = trashList();
      var h = '<div class="head"><h1>Корзина</h1><div class="stat">' + (list.length ? 'Удалённое хранится 30 дней' : 'Пусто') + '</div></div>';
      if (!list.length) return h + '<div class="empty">Удалённые места, коробки и вещи появятся здесь. Их можно вернуть вместе с содержимым.</div>';
      h += '<div class="bar" style="--a:' + DEF + '"><button class="btn danger' + (S.conf === 'emptytrash' ? ' ask' : '') + '" data-emptytrash>' + (S.conf === 'emptytrash' ? 'Точно очистить? Фото тоже удалятся' : 'Очистить корзину') + '</button></div>';
      return h + '<div class="list">' + list.map(function (r) {
        var kids = trashKids(r), left = Math.max(1, Math.ceil((TRASH_MS - (Date.now() - r.u)) / 86400000));
        return '<div class="card" style="--a:' + (r.c || DEF) + ';cursor:default"><div class="tile">' + svg(r.t) + '</div>' +
          '<div class="t"><div class="name">' + esc(r.n) + '</div><div class="sub">' + KIND[r.t] + (kids ? ' · внутри записей: ' + kids : '') + ' · осталось дн.: ' + left + '</div></div>' +
          '<button class="btn primary" data-restore="' + r.id + '">Вернуть</button></div>';
      }).join('') + '</div>';
    }

