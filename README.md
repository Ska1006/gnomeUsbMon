# USB & PD Monitor (GNOME Shell)

Состояние подключённых USB-устройств и USB-C **Power Delivery** зарядников: негоциированные ватты, PDO-профили, роли портов, скорость заряда батареи.

- Полная спека: [SPEC.md](SPEC.md)
- UUID: `gnome-usb-mon@ska1006.github.io`
- GNOME Shell **50** · Wayland/X11 · root не требуется

## Статус

**M1** — скелет: панельный индикатор + роли Type-C портов (sink/source, host/device) + флаг подключения зарядника. Читается из `/sys/class/typec/`.

Дальше: M2 живые ватты (UCSI + polling), M3 список USB, M4 настройки, M5 уведомления/PDO/статистика.

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
