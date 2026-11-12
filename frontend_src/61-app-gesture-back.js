    /* Жест 2 (приложение): свайп от левого края вправо = «Назад», страница сдвигается за пальцем */
    if (env.kind === 'pwa') (function () {
      var wrap = sr.querySelector('.wrap'), st = null, locked = false, dx = 0, tm = 0;
      function can() { return !S.sheet && !!(S.path.length || S.mode || S.q.trim()); }
      host.addEventListener('touchstart', function (e) {
        st = null; locked = false; dx = 0;
        if (e.touches.length !== 1 || e.touches[0].clientX > window.innerWidth / 2 || !can()) return;
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

