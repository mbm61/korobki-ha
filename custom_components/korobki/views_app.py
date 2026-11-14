"""Страница установленного приложения и скрипт панели."""
from __future__ import annotations

from pathlib import Path

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN, STATIC_URL

APP_FILES = {
    "index.html": "text/html",
    "sw.js": "application/javascript",
    "manifest.json": "application/manifest+json",
    "icon-192.png": "image/png",
    "icon-512.png": "image/png",
    "apple-touch-icon.png": "image/png",
}


class AppView(HomeAssistantView):
    """Файлы установленного приложения: /korobki_app/, /korobki_app/index.html, sw.js и так далее.

    Каждый файл отдаётся явно, папка целиком не раздаётся (адрес папки Home Assistant отдаёт как 403).
    Вход не нужен, как и для любого файла интерфейса: данные защищены токеном в API.
    """

    cors_allowed = True  # локальный и внешний адреса — разные источники для браузера
    url = "/korobki_app/{filename}"
    extra_urls = ["/korobki_app/", "/korobki_app"]
    name = "korobki:app"
    requires_auth = False

    def __init__(self, hass: HomeAssistant, folder: Path) -> None:
        self._hass = hass
        self._folder = folder

    async def get(self, request: web.Request, filename: str = "index.html") -> web.Response:
        filename = filename or "index.html"
        ctype = APP_FILES.get(filename)
        if ctype is None:
            return self.json_message("Не найдено", 404)
        try:
            body = await self._hass.async_add_executor_job((self._folder / filename).read_bytes)
        except OSError:
            return self.json_message("Не найдено", 404)
        headers = {"Cache-Control": "no-cache"}
        if filename == "sw.js":
            headers["Service-Worker-Allowed"] = "/korobki_app/"
            headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            # версия в тексте воркера: с каждым релизом файл меняется, и браузер ставит новый воркер
            version = str(self._hass.data.get(DOMAIN, {}).get("version", "dev"))
            body = body.replace(b"__KOROBKI_VERSION__", version.encode("utf-8"))
        return web.Response(body=body, content_type=ctype, headers=headers)


class PanelJsView(HomeAssistantView):
    """Скрипт панели. В него подставляется версия из manifest.json, поэтому версия задаётся только в одном месте."""

    url = STATIC_URL
    name = "korobki:panel_js"
    requires_auth = False

    def __init__(self, hass: HomeAssistant, path: Path, version: str) -> None:
        self._hass = hass
        self._path = path
        self._version = version

    async def get(self, request: web.Request) -> web.Response:
        text = await self._hass.async_add_executor_job(self._path.read_text, "utf-8")
        return web.Response(
            body=text.replace("__KOROBKI_VERSION__", self._version).encode("utf-8"),
            content_type="application/javascript", charset="utf-8",
            headers={"Cache-Control": "no-cache"},
        )
