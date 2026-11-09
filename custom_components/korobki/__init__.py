"""Коробки: учёт вещей (дом -> кладовки -> коробки -> вещи) в Home Assistant.

Что делает интеграция:
- хранит записи (каждая вещь, коробка, категория отдельно) в .storage/korobki;
- синхронизирует их с устройствами через POST /api/korobki/sync (работает и после офлайна);
- чистит корзину (30 дней) и лишние фото, отвечает на вопрос «где лежит ...» (голос и сервис korobki.find);
- хранит фото в <config>/korobki_photos и отдаёт их через /api/korobki/photo;
- добавляет в боковое меню панель «Коробки» и отдаёт устанавливаемое приложение /korobki_app/.

Подключение: в configuration.yaml добавить строку  korobki:  и перезапустить HA.
"""
from __future__ import annotations

import json
import logging
import re
import secrets
import time
from datetime import timedelta
from pathlib import Path

from aiohttp import web
import voluptuous as vol

from homeassistant.components import panel_custom
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import config_validation as cv, intent
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "korobki"
STORAGE_VERSION = 2
EVENT_UPDATED = "korobki_updated"

PANEL_URL_PATH = "korobki"
STATIC_URL = "/korobki_static/korobki-panel.js"
APP_URL = "/korobki_app"

PHOTO_ID_RE = re.compile(r"^[0-9a-f]{16}$")
MAX_PHOTO_BYTES = 6_000_000
MAX_RECORDS_PER_SYNC = 5000
TRASH_MS = 30 * 86400 * 1000
ORPHAN_AUTO_AGE = 86400
ORPHAN_MANUAL_AGE = 3600
INTENT_FIND = "KorobkiFind"

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


class _KorobkiStore(Store):
    """Хранилище, которое принимает данные любой прежней версии (старое дерево 0.3.0 и новые записи).

    Преобразование в плоские записи делает _migrate, здесь данные отдаются как есть.
    """

    async def _async_migrate_func(self, old_major_version, old_minor_version, old_data):
        return old_data


