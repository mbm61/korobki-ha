  /* ---------- Приложение ---------- */
  function createApp(host, sr, env) {
    var DEF = '#4f729f', MAXPH = 8;
    var uid = function () { return Math.random().toString(36).slice(2, 9); };
    var oSeq = 0;
    function nextO() { return Date.now() * 1000 + (oSeq++ % 1000); }
    var P = function (n, c, ch) { return { id: uid(), t: 'place', n: n, c: c, ch: ch, ph: [], o: nextO() }; };
    var B = function (n, ch, c) { return { id: uid(), t: 'box', n: n, c: c, ch: ch, ph: [], o: nextO() }; };
    var I = function (n, q) { return { id: uid(), t: 'item', n: n, q: q || 1, ph: [], o: nextO() }; };

    function emptyRoot() { return { id: 'root', t: 'home', n: 'Дом', ch: [], ph: [] }; }
    function exampleChildren() {
      return [
        P('Кладовка', '#ffc107', [
          B('Зимняя одежда', [I('Пуховик детский'), I('Шапки', 4), I('Варежки, пар', 3)]),
          B('Инструменты', [I('Шуруповёрт'), I('Набор бит', 2), I('Рулетка'), I('Уровень')]),
          B('Аквариум: запас', [I('Шланг силиконовый, м', 2), I('Обратный клапан CO₂', 2), I('Запасная помпа')], '#00bcd4')
        ]),
        P('Ниша с электрикой', '#f44336', [
          B('Запас Zigbee', [I('Датчики протечки', 2), I('Термоголовка'), I('Батарейки CR2032', 6)])
        ])
      ];
    }

    var root = emptyRoot(), settings = normSettings({});
    var recs = {}, dirty = {}, upq = [], delq = [], since = 0, device = '', everSynced = false, useq = 0, nconf = 0;
    var loaded = false, destroyed = false, memOnly = false, booted = false;
    var net = 'idle', lastSync = 0, syncing = null, again = false;
    var persistT = null, syncT = null, pollT = null, unsub = null;
    var narrow = false, pendingRoute = null, lastRoutePath = null, dsince = 0, expBlob = null, impData = null;
    var S = { mode: null, catId: null, stale: false, path: [], q: '', adding: false, addType: null, draft: '', edit: false, conf: null, focus: false, addTags: [], dd: false, sdd: null, draftNote: '', addFiles: [], draftCat: '', sheet: null, pick: null, error: '', bulk: false, keep: false, f: { cats: [], nocat: false, nophoto: false, sort: 'path' }, svc: { stats: null, est: null, persisted: null, busy: '', exp: null, imp: null } };

    function normSettings(x) {
      var o = Object.assign({ qr: 'app', base: '', cats: [] }, x || {});
      if (!Array.isArray(o.cats)) o.cats = [];
      return o;
    }
    var ALLOW = { home: ['place'], place: ['box', 'item'], box: ['item', 'box'] };
    var TLABEL = { place: 'Место', box: 'Коробка', item: 'Вещь' };
    var KIND = { place: 'Место', box: 'Коробка', item: 'Вещь', home: 'Дом' };
    var HINT = { place: 'Например, Гараж', box: 'Например, Зимняя одежда', item: 'Например, Шуруповёрт' };
    var $ = function (id) { return sr.getElementById(id); };

    var ic = {
      place: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="15" cy="12" r="1" fill="currentColor"/>',
      box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
      item: '<path d="M3.5 12.5V4.5h8l9 9-8 8-9-9Z"/><circle cx="8" cy="9" r="1.2" fill="currentColor"/>',
      chev: '<path d="m9 6 6 6-6 6"/>',
      x: '<path d="M6 6l12 12M18 6 6 18"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      cam: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>',
      qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/>',
      sheet: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
      pen: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
      tag: '<path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16"/>',
      back: '<path d="M15 5l-7 7 7 7"/>',
      move: '<path d="M4 12h13M13 7l5 5-5 5"/><path d="M4 5v14"/>',
      copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
      trash: '<path d="M4 7h16M10 3.5h4M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
      check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
      chevd: '<path d="m6 9 6 6 6-6"/>',
      cloud: '<path d="M7 18.5h10a4 4 0 0 0 .7-7.9A5.6 5.6 0 0 0 6.9 9.4 4.6 4.6 0 0 0 7 18.5Z"/>',
      cloudok: '<path d="M7 18.5h10a4 4 0 0 0 .7-7.9A5.6 5.6 0 0 0 6.9 9.4 4.6 4.6 0 0 0 7 18.5Z"/><path d="m9.5 13.5 2 2 3.5-4"/>',
      cloudoff: '<path d="M7 18.5h10a4 4 0 0 0 .7-7.9A5.6 5.6 0 0 0 6.9 9.4 4.6 4.6 0 0 0 7 18.5Z"/><path d="M4 4l16 16"/>',
      cloudup: '<path d="M7 18.5h10a4 4 0 0 0 .7-7.9A5.6 5.6 0 0 0 6.9 9.4 4.6 4.6 0 0 0 7 18.5Z"/><path d="M12 16v-5M9.8 13l2.2-2.2L14.2 13"/>',
      refresh: '<path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4"/>',
      lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
    };
    /* кнопка-иконка 46x46: подпись только в aria-label и title */
    function ib(attr, icon, label, cls) {
      return '<button type="button" class="ib' + (cls ? ' ' + cls : '') + '" ' + attr + ' aria-label="' + esc(label) + '" title="' + esc(label) + '">' + svg(icon, 22) + '</button>';
    }
    function delBtn(id) {
      var ask = S.conf === id;
      return '<button type="button" class="ib danger' + (ask ? ' ask' : '') + '" data-del="' + id + '" aria-label="Удалить" title="Удалить">' + svg('trash', 22) + (ask ? '<span>Точно удалить?</span>' : '') + '</button>';
    }
    function nodeActions(n) {
      return '<div class="actions">' + ib('data-qr="' + n.id + '"', 'qr', 'QR-этикетка') + ib('data-move="' + n.id + '"', 'move', 'Переместить') + ib('data-dup="' + n.id + '"', 'copy', 'Копировать') + delBtn(n.id) + '</div>';
    }
    function svg(k, s) {
      s = s || 24;
      return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ic[k] + '</svg>';
    }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function pl(n, f) { var m = n % 100, d = n % 10; return n + ' ' + (m > 10 && m < 20 ? f[2] : d === 1 ? f[0] : d > 1 && d < 5 ? f[1] : f[2]); }
    var W = { place: ['место', 'места', 'мест'], box: ['коробка', 'коробки', 'коробок'], item: ['вещь', 'вещи', 'вещей'] };

