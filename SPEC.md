# GNOME USB & PD Monitor — Спецификация

**UUID:** `gnome-usb-mon@typoska.github.io`
**Цель:** GNOME Shell extension — показывает состояние подключённых внешних USB-устройств, приоритет — USB-C **Power Delivery** зарядники (негоциированные ватты, PDO-профили, роли портов, скорость заряда батареи).

---

## 1. Целевая платформа (проверено на машине)

| Компонент | Значение | Проверка |
|---|---|---|
| GNOME Shell | **50.3** → `shell-version: ["50"]`, ESM-расширение | `gnome-shell --version` |
| Сессия | Wayland / GNOME (роли не важны, extension в shell-процессе) | `$XDG_SESSION_TYPE` |
| Type-C стек | `typec` + `typec_ucsi` + `ucsi_acpi` загружены | `lsmod` |
| Порты | `port0`, `port1` (`/sys/class/typec/`), оба sink-capable, PD rev 2.0 | sysfs |
| PPS | Да — `usb_type: [C] PD PD_PPS` | `ucsi-source-psy/usb_type` |
| GUdev | `GUdev-1.0.typelib` присутствует | girepository |
| Батарея | `BAT1` (charge-type: есть `current_now`, нет `power_now`) | sysfs |
| Права | sysfs `typec`/`power_supply` читаются юзером — **root не нужен** | прочитано без sudo |

**Вывод:** всё железо и софт для полного PD-мониторинга на месте. Root/polkit не требуется.

---

## 2. Источники данных (sysfs + udev)

Все чтения sysfs — **асинхронно** (`Gio.File.load_contents_async`), никаких sync-read в главном loop shell.

### 2.1 USB-устройства — enumeration
`GUdev.Client.query_by_subsystem('usb')`, фильтр `DEVTYPE == usb_device` (пропуск `usb_interface`).
Пропускаем root-hubs (имя вида `usbN`).
**External vs internal:** sysfs `removable` → `removable` (внешний юзер-порт, ACPI _UPC/_PLD) / `fixed` (встроенный: вебка, wifi) / `unknown`. `external = removable === 'removable'`. hide-when-idle и scope=external учитывают только `external`.

| Поле | Источник |
|---|---|
| Вендор / продукт | `ID_VENDOR`, `ID_MODEL` (fallback: sysfs `manufacturer`/`product`) |
| VID:PID | `ID_VENDOR_ID`:`ID_MODEL_ID` |
| Скорость | sysfs `speed` (1.5/12/480/5000/10000 Mbps → LS/FS/HS/USB3/USB3.1) |
| Класс | `bDeviceClass` → человекочитаемая строка |
| Драйвер | `DRIVER` интерфейса |
| Serial | `ID_SERIAL_SHORT` |
| Путь порта | sysfs `devpath` / имя ноды (напр. `1-2`) |

### 2.2 Type-C порты — роли
`/sys/class/typec/portN/`:
- `power_role` → `source [sink]` (активная роль в скобках)
- `data_role` → `[host] device`
- `power_operation_mode` → `usb_power_delivery` / `usb_pd_pps` / `default`
- `usb_power_delivery_revision`, `orientation`

### 2.3 Партнёр (зарядник) при подключении
Появляется `/sys/class/typec/portN-partner/`:
- `pdN/source-capabilities/` (номер `pdN` варьируется; старые ядра — `usb_power_delivery/source-capabilities/`) — **PDO зарядника**. Значения с суффиксами `mV`/`mA`:
  - `K:fixed_supply/` → `voltage` (mV), `maximum_current` (mA), `operational_current`, `dual_role_power`, `usb_communication_capable`, `unconstrained_power`
  - `K:programmable_supply/` (**PPS/APDO**) → `maximum_voltage`, `minimum_voltage`, `maximum_current`
  - `K:variable_supply/` / `K:battery/` → min/max voltage, max current/power
- `identity/` → VID/PID зарядника, product string (если отдаёт)
- `usb_power_delivery_revision`

### 2.4 Негоциированный контракт (PD)
`/sys/class/power_supply/ucsi-source-psy-USBC000:00N/`:
- `online` (1 = зарядник активен)
- `voltage_now` (µV) × `current_now` (µA) → **PD-контракт** (потолок). ВНИМАНИЕ: `current_now == current_max` (константа) — негоциированный лимит, НЕ живой замер тока. ADC на входе зарядника нет.
- `voltage_max`, `current_max`, `usb_type`

Реальный измеренный ток — только у батареи (`BAT1/current_now`, фьюел-гейдж): ток/мощность заряда В батарею. Полный ток ОТ зарядника (батарея + система) на этом железе не измеряется.

