# USB & PD Monitor (GNOME Shell)

Состояние подключённых USB-устройств и USB-C **Power Delivery** зарядников: негоциированные ватты, PDO-профили, роли портов, скорость заряда батареи.

- Полная спека: [SPEC.md](SPEC.md)
- UUID: `gnome-usb-mon@ska1006.github.io`
- GNOME Shell **50** · Wayland/X11 · root не требуется

## Статус

- **M1** — скелет: индикатор + роли Type-C портов, флаг подключения.
- **M2** — живые ватты (UCSI voltage×current), hotplug (GUdev), скорость заряда батареи, адаптивный polling, hide-when-idle.
- **M3** — список USB-устройств + drill-down submenu (VID:PID, класс, скорость, драйвер, serial, порт), external/internal по `removable`, учёт external-USB в hide-when-idle.
- **M4** — Adwaita-настройки (`prefs.js`): все тумблеры, режим панели, интервал, охват USB, ignore-list с живым списком внешних устройств. Пункт «Настройки» в меню.

Дальше: M5 уведомления/PDO/статистика, M6 упаковка.

## Установка (локально)

```sh
make install
# Wayland: перелогиниться, затем:
gnome-extensions enable gnome-usb-mon@ska1006.github.io
```

## Разработка

```sh
make reload-nested      # вложенный gnome-shell --nested (без перелогина)
journalctl -f -o cat /usr/bin/gnome-shell   # логи расширения
```

Dev-режим с фикстурами sysfs (для теста парсинга PD офлайн):

```sh
GNOME_USB_MON_SYSFS_ROOT=./fixtures ...
```

## Структура

```
extension.js        enable/disable
lib/sysfs.js        async-чтение sysfs
lib/pd.js           typec порты / PD
ui/indicator.js     панельный индикатор + меню
schemas/            GSettings
```
