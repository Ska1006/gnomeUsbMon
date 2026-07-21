# USB & PD Monitor (GNOME Shell)

![CI](https://github.com/Ska1006/gnomeUsbMon/actions/workflows/ci.yml/badge.svg)

Состояние подключённых USB-устройств и USB-C **Power Delivery** зарядников: негоциированные ватты, PDO-профили, роли портов, скорость заряда батареи.

- Полная спека: [SPEC.md](SPEC.md)
- UUID: `gnome-usb-mon@ska1006.github.io`
- GNOME Shell **50** · Wayland/X11 · root не требуется

## Внешний вид

```
 top bar:  ⚡65W ▾
┌────────────────────────────────────────┐
│ ⚡ Заряд · 92% · PD 65W                 │
│ ────────────────────────────────────── │
│ ⚡ USB-C port0  [sink/host]  20V·3.25A·65W ▸│  ← PDO submenu
│      5.0V · 3.00A · 15W                 │
│      …                                  │
│      20.0V · 3.25A · 65W  ← активно     │
│ ▪ USB-C port1  [sink/device]  idle      │
│ ────────────────────────────────────── │
│ USB устройства (2)                      │
│ 🖴 SanDisk Ultra        5G          ▸    │  ← drill-down
│ ⌨ Logitech Receiver    1.5M        ▸    │
│ ────────────────────────────────────── │
│ ⚙ Настройки                            │
└────────────────────────────────────────┘
```
(иконки — symbolic из Adwaita; эмодзи здесь только для схемы)

## Возможности

- **PD-зарядники**: негоциированный контракт (V·A·W), PDO-профили в submenu с подсветкой активного, максимальная мощность.
- **Type-C порты**: роли `sink/source` и `host/device`, наличие партнёра.
- **USB-устройства**: список с drill-down (VID:PID, класс, скорость, драйвер, serial, порт, `bMaxPower`); external/internal по sysfs `removable`.
- **Панель**: иконка по состоянию (зарядник / устройство / питание) + ватты; авто-скрытие когда нет внешних устройств (с настраиваемым ignore-list).
- **Уведомления** plug/unplug зарядника и USB.
- **Настройки** (Adwaita): режим панели, охват списка USB, тумблеры уведомлений/PDO, ignore-list с живым списком устройств.

Всё через sysfs (`typec`, `power_supply`) + GUdev — **root не требуется**. PDO-парсинг покрыт офлайн-тестами на sysfs-фикстуре.

## Установка (локально)

```sh
make install
# Wayland: перелогиниться, затем:
gnome-extensions enable gnome-usb-mon@ska1006.github.io
```

## Разработка

```sh
make test               # офлайн-тест парсинга PD/PSY на фикстуре
make pack               # собрать .shell-extension.zip
make reload-nested      # вложенный gnome-shell --nested (без перелогина)
journalctl -f -o cat /usr/bin/gnome-shell   # логи расширения
```

Dev-режим с фикстурами sysfs (тест парсинга без реального железа):

```sh
./fixtures/gen.sh       # создать fixtures/charger-100w/ (мок «воткнут 100W»)
GNOME_USB_MON_SYSFS_ROOT=fixtures/charger-100w gjs -m tests/pdo-test.js
```

`GNOME_USB_MON_SYSFS_ROOT` подменяет корень sysfs → любой lib-модуль читает из фикстуры.

### Переводы (i18n)

Исходные строки — на английском (`_()`), переводы в `po/`.
Языки: `de fr es ru zh_CN pt_BR it pl ja` (+ английский-исходник).

```sh
make pot                # обновить po/gnome-usb-mon.pot из кода
make mo                 # скомпилировать po/*.po → locale/<lang>/LC_MESSAGES/*.mo
```

`make install` собирает `.mo` и кладёт `locale/` в расширение. Новый язык — скопировать `.pot` в `po/<lang>.po`, перевести, `make install`.

## Структура

```
extension.js        enable/disable
lib/sysfs.js        async-чтение sysfs
lib/pd.js           typec порты / PD
ui/indicator.js     панельный индикатор + меню
schemas/            GSettings
```
