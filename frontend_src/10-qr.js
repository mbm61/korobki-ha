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

