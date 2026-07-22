# USB & PD Monitor (GNOME Shell)

**English** · [Русский](README.ru.md)

![CI](https://github.com/Ska1006/gnomeUsbMon/actions/workflows/ci.yml/badge.svg)

Monitor connected USB devices and USB-C **Power Delivery** chargers: negotiated watts, PDO profiles, port roles, battery charge rate.

- Full spec: [SPEC.md](SPEC.md)
- UUID: `gnome-usb-mon@ska1006.github.io`
- GNOME Shell **50** · Wayland/X11 · no root required

## Appearance

```
 top bar:  ⚡65W ▾
┌────────────────────────────────────────┐
│ ⚡ Charging · 92% · PD 65W              │
│ ────────────────────────────────────── │
│ ⚡ USB-C port0  [sink/host]  20V·3.25A·65W ▸│  ← PDO submenu
│      5.0V · 3.00A · 15W                 │
│      …                                  │
│      20.0V · 3.25A · 65W  ← active      │
│ ▪ USB-C port1  [sink/device]  idle      │
│ ────────────────────────────────────── │
│ USB devices (2)                         │
│ 🖴 SanDisk Ultra        5G          ▸    │  ← drill-down
│ ⌨ Logitech Receiver    1.5M        ▸    │
│ ────────────────────────────────────── │
│ ⚙ Settings                             │
└────────────────────────────────────────┘
```
(icons are Adwaita symbolic; the emoji here are only for the sketch)

## Features

- **PD chargers**: negotiated contract (V·A·W), PDO profiles in a submenu with the active one highlighted, maximum power.
- **Type-C ports**: `sink/source` and `host/device` roles, partner presence.
- **USB devices**: list with drill-down (VID:PID, class, speed, driver, serial, port, `bMaxPower`); external/internal via sysfs `removable`.
- **Panel**: state icon (charger / device / powered) + watts; auto-hide when there are no external devices (with a configurable ignore list).
- **Notifications** on charger/USB plug and unplug.
- **Settings** (Adwaita): panel mode, USB list scope, notification/PDO toggles, ignore list with a live device list.

Everything through sysfs (`typec`, `power_supply`) + GUdev — **no root required**. PDO parsing is covered by offline tests on a sysfs fixture.

## Install

```sh
git clone https://github.com/Ska1006/gnomeUsbMon.git
cd gnomeUsbMon
./install.sh
```

Then activate the shell: on **Wayland** log out and back in; on **X11** press `Alt+F2`, type `r`, Enter. The extension is enabled automatically.

- Uninstall: `./install.sh -u`
- Settings: `gnome-extensions prefs gnome-usb-mon@ska1006.github.io`

Requirements: `gnome-extensions` and `glib-compile-schemas` (from the `gnome-shell` / `glib2` packages). Translations are optional and need `gettext` (`msgfmt`).

## Development

```sh
make test               # offline PD/PSY parsing test on a fixture
make pack               # build the .shell-extension.zip
make reload-nested      # nested gnome-shell --nested (no relogin)
journalctl -f -o cat /usr/bin/gnome-shell   # extension logs
```

Dev mode with sysfs fixtures (parse without real hardware):

```sh
./fixtures/gen.sh       # create fixtures/charger-100w/ (a "100W plugged" mock)
GNOME_USB_MON_SYSFS_ROOT=fixtures/charger-100w gjs -m tests/pdo-test.js
```

`GNOME_USB_MON_SYSFS_ROOT` overrides the sysfs root → every lib module reads from the fixture.

### Translations (i18n)

Source strings are English (`_()`), translations live in `po/`.
Languages: `de fr es ru zh_CN pt_BR it pl ja` (+ the English source).

```sh
make pot                # refresh po/gnome-usb-mon.pot from the code
make mo                 # compile po/*.po → locale/<lang>/LC_MESSAGES/*.mo
```

`make install` compiles the `.mo` files and ships `locale/`. New language: copy the `.pot` to `po/<lang>.po`, translate, `make install`.

## Structure

```
extension.js        enable/disable
lib/sysfs.js        async sysfs reads
lib/pd.js           typec ports / PD
ui/indicator.js     panel indicator + menu
schemas/            GSettings
```

## License

GPL-2.0-or-later — see [LICENSE](LICENSE).