**Маппинг** `ucsi-source-psy-...:00N` ↔ `typec portM`: N — UCSI connector index (1-based), port — 0-based. Резолвим через связь по `USBC000` + порядок; при неоднозначности сверяем `online` с наличием partner-папки.

### 2.5 Батарея / AC
`/sys/class/power_supply/BAT1/`: `status`, `capacity`, `voltage_now`×`current_now` (charge-type) **или** `power_now` (energy-type) — обрабатываем оба варианта.
`/sys/class/power_supply/ACAD/online` — есть ли внешнее питание.

---

## 3. Модель событий

- **GUdev.Client** subsystems `['usb', 'typec', 'power_supply']` → сигнал `uevent(action, device)`:
  - `typec` partner add/remove → перечитать PD-секцию + уведомление
  - `usb` add/remove → пересобрать список устройств (+ уведомление, если включено)
  - `power_supply` change → обновить `online`
- **Polling-таймер** (`GLib.timeout_add_seconds`, фикс 2 с) — перечитывает `voltage_now`/`current_now` для живых значений. Работает только при активной зарядке (иначе значения статичны, hotplug ловит udev).
  - **Экономия энергии:** таймер работает только когда (dropdown открыт) ИЛИ (панель показывает ватты) ИЛИ (идёт зарядка). Иначе остановлен.
- Все таймеры/сигналы снимаются в `disable()`.

---

## 4. UI

### 4.1 Панель (топ-бар) — режим из настроек
`PanelMenu.Button` с symbolic-иконкой. Режим (`panel-mode`):
- `icon-only` — иконка меняет вид: заряд / питание без заряда / нет
- `icon-watts` — иконка + текущие ватты (`⚡45W`)
- `icon-watts-percent` — иконка + ватты + `↑92%`

**Авто-скрытие** (`hide-when-idle`, дефолт вкл): когда нет зарядника И нет notable-USB — индикатор (включая иконку) скрыт полностью.

### 4.2 Dropdown
```
⚡ Charging · 45 W · 92%              ← header
──────────────────────────────
USB-C port0  [sink]  UGREEN 100W
  15.0V · 3.00A · 45W
  ▸ PDO profiles                     ← submenu (если show-pdo-list)
USB-C port1  [host]  idle
──────────────────────────────
USB devices                          ← базовый список (usb-list-mode)
  Logitech Receiver        1.5M      → клик = submenu (полная инфа)
  SanDisk Ultra            5G
──────────────────────────────
⚙ Settings
```

**Drill-down submenu устройства** (полная детализация по клику):
```
SanDisk Ultra
  VID:PID    0781:5591
  Class      Mass Storage
  Speed      5 Gbps (USB 3.0)
  Driver     usb-storage
  Serial     4C531001…
  Port path  1-2
```

**PDO submenu зарядника** (`show-pdo-list`): все профили с подсветкой активного:
```
▸ PDO profiles — UGREEN 100W
  5.0V   3.0A   15W
  9.0V   3.0A   27W
  15.0V  3.0A   45W   ← active
  20.0V  5.0A  100W
  PPS 3.3–21.0V  5.0A (APDO)
```

---

## 5. Настройки (GSettings + Adwaita prefs)

Схема `org.gnome.shell.extensions.gnome-usb-mon`. Все доп-функции — тумблеры (по требованию).

| Ключ | Тип | Дефолт | Описание |
|---|---|---|---|
| `panel-mode` | enum | `icon-watts` | вид в топ-баре |
| `hide-when-idle` | bool | `true` | скрывать индикатор когда нет внешних устройств |
| `hide-ignore-list` | strv (`as`) | `[]` | что НЕ считать «внешним» для скрытия (VID:PID или класс) |
| `usb-list-mode` | enum {`basic`,`off`} | `basic` | список USB-устройств в меню |
| `usb-list-scope` | enum {`external`,`all`} | `external` | какие USB показывать (только removable / все) |
| `notify-charger` | bool | `true` | уведомления plug/unplug зарядника |
| `notify-usb` | bool | `false` | уведомления plug/unplug прочих USB |
| `show-pdo-list` | bool | `true` | submenu с PDO-профилями зарядника |

**`hide-ignore-list`**: при `hide-when-idle` индикатор виден, если есть хоть одно внешнее устройство, НЕ входящее в этот список. В prefs — список USB-устройств с чекбоксами «игнорировать» (по VID:PID) + пресеты по классу (напр. HID-ресиверы). Root-hubs всегда игнорируются.

