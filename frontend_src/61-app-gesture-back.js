    /* Жест 2 (приложение): свайп слева направо на карточках фильтров и категорий = «Назад» (страница едет за пальцем).
       На экранах места и коробки этот же жест листает к предыдущему месту или коробке (жест 3) */
    if (env.kind === 'pwa') (function () {
      var wrap = sr.querySelector('.wrap'), st = null, locked = false, dx = 0, tm = 0;
      function can() { return !S.sheet && !!(S.mode || S.q.trim()); }
      host.addEventListener('touchstart', function (e) {
        st = null; locked = false; dx = 0;
        if (e.touches.length !== 1 || !can()) return;
        if (e.target && e.target.closest && e.target.closest('input, textarea, select, [data-nav]')) return;
        st = { x: e.touches[0].clientX, y: e.touches[0].clientY }; tm = Date.now(); wrap.style.transition = 'none';
      }, { passive: true });
      host.addEventListener('touchmove', function (e) {
        if (!st) return;
        var mx = e.touches[0].clientX - st.x, my = e.touches[0].clientY - st.y;
        if (!locked) {
          if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
          if (mx > 0 && Math.abs(mx) > Math.abs(my)) locked = true; else { st = null; wrap.style.transition = ''; return; }
        }
        dx = Math.max(0, mx);
        wrap.style.transform = 'translateX(' + dx + 'px)'; wrap.style.boxShadow = '-8px 0 24px rgba(0,0,0,.18)';
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      function end() {
        if (!st) return;
        var d = dx, fast = d / Math.max(1, Date.now() - tm) > 0.5, w = window.innerWidth; st = null;
        wrap.style.transition = 'transform .18s ease';
        if (locked && (d > w * 0.25 || (fast && d > 40))) {
          wrap.style.transform = 'translateX(' + w + 'px)';
          setTimeout(function () {
            goBack(); wrap.style.transition = 'none'; wrap.style.transform = 'translateX(-30px)'; wrap.style.opacity = '.6'; wrap.style.boxShadow = '';
            requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.style.transition = 'transform .18s ease, opacity .18s ease'; wrap.style.transform = ''; wrap.style.opacity = ''; }); });
          }, 170);
        } else { wrap.style.transform = ''; wrap.style.boxShadow = ''; }
        locked = false; dx = 0;
      }
      host.addEventListener('touchend', end); host.addEventListener('touchcancel', end);
    })();

    /* Жест 3: на экране места или коробки свайп листает соседние. Справа налево (палец влево) = следующее,
       слева направо = предыдущее; по кругу. На главной не работает, на фильтрах и категориях тоже (там свой «назад») */
    (function () {
      var wrap = sr.querySelector('.wrap'), st = null, locked = false, nextPath = null, dir = 0, dx = 0, tm = 0;
      function target(d) {
        if (S.sheet || S.mode || S.q.trim() || S.adding || !S.path.length) return null;
        var T = trail(), cur = T.cur, parent = T.nodes[T.nodes.length - 2];
        if (!parent) return null;
        var sibs = (parent.ch || []).filter(function (x) { return x.t === cur.t; });
        if (sibs.length < 2) return null;
        var i = sibs.indexOf(cur), next = sibs[(i + d + sibs.length) % sibs.length];
        return S.path.slice(0, -1).concat(next.id);
      }
      host.addEventListener('touchstart', function (e) {
        st = null; locked = false; dx = 0;
        if (e.touches.length !== 1) return;
        if (e.target && e.target.closest && e.target.closest('input, textarea, select, [data-nav], #crumbs, #sheet')) return;
        st = { x: e.touches[0].clientX, y: e.touches[0].clientY }; tm = Date.now();
      }, { passive: true });
      /* Карточка едет за пальцем */
      host.addEventListener('touchmove', function (e) {
        if (!st || e.touches.length !== 1) return;
        var mx = e.touches[0].clientX - st.x, my = e.touches[0].clientY - st.y;
        if (!locked) {
          if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
          if (Math.abs(mx) > Math.abs(my)) {
            dir = mx < 0 ? 1 : -1;
            nextPath = target(dir);
            if (!nextPath) { st = null; return; }
            locked = true; wrap.style.transition = 'none';
          } else { st = null; return; }
        }
        dx = mx;
        wrap.style.transform = 'translateX(' + dx + 'px)';
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      function end() {
        if (!st) return;
        var was = locked, path = nextPath, sgn = dir, d = Math.abs(dx), fast = d / Math.max(1, Date.now() - tm) > 0.5, w = window.innerWidth;
        st = null; locked = false; dx = 0; nextPath = null;
        if (!was) return;
        if (d > w * 0.25 || (fast && d > 40)) {
          wrap.style.transition = 'transform .18s ease';
          wrap.style.transform = 'translateX(' + (-sgn * w) + 'px)';
          setTimeout(function () {
            S.path = path; S.conf = null; render(); toTop();
            wrap.style.transition = 'none'; wrap.style.transform = 'translateX(' + (sgn * 40) + 'px)'; wrap.style.opacity = '.6';
            requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.style.transition = 'transform .18s ease, opacity .18s ease'; wrap.style.transform = ''; wrap.style.opacity = ''; }); });
          }, 170);
        } else {
          wrap.style.transition = 'transform .18s ease'; wrap.style.transform = '';
        }
      }
      host.addEventListener('touchend', end); host.addEventListener('touchcancel', end);
    })();

    /* Жест 4: свайп вверх, начатый у нижнего края (у кнопок «Домой» и «Назад») = на главный экран.
       Не работает на карточке вещи и на фотографии, на главной не нужен */
    (function () {
      var st = null;
      host.addEventListener('touchstart', function (e) {
        st = null;
        if (e.touches.length !== 1) return;
        if (e.touches[0].clientY < window.innerHeight - 140) return;
        st = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }, { passive: true });
      host.addEventListener('touchend', function (e) {
        if (!st || !e.changedTouches || !e.changedTouches.length) { st = null; return; }
        var dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y;
        st = null;
        if (-dy < 60 || Math.abs(dx) > Math.abs(dy) * 0.6) return;
        if (S.sheet && (S.sheet.type === 'item' || S.sheet.type === 'viewer')) return;
        if (!S.path.length && !S.mode && !S.q.trim() && !S.sheet) return;
        goHome();
      }, { passive: true });
    })();

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

