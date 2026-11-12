"""Хранилище данных: загрузка, перенос со старых форматов, схема."""
from __future__ import annotations

import time

from homeassistant.helpers.storage import Store


class KorobkiStore(Store):
    """Хранилище, которое принимает данные любой прежней версии (старое дерево 0.3.0 и новые записи).

    Преобразование в плоские записи делает migrate(), здесь данные отдаются как есть.
    """

    async def _async_migrate_func(self, old_major_version, old_minor_version, old_data):
        return old_data


def ensure_schema(data: dict) -> dict:
    """Добавляет поля, появившиеся позже (журнал, конфликты, устройства). Безопасно вызывать повторно."""
    data.setdefault("rev", 0)
    data.setdefault("recs", {})
    data.setdefault("log", [])
    data.setdefault("conflicts", [])
    data.setdefault("devices", {})
    return data


def migrate(data: dict) -> dict:
    """Старый формат (дерево root + settings) превращается в плоский список записей."""
    if "recs" in data:
        return ensure_schema(data)
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
    return ensure_schema({"rev": 1 if recs else 0, "recs": recs})
