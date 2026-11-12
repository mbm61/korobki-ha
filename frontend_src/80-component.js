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
