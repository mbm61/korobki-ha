"""Резервные копии по расписанию: файл в /config/korobki_backups, проверка чтением, уведомление при ошибке.

Формат файла тот же, что у «Скачать копию» в Сервисе (app, format, version, created, recs), поэтому
любой такой файл можно выбрать в Сервисе → «Восстановление». Дополнительно в файле есть список фото («photos»).
Сами фото копируются рядом, в korobki_backups/photos (файлы неизменяемы, копируются только новые), и нужны,
пока на них ссылается хотя бы одна из хранимых копий. Если фото пропало из korobki_photos, при запуске оно
возвращается из этой папки. Перед записью каждая запись проверяется (model.check_records).
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

from .const import BACKUP_DIR, BACKUP_HOURS, BACKUP_KEEP, DOMAIN, PHOTO_ID_RE
from .gc import used_photos
from .model import check_records

_LOGGER = logging.getLogger(__name__)
NOTIFY_ID = "korobki_backup_failed"
NOTIFY_BAD = "korobki_backup_invalid"
PHOTO_SUB = "photos"
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


def _photo_files(src: Path, pid: str) -> list[Path]:
    """Файлы одного фото (оригинал и миниатюра)."""
    return [f for f in src.glob(pid + "*.jpg") if f.stem.split("_")[0] == pid]


def _sync_photos(photo_dir: Path, mirror: Path, used: frozenset) -> dict:
    """Копирует в зеркало фото, на которые есть ссылки. Файлы неизменяемы, существующие того же размера пропускаются."""
    mirror.mkdir(parents=True, exist_ok=True)
    copied = missing = 0
    for pid in sorted(used):
        if not PHOTO_ID_RE.match(pid):
            continue
        files = _photo_files(photo_dir, pid)
        if not files:
            if not _photo_files(mirror, pid):
                missing += 1   # ссылка есть, а файла нет нигде
            continue
        for f in files:
            dst = mirror / f.name
            try:
                if dst.exists() and dst.stat().st_size == f.stat().st_size:
                    continue
                tmp = mirror / (f.name + ".tmp")
                tmp.write_bytes(f.read_bytes())
                if tmp.stat().st_size != f.stat().st_size:
                    tmp.unlink(missing_ok=True)
                    raise OSError("размер копии фото не совпал: " + f.name)
                tmp.replace(dst)
                copied += 1
            except OSError:
                missing += 1
    return {"copied": copied, "missing": missing}


def _prune_photos(folder: Path, mirror: Path) -> int:
    """Удаляет из зеркала фото, которых нет ни в одной из оставшихся копий."""
    keep: set[str] = set()
    for f in _list(folder):
        try:
            keep.update(json.loads((folder / f["name"]).read_text("utf-8")).get("photos") or [])
        except (OSError, ValueError):
            return 0   # не смогли прочитать копию: ничего не удаляем
    removed = 0
    for f in mirror.glob("*.jpg"):
        if f.stem.split("_")[0] not in keep:
            f.unlink(missing_ok=True)
            removed += 1
    for f in mirror.glob("*.tmp"):
        f.unlink(missing_ok=True)
    return removed


def restore_photos(photo_dir: Path, mirror: Path, used: frozenset) -> int:
    """Возвращает в korobki_photos фото, на которые есть ссылки, но файла нет (берёт из зеркала копий)."""
    if not mirror.is_dir():
        return 0
    n = 0
    photo_dir.mkdir(parents=True, exist_ok=True)
    for pid in used:
        if not PHOTO_ID_RE.match(pid):
            continue
        for f in _photo_files(mirror, pid):
            if (photo_dir / f.name).exists():
                continue   # каждый файл (оригинал, миниатюра) проверяем отдельно
            try:
                (photo_dir / f.name).write_bytes(f.read_bytes())
                n += 1
            except OSError:
                pass
    return n


def _write(folder: Path, payload: bytes, name: str, expect: int, keep: int, photo_dir: Path | None = None,
           used: frozenset = frozenset()) -> dict:
    """Пишет копию через временный файл, читает обратно, проверяет каждую запись и число записей, затем копирует
    фото и чистит старые копии."""
    folder.mkdir(parents=True, exist_ok=True)
    photos = {"copied": 0, "missing": 0}
    if photo_dir is not None:
        photos = _sync_photos(photo_dir, folder / PHOTO_SUB, used)   # фото раньше файла копии: ссылки не повисают
    tmp, final = folder / (name + ".tmp"), folder / name
    tmp.write_bytes(payload)
    back = json.loads(tmp.read_text("utf-8"))
    if back.get("app") != "korobki" or not isinstance(back.get("recs"), dict) or len(back["recs"]) != expect:
        tmp.unlink(missing_ok=True)
        raise ValueError("проверка чтением не прошла: число записей не совпало")
    bad = check_records(back["recs"])   # то, что прочитано обратно, а не то, что собирались записать
    tmp.replace(final)
    for old in _list(folder)[keep:]:
        (folder / old["name"]).unlink(missing_ok=True)
    pruned = _prune_photos(folder, folder / PHOTO_SUB) if photo_dir is not None else 0
    return {"name": name, "size": len(payload), "recs": expect, "bad": len(bad), "bad_list": bad[:5],
            "photos": len(used), "photos_copied": photos["copied"], "photos_missing": photos["missing"],
            "photos_pruned": pruned}


async def run_backup(hass: HomeAssistant, reason: str = "schedule") -> dict:
    """Делает одну копию. Итог кладёт в hass.data[DOMAIN]['backup'], при ошибке создаёт уведомление и событие."""
    st = hass.data[DOMAIN]
    d = st["data"]
    now = datetime.now()
    status = {"t": int(time.time() * 1000), "ok": False, "error": "", "reason": reason}
    try:
        recs = d["recs"]
        used = used_photos(recs)
        payload = json.dumps(
            {"app": "korobki", "format": 1, "version": st["version"], "created": now.astimezone().isoformat(),
             "auto": True, "recs": recs, "photos": sorted(used)},
            ensure_ascii=False,
        ).encode("utf-8")
        folder = Path(hass.config.path(BACKUP_DIR))
        name = f"{PREFIX}{now.strftime('%Y-%m-%d_%H%M%S')}.json"
        info = await hass.async_add_executor_job(
            _write, folder, payload, name, len(recs), BACKUP_KEEP, st["photo_dir"], used)
        status.update(ok=True, **info)
    except Exception as err:  # noqa: BLE001 — любая ошибка должна стать уведомлением, а не молчанием
        status["error"] = str(err) or err.__class__.__name__
        _LOGGER.error("Коробки: резервная копия не создана: %s", status["error"])
    st["backup"] = status
    try:
        from homeassistant.components import persistent_notification as pn

        if status["ok"] and (status.get("bad") or status.get("photos_missing")):
            lst = "; ".join(f"{b['id']}: {b['why']}" for b in status.get("bad_list", []))
            pn.async_create(
                hass,
                "Копия создана, но в данных есть проблемы. "
                + (f"Записей с ошибками: {status['bad']} ({lst}). " if status.get("bad") else "")
                + (f"Фото, на которые есть ссылки, но нет файла: {status['photos_missing']}." if status.get("photos_missing") else ""),
                title="Коробки: проверка данных в копии", notification_id=NOTIFY_BAD,
            )
        elif status["ok"]:
            pn.async_dismiss(hass, NOTIFY_BAD)
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
    st = hass.data[DOMAIN]
    back = await hass.async_add_executor_job(restore_photos, st["photo_dir"], folder / PHOTO_SUB, used_photos(st["data"]["recs"]))
    if back:
        _LOGGER.warning("Коробки: возвращено фото из копий: %s файлов", back)
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
