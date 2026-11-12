"""Голосовой поиск «где лежит ...»: сервис korobki.find и фраза для Assist."""
from __future__ import annotations

import logging
import re
from pathlib import Path

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import config_validation as cv, intent

from .const import DOMAIN, INTENT_FIND

_LOGGER = logging.getLogger(__name__)

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


def write_sentences(folder: Path) -> None:
    """Кладёт файлы фраз для Assist (только если их ещё нет, чтобы не затирать ваши правки)."""
    for lang, text in SENTENCES.items():
        target = folder / lang / "korobki.yaml"
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")


async def async_setup_voice(hass: HomeAssistant) -> None:
    """Регистрирует сервис и фразу. Голос необязателен: ошибка здесь не должна ломать панель."""

    async def _find_service(call: ServiceCall) -> dict:
        return find_items(hass.data[DOMAIN]["data"]["recs"], call.data["query"])

    hass.services.async_register(
        DOMAIN, "find", _find_service,
        schema=vol.Schema({vol.Required("query"): cv.string}),
        supports_response=SupportsResponse.ONLY,
    )
    try:
        intent.async_register(hass, FindIntent())
        await hass.async_add_executor_job(write_sentences, Path(hass.config.path("custom_sentences")))
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Коробки: не удалось подключить голосовой поиск")
