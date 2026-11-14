"""Синхронизация с устройствами, журнал операций и конфликты."""
from __future__ import annotations

import time

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN, EVENT_UPDATED, LOG_LIMIT, ID_RE, LABEL_BAD_RE, MAX_RECORDS_PER_SYNC, PULL_LIMIT
from .model import apply_batch


class SyncView(HomeAssistantView):
    """POST /api/korobki/sync: принять изменения устройства и отдать чужие.

    Запрос: {since, device, label, records:[...]}. Каждая запись может нести dv (id устройства), us (счётчик правок
    устройства) и br (ревизия записи, на которой основана правка). Правила слияния описаны в model.py.
    Ответ: {rev (курсор: следующий since), head (текущая ревизия), more (есть ещё записи для скачивания), rest (сколько присланных записей не принято), version, records, conflicts (новые), nconf (нерешённые), fixes (исправлений графа)}.
    """

    cors_allowed = True  # локальный и внешний адреса — разные источники для браузера
    url = "/api/korobki/sync"
    name = "api:korobki:sync"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except ValueError:
            return self.json_message("Нужен JSON", 400)
        if not isinstance(body, dict) or not isinstance(body.get("records", []), list):
            return self.json_message("Неверный запрос", 400)
        since = body.get("since", 0)
        if not isinstance(since, int) or isinstance(since, bool):
            since = 0
        device = body.get("device") if isinstance(body.get("device"), str) and ID_RE.match(body["device"]) else ""
        label = LABEL_BAD_RE.sub("", str(body.get("label") or ""))[:40]
        all_in = body.get("records", [])
        incoming = all_in[:MAX_RECORDS_PER_SYNC]
        rest = len(all_in) - len(incoming)  # не принято в этом запросе: клиент пришлёт следующим

        st = self._hass.data[DOMAIN]
        d, store = st["data"], st["store"]
        now = int(time.time() * 1000)
        res = apply_batch(d, incoming, device, now)
        recs = d["recs"]
        fresh = sorted((r for r in recs.values() if r["r"] > since), key=lambda r: r["r"])
        cursor, more = d["rev"], False
        if len(fresh) > PULL_LIMIT:
            # отдаём порцию; записи с одной ревизией не разрываем, курсор = последняя отданная ревизия
            cursor, more = fresh[PULL_LIMIT - 1]["r"], True
            fresh = [r for r in fresh if r["r"] <= cursor]
        out = {r["id"]: r for r in fresh}
        for rid in res["touched"]:
            if rid in recs:
                out[rid] = recs[rid]
        out = list(out.values())

        ushi = 0
        if device:
            old = d["devices"].get(device, {})
            ushi = max(int(old.get("us") or 0), res["usmax"])
            if res["stale"]:   # счётчик устройства откатился: сверяемся с тем, что уже записано на сервере
                ushi = max([ushi] + [r.get("us") or 0 for r in recs.values() if r.get("dv") == device])
            d["devices"][device] = {"last": now, "label": label or old.get("label", ""), "us": ushi}
        interesting = res["sent"] or out or res["fixes"]
        if interesting:
            d["log"].append({
                "t": now, "dev": device[:8], "lb": label, "sent": res["sent"], "acc": res["accepted"],
                "same": res["same"], "ign": res["ignored"], "rej": res["rejected"], "con": len(res["conflicts"]),
                "fix": len(res["fixes"]), "clk": res["clock"], "pull": len(out), "rev": d["rev"],
            })
            del d["log"][:-LOG_LIMIT]
        if res["changed"] or interesting:
            store.async_delay_save(lambda: d, 1)
        if res["changed"]:
            self._hass.bus.async_fire(EVENT_UPDATED, {"rev": d["rev"]})
        return self.json({
            "rev": cursor, "head": d["rev"], "more": more, "rest": rest, "version": st["version"], "records": out,
            "conflicts": res["conflicts"], "nconf": len(d["conflicts"]), "fixes": len(res["fixes"]),
            "fixlist": res["fixes"][:20], "stale": res["stale"], "ushi": ushi,
        })


class LogView(HomeAssistantView):
    """GET /api/korobki/log: последние операции синхронизации, нерешённые конфликты и устройства."""

    cors_allowed = True
    url = "/api/korobki/log"
    name = "api:korobki:log"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request) -> web.Response:
        d = self._hass.data[DOMAIN]["data"]
        return self.json({
            "rev": d["rev"], "log": list(reversed(d["log"][-50:])),
            "conflicts": list(reversed(d["conflicts"])), "devices": d["devices"],
        })


class ConflictView(HomeAssistantView):
    """POST /api/korobki/conflicts/<id> {action:"dismiss"}: конфликт разобран, убрать из списка."""

    cors_allowed = True
    url = "/api/korobki/conflicts/{cid}"
    name = "api:korobki:conflict"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request, cid: str) -> web.Response:
        st = self._hass.data[DOMAIN]
        d = st["data"]
        before = len(d["conflicts"])
        d["conflicts"] = [c for c in d["conflicts"] if c["id"] != cid]
        if len(d["conflicts"]) != before:
            st["store"].async_delay_save(lambda: d, 1)
        return self.json({"ok": True, "nconf": len(d["conflicts"])})
