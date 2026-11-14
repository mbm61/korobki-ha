"""Уборка: корзина старше 30 дней и фото, на которые никто не ссылается."""
from __future__ import annotations

import time
from datetime import timedelta
from pathlib import Path

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_time_interval

from .const import DOMAIN, ORPHAN_AUTO_AGE, ORPHAN_MANUAL_AGE, TRASH_MS


def compact(d: dict) -> bool:
    """Записи из корзины старше 30 дней теряют содержимое (остаётся пустая отметка об удалении)."""
    now = int(time.time() * 1000)
    changed = False
    for r in d["recs"].values():
        if r.get("d") and r.get("n") and now - r["u"] > TRASH_MS:
            r.update({"n": "", "note": "", "tg": [], "ph": [], "q": None, "c": None})
            if not changed:
                d["rev"] += 1
                changed = True
            r["r"] = d["rev"]
    return changed


def used_photos(recs: dict) -> frozenset:
    """Снимок ссылок на фото. Вызывается только в потоке событий HA, где записи не меняются на ходу."""
    return frozenset(pid for r in list(recs.values()) for pid in (r.get("ph") or []))


def photo_stats(photo_dir: Path, used, min_age: float, delete: bool) -> dict:
    """Считает фото, на которые нет ссылок ни в одной записи (включая корзину). По флагу удаляет их.

    Работает в потоке-исполнителе, поэтому получает неизменяемый снимок `used`, а не живые записи.
    """
    if isinstance(used, dict):  # совместимость: словарь записей превращаем в снимок
        used = used_photos(used)
    now = time.time()
    photos = total = orphans = orphan_bytes = removed = freed = 0
    seen: set[str] = set()
    for f in photo_dir.glob("*.jpg"):
        pid = f.stem.split("_")[0]
        try:
            st = f.stat()
        except OSError:
            continue
        total += st.st_size
        if pid not in seen:
            seen.add(pid)
            photos += 1
        if pid in used or now - st.st_mtime < min_age:
            continue
        orphans += 1
        orphan_bytes += st.st_size
        if delete:
            try:
                f.unlink()
                removed += 1
                freed += st.st_size
            except OSError:
                pass
    return {
        "photos": photos, "bytes": total, "orphans": orphans, "orphan_bytes": orphan_bytes,
        "removed": removed, "freed": freed,
    }


async def run_gc(hass: HomeAssistant, min_age: float) -> dict:
    st = hass.data[DOMAIN]
    d = st["data"]
    if compact(d):
        st["store"].async_delay_save(lambda: d, 1)
    return await hass.async_add_executor_job(photo_stats, st["photo_dir"], used_photos(d["recs"]), min_age, True)


async def async_setup_gc(hass: HomeAssistant) -> None:
    """Уборка при запуске и раз в сутки."""

    async def _daily(_now=None) -> None:
        await run_gc(hass, ORPHAN_AUTO_AGE)

    await _daily()
    async_track_time_interval(hass, _daily, timedelta(hours=24))


class StatsView(HomeAssistantView):
    """GET /api/korobki/stats: сколько фото и сколько из них лишних."""

    cors_allowed = True  # локальный и внешний адреса — разные источники для браузера
    url = "/api/korobki/stats"
    name = "api:korobki:stats"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request) -> web.Response:
        st = self._hass.data[DOMAIN]
        res = await self._hass.async_add_executor_job(
            photo_stats, st["photo_dir"], used_photos(st["data"]["recs"]), ORPHAN_MANUAL_AGE, False
        )
        return self.json(res)


class CleanupView(HomeAssistantView):
    """POST /api/korobki/cleanup: удалить лишние фото сейчас."""

    cors_allowed = True
    url = "/api/korobki/cleanup"
    name = "api:korobki:cleanup"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request) -> web.Response:
        return self.json(await run_gc(self._hass, ORPHAN_MANUAL_AGE))
