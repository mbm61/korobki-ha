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

