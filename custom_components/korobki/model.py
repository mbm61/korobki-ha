"""Модель данных: проверка записей, слияние правок с разных устройств, нормализация графа.

Функции здесь «чистые» (без Home Assistant), их можно проверять отдельно.

Как устроено слияние (apply_batch):
- у каждой записи на сервере есть ревизия r (номер изменения всей базы), id устройства dv и счётчик us;
- устройство вместе с правкой присылает br: ревизию записи, которую оно видело в последний раз;
- br >= r на сервере: правка последовательная, принимается всегда (даже если часы устройства отстают);
- та же запись с того же устройства: порядок решает счётчик us, а не часы;
- br < r: правка одновременная. Побеждает более поздняя по времени, проигравшая версия попадает в журнал конфликтов;
- метки времени из будущего (больше чем на 5 минут) заменяются временем сервера.
"""
from __future__ import annotations

import math
import secrets
from typing import Any, Callable

from .const import BASE_RE, COLOR_RE, ID_RE, LOST_ID, LOST_NAME, MAX_CLOCK_SKEW_MS, CONFLICT_LIMIT, PHOTO_ID_RE

TYPES = ("home", "place", "box", "item", "cat", "settings")
# поля, по которым записи сравниваются (метки u, r, dv, us в сравнение не входят)
CONTENT = ("p", "t", "n", "c", "q", "tg", "note", "ph", "o", "qr", "base", "d")
# какие типы родителей допустимы (для места родитель всегда корень)
PARENT_TYPES = {"box": ("place", "box"), "item": ("place", "box")}


def clean(r: object) -> dict | None:
    """Проверка одной записи от устройства. Возвращает чистую копию или None, если запись негодная."""
    if not isinstance(r, dict) or not isinstance(r.get("id"), str) or not ID_RE.match(r["id"]):
        return None  # id только из букв, цифр, «_» и «-» (до 64): попадает в атрибуты HTML на устройствах
    u = r.get("u")
    if isinstance(u, bool) or not isinstance(u, (int, float)) or not math.isfinite(u) or r.get("t") not in TYPES:
        return None
    rid, typ = r["id"], r["t"]
    # служебные записи имеют фиксированные id
    if (typ == "home") != (rid == "root") or (typ == "settings") != (rid == "settings"):
        return None
    tg: list[str] = []
    if isinstance(r.get("tg"), list):
        for x in r["tg"][:50]:
            if not isinstance(x, str) or not ID_RE.match(x):
                continue
            if x not in tg:
                tg.append(x)
    us, br = r.get("us"), r.get("br")
    return {
        "id": rid,
        "p": r.get("p") if isinstance(r.get("p"), str) and ID_RE.match(r["p"]) and typ in ("place", "box", "item") else None,
        "t": typ,
        "n": str(r.get("n", ""))[:300],
        "c": r.get("c") if isinstance(r.get("c"), str) and COLOR_RE.match(r["c"]) else None,
        "q": r.get("q") if isinstance(r.get("q"), (int, float)) and not isinstance(r.get("q"), bool) else None,
        "tg": tg,
        "note": str(r.get("note", ""))[:5000],
        "ph": [x for x in (r.get("ph") or []) if isinstance(x, str) and PHOTO_ID_RE.match(x)][:8]
        if isinstance(r.get("ph"), list) else [],
        "o": r.get("o") if isinstance(r.get("o"), (int, float)) and not isinstance(r.get("o"), bool) else 0,
        "qr": str(r.get("qr", ""))[:300],
        "base": r["base"][:300] if isinstance(r.get("base"), str) and (not r["base"] or BASE_RE.match(r["base"][:300])) else "",
        "u": int(u),
        "d": bool(r.get("d")),
        "dv": r["dv"] if isinstance(r.get("dv"), str) and ID_RE.match(r["dv"]) else "",
        "us": int(us) if isinstance(us, (int, float)) and not isinstance(us, bool) and math.isfinite(us) else None,
        "br": int(br) if isinstance(br, (int, float)) and not isinstance(br, bool) and math.isfinite(br) else None,
    }


def same_content(a: dict, b: dict) -> bool:
    return all(a.get(k) == b.get(k) for k in CONTENT)


def public(r: dict) -> dict:
    """Версия записи для журнала конфликтов (без служебных полей сервера)."""
    out = {k: r.get(k) for k in CONTENT}
    out.update({"id": r["id"], "u": r["u"], "dv": r.get("dv", "")})
    return out


