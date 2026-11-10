/* Панель «Коробки» для Home Assistant.
 * Дом -> места -> коробки -> вещи, фото, QR-этикетки.
 * Данные: websocket korobki/get и korobki/save. Фото: /api/korobki/photo.
 * Оформление: карточки с градиентом из акцентного цвета места, цвета берутся из темы HA. */
(function () {
  'use strict';
  /* версию подставляет сервер при отдаче файла (из manifest.json), вручную её менять не нужно */
  var VERSION = '__KOROBKI_VERSION__';

  /* ---------- QR-код (байтовый режим, уровень M, версии 1-6) ---------- */
  var QR = (function () {
    var RAW = [0, 26, 44, 70, 100, 134, 172], ECC = [0, 10, 16, 26, 18, 24, 16], NB = [0, 1, 1, 1, 2, 2, 4];
    function mul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
    function rs(data, deg) {
      var gen = [], i, j;
      for (i = 0; i < deg - 1; i++) gen.push(0);
      gen.push(1);
      var root = 1;
      for (i = 0; i < deg; i++) {
        for (j = 0; j < gen.length; j++) { gen[j] = mul(gen[j], root); if (j + 1 < gen.length) gen[j] ^= gen[j + 1]; }
        root = mul(root, 2);
      }
      var res = [];
      for (i = 0; i < deg; i++) res.push(0);
      data.forEach(function (b) {
        var f = b ^ res.shift(); res.push(0);
        for (var k = 0; k < deg; k++) res[k] ^= mul(gen[k], f);
      });
      return res;
    }
    function make(text) {
      var bytes = Array.prototype.slice.call(new TextEncoder().encode(text)), v = 0, t, i, j;
      for (t = 1; t <= 6; t++) { if (12 + 8 * bytes.length <= (RAW[t] - ECC[t] * NB[t]) * 8) { v = t; break; } }
      if (!v) return null;
      var dcw = RAW[v] - ECC[v] * NB[v], bits = [];
      function put(val, len) { for (var q = len - 1; q >= 0; q--) bits.push((val >>> q) & 1); }
      put(4, 4); put(bytes.length, 8);
      bytes.forEach(function (b) { put(b, 8); });
      put(0, Math.min(4, dcw * 8 - bits.length));
      while (bits.length % 8) bits.push(0);
      for (var pad = 0xEC; bits.length < dcw * 8; pad ^= 0xEC ^ 0x11) put(pad, 8);
      var data = [];
      for (i = 0; i < bits.length; i += 8) { var bb = 0; for (j = 0; j < 8; j++) bb = (bb << 1) | bits[i + j]; data.push(bb); }

      var nb = NB[v], el = ECC[v], raw = RAW[v], ns = nb - raw % nb, sl = Math.floor(raw / nb), blocks = [], k = 0;
      for (i = 0; i < nb; i++) {
        var dat = data.slice(k, k + sl - el + (i < ns ? 0 : 1)); k += dat.length;
        var ecc = rs(dat, el);
        if (i < ns) dat.push(0);
        blocks.push(dat.concat(ecc));
      }
      var all = [];
      for (i = 0; i < blocks[0].length; i++) {
        for (j = 0; j < blocks.length; j++) { if (i !== sl - el || j >= ns) all.push(blocks[j][i]); }
      }

      var size = 17 + 4 * v, m = [], f = [], y, x;
      for (y = 0; y < size; y++) { m.push([]); f.push([]); for (x = 0; x < size; x++) { m[y].push(false); f[y].push(false); } }
      function setF(x, y, d) { m[y][x] = d; f[y][x] = true; }
      for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
      function finder(cx, cy) {
        for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
        }
      }
      finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
      if (v >= 2) {
        var c = size - 7;
        for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) setF(c + ax, c + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
      }
      function fmt(mask) {
        var d = mask, rem = d, q;
        for (q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        var b = ((d << 10) | rem) ^ 0x5412;
        function bit(n) { return ((b >>> n) & 1) !== 0; }
        for (q = 0; q <= 5; q++) setF(8, q, bit(q));
        setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
        for (q = 9; q < 15; q++) setF(14 - q, 8, bit(q));
        for (q = 0; q < 8; q++) setF(size - 1 - q, 8, bit(q));
        for (q = 8; q < 15; q++) setF(8, size - 15 + q, bit(q));
        setF(8, size - 8, true);
      }
      fmt(0);

      var bi = 0, right, vert, jj, upward;
      for (right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (vert = 0; vert < size; vert++) {
          for (jj = 0; jj < 2; jj++) {
            x = right - jj;
            upward = ((right + 1) & 2) === 0;
            y = upward ? size - 1 - vert : vert;
            if (!f[y][x] && bi < all.length * 8) { m[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
          }
        }
      }
      function cond(mk, x, y) {
        switch (mk) {
          case 0: return (x + y) % 2 === 0;
          case 1: return y % 2 === 0;
          case 2: return x % 3 === 0;
          case 3: return (x + y) % 3 === 0;
          case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
          case 5: return x * y % 2 + x * y % 3 === 0;
          case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
          default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
      }
      function applyMask(mk) { for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) if (!f[yy][xx] && cond(mk, xx, yy)) m[yy][xx] = !m[yy][xx]; }
      function penalty() {
        var p = 0, dir, a, b, run, line, q, dark = 0;
        for (dir = 0; dir < 2; dir++) {
          for (a = 0; a < size; a++) {
            line = [];
            for (b = 0; b < size; b++) line.push(dir ? m[b][a] : m[a][b]);
            run = 1;
            for (b = 1; b < size; b++) {
              if (line[b] === line[b - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
            }
            for (b = 0; b + 7 <= size; b++) {
              if (line[b] && !line[b + 1] && line[b + 2] && line[b + 3] && line[b + 4] && !line[b + 5] && line[b + 6]) {
                var lb = true, la = true;
                for (q = 1; q <= 4; q++) { if (b - q >= 0 && line[b - q]) lb = false; if (b + 6 + q < size && line[b + 6 + q]) la = false; }
                if (lb || la) p += 40;
              }
            }
          }
        }
        for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
          if (m[y][x]) dark++;
          if (y < size - 1 && x < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
        }
        var total = size * size, kk = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
        return p + Math.max(0, kk) * 10;
      }
      var best = 0, bp = 1e9, mk;
      for (mk = 0; mk < 8; mk++) { applyMask(mk); fmt(mk); var pe = penalty(); if (pe < bp) { bp = pe; best = mk; } applyMask(mk); }
      applyMask(best); fmt(best);
      return m;
    }
    return { make: make };
  })();

  function drawQR(ctx, m, x, y, box) {
    var n = m.length, cell = Math.max(1, Math.floor(box / (n + 8))), off = Math.floor((box - cell * n) / 2);
    ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (m[r][c]) ctx.fillRect(x + off + c * cell, y + off + r * cell, cell, cell);
  }

  /* ---------- Стили панели ---------- */
  var STYLE = [
    ':host { --bg: var(--primary-background-color, #f2f4f8); --card: var(--card-background-color, #fff); --fg: var(--primary-text-color, #16202c); --muted: var(--secondary-text-color, #64738a); --line: var(--divider-color, #d9e0ea); --accent: var(--primary-color, #4f729f); --danger: var(--error-color, #c62828); --f: var(--paper-font-body1_-_font-family, Roboto, system-ui, -apple-system, "Segoe UI", sans-serif);',
    '  display: block; height: 100%; overflow-y: auto; box-sizing: border-box; background: var(--bg); color: var(--fg); font: 15px/1.45 var(--f); }',
    '* { box-sizing: border-box; }',
    'button, input, textarea { font-family: inherit; color: inherit; }',
    'button { cursor: pointer; }',
    ':focus-visible { outline: 2px solid var(--a, var(--accent)); outline-offset: 2px; }',
    '.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }',
    '.wrap { max-width: 560px; margin: 0 auto; padding: 0 16px env(safe-area-inset-bottom, 0px); }',
    '.top { position: sticky; top: 0; z-index: 5; background: var(--bg); padding-block: calc(8px + env(safe-area-inset-top, 0px)) 6px; }',
    '.toprow { display: flex; align-items: center; gap: 4px; min-height: 34px; }',
    '.top .srow { gap: 8px; }',
    '.top .menu { height: 34px; }',
    '.menu { width: 40px; height: 40px; flex: none; border: 0; background: none; border-radius: 12px; display: grid; place-items: center; }',
    '.crumbs { flex: 1; min-width: 0; display: flex; align-items: center; gap: 2px; overflow-x: auto; scrollbar-width: none; white-space: nowrap; padding-bottom: 2px; padding-top: 2px; color: var(--muted); }',
    '.crumbs::-webkit-scrollbar { display: none; }',
    '.crumb { background: none; border: 0; padding: 6px 8px; border-radius: 8px; color: var(--muted); font-size: 13px; font-weight: 500; }',
    '.cur { padding: 6px 8px; font-size: 13px; font-weight: 600; color: var(--fg); }',
    '.search { position: relative; display: block; }',
    '.search svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }',
    '.search input { width: 100%; height: 44px; padding: 0 14px 0 42px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); font-size: 16px; }',
    '.search input::placeholder { color: var(--muted); }',
    '.head { margin: 16px 2px 14px; }',
    'h1 { margin: 0 0 6px; font: 700 clamp(22px, 6.5vw, 28px)/1.18 var(--f); letter-spacing: -0.01em; text-wrap: balance; overflow-wrap: anywhere; }',
    '.stat { color: var(--muted); font-size: 14px; }',
    '.bar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }',
    '.btn { height: 42px; padding: 0 16px; border-radius: 12px; font-size: 14px; font-weight: 600; border: 1px solid var(--line); background: var(--card); display: inline-flex; align-items: center; justify-content: center; gap: 8px; }',
    '.btn[disabled] { opacity: .4; cursor: default; }',
    '.btn.primary { border-color: color-mix(in srgb, var(--a) 55%, transparent); background: color-mix(in srgb, var(--a) 20%, var(--card)); }',
    '.btn.on { border-color: var(--a); background: color-mix(in srgb, var(--a) 20%, var(--card)); }',
    '.btn.danger { color: var(--danger); }',
    '.btn.danger.ask { border-color: var(--danger); }',
    '.list { display: grid; gap: 10px; }',
    /* Карточки: рамка 1px из акцента 35% и градиент 160deg */
    '.card, .items, .form { border: 1px solid color-mix(in srgb, var(--a) 35%, transparent); background: linear-gradient(160deg, color-mix(in srgb, var(--a) 10%, var(--card)) 0%, var(--card) 65%); border-radius: 16px; }',
    '.card { display: flex; align-items: center; gap: 14px; padding: 14px; min-width: 0; cursor: pointer; transition: transform .15s ease; }',
    '.card:active { transform: scale(0.98); }',
    '.tile { width: 46px; height: 46px; flex: none; display: grid; place-items: center; border-radius: 12px; background: color-mix(in srgb, var(--a) 22%, transparent); color: var(--a); }',
    '.tile svg { width: 26px; height: 26px; }',
    '.tile.ph, .th, .rthumb { background-size: cover; background-position: center; background-repeat: no-repeat; }',
    '.t { flex: 1; min-width: 0; }',
    '.name { font-weight: 600; font-size: 16px; overflow-wrap: anywhere; }',
    '.sub { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }',
    '.chev { color: var(--muted); opacity: .7; display: grid; }',
    '.strip { display: flex; gap: 8px; overflow-x: auto; margin: 0 0 14px; padding-bottom: 2px; scrollbar-width: none; }',
    '.strip::-webkit-scrollbar { display: none; }',
    '.th { width: 76px; height: 76px; flex: none; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--a) 35%, transparent); background-color: color-mix(in srgb, var(--a) 10%, var(--card)); padding: 0; }',
    '.th.add { display: grid; place-items: center; align-content: center; gap: 2px; color: var(--a); border-style: dashed; font-size: 12px; font-weight: 600; }',
    '.th.wait { animation: pulse 1.4s ease-in-out infinite; }',
    '@keyframes pulse { 50% { opacity: .5; } }',
    '.label { margin: 20px 2px 8px; font-size: 12px; font-weight: 500; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }',
    '.items { overflow: hidden; }',
    '.row { display: flex; align-items: center; gap: 12px; padding: 8px 12px 8px 10px; min-height: 58px; }',
    '.row + .row { border-top: 1px solid color-mix(in srgb, var(--a) 18%, transparent); }',
    '.rmain { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; cursor: pointer; }',
    '.rthumb { width: 42px; height: 42px; flex: none; border-radius: 10px; display: grid; place-items: center; background-color: color-mix(in srgb, var(--a) 16%, transparent); color: var(--a); }',
    '.rthumb svg { width: 22px; height: 22px; }',
    '.rname { flex: 1; min-width: 0; overflow-wrap: anywhere; }',
    '.step { display: flex; align-items: center; background: color-mix(in srgb, var(--fg) 7%, transparent); border-radius: 10px; flex: none; }',
    '.step button { width: 34px; height: 34px; border: 0; background: none; border-radius: 10px; font-size: 18px; line-height: 1; }',
    '.qty { min-width: 26px; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }',
    '.del { min-width: 34px; height: 34px; padding: 0 8px; flex: none; border-radius: 10px; font-size: 13px; font-weight: 600; border: 1px solid var(--line); background: var(--card); color: var(--muted); display: inline-grid; place-items: center; }',
    '.del.ask { color: var(--danger); border-color: var(--danger); }',
    '.form { padding: 14px; display: grid; gap: 10px; margin-bottom: 12px; }',
    '.seg { display: flex; gap: 6px; }',
    '.seg button { flex: 1; height: 38px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); font-size: 14px; font-weight: 500; }',
    '.seg button.on { border-color: var(--a); background: color-mix(in srgb, var(--a) 20%, var(--card)); font-weight: 600; }',
    '.form input, .field { width: 100%; height: 44px; padding: 0 14px; border-radius: 12px; font-size: 16px; border: 1px solid var(--line); background: var(--card); }',
    '.form .qrow { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 14px; }',
    '.form .qrow input { width: 96px; }',
    '.actions { display: flex; gap: 8px; flex-wrap: wrap; }',
    '.empty { padding: 22px 16px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 16px; display: grid; gap: 12px; justify-items: center; }',
    '.foot { margin-top: 28px; margin-bottom: 20px; padding: 0 2px; font-size: 12px; color: var(--muted); display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }',
    '.sheet { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; justify-content: center; }',
    '.sheet[hidden], .toast[hidden], .menu[hidden] { display: none; }',
    '.scrim { position: absolute; inset: 0; background: rgba(8, 12, 18, .5); }',
    '.panel { position: relative; width: 100%; max-width: 560px; max-height: 90%; overflow-y: auto; overscroll-behavior: contain; background: var(--card); color: var(--fg); border-radius: 20px 20px 0 0; border: 1px solid color-mix(in srgb, var(--a) 35%, transparent); border-bottom: 0; background-image: linear-gradient(160deg, color-mix(in srgb, var(--a) 10%, var(--card)) 0%, var(--card) 65%); padding: 14px 16px calc(20px + env(safe-area-inset-bottom, 0px)); display: grid; gap: 14px; }',
    '.phead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
    '.kind { font-size: 12px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--a); }',
    '.x { width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); display: grid; place-items: center; }',
    '.big { font: 700 20px/1.2 var(--f); height: 48px; }',
    '.line { display: flex; align-items: center; justify-content: space-between; gap: 12px; }',
    '.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }',
    '.grid .th { width: 100%; height: auto; aspect-ratio: 1; }',
    '.labimg { width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--line); background: #fff; display: block; }',
    '.hint { font-size: 13px; color: var(--muted); }',
    '.url { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; user-select: all; }',
    '.viewer { display: grid; gap: 12px; }',
    '.viewer img { width: 100%; max-height: 62vh; object-fit: contain; border-radius: 12px; background: color-mix(in srgb, var(--fg) 6%, transparent); }',
    '.vnav { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
    '.toast { position: fixed; left: 50%; transform: translateX(-50%); z-index: 30; max-width: min(92vw, 420px); bottom: calc(80px + env(safe-area-inset-bottom, 0px)); pointer-events: none; padding: 10px 16px; border-radius: 12px; background: var(--fg); color: var(--bg); font-size: 14px; text-align: center; }',
    '.pill { flex: none; height: 36px; padding: 0 14px 0 12px; border-radius: 18px; display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 14%, var(--card)); }',
    '.pill.on { background: color-mix(in srgb, var(--accent) 34%, var(--card)); }',
    '.h1row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }',
    '.h1row h1 { margin: 0; min-width: 0; }',
    '.pen { width: 34px; height: 34px; flex: none; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--muted); display: grid; place-items: center; }',
    '.chips { display: flex; flex-wrap: wrap; gap: 6px; }',
    '.chip { height: 34px; padding: 0 13px; border-radius: 17px; font-size: 14px; font-weight: 500; border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); background: color-mix(in srgb, var(--c) 8%, var(--card)); }',
    '.chip.on { background: color-mix(in srgb, var(--c) 32%, var(--card)); font-weight: 700; }',
    '.mini { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; color: var(--fg); background: color-mix(in srgb, var(--c) 24%, transparent); }',
    '.rtext { flex: 1; min-width: 0; }',
    '.rmeta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }',
    '.rnote { font-size: 12px; color: var(--muted); margin-top: 2px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }',
    '.sec { font-size: 12px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }',
    '.ta { height: auto; min-height: 66px; padding: 10px 14px; line-height: 1.4; resize: vertical; display: block; }',
    '.inline { display: flex; gap: 8px; }',
    '.inline .field { flex: 1; min-width: 0; }',
    '.banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; margin-top: 8px; border-radius: 12px; font-size: 14px; border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 14%, var(--card)); }',
    '.card .field { height: 38px; }',
    '.syncbar { --st: #42a5f5; display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 6px; padding: 6px 10px; border-radius: 12px; font-size: 13px; border: 1px solid color-mix(in srgb, var(--st) 50%, transparent); background: color-mix(in srgb, var(--st) 14%, var(--card)); }',
    '.syncbar[hidden] { display: none; }',
    '.mini2 { flex: none; height: 30px; padding: 0 12px; border-radius: 10px; font-size: 13px; font-weight: 600; border: 1px solid var(--line); background: var(--card); }',
    '.foot button { background: none; border: 0; padding: 6px 0; font-size: 12px; color: var(--muted); text-decoration: underline; }',
    '.fb { display: inline-flex; gap: 14px; }',
    '.pill[hidden], .bnav[hidden], .iconbtn[hidden], .foot[hidden], .ddlist[hidden] { display: none; }',
    /* кнопки-иконки под палец */
    '.ib { min-width: 46px; height: 46px; padding: 0; flex: none; border-radius: 14px; border: 1px solid var(--line); background: var(--card); color: var(--fg); display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 14px; font-weight: 600; }',
    '.ib:active { transform: scale(.96); }',
    '.ib.primary, .ib.on { border-color: color-mix(in srgb, var(--a, var(--accent)) 55%, transparent); background: color-mix(in srgb, var(--a, var(--accent)) 20%, var(--card)); }',
    '.ib.danger { color: var(--danger); }',
    '.ib.ask { padding: 0 14px; border-color: var(--danger); }',
    '.bar, .actions { gap: 10px; }',
    /* выпадающий список категорий */
    '.dd { display: grid; gap: 6px; }',
    '.ddbtn { width: 100%; height: 44px; padding: 0 12px 0 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 15px; text-align: left; }',
    '.ddsum { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ddlist { border: 1px solid var(--line); border-radius: 12px; background: var(--card); max-height: 240px; overflow-y: auto; overscroll-behavior: contain; }',
    '.ddrow { width: 100%; min-height: 44px; padding: 0 14px; display: flex; align-items: center; gap: 10px; border: 0; border-bottom: 1px solid var(--line); background: none; text-align: left; font-size: 15px; }',
    '.ddrow .ddchk { width: 22px; height: 22px; border-radius: 7px; border: 1.5px solid color-mix(in srgb, var(--c) 60%, transparent); display: grid; place-items: center; color: transparent; flex: none; }',
    '.ddrow.on .ddchk { background: var(--c); color: #fff; border-color: var(--c); }',
    '.ddrow.on .ddname { font-weight: 700; }',
    '.ddnew { display: flex; gap: 8px; padding: 8px; align-items: center; }',
    '.ddnew input { flex: 1; min-width: 0; height: 46px; }',
    '.wrap { min-height: 100%; display: flex; flex-direction: column; }',
    '.wrap main { flex: 1; }',
    '.srow { display: flex; gap: 8px; align-items: center; }',
    '.srow .search { flex: 1; min-width: 0; }',
    '.iconbtn { width: 44px; height: 44px; flex: none; border-radius: 12px; border: 1px solid var(--line); background: var(--card); display: grid; place-items: center; color: var(--muted); }',
    '.iconbtn.on { color: var(--fg); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 20%, var(--card)); }',
    '.bnav { position: sticky; bottom: 0; z-index: 4; display: flex; gap: 10px; padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(to top, var(--bg) 78%, transparent); }',
    '.bnav button { flex: 1; height: 42px; border-radius: 14px; font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 12%, var(--card)) 0%, var(--card) 65%); }',
    '.bnav button:active { transform: scale(.98); }',
    '@media (min-width: 900px) { .bnav { display: none; } }',
    /* плотные строки вещей (вариант Б) */
    '.row { min-height: 50px; padding: 6px 12px 6px 10px; }',
    '.rthumb { width: 36px; height: 36px; border-radius: 50%; }',
    '.ini { font-weight: 700; font-size: 15px; background-color: color-mix(in srgb, var(--a) 24%, transparent); }',
    '.tile.ini { border-radius: 50%; font-size: 20px; }',
    '.row .rname { font-weight: 600; }',
    /* сетка мест и коробок (вариант В) */
    '.gridc { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }',
    '.g { position: relative; min-width: 0; cursor: pointer; border-radius: 16px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--a) 35%, transparent); background: linear-gradient(160deg, color-mix(in srgb, var(--a) 10%, var(--card)) 0%, var(--card) 65%); transition: transform .15s ease; }',
    '.g:active { transform: scale(.98); }',
    '.cover { height: 104px; position: relative; display: grid; place-items: center; color: var(--a); background-color: color-mix(in srgb, var(--a) 18%, var(--card)); background-size: cover; background-position: center; }',
    '.cover svg { width: 40px; height: 40px; }',
    '.badge { position: absolute; right: 8px; top: 8px; min-width: 24px; padding: 1px 8px; border-radius: 12px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 12px; font-weight: 600; text-align: center; }',
    '.g .del { position: absolute; right: 8px; top: 8px; background: var(--card); }',
    '.gb { padding: 9px 11px 11px; }',
    '.gb .name { font-size: 15px; }',
    /* вложенные коробки: компактно, с цветной полосой */
    '.card.cs { gap: 10px; padding: 8px 12px; border-radius: 12px; border-left: 4px solid var(--a); }',
    '.card.cs .tile { width: 34px; height: 34px; border-radius: 10px; }',
    '.card.cs .tile svg { width: 20px; height: 20px; }',
    '.card.cs .name { font-size: 15px; }',
    /* пустые экраны */
    '.empty { border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 8%, var(--card)) 0%, var(--card) 65%); }',
    '.eico { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; color: var(--a, var(--accent)); background: color-mix(in srgb, var(--a, var(--accent)) 18%, transparent); }',
    '.eico svg { width: 34px; height: 34px; }',
    /* выбор цвета */
    '.swatches { display: flex; flex-wrap: wrap; gap: 8px; }',
    '.sw { width: 34px; height: 34px; border-radius: 50%; border: 2px solid transparent; background: var(--c); padding: 0; }',
    '.sw.on { border-color: var(--fg); box-shadow: 0 0 0 2px var(--card) inset; }',
    '.sw.auto { background: var(--card); border: 1px dashed var(--muted); font-size: 11px; color: var(--muted); width: auto; padding: 0 12px; border-radius: 17px; }',
    '.sw.auto.on { border-style: solid; border-color: var(--fg); }',
    '.fgroup { display: grid; gap: 8px; padding: 14px; margin-bottom: 12px; }',
    '.sel { height: 38px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); padding: 0 10px; font-size: 14px; }',
    '.ta.bulk { min-height: 120px; }',
    '.sub2 { font-size: 12px; color: var(--muted); }',
    '.tgl { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--muted); }',
    '.tgl input { width: 20px; height: 20px; }',
    '.mrow { width: 100%; text-align: left; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); font-size: 15px; }',
    '.mrow[disabled] { opacity: .4; }',
    '.mrow .sub { display: block; }',
    '.svcrow { display: grid; gap: 6px; }',
    '.warn2 { font-size: 13px; padding: 8px 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, #ffa000 55%, transparent); background: color-mix(in srgb, #ffa000 14%, var(--card)); }',
    '@media (prefers-reduced-motion: reduce) { .card, .th.wait { transition: none; animation: none; } }'
  ].join('\n');

  var HTML = '<style>' + STYLE + '</style>' +
    '<div class="wrap">' +
    '<header class="top"><div class="srow">' +
    '<button class="menu" id="menu" hidden aria-label="Меню"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>' +
    '<label class="search"><span class="sr">Поиск</span>' +
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
    '<input id="q" type="search" placeholder="Поиск вещей" autocomplete="off"></label>' +
    '<button class="iconbtn" id="filtBtn" aria-label="Фильтры" title="Фильтры"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16l-6 7.5V19l-4-2v-4.5Z"/></svg></button>' +
    '<button class="iconbtn" id="catsBtn" aria-label="Категории" title="Категории"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16"/></svg></button></div>' +
    '<div class="toprow"><button class="menu" id="back" hidden aria-label="Назад"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<nav class="crumbs" id="crumbs" aria-label="Путь"></nav></div>' +
    '<div class="syncbar" id="syncbar" hidden></div></header>' +
    '<main id="view"></main><footer class="foot" id="foot"></footer>' +
    '<nav class="bnav" id="bnav" hidden aria-label="Навигация"><button data-home aria-label="В корень дома"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11 12 4l8 7M6 10v10h12V10"/></svg>Домой</button>' +
    '<button data-goback aria-label="Назад"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Назад</button></nav></div>' +
    '<div class="sheet" id="sheet" hidden></div><div class="toast" id="toast" hidden></div>' +
    '<input class="sr" id="pick" type="file" accept="image/*" multiple tabindex="-1" aria-hidden="true">' +
    '<input class="sr" id="impick" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true">';

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
    var recs = {}, dirty = {}, upq = [], delq = [], since = 0, device = '', everSynced = false;
    var loaded = false, destroyed = false, memOnly = false, booted = false;
    var net = 'idle', lastSync = 0, syncing = null, again = false;
    var persistT = null, syncT = null, pollT = null, unsub = null;
    var narrow = false, pendingRoute = null, lastRoutePath = null, dsince = 0, expBlob = null, impData = null;
    var S = { mode: null, catId: null, stale: false, path: [], q: '', adding: false, addType: null, draft: '', edit: false, conf: null, focus: false, addTags: [], dd: false, draftCat: '', sheet: null, pick: null, error: '', bulk: false, keep: false, f: { cats: [], nocat: false, nophoto: false, sort: 'path' }, svc: { stats: null, est: null, persisted: null, busy: '', exp: null, imp: null } };

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
      chevd: '<path d="m6 9 6 6 6-6"/>'
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
      if (tg.length) h += '<div class="rmeta">' + tg.map(function (c) { return '<span class="mini" style="--c:' + c.c + '">#' + esc(c.n) + '</span>'; }).join('') + '</div>';
      if (it.note) h += '<div class="rnote">' + esc(it.note) + '</div>';
      return h;
    }
    function hitCard(x) {
      var c = x.c, title = esc(c.n) + (c.t === 'item' ? ' × ' + c.q : '');
      return '<div class="card" style="--a:' + x.a + '" data-hit="' + x.path.join(',') + '"' + (c.t === 'item' ? ' data-hitid="' + c.id + '"' : '') + ' tabindex="0" role="button">' +
        tileHtml(c) +
        '<div class="t"><div class="name">' + title + '</div><div class="sub">' + esc([root.n].concat(x.where).join(' › ')) + '</div>' + (c.t === 'item' ? metaHtml(c) : '') + '</div>' +
        '<span class="chev">' + svg('chev', 20) + '</span></div>';
    }

    /* --- хранилище на устройстве --- */
    var DB = null, DBNAME = 'korobki-local-' + env.kind;
    function dbOpen(cb) {
      try {
        var r = indexedDB.open(DBNAME, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); r.result.createObjectStore('photos'); };
        r.onsuccess = function () { DB = r.result; cb(true); };
        r.onerror = function () { cb(false); };
        r.onblocked = function () { cb(false); };
      } catch (e) { cb(false); }
    }
    function dbGet(store, key, cb) {
      if (!DB) return cb(null);
      try {
        var rq = DB.transaction(store, 'readonly').objectStore(store).get(key);
        rq.onsuccess = function () { cb(rq.result || null); };
        rq.onerror = function () { cb(null); };
      } catch (e) { cb(null); }
    }
    function dbPut(store, key, val) { if (!DB) return; try { DB.transaction(store, 'readwrite').objectStore(store).put(val, key); } catch (e) {} }
    function dbDel(store, key) { if (!DB) return; try { DB.transaction(store, 'readwrite').objectStore(store).delete(key); } catch (e) {} }
    function persist(now) { clearTimeout(persistT); persistT = setTimeout(doPersist, now ? 0 : 250); }
    function doPersist() {
      clearTimeout(persistT);
      dbPut('kv', 'state', { recs: recs, dirty: Object.keys(dirty), upq: upq, delq: delq, since: since, device: device, synced: everSynced, dsince: dsince });
    }

    /* --- записи для синхронизации: каждая вещь, коробка, категория это отдельная запись с меткой времени --- */
    function norm(r) {
      return {
        id: r.id, p: r.p == null ? null : r.p, t: r.t, n: r.n == null ? '' : String(r.n), c: r.c || null,
        q: r.q == null ? null : Number(r.q), tg: Array.isArray(r.tg) ? r.tg.slice() : [], note: r.note || '',
        ph: Array.isArray(r.ph) ? r.ph.slice() : [], o: r.o || 0, qr: r.qr || '', base: r.base || ''
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
          var rec = norm(f); rec.u = Math.max(now, r ? r.u + 1 : 0); rec.d = false;
          recs[id] = rec; dirty[id] = 1; any = true;
        }
      });
      Object.keys(recs).forEach(function (id) {
        var r = recs[id];
        if (!r.d && !flat[id]) {
          var t = norm(r); t.u = Math.max(now, r.u + 1); t.d = true;
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
    function applyRemote(list) {
      var changed = false;
      list.forEach(function (r) {
        var l = recs[r.id];
        delete r.r;
        if (!l || r.u > l.u) {
          if (!l || sig(l) !== sig(r) || !!l.d !== !!r.d) changed = true;
          recs[r.id] = r; delete dirty[r.id];
        } else if (r.u === l.u) { if (r.d && l.d && !r.n && l.n) recs[r.id] = r; delete dirty[r.id]; }
      });
      return changed;
    }

    /* --- обмен с Home Assistant --- */
    function call(method, path, body, type) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var tm = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
      return env.request(method, path, body, type, ctl ? ctl.signal : undefined).then(function (r) {
        clearTimeout(tm);
        if (r.status === 401 || r.status === 403) { var e = new Error('auth'); e.auth = true; throw e; }
        if (!r.ok && r.status !== 404) { var e2 = new Error('http ' + r.status); e2.http = r.status; throw e2; }
        return r;
      }, function (err) { clearTimeout(tm); throw err; });
    }
    function pendingCount() { return Object.keys(dirty).length + upq.length + delq.length; }
    function scheduleSync(ms) { clearTimeout(syncT); syncT = setTimeout(sync, ms || 800); }
    function save() { reconcile(); if (pendingCount() && !dsince) dsince = Date.now(); persist(); renderSync(); scheduleSync(900); }

    function pushPull() {
      var ids = Object.keys(dirty);
      var list = ids.filter(function (id) { return recs[id]; }).map(function (id) { return Object.assign({}, recs[id]); });
      return call('POST', '/api/korobki/sync', { since: since, records: list, device: device }).then(function (r) { return r.json(); }).then(function (j) {
        var changed = applyRemote(j.records || []);
        since = j.rev; everSynced = true;
        S.stale = !!(j.version && VERSION.indexOf('__') !== 0 && j.version !== VERSION);
        if (changed) { buildTree(); render(); }
        doPersist();
      });
    }
    function uploadPhotos() {
      return upq.slice().reduce(function (p, id) {
        return p.then(function () {
          return new Promise(function (res) { dbGet('photos', id, res); }).then(function (rec) {
            if (!rec || !rec.full) { upq = upq.filter(function (x) { return x !== id; }); return null; }
            return call('PUT', '/api/korobki/photo/' + id, abToBlob(rec.full), 'image/jpeg')
              .then(function () { return rec.thumb ? call('PUT', '/api/korobki/photo/' + id + '/thumb', abToBlob(rec.thumb), 'image/jpeg') : null; })
              .then(function () { upq = upq.filter(function (x) { return x !== id; }); rec.up = 1; dbPut('photos', id, rec); doPersist(); }, function (e) {
                if (e && e.http && e.http < 500) { upq = upq.filter(function (x) { return x !== id; }); return null; }
                throw e;
              });
          });
        });
      }, Promise.resolve());
    }
    function deletePhotos() {
      return delq.slice().reduce(function (p, id) {
        return p.then(function () {
          return call('DELETE', '/api/korobki/photo/' + id).then(function () { delq = delq.filter(function (x) { return x !== id; }); doPersist(); });
        });
      }, Promise.resolve());
    }
    function sync() {
      if (destroyed || !booted) return Promise.resolve();
      if (syncing) { again = true; return syncing; }
      var was = everSynced;
      net = 'sync'; renderSync();
      syncing = uploadPhotos().then(deletePhotos).then(pushPull).then(function () {
        net = 'ok'; lastSync = Date.now(); if (!pendingCount()) dsince = 0; retryPhotos(); prefetchThumbs(); gcLocalPhotos();
      }).catch(function (e) {
        net = e && e.auth ? 'auth' : 'offline';
      }).then(function () {
        syncing = null;
        if (!was) render(); else { renderSync(); renderFoot(); }
        if (again) { again = false; return sync(); }
      });
      return syncing;
    }

    /* --- фото: сначала сохраняются на устройстве, на сервер уходят при связи --- */
    var URLS = {}, PEND = {}, rq = false;
    function later() { if (rq || destroyed) return; rq = true; requestAnimationFrame(function () { rq = false; render(); }); }
    function abToBlob(ab) { return new Blob([ab], { type: 'image/jpeg' }); }
    function blobToAb(b) {
      if (b.arrayBuffer) return b.arrayBuffer();
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsArrayBuffer(b); });
    }
    function newPhotoId() {
      var a = new Uint8Array(8); (window.crypto || window.msCrypto).getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }
    function photoUrl(id, full) {
      var key = id + (full ? 'f' : 't');
      if (URLS[key]) return URLS[key];
      if (!PEND[key]) {
        PEND[key] = 1;
        dbGet('photos', id, function (rec) {
          var ab = rec && (full ? rec.full : rec.thumb);
          if (ab) { URLS[key] = URL.createObjectURL(abToBlob(ab)); delete PEND[key]; later(); return; }
          fetchPhoto(id, full, key);
        });
      }
      return null;
    }
    function fetchPhoto(id, full, key) {
      call('GET', '/api/korobki/photo/' + id + (full ? '' : '/thumb')).then(function (r) {
        if (!r.ok) { var e = new Error('missing'); e.missing = true; throw e; }
        return r.blob();
      }).then(function (b) {
        return blobToAb(b).then(function (ab) {
          dbGet('photos', id, function (cur) {
            cur = cur || { up: 1 };
            if (full) cur.full = ab; else cur.thumb = ab;
            dbPut('photos', id, cur);
          });
          URLS[key] = URL.createObjectURL(b); delete PEND[key]; later();
        });
      }).catch(function (e) { PEND[key] = e && e.missing ? 3 : 2; });
    }
    function retryPhotos() {
      var any = false;
      Object.keys(PEND).forEach(function (k) { if (PEND[k] === 2) { delete PEND[k]; any = true; } });
      if (any) later();
    }
    function prefetchThumbs() {
      Object.keys(recs).forEach(function (id) {
        var r = recs[id];
        if (!r.d && r.ph) r.ph.forEach(function (pid) { photoUrl(pid); });
      });
    }
    function firstPhoto(n) { return n.ph && n.ph[0] ? photoUrl(n.ph[0]) : null; }
    function toBlob(img, max, q, cb) {
      var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(cb, 'image/jpeg', q);
    }
    function shrink(file, cb) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        toBlob(img, 1000, 0.72, function (full) {
          toBlob(img, 240, 0.7, function (thumb) { URL.revokeObjectURL(url); cb(full, thumb); });
        });
      };
      img.onerror = function () { URL.revokeObjectURL(url); cb(null, null); };
      img.src = url;
    }
    function addPhotoLocal(file) {
      return new Promise(function (resolve) {
        shrink(file, function (full, thumb) {
          if (!full || !thumb) return resolve(null);
          Promise.all([blobToAb(full), blobToAb(thumb)]).then(function (abs) {
            var pid = newPhotoId();
            dbPut('photos', pid, { full: abs[0], thumb: abs[1], up: 0 });
            URLS[pid + 'f'] = URL.createObjectURL(full); URLS[pid + 't'] = URL.createObjectURL(thumb);
            upq.push(pid); persist();
            resolve(pid);
          }).catch(function () { resolve(null); });
        });
      });
    }
    function dropPhoto(pid) {
      ['f', 't'].forEach(function (s) { if (URLS[pid + s]) { URL.revokeObjectURL(URLS[pid + s]); delete URLS[pid + s]; } delete PEND[pid + s]; });
      dbDel('photos', pid);
      upq = upq.filter(function (x) { return x !== pid; });
      if (delq.indexOf(pid) < 0) delq.push(pid);
      persist();
    }

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
          if (f.cats.length && !f.cats.every(function (id) { return (c.tg || []).indexOf(id) > -1; })) return;
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
          h += '<div class="sec">Категории (все выбранные сразу)</div><div class="chips">' + settings.cats.map(function (c) {
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

    /* --- сервис: копии, хранилище, фото на сервере --- */
    function requestPersist() {
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function (v) { S.svc.persisted = v; }); } catch (e) {}
    }
    function gcLocalPhotos() {
      if (!DB) return;
      var used = {}; upq.forEach(function (x) { used[x] = 1; });
      Object.keys(recs).forEach(function (id) { (recs[id].ph || []).forEach(function (pid) { used[pid] = 1; }); });
      try {
        var st = DB.transaction('photos', 'readwrite').objectStore('photos'), rq = st.getAllKeys();
        rq.onsuccess = function () { (rq.result || []).forEach(function (k) { if (!used[k]) st.delete(k); }); };
      } catch (e) {}
    }
    function abToB64(ab) {
      var u = new Uint8Array(ab), s2 = '';
      for (var i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s2);
    }
    function b64ToAb(b) {
      var bin = atob(b), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    }
    function getPhotoBuf(pid, full) {
      return new Promise(function (res) { dbGet('photos', pid, res); }).then(function (rec) {
        var ab = rec && (full ? rec.full : rec.thumb);
        if (ab) return ab;
        return call('GET', '/api/korobki/photo/' + pid + (full ? '' : '/thumb')).then(function (r) { return r.ok ? r.blob() : null; })
          .then(function (b) {
            if (!b) return null;
            return blobToAb(b).then(function (buf) {
              dbGet('photos', pid, function (cur) { cur = cur || { up: 1 }; if (full) cur.full = buf; else cur.thumb = buf; dbPut('photos', pid, cur); });
              return buf;
            });
          }).catch(function () { return null; });
      });
    }
    function doExport(withPh) {
      S.svc.busy = 'Готовлю копию…'; S.svc.exp = null; expBlob = null; render();
      var data = { app: 'korobki', format: 1, version: VERSION, created: new Date().toISOString(), recs: recs };
      var ids = [], photos = {}, i = 0;
      if (withPh) Object.keys(recs).forEach(function (id) { (recs[id].ph || []).forEach(function (pid) { if (ids.indexOf(pid) < 0) ids.push(pid); }); });
      return ids.reduce(function (pr, pid) {
        return pr.then(function () {
          S.svc.busy = 'Фото ' + (++i) + ' из ' + ids.length; render();
          return Promise.all([getPhotoBuf(pid, true), getPhotoBuf(pid, false)]).then(function (r) {
            if (r[0] || r[1]) photos[pid] = { f: r[0] ? abToB64(r[0]) : '', t: r[1] ? abToB64(r[1]) : '' };
          });
        });
      }, Promise.resolve()).then(function () {
        if (withPh) data.photos = photos;
        expBlob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        var d = new Date(), ds = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        S.svc.exp = { name: 'korobki-' + ds + (withPh ? '-s-foto' : '') + '.json', size: expBlob.size, missing: ids.length - Object.keys(photos).length };
        S.svc.busy = ''; render();
      }).catch(function () { S.svc.busy = ''; toast('Не удалось подготовить копию'); render(); });
    }
    function saveExp() {
      if (!expBlob || !S.svc.exp) return;
      var name = S.svc.exp.name, file = null;
      try { file = new File([expBlob], name, { type: 'application/json' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(function () {}); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(expBlob); a.download = name; sr.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
    function readImport(file) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var d = JSON.parse(fr.result);
          if (!d || d.app !== 'korobki' || !d.recs || typeof d.recs !== 'object') throw new Error('bad');
          var n = Object.keys(d.recs).filter(function (id) { var r = d.recs[id]; return r && typeof r.id === 'string' && !r.d; }).length;
          impData = d; S.svc.imp = { n: n, ph: d.photos ? Object.keys(d.photos).length : 0, date: d.created || '' };
        } catch (e) { impData = null; S.svc.imp = null; toast('Это не файл копии «Коробок»'); }
        render();
      };
      fr.readAsText(file);
    }
    function doImport() {
      if (!impData) return;
      var now = Date.now(), cnt = 0;
      Object.keys(impData.recs).forEach(function (id) {
        var r = impData.recs[id];
        if (!r || typeof r.id !== 'string' || r.id !== id) return;
        var x = norm(r); x.d = !!r.d; x.u = Math.max(now, (recs[id] ? recs[id].u + 1 : 0)); recs[id] = x; dirty[id] = 1; cnt++;
      });
      var ph = impData.photos || {};
      Object.keys(ph).forEach(function (pid) {
        if (!/^[0-9a-f]{16}$/.test(pid)) return;
        try {
          var full = ph[pid].f ? b64ToAb(ph[pid].f) : null, th = ph[pid].t ? b64ToAb(ph[pid].t) : null;
          dbPut('photos', pid, { full: full || th, thumb: th || full, up: 0 });
          if (upq.indexOf(pid) < 0) upq.push(pid);
        } catch (e) {}
      });
      impData = null; S.svc.imp = null;
      buildTree(); if (!dsince) dsince = now; persist(); renderSync(); scheduleSync(300);
      toast('Восстановлено записей: ' + cnt); render();
    }
    function loadSvc() {
      S.svc.stats = null; S.svc.statsErr = false;
      try { if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(function (v) { S.svc.persisted = v; refreshSvc(); }); } catch (e) {}
      try { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { S.svc.est = e; refreshSvc(); }); } catch (e) {}
      call('GET', '/api/korobki/stats').then(function (r) { return r.json(); }).then(function (j) { S.svc.stats = j; refreshSvc(); }).catch(function () { S.svc.statsErr = true; refreshSvc(); });
    }
    function refreshSvc() { if (S.sheet && S.sheet.type === 'svc') render(); }
    function doCleanup() {
      S.svc.busy = 'Очищаю…'; render();
      call('POST', '/api/korobki/cleanup', {}).then(function (r) { return r.json(); }).then(function (j) {
        S.svc.busy = ''; toast('Удалено лишних фото: ' + j.removed + ' (' + mb(j.freed) + ')'); loadSvc(); render();
      }).catch(function () { S.svc.busy = ''; toast('Нет связи с Home Assistant'); render(); });
    }
    function mb(b) { return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' КБ' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' МБ'; }
    function svcHtml(head) {
      var v = S.svc, st = v.stats, n = pendingCount(), tr = trashList().length;
      var h = head('Сервис');
      if (v.busy) h += '<div class="hint">' + esc(v.busy) + '</div>';
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
      h += '<div class="sec">Резервная копия</div><div class="hint">Файл со всеми местами, коробками, вещами и категориями. «С фото» файл больше. Фото, которых нет на устройстве, берутся с сервера.</div>' +
        '<div class="actions"><button class="btn" data-export="0"' + (v.busy ? ' disabled' : '') + '>Скачать копию</button><button class="btn" data-export="1"' + (v.busy ? ' disabled' : '') + '>Копия с фото</button></div>';
      if (v.exp) h += '<div class="svcrow"><div class="hint">Готово: ' + esc(v.exp.name) + ', ' + mb(v.exp.size) + (v.exp.missing ? '. Без фото: ' + v.exp.missing + ' (не нашлись)' : '') + '</div><button class="btn primary" data-saveexp>Сохранить файл</button></div>';
      h += '<div class="sec">Восстановление</div><div class="hint">Записи из копии вернутся и заменят одноимённые. То, чего в копии нет, останется.</div>' +
        '<div class="actions"><button class="btn" data-pickimp>Выбрать файл копии</button></div>';
      if (v.imp) h += '<div class="svcrow"><div class="hint">В файле записей: ' + v.imp.n + (v.imp.ph ? ', фото: ' + v.imp.ph : '') + (v.imp.date ? ', от ' + esc(v.imp.date.slice(0, 10)) : '') + '</div><button class="btn danger ask" data-doimport>Восстановить</button></div>';
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

    /* --- QR-этикетки --- */
    function linkFor(id) {
      if (settings.qr === 'web') return (settings.base || location.origin).replace(/\/+$/, '') + '/korobki/' + id;
      return 'homeassistant://navigate/korobki/' + id;
    }
    function wrapText(ctx, text, maxW, maxLines) {
      var words = String(text).split(/\s+/), lines = [], cur = '';
      words.forEach(function (w) {
        var t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        var last = lines[maxLines - 1];
        while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
        lines[maxLines - 1] = last + '…';
      }
      return lines;
    }
    var LW = 760, LH = 360;
    function drawLabel(ctx, x, y, node) {
      var m = QR.make(linkFor(node.id));
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, LW, LH);
      ctx.strokeStyle = '#9aa5b4'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, LW - 2, LH - 2);
      if (m) drawQR(ctx, m, x + 16, y + 16, LH - 32);
      var tx = x + LH, maxW = LW - LH - 24, ty = y + 62;
      ctx.fillStyle = '#5b6b80'; ctx.font = '600 22px system-ui, -apple-system, sans-serif'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(KIND[node.t].toUpperCase(), tx, ty);
      ctx.fillStyle = '#0d1520'; ctx.font = '700 40px system-ui, -apple-system, sans-serif';
      var ly = ty + 52;
      wrapText(ctx, node.n, maxW, 3).forEach(function (l) { ctx.fillText(l, tx, ly); ly += 46; });
      var where = namesTo(node.id).join(' › ');
      if (where) {
        ctx.fillStyle = '#5b6b80'; ctx.font = '400 24px system-ui, -apple-system, sans-serif';
        wrapText(ctx, where, maxW, 2).forEach(function (l) { ly += 4; ctx.fillText(l, tx, ly); ly += 30; });
      }
      if (!m) { ctx.fillStyle = '#c62828'; ctx.font = '600 22px system-ui, sans-serif'; ctx.fillText('Адрес слишком длинный', tx, y + LH - 24); }
    }
    function labelImage(nodes) {
      var multi = nodes.length > 1, cols = multi ? 2 : 1, rows = Math.ceil(nodes.length / cols), g = multi ? 24 : 0;
      var c = document.createElement('canvas');
      c.width = cols * LW + (cols + 1) * g; c.height = rows * LH + (rows + 1) * g;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      nodes.forEach(function (n, i) { drawLabel(ctx, g + (i % cols) * (LW + g), g + Math.floor(i / cols) * (LH + g), n); });
      return c.toDataURL('image/png');
    }

    /* --- отрисовка --- */
    function tileHtml(n) {
      var p = firstPhoto(n);
      if (p) return '<div class="tile ph" style="background-image:url(' + p + ')"></div>';
      return n.t === 'item' ? '<div class="tile ini">' + esc(initial(n.n)) + '</div>' : '<div class="tile">' + svg(n.t) + '</div>';
    }
    function initial(name) { var m = /[A-Za-zА-Яа-яЁё0-9]/.exec(name || ''); return m ? m[0].toUpperCase() : '•'; }
    function gridHtml(n, acc) {
      var a = n.c || acc, p = firstPhoto(n), st = stats(n);
      return '<div class="g" style="--a:' + a + '" data-open="' + n.id + '" tabindex="0" role="button" aria-label="Открыть: ' + esc(n.n) + '">' +
        '<div class="cover" style="' + (p ? 'background-image:url(' + p + ')' : '') + '">' + (p ? '' : svg(n.t)) +
        (S.edit ? delHtml(n.id) : '<span class="badge" title="Вещей внутри">' + st.i + '</span>') + '</div>' +
        '<div class="gb"><div class="name">' + esc(n.n) + '</div><div class="sub">' + summary(n) + '</div></div></div>';
    }
    function compactHtml(n, acc) {
      var a = n.c || acc;
      return '<div class="card cs" style="--a:' + a + '" data-open="' + n.id + '" tabindex="0" role="button" aria-label="Открыть: ' + esc(n.n) + '">' +
        tileHtml(n) + '<div class="t"><div class="name">' + esc(n.n) + '</div><div class="sub">' + summary(n) + '</div></div>' +
        (S.edit ? delHtml(n.id) : '<span class="chev">' + svg('chev', 18) + '</span>') + '</div>';
    }
    function delHtml(id) {
      var ask = S.conf === id;
      return '<button class="del' + (ask ? ' ask' : '') + '" data-del="' + id + '" aria-label="Удалить">' + (ask ? 'Удалить?' : svg('x', 16)) + '</button>';
    }
    function cardHtml(n, acc) {
      var a = n.c || acc;
      return '<div class="card" style="--a:' + a + '" data-open="' + n.id + '" tabindex="0" role="button" aria-label="Открыть: ' + esc(n.n) + '">' +
        tileHtml(n) +
        '<div class="t"><div class="name">' + esc(n.n) + '</div><div class="sub">' + summary(n) + '</div></div>' +
        (S.edit ? delHtml(n.id) : '<span class="chev">' + svg('chev', 20) + '</span>') + '</div>';
    }
    function thumbsHtml(n, addToo) {
      var h = '';
      (n.ph || []).forEach(function (id, i) {
        var u = photoUrl(id);
        h += u ? '<button class="th" data-view="' + n.id + ':' + i + '" style="background-image:url(' + u + ')" aria-label="Фото ' + (i + 1) + '"></button>'
               : '<div class="th wait"></div>';
      });
      if (addToo && (n.ph || []).length < MAXPH) h += '<button class="th add" data-addphoto="' + n.id + '">' + svg('cam', 22) + '<span>Фото</span></button>';
      return h;
    }

    function normalView(T) {
      var cur = T.cur, acc = T.acc;
      var conts = cur.ch.filter(function (c) { return c.t !== 'item'; });
      var items = cur.ch.filter(function (c) { return c.t === 'item'; });
      var allowed = ALLOW[cur.t];
      var type = S.addType && allowed.indexOf(S.addType) > -1 ? S.addType : allowed[0];
      var addLabel = cur.t === 'home' ? 'Добавить место' : cur.t === 'place' ? 'Добавить в место' : 'Добавить в коробку';

      var h = '<div class="head"><div class="h1row"><h1>' + esc(cur.n) + '</h1><button class="pen" data-edit="' + cur.id + '" aria-label="Изменить название">' + svg('pen', 18) + '</button></div><div class="stat">' + summary(cur) + '</div></div>';
      if (cur.t !== 'home') h += '<div class="strip" style="--a:' + acc + '">' + thumbsHtml(cur, true) + '</div>';
      h += '<div class="bar" style="--a:' + acc + '">' +
        ib('data-toggle-add', 'plus', addLabel, 'primary' + (S.adding ? ' on' : '')) +
        (cur.t !== 'home' ? ib('data-qr="' + cur.id + '"', 'qr', 'QR-этикетка') : '') +
        (conts.length ? ib('data-labels="' + cur.id + '"', 'sheet', 'Лист этикеток') : '') +
        (cur.ch.length ? ib('data-toggle-edit', S.edit ? 'check' : 'pen', S.edit ? 'Готово' : 'Править', S.edit ? 'on' : '') : '') +
        '</div>';

      if (S.adding) {
        h += '<form class="form" id="addForm" style="--a:' + acc + '">';
        if (allowed.length > 1) {
          h += '<div class="seg" role="group" aria-label="Что добавить">' + allowed.map(function (t) {
            return '<button type="button" data-type="' + t + '" class="' + (t === type ? 'on' : '') + '">' + TLABEL[t] + '</button>';
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
        h += '<div class="actions"><button class="btn primary" type="submit">Добавить</button><button class="btn" type="button" data-toggle-add>Отмена</button></div></form>';
      }

      if (conts.length) {
        if (cur.t === 'box') h += '<div class="list" style="gap:6px">' + conts.map(function (c) { return compactHtml(c, acc); }).join('') + '</div>';
        else h += '<div class="gridc">' + conts.map(function (c) { return gridHtml(c, acc); }).join('') + '</div>';
      }

      if (items.length) {
        h += '<div class="label">Вещи</div><div class="items" style="--a:' + acc + '">' + items.map(function (it) {
          var p = firstPhoto(it);
          return '<div class="row"><div class="rmain" data-sheet="' + it.id + '" tabindex="0" role="button" aria-label="Открыть: ' + esc(it.n) + '">' +
            (p ? '<div class="rthumb" style="background-image:url(' + p + ')"></div>' : '<div class="rthumb ini">' + esc(initial(it.n)) + '</div>') +
            '<div class="rtext"><div class="rname">' + esc(it.n) + '</div>' + metaHtml(it) + '</div></div>' +
            '<div class="step"><button data-step="' + it.id + '" data-d="-1" aria-label="Меньше">−</button><span class="qty">' + it.q + '</span><button data-step="' + it.id + '" data-d="1" aria-label="Больше">+</button></div>' +
            (S.edit ? delHtml(it.id) : '') + '</div>';
        }).join('') + '</div>';
      }

      if (!cur.ch.length && !S.adding) {
        if (cur.t === 'home') {
          h += '<div class="empty" style="--a:' + acc + '"><div class="eico">' + svg('place') + '</div><div>Пока нет ни одного места. Начните с кладовки, балкона или антресоли.</div><button class="btn primary" data-toggle-add>' + svg('plus', 18) + 'Добавить место</button><button class="btn" data-seed>Заполнить примером</button></div>';
        } else h += '<div class="empty" style="--a:' + acc + '"><div class="eico">' + svg(cur.t === 'place' ? 'box' : 'item') + '</div><div>Здесь пока пусто.</div><button class="btn primary" data-toggle-add>' + svg('plus', 18) + addLabel + '</button></div>';
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
      h += '<form class="form" id="catForm" style="--a:' + DEF + '"><input id="newCatName" type="text" autocomplete="off" placeholder="Новая категория, например: хрупкое" aria-label="Название категории">' +
        '<div class="actions"><button class="btn primary" type="submit">Добавить</button>' +
        (n ? ib('data-toggle-edit', S.edit ? 'check' : 'pen', S.edit ? 'Готово' : 'Править', S.edit ? 'on' : '') : '') + '</div></form>';
      if (!n) return h + '<div class="empty">Категории помогают отмечать вещи: хрупкое, зимнее, документы, на выброс. Создайте категорию здесь, потом выбирайте её в карточке вещи.</div>';
      return h + '<div class="list">' + settings.cats.map(function (c) {
        var cnt = catCount(c.id);
        if (S.edit) {
          var ask = S.conf === 'cat:' + c.id;
          return '<div class="card" style="--a:' + c.c + ';cursor:default"><div class="tile">' + svg('tag') + '</div>' +
            '<div class="t"><input class="field" data-catname="' + c.id + '" value="' + esc(c.n) + '" aria-label="Название категории"></div>' +
            '<button class="del' + (ask ? ' ask' : '') + '" data-delcat="' + c.id + '" aria-label="Удалить категорию">' + (ask ? 'Удалить?' : svg('x', 16)) + '</button></div>';
        }
        return '<div class="card" style="--a:' + c.c + '" data-cat="' + c.id + '" tabindex="0" role="button">' +
          '<div class="tile">' + svg('tag') + '</div>' +
          '<div class="t"><div class="name">#' + esc(c.n) + '</div><div class="sub">' + (cnt ? pl(cnt, W.item) : 'Нет вещей') + '</div></div>' +
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

    /* Категории при добавлении: выпадающий список с галочками и строкой «новая категория» */
    function ddSummary() {
      var names = S.addTags.map(catById).filter(Boolean).map(function (c) { return '#' + c.n; });
      return names.length ? names.join(', ') : 'Не выбрано';
    }
    function addCatsHtml() {
      var sel = S.addTags, h = '<div class="sec">Категории</div><div class="dd">' +
        '<button type="button" class="ddbtn" data-dd aria-haspopup="listbox" aria-expanded="' + S.dd + '"><span id="ddsum" class="ddsum">' + esc(ddSummary()) + '</span>' + svg('chevd', 20) + '</button>' +
        '<div class="ddlist" id="ddlist"' + (S.dd ? '' : ' hidden') + '>';
      h += settings.cats.map(function (c) {
        var on = sel.indexOf(c.id) > -1;
        return '<button type="button" class="ddrow' + (on ? ' on' : '') + '" role="option" style="--c:' + c.c + '" data-addtag="' + c.id + '" aria-selected="' + on + '"><span class="ddchk">' + svg('check', 16) + '</span><span class="ddname">#' + esc(c.n) + '</span></button>';
      }).join('');
      return h + '<div class="ddnew"><input id="fNewCat" type="text" autocomplete="off" placeholder="Новая категория" value="' + esc(S.draftCat) + '" aria-label="Новая категория">' +
        ib('data-ddadd', 'plus', 'Создать категорию', 'primary') + '</div></div></div>';
    }
    function catsBlock(n) {
      var on = n.tg || [];
      return '<div class="sec">Категории</div><div class="chips">' + settings.cats.map(function (c) {
        var sel = on.indexOf(c.id) > -1;
        return '<button type="button" class="chip' + (sel ? ' on' : '') + '" style="--c:' + c.c + '" data-tag="' + c.id + '" aria-pressed="' + sel + '">#' + esc(c.n) + '</button>';
      }).join('') + '</div>' +
        '<form class="inline" id="sCatForm"><input class="field" id="sCatName" type="text" autocomplete="off" placeholder="' + (settings.cats.length ? 'Новая категория' : 'Создайте первую категорию') + '" aria-label="Новая категория"><button class="btn" type="submit">Добавить</button></form>';
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
      var a = accOf(n.id), h = '<div class="scrim" data-close></div><div class="panel" role="dialog" aria-modal="true" style="--a:' + a + '">';
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
      } else if (sh.type === 'labels') {
        var kids = n.ch.filter(function (c) { return c.t !== 'item'; });
        h += head('Этикетки') +
          '<img class="labimg" alt="Лист этикеток" src="' + labelImage(kids) + '">' +
          '<div class="hint">Этикетки всех вложенных коробок и мест. Нажмите на картинку и удерживайте, чтобы сохранить.</div>' + qrControls();
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
    function renderSync() {
      var b = $('syncbar'); if (!b) return;
      var n = pendingCount(), html = '', st = '#42a5f5';
      var oldMs = dsince && n ? Date.now() - dsince : 0, days = Math.floor(oldMs / 86400000);
      if (net === 'auth') {
        st = '#e53935';
        html = '<span>Нет доступа к Home Assistant. ' + (env.reauth ? 'Введите токен заново.' : 'Войдите в Home Assistant заново.') + '</span>' + (env.reauth ? '<button class="mini2" data-reauth>Токен</button>' : '');
      } else if (net === 'offline') {
        st = '#ffa000';
        html = '<span>' + (n ? 'Нет связи. Изменения сохранены на устройстве: ' + n + '.' + (days >= 2 ? ' Не отправляются уже ' + days + ' дн., подключитесь к сети.' : '') : 'Нет связи. Приложение работает без сети.') + '</span><button class="mini2" data-sync>Повторить</button>';
        if (days >= 2) st = '#e53935';
      } else if (net === 'sync') {
        html = '<span>Синхронизация…</span>';
      } else if (n) {
        if (days >= 2) st = '#e53935';
        html = '<span>Ожидает отправки: ' + n + (days >= 2 ? '. Не уходит уже ' + days + ' дн.' : '') + '</span><button class="mini2" data-sync>Отправить</button>';
      } else if (S.stale) {
        html = '<span>Вышла новая версия панели.</span><button class="mini2" data-reload>Обновить</button>';
      }
      b.hidden = !html; b.style.setProperty('--st', st); b.innerHTML = html;
    }
    function render() {
      if (destroyed) return;
      $('menu').hidden = !(narrow && env.kind === 'panel');
      if (!loaded) { $('view').innerHTML = '<div class="head"><h1>Коробки</h1><div class="stat">Загружаю…</div></div>'; return; }
      if (!everSynced) {
        $('crumbs').innerHTML = ''; $('back').hidden = true;
        $('view').innerHTML = '<div class="head"><h1>Коробки</h1><div class="stat">' + (net === 'offline' ? 'Нет связи с Home Assistant' : net === 'auth' ? 'Нет доступа' : 'Загружаю данные…') + '</div></div>' +
          '<div class="empty"><div>При первом запуске нужна связь с Home Assistant: данные скачиваются на устройство. Дальше приложение работает и без сети.</div><button class="btn" data-sync>Повторить</button></div>';
        renderFoot(); renderSync();
        return;
      }
      var T = trail(), searching = S.q.trim() !== '';
      var finding = S.mode === 'find', onCats = (S.mode === 'cats' || S.mode === 'cat') && !searching;
      $('back').hidden = !(S.path.length || S.mode || searching);
      $('bnav').hidden = !(S.path.length || S.mode || searching);
      $('catsBtn').hidden = onCats;
      $('catsBtn').classList.toggle('on', S.mode === 'cats' || S.mode === 'cat');
      $('filtBtn').classList.toggle('on', finding);
      if (S.mode && (!searching || finding)) {
        var cc = S.mode === 'cat' ? catById(S.catId) : null;
        $('crumbs').innerHTML = S.mode === 'trash' ? '<span class="cur">Корзина</span>' : finding ? '<span class="cur">Фильтры</span>' : cc
          ? '<button class="crumb" data-catsroot>Категории</button><span class="chev">' + svg('chev', 14) + '</span><span class="cur">#' + esc(cc.n) + '</span>'
          : '<span class="cur">Категории</span>';
      } else {
        $('crumbs').innerHTML = T.nodes.map(function (n, i) {
          var last = i === T.nodes.length - 1;
          return last ? '<span class="cur">' + esc(n.n) + '</span>' : '<button class="crumb" data-crumb="' + i + '">' + esc(n.n) + '</button><span class="chev">' + svg('chev', 14) + '</span>';
        }).join('');
      }
      var crEl = $('crumbs'); crEl.scrollLeft = crEl.scrollWidth;
      $('view').innerHTML = ((searching || finding) ? findView() : S.mode === 'cats' ? catsView() : S.mode === 'cat' ? catView() : S.mode === 'trash' ? trashView() : normalView(T));
      renderFoot(); renderSync();
      var sh = $('sheet'), html = sheetHtml();
      sh.innerHTML = html; sh.hidden = !html;
      if (S.focus) { var f = $('fName'); if (f) f.focus(); S.focus = false; }
    }

    var toastT = null;
    function toast(msg) {
      var t = $('toast'); t.textContent = msg; t.hidden = false;
      clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600);
    }
    function addCatInline() {
      var inp = $('fNewCat'), f = $('fName') || $('fBulk');
      var c = addCat(inp && inp.value);
      if (!c) { if (inp) inp.focus(); return; }
      if (S.addTags.indexOf(c.id) < 0) S.addTags.push(c.id);
      S.draft = f ? f.value : S.draft; S.draftCat = ''; S.dd = true;
      save(); render();
    }
    sr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.id === 'fNewCat') { e.preventDefault(); addCatInline(); }
    });
    function toTop() { host.scrollTop = 0; try { window.scrollTo(0, 0); } catch (e) {} }
    function clearSearch() { S.q = ''; $('q').value = ''; }
    function goBack() {
      if (S.sheet) { closeSheet(); return; }
      if (S.q.trim()) { clearSearch(); render(); return; }
      S.adding = false; S.edit = false; S.conf = null;
      if (S.mode === 'cat') { S.mode = 'cats'; render(); toTop(); return; }
      if (S.mode === 'cats' || S.mode === 'trash' || S.mode === 'find') { S.mode = null; render(); toTop(); return; }
      if (S.path.length) { S.path.pop(); render(); toTop(); }
    }
    function goHome() {
      S.sheet = null; S.mode = null; S.path = []; S.adding = false; S.edit = false; S.conf = null; clearSearch(); render(); toTop();
    }
    function closeSheet() { S.sheet = S.sheet && S.sheet.back ? S.sheet.back : null; S.conf = null; render(); }

    function doDelete(id) {
      var n = findNode(root, id);
      if (!n) return;
      removeNode(root, id);
      S.sheet = null; save();
    }
    function removePhoto(nodeId, pid) {
      var n = findNode(root, nodeId);
      if (!n) return;
      n.ph = (n.ph || []).filter(function (p) { return p !== pid; });
      dropPhoto(pid); save();
      if (!n.ph.length) S.sheet = S.sheet.back || null;
      else S.sheet.idx = Math.min(S.sheet.idx, n.ph.length - 1);
    }

    /* --- переход по ссылке /korobki/<id> --- */
    function applyRoute(r, force) {
      if (!loaded) { pendingRoute = r; return; }
      var path = (r && r.path) || '';
      if (!force && path === lastRoutePath) return;
      lastRoutePath = path;
      var m = /^\/?([A-Za-z0-9]+)\/?$/.exec(path);
      if (!m) return;
      var id = m[1], p = id === 'root' ? [] : pathTo(root, id, []);
      if (!p) { toast('Этой коробки нет в данных'); return; }
      var n = findNode(root, id);
      S.adding = false; S.edit = false; S.conf = null; clearSearch();
      if (n.t === 'item') { S.path = p.slice(0, -1); S.sheet = { type: 'item', id: id }; }
      else { S.path = p; S.sheet = null; }
      render(); toTop();
    }

    /* --- события --- */
    sr.addEventListener('click', function (e) {
      var t = e.target, el;
      var q = function (sel) { return t.closest ? t.closest(sel) : null; };

      if (q('#menu')) { host.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true })); return; }
      if (q('[data-close]')) { closeSheet(); return; }
      if (q('#back') || q('[data-goback]')) { goBack(); return; }
      if (q('[data-home]')) { goHome(); return; }
      if (q('#filtBtn')) { S.mode = S.mode === 'find' ? null : 'find'; S.adding = false; S.edit = false; S.conf = null; render(); toTop(); return; }
      if (q('[data-trash]')) { S.sheet = null; S.mode = 'trash'; S.adding = false; S.edit = false; S.conf = null; clearSearch(); render(); toTop(); return; }
      if (q('[data-svc]')) { S.sheet = { type: 'svc', id: 'root', back: null }; S.conf = null; render(); loadSvc(); return; }
      if ((el = q('[data-emptytrash]'))) { if (S.conf === 'emptytrash') { emptyTrash(); S.conf = null; toast('Корзина очищена'); } else S.conf = 'emptytrash'; render(); return; }
      if ((el = q('[data-restore]'))) { var rn = recs[el.getAttribute('data-restore')]; restoreRec(el.getAttribute('data-restore')); toast('Возвращено: ' + (rn ? rn.n : '')); render(); return; }
      if (q('[data-export]')) { doExport(q('[data-export]').getAttribute('data-export') === '1'); return; }
      if (q('[data-saveexp]')) { saveExp(); return; }
      if (q('[data-pickimp]')) { $('impick').click(); return; }
      if (q('[data-doimport]')) { doImport(); return; }
      if (q('[data-cleanup]')) { doCleanup(); return; }
      if (q('[data-persist]')) { requestPersist(); setTimeout(loadSvc, 600); return; }
      if ((el = q('[data-move]'))) { S.sheet = { type: 'move', id: el.getAttribute('data-move'), back: S.sheet }; render(); return; }
      if ((el = q('[data-moveto]'))) { if (S.sheet) doMove(S.sheet.id, el.getAttribute('data-moveto')); return; }
      if ((el = q('[data-dup]'))) { doDup(el.getAttribute('data-dup')); return; }
      if ((el = q('[data-fcat]'))) { var fc = el.getAttribute('data-fcat'), fi = S.f.cats.indexOf(fc); if (fi > -1) S.f.cats.splice(fi, 1); else { S.f.cats.push(fc); S.f.nocat = false; } render(); return; }
      if (q('[data-fnocat]')) { S.f.nocat = !S.f.nocat; if (S.f.nocat) S.f.cats = []; render(); return; }
      if (q('[data-fnophoto]')) { S.f.nophoto = !S.f.nophoto; render(); return; }
      if (q('[data-freset]')) { S.f = { cats: [], nocat: false, nophoto: false, sort: 'path' }; render(); return; }
      if ((el = q('[data-bulk]'))) { var bf = $('fName') || $('fBulk'), bc = $('fNewCat'); S.draft = bf ? bf.value : ''; S.draftCat = bc ? bc.value : ''; S.bulk = el.checked; S.focus = true; render(); return; }
      if ((el = q('[data-keep]'))) { S.keep = el.checked; return; }
      if ((el = q('[data-setcolor]'))) {
        var cn = findNode(root, el.getAttribute('data-for')), cv = el.getAttribute('data-setcolor');
        if (cn) { if (cv) cn.c = cv; else delete cn.c; save(); render(); }
        return;
      }
      if (q('[data-sync]')) { sync(); return; }
      if (q('[data-reauth]') && env.reauth) { env.reauth(); return; }
      if (q('[data-logout]') && env.logout) { env.logout(); return; }
      if ((el = q('[data-themeset]')) && env.theme) { env.theme(el.getAttribute('data-themeset')); render(); return; }
      if (q('#catsBtn')) { S.mode = 'cats'; S.catId = null; S.edit = false; S.adding = false; S.conf = null; clearSearch(); render(); toTop(); return; }
      if (q('[data-reload]')) { location.reload(); return; }
      if ((el = q('[data-addtag]'))) {
        var at = el.getAttribute('data-addtag'), ai = S.addTags.indexOf(at);
        if (ai > -1) S.addTags.splice(ai, 1); else S.addTags.push(at);
        el.classList.toggle('on', ai < 0); el.setAttribute('aria-selected', String(ai < 0));
        var ds = $('ddsum'); if (ds) ds.textContent = ddSummary();
        return;
      }
      if (q('[data-dd]')) {
        S.dd = !S.dd; var dl = $('ddlist'); if (dl) dl.hidden = !S.dd;
        var db = q('[data-dd]'); db.setAttribute('aria-expanded', String(S.dd));
        return;
      }
      if (q('[data-ddadd]')) { addCatInline(); return; }
      if ((el = q('[data-tag]'))) {
        var tn = S.sheet && findNode(root, S.sheet.id), tid = el.getAttribute('data-tag');
        if (tn) {
          tn.tg = tn.tg || [];
          var ti = tn.tg.indexOf(tid);
          if (ti > -1) tn.tg.splice(ti, 1); else tn.tg.push(tid);
          el.classList.toggle('on', ti < 0); el.setAttribute('aria-pressed', String(ti < 0)); save();
        }
        return;
      }
      if ((el = q('[data-delcat]'))) {
        var cid = el.getAttribute('data-delcat');
        if (S.conf === 'cat:' + cid) { dropCat(cid); S.conf = null; save(); } else S.conf = 'cat:' + cid;
        render(); return;
      }
      if ((el = q('[data-del]'))) {
        var id = el.getAttribute('data-del');
        if (S.conf === id) { doDelete(id); S.conf = null; toast('Перенесено в корзину'); }
        else {
          S.conf = id;
          var dn = findNode(root, id), ds = dn && dn.t !== 'item' ? stats(dn) : null, dp = [];
          if (ds && ds.b) dp.push(pl(ds.b, W.box));
          if (ds && ds.i) dp.push(pl(ds.i, W.item));
          toast(dp.length ? 'Вместе с этим удалится: ' + dp.join(', ') + '. Вернуть можно из корзины.' : 'Нажмите ещё раз. Вернуть можно из корзины.');
        }
        render(); return;
      }
      if ((el = q('[data-delphoto]'))) {
        var pid = el.getAttribute('data-delphoto');
        if (S.conf === 'ph:' + pid) { removePhoto(S.sheet.id, pid); S.conf = null; } else S.conf = 'ph:' + pid;
        render(); return;
      }
      var hadConf = !!S.conf; S.conf = null;

      if ((el = q('[data-step]'))) {
        var n = findNode(root, el.getAttribute('data-step'));
        if (n) { n.q = Math.max(0, (n.q || 0) + Number(el.getAttribute('data-d'))); save(); }
        render();
      } else if (q('[data-seed]')) {
        root.ch = exampleChildren(); save(); render();
      } else if ((el = q('[data-qrmode]'))) {
        settings.qr = el.getAttribute('data-qrmode'); save(); render();
      } else if ((el = q('[data-edit]'))) {
        S.sheet = { type: 'node', id: el.getAttribute('data-edit'), back: null }; render();
      } else if ((el = q('[data-cat]'))) {
        S.mode = 'cat'; S.catId = el.getAttribute('data-cat'); S.edit = false; render(); toTop();
      } else if (q('[data-catsroot]')) {
        S.mode = 'cats'; render(); toTop();
      } else if ((el = q('[data-addphoto]'))) {
        S.pick = el.getAttribute('data-addphoto'); $('pick').click();
      } else if ((el = q('[data-view]'))) {
        var parts = el.getAttribute('data-view').split(':');
        S.sheet = { type: 'viewer', id: parts[0], idx: Number(parts[1]), back: S.sheet }; render();
      } else if ((el = q('[data-nav]'))) {
        var nn = findNode(root, S.sheet.id), len = nn && nn.ph ? nn.ph.length : 0;
        S.sheet.idx = Math.min(Math.max(0, S.sheet.idx + Number(el.getAttribute('data-nav'))), Math.max(0, len - 1)); render();
      } else if ((el = q('[data-qr]'))) {
        S.sheet = { type: 'qr', id: el.getAttribute('data-qr'), back: S.sheet && (S.sheet.type === 'item' || S.sheet.type === 'node') ? S.sheet : null }; render();
      } else if ((el = q('[data-labels]'))) {
        S.sheet = { type: 'labels', id: el.getAttribute('data-labels'), back: null }; render();
      } else if ((el = q('[data-sheet]'))) {
        S.sheet = { type: 'item', id: el.getAttribute('data-sheet'), back: null }; render();
      } else if ((el = q('[data-open]'))) {
        S.path.push(el.getAttribute('data-open')); S.adding = false; S.edit = false; clearSearch(); render(); toTop();
      } else if ((el = q('[data-hit]'))) {
        S.path = el.getAttribute('data-hit').split(',').filter(Boolean); S.adding = false; S.edit = false;
        var hid = el.getAttribute('data-hitid');
        S.mode = null; clearSearch(); S.sheet = hid ? { type: 'item', id: hid, back: null } : null; render(); toTop();
      } else if ((el = q('[data-crumb]'))) {
        S.mode = null; S.path = S.path.slice(0, Number(el.getAttribute('data-crumb'))); S.adding = false; S.edit = false; clearSearch(); render(); toTop();
      } else if (q('[data-toggle-add]')) {
        S.adding = !S.adding; S.draft = ''; S.draftCat = ''; S.addTags = []; S.addType = null; S.dd = false; S.focus = S.adding; render();
      } else if (q('[data-toggle-edit]')) {
        S.edit = !S.edit; render();
      } else if ((el = q('[data-type]'))) {
        var f = $('fName') || $('fBulk'), fc = $('fNewCat'); S.draft = f ? f.value : ''; S.draftCat = fc ? fc.value : ''; S.addType = el.getAttribute('data-type'); S.focus = true; render();
      } else if (hadConf) {
        render();
      }
    });

    sr.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.sheet) { closeSheet(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-open],[data-hit],[data-sheet],[data-cat]')) {
        e.preventDefault(); e.target.click();
      }
    });

    sr.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches && t.matches('[data-rename]')) {
        var n = findNode(root, t.getAttribute('data-rename')), v = t.value.trim();
        if (n && v) { n.n = v; save(); }
      } else if (t.matches && t.matches('[data-note]')) {
        var nn2 = findNode(root, t.getAttribute('data-note'));
        if (nn2) { nn2.note = t.value.trim(); save(); }
      } else if (t.matches && t.matches('[data-catname]')) {
        var cat = catById(t.getAttribute('data-catname')), cv = t.value.replace(/^#+/, '').trim();
        if (cat && cv) { cat.n = cv; save(); }
      } else if (t.matches && t.matches('[data-fsort]')) {
        S.f.sort = t.value; render();
      } else if (t.id === 'impick') {
        if (t.files && t.files[0]) readImport(t.files[0]);
        t.value = '';
      } else if (t.id === 'baseUrl') {
        settings.base = t.value.trim(); save(); render();
      }
    });

    sr.addEventListener('submit', function (e) {
      var fid = e.target.id;
      if (fid === 'catForm') {
        e.preventDefault();
        var inp = $('newCatName'), nc = addCat(inp.value);
        if (!nc) { inp.focus(); return; }
        save(); render(); return;
      }
      if (fid === 'sCatForm') {
        e.preventDefault();
        var itm = S.sheet && findNode(root, S.sheet.id), c2 = addCat($('sCatName').value);
        if (!itm || !c2) { $('sCatName').focus(); return; }
        itm.tg = itm.tg || [];
        if (itm.tg.indexOf(c2.id) < 0) itm.tg.push(c2.id);
        save(); render(); return;
      }
      if (fid !== 'addForm') return;
      e.preventDefault();
      var T = trail(), cur = T.cur, allowed = ALLOW[cur.t];
      var type = S.addType && allowed.indexOf(S.addType) > -1 ? S.addType : allowed[0];
      var nodes = [];
      if (type === 'item' && S.bulk) {
        var bx = $('fBulk');
        (bx.value || '').split(/\n+/).forEach(function (line) {
          line = line.trim(); if (!line) return;
          var m = /^(.*?)(?:\s+[xXхХ*]|\s*×)\s*(\d{1,4})$/.exec(line);
          if (m && m[1].trim()) nodes.push(I(m[1].trim(), Math.max(1, parseInt(m[2], 10))));
          else nodes.push(I(line, 1));
        });
        if (!nodes.length) { bx.focus(); return; }
      } else {
        var name = $('fName').value.trim();
        if (!name) { $('fName').focus(); return; }
        var node = type === 'item'
          ? I(name, Math.max(1, parseInt(($('fQty') || {}).value, 10) || 1))
          : (type === 'place' ? P(name, null, []) : B(name, []));
        if (type === 'place') {
          var pal = ['#ffc107', '#03a9f4', '#9c27b0', '#f44336', '#4caf50', '#00bcd4', '#ff7043'];
          node.c = pal[cur.ch.length % pal.length];
        }
        nodes.push(node);
      }
      if (type === 'item') {
        var tags = S.addTags.filter(function (t) { return catById(t); });
        var fresh = addCat(($('fNewCat') || {}).value);
        if (fresh && tags.indexOf(fresh.id) < 0) tags.push(fresh.id);
        nodes.forEach(function (nd) { nd.tg = tags.slice(); });
        S.addTags = S.keep ? tags : [];
      }
      nodes.forEach(function (nd) { cur.ch.push(nd); });
      if (type === 'item' && S.keep) { S.draft = ''; S.draftCat = ''; S.focus = true; toast('Добавлено: ' + nodes.length); }
      else { S.adding = false; S.draft = ''; S.draftCat = ''; S.addTags = []; S.addType = null; S.dd = false; }
      save(); render();
    });

    $('pick').addEventListener('change', function () {
      var files = Array.prototype.slice.call(this.files || []), node = S.pick ? findNode(root, S.pick) : null;
      this.value = '';
      if (!node || !files.length) return;
      files = files.slice(0, Math.max(0, MAXPH - (node.ph || []).length));
      if (!files.length) { toast('К одной позиции можно добавить до ' + MAXPH + ' фото'); return; }
      var pending = files.length, failed = 0;
      files.forEach(function (f) {
        addPhotoLocal(f).then(function (pid) {
          if (pid) node.ph = (node.ph || []).concat(pid); else failed++;
          if (--pending === 0) {
            if (failed) toast('Не удалось обработать фото: ' + failed);
            save(); render();
          }
        });
      });
    });

    $('q').addEventListener('input', function () { S.q = this.value; S.conf = null; render(); });

    function onVisible() {
      if (document.hidden) doPersist(); else scheduleSync(200);
    }
    function onOnline() { scheduleSync(300); }
    function onOffline() { net = 'offline'; renderSync(); }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pagehide', doPersist);

    /* --- запуск: сначала данные с устройства, потом синхронизация --- */
    function afterDb() {
      if (booted) return;
      booted = true; clearTimeout(bootT);
      dbGet('kv', 'state', function (st) {
        if (st && st.recs) {
          recs = st.recs; dirty = {};
          (st.dirty || []).forEach(function (i) { dirty[i] = 1; });
          upq = st.upq || []; delq = st.delq || []; since = st.since || 0; device = st.device || ''; everSynced = !!st.synced; dsince = st.dsince || 0;
        }
        if (!device) device = uid() + uid();
        buildTree(); loaded = true; render(); requestPersist();
        if (pendingRoute) { var pr = pendingRoute; pendingRoute = null; applyRoute(pr, true); }
        sync();
        pollT = setInterval(function () { if (!document.hidden) sync(); }, env.kind === 'pwa' ? 45000 : 90000);
        if (env.subscribe) {
          try { env.subscribe(function () { scheduleSync(300); }).then(function (u) { if (destroyed) u(); else unsub = u; }).catch(function () {}); } catch (e) {}
        }
      });
    }
    render();
    var bootT = setTimeout(function () { memOnly = true; afterDb(); }, 3000);
    dbOpen(function (ok) { if (!ok) memOnly = true; afterDb(); });

    return {
      setNarrow: function (v) { narrow = !!v; render(); },
      route: function (r) { applyRoute(r, false); },
      destroy: function () {
        destroyed = true; clearTimeout(syncT); clearTimeout(bootT); clearInterval(pollT);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('pagehide', doPersist);
        if (unsub) { try { unsub(); } catch (e) {} }
        doPersist();
      }
    };
  }

  /* ---------- Подключение к Home Assistant из панели ---------- */
  function hassEnv(getHass) {
    return {
      kind: 'panel',
      request: function (method, path, body, type, signal) {
        var init = { method: method, headers: {} };
        if (signal) init.signal = signal;
        if (body != null) {
          if (typeof Blob !== 'undefined' && body instanceof Blob) { init.body = body; init.headers['Content-Type'] = type || 'image/jpeg'; }
          else { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
        }
        return getHass().fetchWithAuth(path, init);
      },
      subscribe: function (cb) {
        var c = getHass().connection;
        return c && c.subscribeEvents ? c.subscribeEvents(function () { cb(); }, 'korobki_updated') : Promise.resolve(function () {});
      }
    };
  }

  /* ---------- Веб-компонент панели ---------- */
  class KorobkiPanel extends HTMLElement {
    constructor() {
      super();
      this._hass = null; this._narrow = false; this._route = null; this._api = null; this._transport = null;
      this.attachShadow({ mode: 'open' });
    }
    set hass(h) {
      var first = !this._hass;
      this._hass = h;
      if (first && !this._transport && !this._api) this._boot();
    }
    get hass() { return this._hass; }
    set transport(t) { this._transport = t; if (!this._api) this._boot(); }
    set narrow(v) { this._narrow = !!v; if (this._api) this._api.setNarrow(this._narrow); }
    set route(r) { this._route = r; if (this._api) this._api.route(r); }
    set panel(p) { this._panel = p; }
    _boot() {
      var self = this;
      this.shadowRoot.innerHTML = HTML;
      var env = this._transport || hassEnv(function () { return self._hass; });
      this._api = createApp(this, this.shadowRoot, env);
      if (this._narrow) this._api.setNarrow(true);
      if (this._route) this._api.route(this._route);
    }
    disconnectedCallback() {
      if (this._api) { this._api.destroy(); this._api = null; this._hass = null; }
    }
  }
  if (!customElements.get('korobki-panel')) customElements.define('korobki-panel', KorobkiPanel);
})();