`prefs.js` — `ExtensionPreferences`, Adwaita `Adw.PreferencesPage`/`Adw.ActionRow` с переключателями.

---

## 6. Доп-функции (детали)

- **Уведомления** (`MessageTray`): partner add → «Зарядник подключён: UGREEN 100W (max 20V·5A)»; remove → «Зарядник отключён». USB add/remove — по отдельному тумблеру, с дебаунсом от спама.
- **История/график** — НЕ в scope (не выбрано).

---

## 7. Graceful degrade

| Условие | Поведение |
|---|---|
| нет `/sys/class/typec/` | PD-секция скрыта, только список USB |
| нет UCSI (`ucsi-source-psy-*`) | нет живых ватт от зарядника — показываем роли портов + PDO если есть |
| нет батареи | пропуск скорости заряда/процента |
| partner без `source-capabilities` (не-PD / captive) | показываем как «подключён», без PDO |
| `voltage_now`/`current_now` == 0 (идёт негоциация) | «negotiating…», без цифры |
| N портов ≠ 2 | динамическая enumeration, без хардкода |

---

## 8. Структура проекта

```
gnome-usb-mon@typoska.github.io/
├── metadata.json
├── extension.js              # Extension: enable/disable, wiring
├── prefs.js                  # ExtensionPreferences (Adwaita)
├── stylesheet.css
├── lib/
│   ├── sysfs.js              # async Gio-хелперы чтения sysfs
│   ├── udev.js               # GUdev.Client + hotplug-сигналы
│   ├── pd.js                 # парсинг typec / partner / PDO / ucsi-psy
│   ├── usb.js                # enumeration USB-устройств
│   ├── power.js              # батарея/AC/ватты
│   └── notifier.js           # уведомления
├── ui/
│   ├── indicator.js          # PanelMenu.Button + панель-режимы
│   └── menu.js               # dropdown, drill-down submenu, PDO submenu
├── schemas/
│   └── org.gnome.shell.extensions.gnome-usb-mon.gschema.xml
└── fixtures/                 # dev-режим: слепки sysfs для тестов парсинга
```

`metadata.json`: `shell-version:["50"]`, `settings-schema`, `gettext-domain`.
GNOME 50 → ESM: `import Gio from 'gi://Gio'`, `export default class extends Extension`.

---

## 9. Тестируемость

Зарядник сейчас не воткнут → нельзя вживую проверить PDO-парсинг. Решение:
- **Dev-режим**: env `GNOME_USB_MON_SYSFS_ROOT=./fixtures` — все чтения sysfs идут из фикстур.
- Захватить слепки sysfs с воткнутым зарядником (PD + PPS) в `fixtures/` → unit-тест `pd.js` парсинга PDO/контракта офлайн.
- Ручной тест на живом железе: воткнуть PD-зарядник, свериться с `ucsi-source-psy/*` и партнёром.

---

## 10. Риски / заметки

- **Никаких sync-read в shell-процессе** — иначе фризы UI. Только `load_contents_async`.
- Батарея charge-type vs energy-type — считать мощность по доступным полям.
- Маппинг `ucsi-source-psy` ↔ `port` подтвердить на живом заряднике.
- Thunderbolt/USB4-доки: partner с множеством PDO — обрабатывать как обычный PD-source.
- Символьные иконки: взять системные (`battery-*-charging-symbolic`) либо свои SVG в `icons/`.

---

## 11. Этапы (milestones)

1. **M1 skeleton** — metadata, enable/disable, sysfs async-хелперы, статичное отображение ролей портов.
2. **M2 live PD** — GUdev hotplug + polling, живые ватты, скорость заряда.
3. **M3 USB list** — enumeration + базовый список + drill-down submenu.
4. **M4 prefs** — Adwaita-настройки, все тумблеры, panel-режимы, hide-when-idle.
5. **M5 доп** — уведомления, PDO submenu.
6. **M6 polish** — graceful degrade, фикстуры/тесты, упаковка (zip, install).

---

## Решения (зафиксировано)

1. **UUID:** `gnome-usb-mon@ska1006.github.io` · repo `git@github.com:Ska1006/gnomeUsbMon.git`
2. **Публикация:** только локальная установка (`~/.local/share/gnome-shell/extensions/`). Без extensions.gnome.org review, i18n опционально.
3. **Иконки:** системные symbolic (`battery-*-charging-symbolic` и пр.), свой набор не нужен.
4. **hide-when-idle:** скрывать индикатор если нет внешних устройств. Список игнора (`hide-ignore-list`) в настройках — какие устройства не учитывать. Root-hubs всегда игнор.
