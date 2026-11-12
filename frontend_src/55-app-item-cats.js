    /* Категории вещи: сверху только присвоенные (нажатие снимает), остальные выбираются из списка */
    function catsBlock(n) {
      var on = n.tg || [], open = S.sdd === n.id;
      var mine = settings.cats.filter(function (c) { return on.indexOf(c.id) > -1; });
      var rest = settings.cats.filter(function (c) { return on.indexOf(c.id) < 0; });
      var h = '<div class="sec">Категории</div>';
      if (mine.length) h += '<div class="chips">' + mine.map(function (c) {
        return '<button type="button" class="chip on" style="--c:' + c.c + '" data-tag="' + c.id + '" aria-label="Убрать категорию ' + esc(c.n) + '">#' + esc(c.n) + ' ' + svg('x', 14) + '</button>';
      }).join('') + '</div>';
      h += '<div class="dd"><button type="button" class="ddbtn" data-sdd aria-expanded="' + open + '"><span class="ddsum">' + (mine.length ? 'Добавить категорию' : 'Выбрать категорию') + '</span>' + svg('chevd', 20) + '</button>' +
        '<div class="ddlist" id="sddlist"' + (open ? '' : ' hidden') + '>' +
        rest.map(function (c) {
          return '<button type="button" class="ddrow" role="option" style="--c:' + c.c + '" data-tag="' + c.id + '"><span class="ddchk">' + svg('check', 16) + '</span><span class="ddname">#' + esc(c.n) + '</span></button>';
        }).join('') +
        '<form class="ddnew" id="sCatForm"><input class="field" id="sCatName" type="text" autocomplete="off" placeholder="Новая категория" aria-label="Новая категория">' + ib('', 'plus', 'Создать категорию', 'primary').replace('type="button"', 'type="submit"') + '</form></div></div>';
      return h;
    }

    function qrControls() {
      var web = settings.qr === 'web';
      return '<div class="seg" role="group" aria-label="Куда ведёт QR">' +
        '<button type="button" data-qrmode="app" class="' + (web ? '' : 'on') + '">В приложении HA</button>' +
        '<button type="button" data-qrmode="web" class="' + (web ? 'on' : '') + '">В браузере</button></div>' +
        '<div class="hint">' + (web ? 'Откроется страница Home Assistant в браузере, понадобится вход. Адрес должен быть доступен там, где вы сканируете.' : 'Камера iPhone предложит открыть приложение Home Assistant сразу на этой коробке.') + '</div>' +
        (web ? '<label class="hint" for="baseUrl">Адрес Home Assistant</label><input class="field" id="baseUrl" type="url" inputmode="url" placeholder="' + esc(location.origin) + '" value="' + esc(settings.base || '') + '">' : '');
    }

    function sheetHtml() {
      var sh = S.sheet;
      if (!sh) return '';
      var n = findNode(root, sh.id);
      if (!n) { S.sheet = null; return ''; }
      var a = accOf(n.id), h = '<div class="scrim" data-close></div><div class="panel" role="dialog" aria-modal="true" style="--a:' + a + '"><div class="grab" aria-hidden="true"></div>';
      var head = function (kind) {
        return '<div class="phead">' + (sh.back ? '<button class="x" data-close aria-label="Назад">' + svg('back', 18) + '</button>' : '') +
          '<div class="kind" style="flex:1">' + kind + '</div><button class="x" data-close aria-label="Закрыть">' + svg('x', 18) + '</button></div>';
      };
      if (sh.type === 'item') {
        h += head('Вещь') +
          '<input class="field big" id="sName" data-rename="' + n.id + '" value="' + esc(n.n) + '" aria-label="Название">' +
          '<div class="hint">' + esc(namesTo(n.id).join(' › ')) + '</div>' +
          '<div class="line"><span>Количество</span><div class="step"><button data-step="' + n.id + '" data-d="-1" aria-label="Меньше">−</button><span class="qty">' + n.q + '</span><button data-step="' + n.id + '" data-d="1" aria-label="Больше">+</button></div></div>' +
          catsBlock(n) +
          '<label class="sec" for="sNote">Пометка</label><textarea class="field ta" id="sNote" data-note="' + n.id + '" rows="2" placeholder="Срок годности, размер, где купили">' + esc(n.note || '') + '</textarea>' +
          '<div class="sec">Фото</div><div class="grid">' + thumbsHtml(n, true) + '</div>' +
          nodeActions(n);
      } else if (sh.type === 'node') {
        h += head(KIND[n.t]) +
          '<input class="field big" id="sName" data-rename="' + n.id + '" value="' + esc(n.n) + '" aria-label="Название">' +
          '<div class="hint">' + (n.t === 'home' ? 'Название дома или квартиры. Показывается вверху и в пути.' : esc(namesTo(n.id).join(' › '))) + '</div>' +
          (n.t === 'home' ? '' : '<div class="sec">Цвет</div><div class="swatches">' +
            (n.t === 'box' ? '<button type="button" class="sw auto' + (!n.c ? ' on' : '') + '" data-setcolor="" data-for="' + n.id + '">Как у места</button>' : '') +
            PAL.map(function (c) { return '<button type="button" class="sw' + (n.c === c ? ' on' : '') + '" style="--c:' + c + '" data-setcolor="' + c + '" data-for="' + n.id + '" aria-label="Цвет ' + c + '"></button>'; }).join('') + '</div>') +
          (n.t === 'home' ? '' : '<div class="sec">Фото</div><div class="grid">' + thumbsHtml(n, true) + '</div>') +
          (n.t === 'home' ? '' : nodeActions(n));
      } else if (sh.type === 'svc') {
        h += svcHtml(head);
      } else if (sh.type === 'move') {
        var tg = moveTargets(n);
        h += head('Переместить') + '<div class="hint">Что: ' + esc(n.n) + '. Куда переложить:</div>' +
          (tg.length ? tg.map(function (t) {
            return '<button class="mrow" data-moveto="' + t.node.id + '"' + (t.cur ? ' disabled' : '') + '>' + esc(t.path.join(' › ')) + (t.cur ? '<span class="sub">сейчас здесь</span>' : '') + '</button>';
          }).join('') : '<div class="empty">Некуда перекладывать.</div>');
      } else if (sh.type === 'qr') {
        h += head('QR-этикетка') +
          '<img class="labimg" alt="Этикетка: ' + esc(n.n) + '" src="' + labelImage([n]) + '">' +
          '<div class="hint">Нажмите на картинку и удерживайте, чтобы сохранить или отправить на печать.</div>' +
          qrControls() + '<div class="url">' + esc(linkFor(n.id)) + '</div>';
      } else if (sh.type === 'viewer') {
        var ids = n.ph || [], i = Math.min(Math.max(0, sh.idx), ids.length - 1), pid = ids[i];
        var src = photoUrl(pid, true) || photoUrl(pid);
        h += head(esc(n.n)) + '<div class="viewer">' + (src ? '<img alt="Фото ' + (i + 1) + '" src="' + src + '">' : '<div class="empty">Загружаю фото…</div>') +
          '<div class="vnav"><button class="btn" data-nav="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Предыдущее">←</button>' +
          '<span class="hint">' + (i + 1) + ' из ' + ids.length + '</span>' +
          '<button class="btn" data-nav="1"' + (i >= ids.length - 1 ? ' disabled' : '') + ' aria-label="Следующее">→</button></div>' +
          '<button class="btn danger' + (S.conf === 'ph:' + pid ? ' ask' : '') + '" data-delphoto="' + pid + '">' + (S.conf === 'ph:' + pid ? 'Точно удалить фото?' : 'Удалить фото') + '</button></div>';
      }
      return h + '</div>';
    }

    function renderFoot() {
      var f = $('foot'); if (!f) return;
      var atHome = !S.path.length && !S.mode && S.q.trim() === '';
      f.hidden = !atHome;
      if (!atHome) { f.innerHTML = ''; return; }
      var t = lastSync ? 'Синхронизировано в ' + new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      f.innerHTML = '<span>Данные хранятся в Home Assistant · v' + (VERSION.indexOf('__') === 0 ? '?' : VERSION) + (memOnly ? ' · без сохранения на устройстве' : '') + '</span><span>' + esc(t) + '</span>' +
        '<span class="fb"><button data-trash>Корзина' + (trashList().length ? ' (' + trashList().length + ')' : '') + '</button><button data-svc>Сервис</button><button data-sync>Синхронизировать</button>' + (env.logout ? '<button data-logout>Выйти</button>' : '') + '</span>';
    }
