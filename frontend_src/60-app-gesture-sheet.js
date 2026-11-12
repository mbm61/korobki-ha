    /* Жест 1: шторка (карточка вещи и др.) закрывается свайпом вниз */
    (function () {
      var sh = $('sheet'), t0 = null, panel = null, dy = 0, tm = 0;
      sh.addEventListener('touchstart', function (e) {
        panel = e.target.closest ? e.target.closest('.panel') : null;
        if (!panel || e.touches.length !== 1 || panel.scrollTop > 0) { panel = null; return; }
        t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; dy = 0; tm = Date.now(); panel.style.transition = 'none';
      }, { passive: true });
      sh.addEventListener('touchmove', function (e) {
        if (!panel || !t0) return;
        var d = e.touches[0].clientY - t0.y, dx = Math.abs(e.touches[0].clientX - t0.x);
        if (d <= 0 || (dx > d && dy === 0)) { if (dy === 0) { panel.style.transition = ''; panel = null; } else { dy = 0; panel.style.transform = ''; } return; }
        if (panel.scrollTop > 0) return;
        dy = d; panel.style.transform = 'translateY(' + d + 'px)';
        var sc = sh.querySelector('.scrim'); if (sc) sc.style.opacity = String(Math.max(0, 1 - d / 500));
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      function end() {
        if (!panel) return;
        var p = panel, d = dy, fast = d / Math.max(1, Date.now() - tm) > 0.6; panel = null; t0 = null; dy = 0;
        p.style.transition = 'transform .2s ease';
        if (d > 110 || (fast && d > 40)) { p.style.transform = 'translateY(105%)'; setTimeout(closeSheet, 190); }
        else { p.style.transform = ''; var sc = sh.querySelector('.scrim'); if (sc) sc.style.opacity = ''; }
      }
      sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
    })();

