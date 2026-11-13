"""Коробки: учёт вещей (дом -> кладовки -> коробки -> вещи) в Home Assistant.

Что делает интеграция:
- хранит записи (каждая вещь, коробка, категория отдельно) в .storage/korobki;
- синхронизирует их с устройствами через POST /api/korobki/sync (работает и после офлайна),
  находит конфликты одновременных правок, ведёт журнал синхронизации и проверяет целостность дерева;
- чистит корзину (30 дней) и лишние фото, отвечает на вопрос «где лежит ...» (голос и сервис korobki.find);
- хранит фото в <config>/korobki_photos и отдаёт их через /api/korobki/photo;
- добавляет в боковое меню панель «Коробки» и отдаёт устанавливаемое приложение /korobki_app/.

Устройство модулей: const (константы), storage (хранилище), model (проверка и слияние записей),
views_sync, views_photo, views_app (HTTP), gc (уборка), backup (копии по расписанию), voice (голосовой поиск).

Подключение: в configuration.yaml добавить строку  korobki:  и перезапустить HA.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from homeassistant.components import panel_custom
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, PANEL_URL_PATH, STATIC_URL, STORAGE_VERSION
from .backup import BackupView, async_setup_backup
from .gc import CleanupView, StatsView, async_setup_gc
from .storage import KorobkiStore, migrate
from .views_app import AppView, PanelJsView
from .views_photo import PhotoCollectionView, PhotoThumbView, PhotoView
from .views_sync import ConflictView, LogView, SyncView
from .voice import async_setup_voice

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Запуск интеграции."""
    store = KorobkiStore(hass, STORAGE_VERSION, DOMAIN)
    data = migrate(await store.async_load() or {})
    if data["rev"] and "migrated" not in data:
        await store.async_save(data)

    photo_dir = Path(hass.config.path("korobki_photos"))
    await hass.async_add_executor_job(lambda: photo_dir.mkdir(parents=True, exist_ok=True))

    # версия берётся из manifest.json: одна правка там обновляет и кэш панели, и проверку в панели
    base = Path(__file__).parent
    manifest = json.loads(await hass.async_add_executor_job((base / "manifest.json").read_text, "utf-8"))
    version = str(manifest.get("version", "0"))

    hass.data[DOMAIN] = {"store": store, "data": data, "photo_dir": photo_dir, "version": version}

    for view in (
        SyncView(hass), LogView(hass), ConflictView(hass), StatsView(hass), CleanupView(hass), BackupView(hass),
        PhotoCollectionView(hass, photo_dir), PhotoView(hass, photo_dir), PhotoThumbView(hass, photo_dir),
        AppView(hass, base / "app"), PanelJsView(hass, base / "frontend" / "korobki-panel.js", version),
    ):
        hass.http.register_view(view)

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

    await async_setup_gc(hass)
    await async_setup_backup(hass)
    await async_setup_voice(hass)
    return True
