#!/usr/bin/env python3
"""Сборка панели: склеивает frontend_src/*.js (по порядку имён) в custom_components/korobki/frontend/korobki-panel.js.

Правьте файлы в frontend_src/, затем запускайте:  python3 build_frontend.py
Проверка, что собранный файл совпадает с исходниками (для CI):  python3 build_frontend.py --check
Каждый файл это кусок одного скрипта (он начинается и заканчивается между функциями), поэтому по отдельности
они не запускаются; node --check проверяется на собранном результате.
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "frontend_src"
OUT = ROOT / "custom_components" / "korobki" / "frontend" / "korobki-panel.js"


def build() -> str:
    parts = sorted(SRC.glob("*.js"))
    if not parts:
        sys.exit("frontend_src пуст")
    return "".join(p.read_text(encoding="utf-8") for p in parts)


def main() -> None:
    text = build()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            sys.exit("korobki-panel.js не совпадает с frontend_src: запустите python3 build_frontend.py")
        print("OK: сборка совпадает")
        return
    OUT.write_text(text, encoding="utf-8")
    try:
        subprocess.run(["node", "--check", str(OUT)], check=True)
    except FileNotFoundError:
        print("node не найден, проверка синтаксиса пропущена")
    print(f"Собрано {len(sorted(SRC.glob('*.js')))} файлов -> {OUT.relative_to(ROOT)} ({len(text.splitlines())} строк)")


if __name__ == "__main__":
    main()
