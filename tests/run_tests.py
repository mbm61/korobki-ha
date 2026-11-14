#!/usr/bin/env python3
"""Все проверки репозитория одной командой: python3 tests/run_tests.py [--fast]

Шаги: сборка панели (build_frontend.py --check), py_compile, node --check, JS-синтаксис исходников,
тест бэкенда (синхронизация, конфликты, страницы, фото, резервные копии, XSS, уборка, id устройства),
браузерные тесты Playwright (офлайн, синхронизация, импорт/экспорт, фото, XSS, одинаковые метки времени).
--fast пропускает браузерные тесты. Код выхода не 0, если что-то не прошло.
"""
import glob, json, os, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
os.chdir(ROOT)
FAST = "--fast" in sys.argv
failed: list[str] = []


def run(title: str, cmd: list[str], must: list[str] | None = None, mustnot: list[str] | None = None, timeout: int = 300) -> None:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        out = (p.stdout or "") + (p.stderr or "")
        code = p.returncode
    except subprocess.TimeoutExpired:
        out, code = "таймаут", 1
    problems = [] if code == 0 else [f"код выхода {code}"]
    for rx in must or []:
        if not re.search(rx, out):
            problems.append(f"нет ожидаемого: {rx}")
    for rx in (mustnot or []) + [r"pageerror", r"errors \[[^\]]", r"Traceback"]:
        if re.search(rx, out):
            problems.append(f"найдено лишнее: {rx}")
    print(("OK   " if not problems else "FAIL ") + title)
    if problems:
        failed.append(title)
        print("     " + "\n     ".join(problems))
        print("     " + out[-1500:].replace("\n", "\n     "))


run("сборка панели актуальна", [sys.executable, "build_frontend.py", "--check"])
run("py_compile", [sys.executable, "-m", "py_compile", *glob.glob("custom_components/korobki/*.py")])
run("node --check панели", ["node", "--check", "custom_components/korobki/frontend/korobki-panel.js"])
run("node --check service worker", ["node", "--check", "custom_components/korobki/app/sw.js"])
for f in sorted(glob.glob("frontend_src/*.js")):
    pass  # фрагменты не самостоятельные: синтаксис проверяется в собранном файле
run("бэкенд", [sys.executable, "-I", "tests/test_backend.py"],
    must=[f"{k}_OK" for k in ("PY", "PY2", "PY3", "PY4", "PY5", "PY6", "PY7")])

# что должен напечатать каждый браузерный тест (иначе он не считается пройденным)
BROWSER = {
    "t12": [r"light errors \[\]", r"dark errors \[\]"],
    "t13": [r"errors \[\]"],
    "t14": [r"errors \[\]"],
    "t15": [r"errors \[\]"],
    "t16": [r"errors \[\]"],
    "t17": [r"restored ok: true \| bad skipped: true", r"filter c1: true true \| c1\+c2 \(any\): true true true",
            r"2nd tap logs out \(page reloaded\): true", r"big import: server has 1300 of 1300", r"max: 500"],
    "t18": [r"id-attack dropped: true \| name escaped: true", r"bad color not in style: true",
            r"item name escaped: true \| bad tag dropped: true", r"x executed: undefined"],
    "t19": [r"UI qty right after response: 3", r"server q after next sync: 3 .*UI: 3", r"converged: true"],
    "t21": [r"useq на диске до каждого запроса: true", r"правка отправлена повторно: true", r"ревизией сервера: true",
            r"правка не потеряна: сервер q = 2 \| UI = 2", r"лишних отправок нет: true"],
    "t20": [r"запись на сервере БЕЗ ссылки на фото: true", r"в журнале нет DELETE: true",
            r"запись ссылается на фото: true", r"сначала PUT фото, потом запись: true",
            r"DELETE после POST записи: true", r"на сервере у записи нет фото: true", r"файл удалён: true"],
}
if not FAST:
    for name, must in BROWSER.items():
        run("браузер " + name, ["node", f"tests/browser/{name}.js"], must=must, timeout=240)
print("\nИТОГ:", "всё прошло" if not failed else "не прошло: " + ", ".join(failed))
sys.exit(1 if failed else 0)
