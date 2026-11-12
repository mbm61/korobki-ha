"""Фото: загрузка, выдача и удаление."""
from __future__ import annotations

import secrets
from pathlib import Path

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import MAX_PHOTO_BYTES, PHOTO_ID_RE


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

    cors_allowed = True  # локальный и внешний адреса — разные источники для браузера
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
        await self._hass.async_add_executor_job(self._file(photo_id).write_bytes, body)
        return self.json({"id": photo_id})


class PhotoView(_PhotoBase):
    """GET, PUT или DELETE /api/korobki/photo/<id>: основное фото."""

    url = "/api/korobki/photo/{photo_id}"
    name = "api:korobki:photo"

    async def get(self, request: web.Request, photo_id: str) -> web.Response:
        if not PHOTO_ID_RE.match(photo_id):
            return self.json_message("Неверный id", 400)
        try:
            body = await self._hass.async_add_executor_job(self._file(photo_id).read_bytes)
        except OSError:
            return self.json_message("Не найдено", 404)
        return _photo_response(body)

    async def put(self, request: web.Request, photo_id: str) -> web.Response:
        """Загрузка фото с заранее известным id (приложение делало его без связи)."""
        if not PHOTO_ID_RE.match(photo_id):
            return self.json_message("Неверный id", 400)
        body = await request.read()
        if not body or len(body) > MAX_PHOTO_BYTES or not _is_jpeg(body):
            return self.json_message("Нужен JPEG до 6 МБ", 400)
        await self._hass.async_add_executor_job(self._file(photo_id).write_bytes, body)
        return self.json({"ok": True})

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
        await self._hass.async_add_executor_job(self._file(photo_id, thumb=True).write_bytes, body)
        return self.json({"ok": True})
