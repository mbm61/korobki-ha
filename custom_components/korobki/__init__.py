"""Коробки: учёт вещей (дом -> кладовки -> коробки -> вещи) в Home Assistant.

Что делает интеграция:
- хранит дерево вещей в .storage/korobki (через helpers.storage.Store);
- отдаёт его панели по websocket (korobki/get, korobki/save);
- хранит фото в папке <config>/korobki_photos и отдаёт их через /api/korobki/photo;
- добавляет в боковое меню панель «Коробки».

Подключение: в configuration.yaml добавить строку  korobki:  и перезапустить HA.
"""
from __future__ import annotations

import json
import logging
import re
import secrets
from pathlib import Path

from aiohttp import web
import voluptuous as vol

from homeassistant.components import panel_custom, websocket_api
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "korobki"
STORAGE_VERSION = 1
EVENT_UPDATED = "korobki_updated"

PANEL_URL_PATH = "korobki"
STATIC_URL = "/korobki_static/korobki-panel.js"

PHOTO_ID_RE = re.compile(r"^[0-9a-f]{16}$")
MAX_PHOTO_BYTES = 6_000_000

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Запуск интеграции."""
    store: Store = Store(hass, STORAGE_VERSION, DOMAIN)
    data = await store.async_load() or {}
    # rev растёт при каждом сохранении, по нему панель замечает правки с другого устройства
    data.setdefault("rev", 0)
    data.setdefault("root", None)
    data.setdefault("settings", {})

    photo_dir = Path(hass.config.path("korobki_photos"))
    await hass.async_add_executor_job(
        lambda: photo_dir.mkdir(parents=True, exist_ok=True)
    )

    # версия берётся из manifest.json: одна правка там обновляет и кэш панели, и проверку в панели
    manifest = json.loads(
        await hass.async_add_executor_job(
            (Path(__file__).parent / "manifest.json").read_text, "utf-8"
        )
    )
    version = str(manifest.get("version", "0"))

    hass.data[DOMAIN] = {
        "store": store,
        "data": data,
        "photo_dir": photo_dir,
        "version": version,
    }

    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_save)

    hass.http.register_view(PhotoCollectionView(hass, photo_dir))
    hass.http.register_view(PhotoView(hass, photo_dir))
    hass.http.register_view(PhotoThumbView(hass, photo_dir))

    js_path = Path(__file__).parent / "frontend" / "korobki-panel.js"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(js_path), False)]
    )
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="korobki-panel",
        frontend_url_path=PANEL_URL_PATH,
        module_url=f"{STATIC_URL}?v={version}",
        sidebar_title="Коробки",
        sidebar_icon="mdi:package-variant-closed",
        require_admin=False,
    )
    _LOGGER.debug("Коробки: панель зарегистрирована")
    return True


# ---------- websocket ----------


@websocket_api.websocket_command({vol.Required("type"): "korobki/get"})
@callback
def ws_get(hass: HomeAssistant, connection, msg) -> None:
    """Отдать дерево целиком."""
    d = hass.data[DOMAIN]["data"]
    connection.send_result(
        msg["id"],
        {
            "rev": d["rev"],
            "root": d["root"],
            "settings": d.get("settings", {}),
            "version": hass.data[DOMAIN]["version"],
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "korobki/save",
        vol.Required("rev"): int,
        vol.Required("root"): dict,
        vol.Optional("settings"): dict,
    }
)
@websocket_api.async_response
async def ws_save(hass: HomeAssistant, connection, msg) -> None:
    """Сохранить дерево. Если ревизия устарела, вернуть актуальные данные."""
    store: Store = hass.data[DOMAIN]["store"]
    d = hass.data[DOMAIN]["data"]

    if msg["rev"] != d["rev"]:
        connection.send_result(
            msg["id"],
            {
                "ok": False,
                "rev": d["rev"],
                "root": d["root"],
                "settings": d.get("settings", {}),
            },
        )
        return

    d["rev"] += 1
    d["root"] = msg["root"]
    if "settings" in msg:
        d["settings"] = msg["settings"]
    await store.async_save(d)
    hass.bus.async_fire(EVENT_UPDATED, {"rev": d["rev"]})
    connection.send_result(msg["id"], {"ok": True, "rev": d["rev"]})


# ---------- фото ----------


def _is_jpeg(body: bytes) -> bool:
    return body[:3] == b"\xff\xd8\xff"


def _photo_response(body: bytes) -> web.Response:
    return web.Response(
        body=body,
        content_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


class _PhotoBase(HomeAssistantView):
    """Общая часть: путь к файлу и чтение/запись в потоке-исполнителе."""

    requires_auth = True

    def __init__(self, hass: HomeAssistant, photo_dir: Path) -> None:
        self._hass = hass
        self._dir = photo_dir

    def _file(self, photo_id: str, thumb: bool = False) -> Path:
        return self._dir / f"{photo_id}{'_t' if thumb else ''}.jpg"


class PhotoCollectionView(_PhotoBase):
    """POST /api/korobki/photo: загрузить основное фото (JPEG в теле запроса)."""

    url = "/api/korobki/photo"
    name = "api:korobki:photo_new"

    async def post(self, request: web.Request) -> web.Response:
        body = await request.read()
        if not body or len(body) > MAX_PHOTO_BYTES or not _is_jpeg(body):
            return self.json_message("Нужен JPEG до 6 МБ", 400)
        photo_id = secrets.token_hex(8)
        await self._hass.async_add_executor_job(
            self._file(photo_id).write_bytes, body
        )
        return self.json({"id": photo_id})


class PhotoView(_PhotoBase):
    """GET или DELETE /api/korobki/photo/<id>: основное фото."""

    url = "/api/korobki/photo/{photo_id}"
    name = "api:korobki:photo"

    async def get(self, request: web.Request, photo_id: str) -> web.Response:
        if not PHOTO_ID_RE.match(photo_id):
            return self.json_message("Неверный id", 400)
        path = self._file(photo_id)
        try:
            body = await self._hass.async_add_executor_job(path.read_bytes)
        except OSError:
            return self.json_message("Не найдено", 404)
        return _photo_response(body)

    async def delete(self, request: web.Request, photo_id: str) -> web.Response:
        if not PHOTO_ID_RE.match(photo_id):
            return self.json_message("Неверный id", 400)

        def _remove() -> None:
            self._file(photo_id).unlink(missing_ok=True)
            self._file(photo_id, thumb=True).unlink(missing_ok=True)

        await self._hass.async_add_executor_job(_remove)
        return self.json({"ok": True})


class PhotoThumbView(_PhotoBase):
    """GET или PUT /api/korobki/photo/<id>/thumb: миниатюра."""

    url = "/api/korobki/photo/{photo_id}/thumb"
    name = "api:korobki:photo_thumb"

    async def get(self, request: web.Request, photo_id: str) -> web.Response:
        if not PHOTO_ID_RE.match(photo_id):
            return self.json_message("Неверный id", 400)
        # если миниатюры нет, отдаём основное фото
        for path in (self._file(photo_id, thumb=True), self._file(photo_id)):
            try:
                body = await self._hass.async_add_executor_job(path.read_bytes)
            except OSError:
                continue
            return _photo_response(body)
        return self.json_message("Не найдено", 404)

    async def put(self, request: web.Request, photo_id: str) -> web.Response:
        if not PHOTO_ID_RE.match(photo_id):
            return self.json_message("Неверный id", 400)
        if not await self._hass.async_add_executor_job(self._file(photo_id).exists):
            return self.json_message("Нет такого фото", 404)
        body = await request.read()
        if not body or len(body) > MAX_PHOTO_BYTES or not _is_jpeg(body):
            return self.json_message("Нужен JPEG до 6 МБ", 400)
        await self._hass.async_add_executor_job(
            self._file(photo_id, thumb=True).write_bytes, body
        )
        return self.json({"ok": True})
