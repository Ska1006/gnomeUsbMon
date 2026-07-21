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

## Статус

- **M1** — скелет: индикатор + роли Type-C портов, флаг подключения.
- **M2** — живые ватты (UCSI voltage×current), hotplug (GUdev), скорость заряда батареи, адаптивный polling, hide-when-idle.
- **M3** — список USB-устройств + drill-down submenu (VID:PID, класс, скорость, драйвер, serial, порт), external/internal по `removable`, учёт external-USB в hide-when-idle.
- **M4** — Adwaita-настройки (`prefs.js`): все тумблеры, режим панели, интервал, охват USB, ignore-list с живым списком внешних устройств. Пункт «Настройки» в меню.
- **M5** — PDO-профили зарядника (submenu порта, подсветка активного), уведомления plug/unplug (зарядник/USB, diff prev↔cur).
- **UI** — иконки по состоянию (зарядник/устройство/питание) и по классу USB, приглушённые заголовки секций.
- **M6** — упаковка (`make pack` → `gnome-extensions pack`), синтетические sysfs-фикстуры + офлайн-тест PDO/PSY-парсинга (`make test`, 15 assertions).

Все этапы (M1–M6) закрыты. PDO-парсинг провалидирован офлайн на фикстуре «100W-зарядник» по kernel `usb_power_delivery` ABI.

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

## Структура

```
extension.js        enable/disable
lib/sysfs.js        async-чтение sysfs
lib/pd.js           typec порты / PD
ui/indicator.js     панельный индикатор + меню
schemas/            GSettings
```
