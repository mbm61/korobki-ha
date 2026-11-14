    /* --- конфликты правок и журнал синхронизации --- */
    var FNAME = { n: 'Название', q: 'Количество', note: 'Пометка', tg: 'Категории', c: 'Цвет', ph: 'Фото', p: 'Расположение', d: 'Удалена', qr: 'QR', base: 'Адрес' };
    function fmtT(t) { return new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    function devName(dv) {
      var lg = S.svc.log, dd = lg && lg.devices && lg.devices[dv];
      return dd && dd.label ? dd.label : dv ? dv.slice(0, 6) : 'неизвестное';
    }
    function fmtVal(f, r) {
      var v = r[f];
      if (f === 'tg') return (v || []).map(function (id) { var k = catById(id); return k ? '#' + k.n : '?'; }).join(', ') || '—';
      if (f === 'ph') return (v || []).length ? (v || []).length + ' шт.' : '—';
      if (f === 'd') return v ? 'да' : 'нет';
      if (f === 'p') { var pn = v && findNode(root, v); return pn ? pn.n : '—'; }
      return v == null || v === '' ? '—' : String(v);
    }
    function conflictHtml(c) {
      var k = c.kept, l = c.lost, nm = k.n || l.n || '(без названия)';
      function from(dv) { return dv === device ? 'с этого устройства' : 'с «' + devName(dv) + '»'; }
      var who = c.win === 'device' ? 'Правка ' + from(c.wdev) + ' перезаписала правку ' + from(c.ldev) + '.' : 'Правка ' + from(c.ldev) + ' не применилась: на сервере более поздняя ' + from(c.wdev) + '.';
      var rows = c.fields.filter(function (f) { return f !== 'o'; }).map(function (f) {
        return '<div class="cdiff"><b>' + (FNAME[f] || f) + ':</b> сейчас «' + esc(fmtVal(f, k)) + '», другая версия «' + esc(fmtVal(f, l)) + '»</div>';
      }).join('');
      return '<div class="cbox"><div class="cname">' + esc(nm) + ' <span class="hint">' + fmtT(c.t) + '</span></div><div class="hint">' + esc(who) + '</div>' + rows +
        '<div class="actions"><button class="btn primary" data-cres="' + esc(c.id) + '">Вернуть другую версию</button><button class="btn" data-cdis="' + esc(c.id) + '">Оставить как есть</button></div></div>';
    }
    function logLine(e) {
      var p = [];
      if (e.sent) p.push('отправлено ' + e.sent + (e.acc !== e.sent ? ', принято ' + e.acc : ''));
      if (e.pull) p.push('получено ' + e.pull);
      if (e.con) p.push('конфликтов ' + e.con);
      if (e.fix) p.push('исправлений ' + e.fix);
      if (e.ign) p.push('отклонено ' + e.ign);
      if (e.rej) p.push('негодных ' + e.rej);
      if (e.clk) p.push('часы устройства спешат');
      return '<div class="logrow"><span class="hint">' + fmtT(e.t) + '</span> ' + esc(e.lb || e.dev || '?') + ': ' + esc(p.join(', ') || 'без изменений') + '</div>';
    }
    function applyLost(cid) {
      var lg = S.svc.log, c = lg && lg.conflicts.filter(function (x) { return x.id === cid; })[0];
      if (!c) return;
      var l = recs[c.rid], x = norm(c.lost);
      x.d = !!c.lost.d; x.u = Math.max(Date.now(), l ? l.u + 1 : 0); if (l && l.br != null) x.br = l.br;
      recs[c.rid] = x; dirty[c.rid] = 1; if (!dsince) dsince = Date.now();
      buildTree(); persist(); dropConflict(cid); toast('Версия возвращена'); scheduleSync(300);
    }
    function dropConflict(cid) {
      var lg = S.svc.log;
      if (lg) { lg.conflicts = lg.conflicts.filter(function (x) { return x.id !== cid; }); nconf = lg.conflicts.length; }
      call('POST', '/api/korobki/conflicts/' + cid, { action: 'dismiss' }).catch(function () {});
      render();
    }
    function svcHtml(head) {
      var v = S.svc, st = v.stats, n = pendingCount(), tr = trashList().length;
      var h = head('Сервис');
      if (v.busy) h += '<div class="hint">' + esc(v.busy) + '</div>';
      if (v.log && v.log.conflicts.length) h += '<div class="sec">Конфликты правок (' + v.log.conflicts.length + ')</div><div class="hint">Две правки одной записи с разных устройств. Одна из них применена, вторая сохранена здесь: её можно вернуть.</div>' + v.log.conflicts.slice(0, 20).map(conflictHtml).join('');
      if (env.server) {
        h += '<div class="sec">Сервер</div><div class="hint">Адрес Home Assistant, с которым синхронизируется приложение. Пусто: тот же сайт, с которого открыто приложение. Нужен адрес того же Home Assistant, например домашний вместо внешнего. Чужой адрес должен разрешать доступ (cors_allowed_origins).</div>' +
          '<input class="field" id="srvUrl" type="url" inputmode="url" autocapitalize="off" autocomplete="off" placeholder="' + esc(location.origin) + '" value="' + esc(env.server.get()) + '" aria-label="Адрес сервера">' +
          (v.srvErr ? '<div class="warn2">' + esc(v.srvErr) + '</div>' : '') +
          '<div class="actions"><button class="btn primary" data-srvsave>Проверить и сохранить</button><button class="btn" data-srvreset>Как на этом сайте</button></div>';
      }
      if (env.theme) {
        var tm = env.theme();
        h += '<div class="sec">Тема</div><div class="seg" role="group" aria-label="Тема оформления">' +
          [['auto', 'Как в iPhone'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(function (o) {
            return '<button type="button" data-themeset="' + o[0] + '" class="' + (tm === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
          }).join('') + '</div>';
      }
      h += '<div class="sec">Синхронизация</div><div class="hint">' + (lastSync ? 'Последняя: ' + new Date(lastSync).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Ещё не было') +
        (n ? '. Не отправлено: ' + n : '. Всё отправлено') + '</div>';
      if (n && dsince && Date.now() - dsince > 2 * 86400000) h += '<div class="warn2">Правки не отправлялись ' + Math.floor((Date.now() - dsince) / 86400000) + ' дн. Подключитесь к сети и нажмите «Синхронизировать».</div>';
      h += '<div class="actions"><button class="btn" data-sync>Синхронизировать</button><button class="btn" data-trash>Корзина' + (tr ? ' (' + tr + ')' : '') + '</button></div>';
      h += '<div class="sec">Журнал синхронизации</div>' + (v.log ? (v.log.log.length ? v.log.log.slice(0, 20).map(logLine).join('') : '<div class="hint">Пока пусто</div>') : '<div class="hint">Загружаю…</div>');
      h += '<div class="sec">Резервная копия</div><div class="hint">Файл со всеми местами, коробками, вещами и категориями. «С фото» файл больше. Фото, которых нет на устройстве, берутся с сервера.</div>' +
        '<div class="actions"><button class="btn" data-export="0"' + (v.busy ? ' disabled' : '') + '>Скачать копию</button><button class="btn" data-export="1"' + (v.busy ? ' disabled' : '') + '>Копия с фото</button></div>';
      if (v.exp) h += '<div class="svcrow"><div class="hint">Готово: ' + esc(v.exp.name) + ', ' + mb(v.exp.size) + (v.exp.missing ? '. Без фото: ' + v.exp.missing + ' (не нашлись)' : '') + '</div><button class="btn primary" data-saveexp>Сохранить файл</button></div>';
      /* Диагностика экрана: помогает разобраться с полосой внизу на iPhone */
      var vv = window.visualViewport, pr = document.createElement('div'), cs = '';
      try { pr.style.cssText = 'position:fixed;left:0;top:0;width:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden'; document.body.appendChild(pr); cs = pr.offsetHeight; document.body.removeChild(pr); } catch (e) {}
      h += '<div class="sec">Диагностика экрана</div><div class="hint" style="user-select:text">окно ' + window.innerWidth + '×' + window.innerHeight + ', экран ' + screen.width + '×' + screen.height + ', visualViewport ' + (vv ? Math.round(vv.width) + '×' + Math.round(vv.height) : '—') + ', внешнее ' + window.outerHeight + ', нижний отступ ' + cs + ', режим ' + ((window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)) ? 'приложение' : 'браузер') + ', панель ' + (function () { var el = document.querySelector('korobki-panel'); return el ? Math.round(el.getBoundingClientRect().height) : '—'; })() + ' px</div>';
      /* Автокопии на сервере: состояние последней, список, кнопка «сделать сейчас» */
      var bk = v.bk, lb = bk && bk.last;
      h += '<div class="sec">Автокопия на сервере</div>';
      if (!bk) h += '<div class="hint">' + (v.bkErr ? 'Состояние автокопий недоступно (нужна версия сервера 0.8.0 и связь).' : 'Проверяю…') + '</div>';
      else {
        h += '<div class="hint">Home Assistant сам сохраняет копию данных раз в ' + (bk.hours || 24) + ' ч в папку ' + esc(bk.dir) + ' (хранится последних: ' + bk.keep + '). Фото в неё не входят.</div>';
        if (lb && lb.ok) h += '<div class="hint">Последняя: ' + new Date(lb.t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (lb.size ? ', ' + mb(lb.size) : '') + (lb.recs ? ', записей: ' + lb.recs : '') + '. Всего копий: ' + bk.count + '.</div>';
        else if (lb) h += '<div class="warn2">Последняя копия не создана: ' + esc(lb.error || 'ошибка') + '. В Home Assistant создано уведомление.</div>';
        else h += '<div class="warn2">Автокопий ещё нет.</div>';
      }
      h += '<div class="actions"><button class="btn" data-bkrun' + (v.busy || !bk ? ' disabled' : '') + '>Сделать копию сейчас</button></div>';
      h += '<div class="sec">Восстановление</div><div class="hint">Записи из копии вернутся и заменят одноимённые. То, чего в копии нет, останется.</div>' +
        '<div class="actions"><button class="btn" data-pickimp>Выбрать файл копии</button></div>';
      if (v.imp && v.imp.fatal) h += '<div class="warn2">Восстановить нельзя: ' + esc(v.imp.fatal) + '</div>';
      else if (v.imp) {
        var im = v.imp, nbad = im.bad.length, notes = [];
        if (nbad) notes.push('будут пропущены записи с ошибками: ' + nbad);
        if (im.tgDrop) notes.push('ссылок на несуществующие категории (уберутся): ' + im.tgDrop);
        if (im.phMiss) notes.push('фото без файла в копии: ' + im.phMiss + ' (возьмутся с сервера, если они там есть)');
        if (im.phBadN) notes.push('повреждённых фото в файле (пропустятся): ' + im.phBadN);
        h += '<div class="svcrow"><div class="hint">Проверка пройдена. В файле записей: ' + im.n + (im.ph ? ', фото: ' + im.ph : '') + (im.date ? ', от ' + esc(im.date.slice(0, 10)) : '') + '</div><button class="btn danger ask" data-doimport>Восстановить</button></div>';
        if (notes.length) h += '<div class="warn2">' + notes.map(esc).join('<br>') + '</div>';
        if (nbad) h += '<div class="hint">Например: ' + im.bad.slice(0, 4).map(function (b) { return esc(b.id.slice(0, 8)) + ' — ' + esc(b.why); }).join('; ') + '</div>';
      }
      h += '<div class="sec">Хранилище на устройстве</div><div class="hint">' +
        (v.persisted === true ? 'Защищено: система не удалит данные сама.' : v.persisted === false ? 'Система может очистить данные при нехватке места. Установите приложение на экран «Домой» и держите синхронизацию.' : 'Проверяю…') +
        (v.est && v.est.usage != null ? ' Занято: ' + mb(v.est.usage) + '.' : '') + '</div>';
      if (v.persisted === false) h += '<div class="actions"><button class="btn" data-persist>Запросить защиту</button></div>';
      h += '<div class="sec">Фото на сервере</div>';
      if (st) {
        h += '<div class="hint">Фото: ' + st.photos + ', ' + mb(st.bytes) + (st.orphans ? '. Лишних: ' + st.orphans + ' (' + mb(st.orphan_bytes) + ')' : '. Лишних нет') + '</div>';
        if (st.orphans) h += '<div class="actions"><button class="btn" data-cleanup' + (v.busy ? ' disabled' : '') + '>Удалить лишние фото</button></div>';
      } else h += '<div class="hint">' + (v.statsErr ? 'Нет связи с Home Assistant.' : 'Загружаю…') + '</div>';
      return h;
    }