def _migrate(data: dict) -> dict:
    """Старый формат (дерево root + settings) превращается в плоский список записей."""
    if "recs" in data:
        data.setdefault("rev", 0)
        return data
    now = int(time.time() * 1000)
    recs: dict[str, dict] = {}
    seq = [0]

    def rec(rid, parent, typ, **kw):
        seq[0] += 1
        r = {
            "id": rid, "p": parent, "t": typ, "n": "", "c": None, "q": None, "tg": [],
            "note": "", "ph": [], "o": now * 1000 + seq[0], "qr": "", "base": "",
            "u": now, "d": False, "r": 1,
        }
        r.update(kw)
        recs[rid] = r

    def walk(n, parent):
        rid = "root" if parent is None and n is data.get("root") else str(n.get("id"))
        rec(
            rid, parent, n.get("t", "box"), n=str(n.get("n", "")), c=n.get("c"),
            q=n.get("q") if n.get("t") == "item" else None,
            tg=list(n.get("tg") or []), note=n.get("note") or "", ph=list(n.get("ph") or []),
        )
        for ch in n.get("ch") or []:
            walk(ch, rid)

    root = data.get("root")
    if root:
        walk(root, None)
    st = data.get("settings") or {}
    for c in st.get("cats") or []:
        rec(str(c.get("id")), None, "cat", n=str(c.get("n", "")), c=c.get("c"))
    if root or st:
        rec("settings", None, "settings", qr=st.get("qr", "app"), base=st.get("base", ""))
    return {"rev": 1 if recs else 0, "recs": recs}


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Запуск интеграции."""
    store: Store = _KorobkiStore(hass, STORAGE_VERSION, DOMAIN)
    data = _migrate(await store.async_load() or {})
    if data["rev"] and "migrated" not in data:
        await store.async_save(data)

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

    hass.data[DOMAIN] = {"store": store, "data": data, "photo_dir": photo_dir, "version": version}

    hass.http.register_view(SyncView(hass))
    hass.http.register_view(StatsView(hass))
    hass.http.register_view(CleanupView(hass))
    hass.http.register_view(PhotoCollectionView(hass, photo_dir))
    hass.http.register_view(PhotoView(hass, photo_dir))
    hass.http.register_view(PhotoThumbView(hass, photo_dir))

    base = Path(__file__).parent
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(STATIC_URL, str(base / "frontend" / "korobki-panel.js"), False),
            StaticPathConfig(APP_URL, str(base / "app"), False),
        ]
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

    # уборка: корзина старше 30 дней и лишние фото (раз в сутки и при запуске)
    async def _daily(_now=None) -> None:
        await _run_gc(hass, ORPHAN_AUTO_AGE)

    await _daily()
    async_track_time_interval(hass, _daily, timedelta(hours=24))

    # голосовой помощник и сервис: «где лежит дрель?»
    async def _find_service(call: ServiceCall) -> dict:
        return find_items(hass.data[DOMAIN]["data"]["recs"], call.data["query"])

    hass.services.async_register(
        DOMAIN, "find", _find_service,
        schema=vol.Schema({vol.Required("query"): cv.string}),
        supports_response=SupportsResponse.ONLY,
    )
    try:
        intent.async_register(hass, FindIntent())
        await hass.async_add_executor_job(_write_sentences, Path(hass.config.path("custom_sentences")))
    except Exception:  # noqa: BLE001 - голос необязателен, панель должна работать всегда
        _LOGGER.exception("Коробки: не удалось подключить голосовой поиск")
    return True


# ---------- уборка и статистика ----------


def _compact(d: dict) -> bool:
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


def _photo_stats(photo_dir: Path, recs: dict, min_age: float, delete: bool) -> dict:
    """Считает фото, на которые нет ссылок ни в одной записи (включая корзину). По флагу удаляет их."""
    used = {pid for r in recs.values() for pid in (r.get("ph") or [])}
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


async def _run_gc(hass: HomeAssistant, min_age: float) -> dict:
    st = hass.data[DOMAIN]
    d = st["data"]
    if _compact(d):
        st["store"].async_delay_save(lambda: d, 1)
    return await hass.async_add_executor_job(_photo_stats, st["photo_dir"], d["recs"], min_age, True)


class StatsView(HomeAssistantView):
    """GET /api/korobki/stats: сколько фото и сколько из них лишних."""

    url = "/api/korobki/stats"
    name = "api:korobki:stats"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request) -> web.Response:
        st = self._hass.data[DOMAIN]
        res = await self._hass.async_add_executor_job(
            _photo_stats, st["photo_dir"], st["data"]["recs"], ORPHAN_MANUAL_AGE, False
        )
        return self.json(res)


class CleanupView(HomeAssistantView):
    """POST /api/korobki/cleanup: удалить лишние фото сейчас."""

    url = "/api/korobki/cleanup"
    name = "api:korobki:cleanup"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request) -> web.Response:
        return self.json(await _run_gc(self._hass, ORPHAN_MANUAL_AGE))


# ---------- голосовой поиск ----------

STOP = {"где", "лежит", "лежат", "находится", "находятся", "хранится", "мой", "моя", "моё", "мои", "наш", "наша", "моего", "the", "my", "where", "is", "are"}


def _stem(w: str) -> str:
    w = w.lower().replace("ё", "е")
    return w[:-2] if len(w) > 5 else w[:-1] if len(w) > 3 else w


def _where(recs: dict, r: dict) -> str:
    names: list[str] = []
    cur = recs.get(r.get("p"))
    guard = 0
    while cur and cur["id"] != "root" and guard < 20:
        kind = "место" if cur["t"] == "place" else "коробка"
        names.append(f"{kind} {cur['n']}")
        cur = recs.get(cur.get("p"))
        guard += 1
    return ", ".join(names) if names else "в доме"


def find_items(recs: dict, query: str, limit: int = 5) -> dict:
    """Ищет вещи и коробки по словам запроса (с грубым учётом окончаний)."""
    words = [_stem(w) for w in re.findall(r"\w+", query.lower()) if w not in STOP and len(w) > 1]
    found = []
    if words:
        for r in recs.values():
            if r.get("d") or r.get("t") not in ("item", "box", "place") or not r.get("n"):
                continue
            name = r["n"].lower().replace("ё", "е")
            if all(w in name for w in words):
                found.append(r)
    found.sort(key=lambda r: (r["t"] != "item", r["n"]))
    results = [
        {"name": r["n"], "type": r["t"], "qty": r.get("q"), "where": _where(recs, r)} for r in found[:limit]
    ]
    if not results:
        answer = f"Не нашёл: {query.strip()}"
    else:
        parts = []
        for x in results[:3]:
            qty = f", {int(x['qty'])} шт." if x["qty"] and x["qty"] > 1 else ""
            parts.append(f"{x['name']}{qty}: {x['where']}")
        answer = ". ".join(parts)
        if len(found) > 3:
            answer += f". Ещё найдено: {len(found) - 3}"
    return {"answer": answer, "count": len(found), "results": results}


class FindIntent(intent.IntentHandler):
    """Фраза «где лежит {thing}»."""

    intent_type = INTENT_FIND
    description = "Finds where an item or a box is stored at home"
    slot_schema = {vol.Required("thing"): cv.string}

    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:
        slots = self.async_validate_slots(intent_obj.slots)
        thing = slots["thing"]["value"]
        res = find_items(intent_obj.hass.data[DOMAIN]["data"]["recs"], thing)
        response = intent_obj.create_response()
        response.async_set_speech(res["answer"])
        return response


SENTENCES = {
    "ru": """language: "ru"
