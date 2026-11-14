    /* Жест 1: шторка (карточка вещи и др.) закрывается свайпом вниз (от начала списка) или вверх (от конца списка) */
    (function () {
      var sh = $('sheet'), t0 = null, panel = null, mode = 0, dy = 0, tm = 0;
      function setScrim(d) { var sc = sh.querySelector('.scrim'); if (sc) sc.style.opacity = String(Math.max(0, 1 - Math.abs(d) / 500)); }
      sh.addEventListener('touchstart', function (e) {
        panel = e.target.closest ? e.target.closest('.panel') : null;
        if (!panel || e.touches.length !== 1) { panel = null; return; }
        t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; dy = 0; mode = 0; tm = Date.now();
      }, { passive: true });
      sh.addEventListener('touchmove', function (e) {
        if (!panel || !t0 || e.touches.length !== 1) return;
        var d = e.touches[0].clientY - t0.y, dx = Math.abs(e.touches[0].clientX - t0.x);
        if (!mode) {
          if (Math.abs(d) < 8) return;
          if (dx > Math.abs(d)) { panel = null; return; }
          var atTop = panel.scrollTop <= 0, atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2;
          if (d > 0 && atTop) mode = 1; else if (d < 0 && atBottom) mode = -1;
          else { panel = null; return; }
          panel.style.transition = 'none';
        }
        dy = mode > 0 ? Math.max(0, d) : Math.min(0, d);
        panel.style.transform = 'translateY(' + dy + 'px)';
        setScrim(dy);
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      function end() {
        if (!panel) return;
        var p = panel, m = mode, d = Math.abs(dy), fast = d / Math.max(1, Date.now() - tm) > 0.6;
        panel = null; t0 = null; mode = 0; dy = 0;
        if (!m) return;
        p.style.transition = 'transform .2s ease';
        if (d > 110 || (fast && d > 40)) { p.style.transform = 'translateY(' + (m > 0 ? '105%' : '-105%') + ')'; setTimeout(closeSheet, 190); }
        else { p.style.transform = ''; var sc = sh.querySelector('.scrim'); if (sc) sc.style.opacity = ''; }
      }
      sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
    })();