def _conflict(cur: dict, inc: dict, inc_wins: bool, now: int) -> dict | None:
    kept, lost = (inc, cur) if inc_wins else (cur, inc)
    fields = [k for k in CONTENT if kept.get(k) != lost.get(k)]
    if not fields or fields == ["o"]:  # одно лишь изменение порядка конфликтом не считаем
        return None
    return {
        "id": secrets.token_hex(4), "t": now, "rid": cur["id"], "kt": cur["t"],
        "win": "device" if inc_wins else "server",
        "wdev": kept.get("dv", ""), "ldev": lost.get("dv", ""),
        "fields": fields, "kept": public(kept), "lost": public(lost),
    }


def apply_batch(d: dict, incoming: list, device: str, now: int) -> dict:
    """Принимает пачку записей от устройства и обновляет базу d. Возвращает сводку для ответа и журнала."""
    recs = d["recs"]
    res: dict[str, Any] = {
        "sent": len(incoming), "accepted": 0, "same": 0, "ignored": 0, "rejected": 0, "clock": 0,
        "conflicts": [], "fixes": [], "touched": set(), "changed": False,
    }

    def bump() -> int:
        if not res["changed"]:
            d["rev"] += 1
            res["changed"] = True
        return d["rev"]

    for raw in incoming:
        r = clean(raw)
        if r is None:
            res["rejected"] += 1
            continue
        rid = r["id"]
        res["touched"].add(rid)
        br = r.pop("br")
        if not r["dv"]:
            r["dv"] = device
        if r["u"] > now + MAX_CLOCK_SKEW_MS:  # часы устройства спешат
            r["u"] = now
            res["clock"] += 1
        cur = recs.get(rid)
        if cur is not None and same_content(cur, r):
            res["same"] += 1
            continue
        if cur is None:
            accept = True
        elif r["dv"] and r["dv"] == cur.get("dv") and r.get("us") is not None and cur.get("us") is not None:
            # то же устройство: порядок по счётчику, а не по часам
            accept = r["us"] > cur["us"]
            if accept:
                r["u"] = max(r["u"], cur["u"] + 1)
        elif br is not None and br >= cur["r"]:
            # устройство видело актуальную версию: это обычная правка поверх неё
            accept = True
            r["u"] = max(r["u"], cur["u"] + 1)
        elif br is None:
            # старый клиент без ревизий: побеждает более поздняя метка
            accept = r["u"] > cur["u"]
        else:
            # одновременная правка: побеждает более поздняя, проигравшая версия уходит в журнал конфликтов
            accept = r["u"] > cur["u"]
            c = _conflict(cur, r, accept, now)
            if c:
                res["conflicts"].append(c)
        if not accept:
            res["ignored"] += 1
            continue
        r["r"] = bump()
        recs[rid] = r
        res["accepted"] += 1

    if res["changed"]:
        res["fixes"] = normalize(d, now, bump)
    if res["conflicts"]:
        d["conflicts"] = (d.get("conflicts", []) + res["conflicts"])[-CONFLICT_LIMIT:]
        res["changed"] = True
    return res