intents:
  KorobkiFind:
    data:
      - sentences:
          - "где (лежит|лежат|находится|находятся|хранится|хранятся) {thing}"
          - "где (мой|моя|моё|мои|наш|наша) {thing}"
          - "найди в коробках {thing}"
lists:
  thing:
    wildcard: true
""",
    "en": """language: "en"
intents:
  KorobkiFind:
    data:
      - sentences:
          - "where (is|are) (my|the) {thing} stored"
          - "find {thing} in the boxes"
lists:
  thing:
    wildcard: true
""",
}


def _write_sentences(folder: Path) -> None:
    """Кладёт файлы фраз для Assist (только если их ещё нет, чтобы не затирать ваши правки)."""
    for lang, text in SENTENCES.items():
        target = folder / lang / "korobki.yaml"
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")


# ---------- синхронизация ----------


def _clean(r: object) -> dict | None:
    """Проверка записи от клиента."""
    if not isinstance(r, dict) or not isinstance(r.get("id"), str) or not r["id"] or len(r["id"]) > 64:
        return None
    if not isinstance(r.get("u"), (int, float)) or r.get("t") not in ("home", "place", "box", "item", "cat", "settings"):
        return None
    out = {
        "id": r["id"], "p": r.get("p") if isinstance(r.get("p"), str) else None, "t": r["t"],
        "n": str(r.get("n", ""))[:300], "c": r.get("c") if isinstance(r.get("c"), str) else None,
        "q": r.get("q") if isinstance(r.get("q"), (int, float)) else None,
        "tg": [str(x)[:64] for x in (r.get("tg") or [])][:50] if isinstance(r.get("tg"), list) else [],
        "note": str(r.get("note", ""))[:5000],
        "ph": [x for x in (r.get("ph") or []) if isinstance(x, str) and PHOTO_ID_RE.match(x)][:8] if isinstance(r.get("ph"), list) else [],
        "o": r.get("o") if isinstance(r.get("o"), (int, float)) else 0,
        "qr": str(r.get("qr", ""))[:300], "base": str(r.get("base", ""))[:300],
        "u": r["u"], "d": bool(r.get("d")),
    }
    return out


class SyncView(HomeAssistantView):
    """POST /api/korobki/sync: принять изменения устройства и отдать чужие.

    Запрос: {since, records:[...]}. Побеждает запись с большей меткой u (последняя правка).
    Ответ: {rev, version, records:[записи, изменившиеся после since]}.
    """

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
        if not isinstance(since, int):
            since = 0
        incoming = body.get("records", [])[:MAX_RECORDS_PER_SYNC]

        st = self._hass.data[DOMAIN]
        d, store = st["data"], st["store"]
        recs = d["recs"]
        touched: set[str] = set()
        changed = False
        for raw in incoming:
            r = _clean(raw)
            if r is None:
                continue
            touched.add(r["id"])
            cur = recs.get(r["id"])
            if cur is None or r["u"] > cur["u"]:
                if not changed:
                    d["rev"] += 1
                    changed = True
                r["r"] = d["rev"]
                recs[r["id"]] = r
        if changed:
            store.async_delay_save(lambda: d, 1)
            self._hass.bus.async_fire(EVENT_UPDATED, {"rev": d["rev"]})
        out = [r for r in recs.values() if r["r"] > since or r["id"] in touched]
        return self.json({"rev": d["rev"], "version": st["version"], "records": out})


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
        await self._hass.async_add_executor_job(
            self._file(photo_id, thumb=True).write_bytes, body
        )
        return self.json({"ok": True})
