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