def normalize(d: dict, now: int, bump: Callable[[], int]) -> list[dict]:
    """Приводит граф записей в порядок после слияния. Возвращает список исправлений.

    Проверяется: родитель существует и не удалён; тип родителя допустим (место в корне, коробка и вещь
    в месте или коробке, вещь внутри вещи нельзя); нет циклов и «зависших» веток под удалённым предком;
    категории вещи существуют и не повторяются. Записи без допустимого родителя переносятся в место «Найденные».
    """
    recs = d["recs"]
    fixes: list[dict] = []

    def live(r: dict | None) -> bool:
        return r is not None and not r.get("d")

    def touch(r: dict, what: str) -> None:
        r["u"] = max(now, r["u"] + 1)
        r["dv"] = "server"
        r["r"] = bump()
        fixes.append({"id": r["id"], "n": r["n"], "t": r["t"], "what": what})

    # 0. безопасность данных, пришедших из старых версий или из ручной правки файла хранилища:
    #    записи с недопустимым id удаляются, недопустимые цвет, родитель, категории и фото очищаются
    for rid in [k for k, r in recs.items() if not isinstance(k, str) or not ID_RE.match(k) or r.get("id") != k]:
        del recs[rid]
        fixes.append({"id": str(rid)[:20], "n": "", "t": "?", "what": "удалена запись с недопустимым id"})
    for r in list(recs.values()):
        bad = []
        if r.get("c") is not None and not (isinstance(r["c"], str) and COLOR_RE.match(r["c"])):
            r["c"] = None; bad.append("цвет")
        if isinstance(r.get("tg"), list) and any(not (isinstance(x, str) and ID_RE.match(x)) for x in r["tg"]):
            r["tg"] = [x for x in r["tg"] if isinstance(x, str) and ID_RE.match(x)]; bad.append("категории")
        if isinstance(r.get("ph"), list) and any(not (isinstance(x, str) and PHOTO_ID_RE.match(x)) for x in r["ph"]):
            r["ph"] = [x for x in r["ph"] if isinstance(x, str) and PHOTO_ID_RE.match(x)]; bad.append("фото")
        if r.get("p") is not None and not (isinstance(r["p"], str) and ID_RE.match(r["p"])):
            r["p"] = None; bad.append("родитель")
        if bad:
            touch(r, "очищено: " + ", ".join(bad))

    root_ok = live(recs.get("root")) and recs["root"]["t"] == "home"

    def lost_place() -> dict:
        lp = recs.get(LOST_ID)
        if lp is None or lp["t"] != "place" or lp.get("d") or lp["p"] != "root":
            o = max((x.get("o", 0) for x in recs.values()), default=0) + 1
            lp = {
                "id": LOST_ID, "p": "root", "t": "place", "n": LOST_NAME, "c": None, "q": None, "tg": [],
                "note": "", "ph": [], "o": o, "qr": "", "base": "", "u": now, "d": False, "dv": "server",
                "us": None, "r": bump(),
            }
            recs[LOST_ID] = lp
            fixes.append({"id": LOST_ID, "n": LOST_NAME, "t": "place", "what": "создано место для потерянных записей"})
        return lp

    nodes = [r for r in recs.values() if live(r) and r["t"] in ("place", "box", "item")]
    if root_ok:
        # 1) место всегда лежит в корне
        for r in nodes:
            if r["t"] == "place" and r["p"] != "root":
                r["p"] = "root"
                touch(r, "место возвращено в корень дома")
        # 2) родитель коробки или вещи должен существовать, быть живым и подходящего типа
        for r in nodes:
            if r["t"] in PARENT_TYPES:
                par = recs.get(r["p"]) if r["p"] else None
                if not (live(par) and par["t"] in PARENT_TYPES[r["t"]]):
                    r["p"] = lost_place()["id"]
                    touch(r, "нет подходящего родителя, перенесено в «Найденные»")
        # 3) всё живое должно быть достижимо из корня (нет циклов и веток под удалённым предком)
        kids: dict[str, list[dict]] = {}
        for r in recs.values():
            if live(r) and r["t"] in ("place", "box", "item") and r.get("p"):
                kids.setdefault(r["p"], []).append(r)
        reached: set[str] = set()

        def walk(start: str) -> None:
            stack = [start]
            while stack:
                cur = stack.pop()
                if cur in reached:
                    continue
                reached.add(cur)
                stack.extend(k["id"] for k in kids.get(cur, []))

        walk("root")
        for r in sorted((x for x in nodes if x["id"] not in reached and x["t"] in PARENT_TYPES), key=lambda x: x["id"]):
            if r["id"] in reached:
                continue
            old = r["p"]
            r["p"] = lost_place()["id"]
            if old in kids:
                kids[old] = [k for k in kids[old] if k["id"] != r["id"]]
            kids.setdefault(r["p"], []).append(r)
            touch(r, "цикл или удалённый предок, перенесено в «Найденные»")
            reached.add(LOST_ID)
            walk(r["id"])
    # 4) категории: только существующие и без повторов
    cats = {x["id"] for x in recs.values() if x["t"] == "cat" and not x.get("d")}
    for r in recs.values():
        if r.get("d") or not r.get("tg"):
            continue
        good: list[str] = []
        for t in r["tg"]:
            if t in cats and t not in good:
                good.append(t)
        if good != r["tg"]:
            r["tg"] = good
            touch(r, "убраны несуществующие категории")
    return fixes
