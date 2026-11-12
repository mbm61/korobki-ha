/* Панель «Коробки» для Home Assistant.
 * Дом -> места -> коробки -> вещи, фото, QR-этикетки.
 * Данные: websocket korobki/get и korobki/save. Фото: /api/korobki/photo.
 * Оформление: карточки с градиентом из акцентного цвета места, цвета берутся из темы HA. */
(function () {
  'use strict';
  /* версию подставляет сервер при отдаче файла (из manifest.json), вручную её менять не нужно */
  var VERSION = '__KOROBKI_VERSION__';

