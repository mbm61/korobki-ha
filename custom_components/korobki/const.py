"""Общие константы интеграции «Коробки»."""
import re

DOMAIN = "korobki"
STORAGE_VERSION = 2
EVENT_UPDATED = "korobki_updated"

PANEL_URL_PATH = "korobki"
STATIC_URL = "/korobki_static/korobki-panel.js"
APP_URL = "/korobki_app"

PHOTO_ID_RE = re.compile(r"^[0-9a-f]{16}$")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")  # id записи, родителя, категории, устройства
BASE_RE = re.compile(r"^https?://[^\s<>\"'`]+$")  # адрес для QR: только http(s) без пробелов и кавычек
COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")  # цвет только в виде #RRGGBB
LABEL_BAD_RE = re.compile(r"[<>&\"'`\x00-\x1f]")  # символы, которые не нужны в подписи устройства
MAX_PHOTO_BYTES = 6_000_000
MAX_RECORDS_PER_SYNC = 500  # записей за один запрос синхронизации; остальные клиент присылает следующими запросами
PULL_LIMIT = 500  # сколько чужих записей отдаём за один ответ (дальше — по курсору)

TRASH_MS = 30 * 86400 * 1000
ORPHAN_AUTO_AGE = 86400
ORPHAN_MANUAL_AGE = 3600

INTENT_FIND = "KorobkiFind"

# Синхронизация и конфликты
MAX_CLOCK_SKEW_MS = 5 * 60 * 1000  # метка времени «из будущего» дальше 5 минут считается ошибкой часов
LOG_LIMIT = 100  # сколько последних операций синхронизации хранить
CONFLICT_LIMIT = 100  # сколько нерешённых конфликтов хранить
LOST_ID = "lost"  # место «Найденные», куда попадают записи без родителя
LOST_NAME = "Найденные (восстановлено)"

# Резервные копии по расписанию
BACKUP_DIR = "korobki_backups"  # папка в /config
BACKUP_KEEP = 14  # сколько копий хранить
BACKUP_HOURS = 24  # как часто делать копию
