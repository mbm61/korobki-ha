"""Резервные копии по расписанию: файл в /config/korobki_backups, проверка чтением, уведомление при ошибке.

Формат файла тот же, что у «Скачать копию» в Сервисе (app, format, version, created, recs), поэтому
любой такой файл можно выбрать в Сервисе → «Восстановление». Фото в копию не входят: они лежат на диске
в korobki_photos и входят в обычную резервную копию Home Assistant.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_time_interval

from .const import BACKUP_DIR, BACKUP_HOURS, BACKUP_KEEP, DOMAIN

_LOGGER = logging.getLogger(__name__)
NOTIFY_ID = "korobki_backup_failed"
EVENT_BACKUP_FAILED = "korobki_backup_failed"
PREFIX = "korobki-auto-"


def _list(folder: Path) -> list[dict]:
    """Файлы автокопий, новые первыми."""
    out = []
    for f in folder.glob(PREFIX + "*.json"):
        try:
            st = f.stat()
        except OSError:
            continue
        out.append({"name": f.name, "size": st.st_size, "t": int(st.st_mtime * 1000)})
    out.sort(key=lambda x: x["t"], reverse=True)
    return out


def _write(folder: Path, payload: bytes, name: str, expect: int, keep: int) -> dict:
    """Пишет копию через временный файл, читает обратно и сверяет число записей, затем чистит старые."""
    folder.mkdir(parents=True, exist_ok=True)
    tmp, final = folder / (name + ".tmp"), folder / name
    tmp.write_bytes(payload)
    back = json.loads(tmp.read_text("utf-8"))
    if back.get("app") != "korobki" or not isinstance(back.get("recs"), dict) or len(back["recs"]) != expect:
        tmp.unlink(missing_ok=True)
        raise ValueError("проверка чтением не прошла: число записей не совпало")
    tmp.replace(final)
    for old in _list(folder)[keep:]:
        (folder / old["name"]).unlink(missing_ok=True)
    return {"name": name, "size": len(payload), "recs": expect}


async def run_backup(hass: HomeAssistant, reason: str = "schedule") -> dict:
    """Делает одну копию. Итог кладёт в hass.data[DOMAIN]['backup'], при ошибке создаёт уведомление и событие."""
    st = hass.data[DOMAIN]
    d = st["data"]
    now = datetime.now()
    status = {"t": int(time.time() * 1000), "ok": False, "error": "", "reason": reason}
    try:
        recs = d["recs"]
        payload = json.dumps(
            {"app": "korobki", "format": 1, "version": st["version"], "created": now.astimezone().isoformat(),
             "auto": True, "recs": recs},
            ensure_ascii=False,
        ).encode("utf-8")
        folder = Path(hass.config.path(BACKUP_DIR))
        name = f"{PREFIX}{now.strftime('%Y-%m-%d_%H%M%S')}.json"
        info = await hass.async_add_executor_job(_write, folder, payload, name, len(recs), BACKUP_KEEP)
        status.update(ok=True, **info)
    except Exception as err:  # noqa: BLE001 — любая ошибка должна стать уведомлением, а не молчанием
        status["error"] = str(err) or err.__class__.__name__
        _LOGGER.error("Коробки: резервная копия не создана: %s", status["error"])
    st["backup"] = status
    try:
        from homeassistant.components import persistent_notification as pn

        if status["ok"]:
            pn.async_dismiss(hass, NOTIFY_ID)
        else:
            pn.async_create(
                hass,
                f"Автоматическая копия данных не создана: {status['error']}. Проверьте место на диске и права на папку "
                f"/config/{BACKUP_DIR}. Копию можно сделать вручную: Коробки → Сервис → Резервная копия.",
                title="Коробки: резервная копия не создана", notification_id=NOTIFY_ID,
            )
    except Exception:  # noqa: BLE001 — уведомление вторично, событие ниже всё равно уйдёт
        _LOGGER.debug("Коробки: уведомление не создано", exc_info=True)
    if not status["ok"]:
        hass.bus.async_fire(EVENT_BACKUP_FAILED, {"error": status["error"], "reason": reason})
    return status


async def async_setup_backup(hass: HomeAssistant) -> None:
    """Копия при запуске (если последней нет или она старше срока) и далее по расписанию."""
    folder = Path(hass.config.path(BACKUP_DIR))
    files = await hass.async_add_executor_job(_list, folder)
    last = files[0]["t"] if files else 0
    if files:
        hass.data[DOMAIN]["backup"] = {"t": last, "ok": True, "error": "", "reason": "found", **files[0]}

    async def _tick(_now=None) -> None:
        await run_backup(hass, "schedule")

    if not last or time.time() * 1000 - last > BACKUP_HOURS * 3600 * 1000:
        await _tick()
    async_track_time_interval(hass, _tick, timedelta(hours=BACKUP_HOURS))


class BackupView(HomeAssistantView):
    """GET /api/korobki/backup: состояние автокопий. POST: сделать копию сейчас."""

    cors_allowed = True
    url = "/api/korobki/backup"
    name = "api:korobki:backup"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request) -> web.Response:
        folder = Path(self._hass.config.path(BACKUP_DIR))
        files = await self._hass.async_add_executor_job(_list, folder)
        return self.json({
            "last": self._hass.data[DOMAIN].get("backup"), "files": files[:10], "count": len(files),
            "keep": BACKUP_KEEP, "hours": BACKUP_HOURS, "dir": f"/config/{BACKUP_DIR}",
        })

    async def post(self, request: web.Request) -> web.Response:
        status = await run_backup(self._hass, "manual")
        return self.json({"last": status})
