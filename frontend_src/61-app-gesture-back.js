    /* Жест 2 (приложение): свайп от левого края вправо = «Назад», страница сдвигается за пальцем */
    if (env.kind === 'pwa') (function () {
      var wrap = sr.querySelector('.wrap'), st = null, locked = false, dx = 0, tm = 0;
      function can() { return !S.sheet && !!(S.path.length || S.mode || S.q.trim()); }
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

    /* Жест 3: свайп справа налево перелистывает. Главная и место: следующее место (после последнего снова первое).
       Внутри коробки: следующая коробка того же места (после последней снова первая). Назад — свайп вправо (жест 2) */
    (function () {
      var wrap = sr.querySelector('.wrap'), st = null, tm = 0;
      function target() {
        if (S.sheet || S.mode || S.q.trim() || S.adding) return null;
        var T = trail(), cur = T.cur;
        if (cur.t === 'home') {
          var places = (root.ch || []).filter(function (x) { return x.t === 'place'; });
          return places.length ? [places[0].id] : null;
        }
        var parent = T.nodes[T.nodes.length - 2];
        if (!parent) return null;
        var sibs = (parent.ch || []).filter(function (x) { return x.t === cur.t; });
        if (sibs.length < 2) return null;
        var next = sibs[(sibs.indexOf(cur) + 1) % sibs.length];
        return S.path.slice(0, -1).concat(next.id);
      }
      host.addEventListener('touchstart', function (e) {
        st = null;
        if (e.touches.length !== 1) return;
        if (e.target && e.target.closest && e.target.closest('input, textarea, select, [data-nav], #crumbs, #sheet')) return;
        st = { x: e.touches[0].clientX, y: e.touches[0].clientY }; tm = Date.now();
      }, { passive: true });
      host.addEventListener('touchend', function (e) {
        if (!st || !e.changedTouches || !e.changedTouches.length) { st = null; return; }
        var dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y;
        st = null;
        if (-dx < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        var path = target();
        if (!path) return;
        S.path = path; S.conf = null; render(); toTop();
        if (wrap) {
          wrap.style.transition = 'none'; wrap.style.transform = 'translateX(40px)'; wrap.style.opacity = '.6';
          requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.style.transition = 'transform .18s ease, opacity .18s ease'; wrap.style.transform = ''; wrap.style.opacity = ''; }); });
        }
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

