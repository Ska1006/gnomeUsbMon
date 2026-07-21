import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {readAllPorts, readPartnerPdos, pdoMaxWatts} from '../lib/pd.js';
import {readUcsiSources, readBattery, acOnline} from '../lib/power.js';
import {listUsbDevices, isIgnored} from '../lib/usb.js';
import {UdevMonitor} from '../lib/udev.js';
import {Notifier} from '../lib/notifier.js';

export const Indicator = GObject.registerClass(
class UsbPdIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'USB & PD Monitor');
        this._extension = extension;
        this._settings = extension.getSettings();
        this._menuOpen = false;
        this._chargerActive = false;
        this._timerId = 0;
        this._refreshBusy = false;
        this._snapshot = null;
        this._usbSig = null;
        this._portSig = null;
        this._portRows = [];
        this._prevCharger = null; // Map portIndex → label (для diff-уведомлений)
        this._prevUsb = null;     // Map name → dev

        this._notifier = new Notifier();

        // --- панель ---
        this._box = new St.BoxLayout({style_class: 'panel-status-indicators-box'});
        this._icon = new St.Icon({
            icon_name: 'media-removable-symbolic',
            style_class: 'system-status-icon',
        });
        this._label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._box.add_child(this._icon);
        this._box.add_child(this._label);
        this.add_child(this._box);

        // --- меню ---
        this._header = new PopupMenu.PopupImageMenuItem('USB & PD Monitor',
            'media-removable-symbolic', {reactive: false});
        this._header.add_style_class_name('umon-header');
        this.menu.addMenuItem(this._header);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._portSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._portSection);

        this._usbSep = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this._usbSep);
        this._usbTitle = new PopupMenu.PopupMenuItem('USB устройства', {reactive: false});
        this._usbTitle.add_style_class_name('umon-section-title');
        this.menu.addMenuItem(this._usbTitle);
        this._usbSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._usbSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = new PopupMenu.PopupMenuItem('Настройки');
        settingsItem.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(settingsItem);

        this.menu.connect('open-state-changed', (_m, open) => {
            this._menuOpen = open;
            if (open)
                this.refresh();
            else
                this._ensurePolling();
        });

        // --- hotplug ---
        this._udev = new UdevMonitor();
        this._udevId = this._udev.connect('changed', () => this.refresh());

        // --- настройки ---
        this._settingsId = this._settings.connect('changed', () => {
            if (this._timerId) {
                GLib.Source.remove(this._timerId);
                this._timerId = 0;
            }
            this._usbSig = null;
            this._portSig = null;
            this._render();
            this._ensurePolling();
        });

        this.refresh();
    }

    async refresh() {
        if (this._refreshBusy)
            return;
        this._refreshBusy = true;
        try {
            const ports = await readAllPorts();
            const pdoMap = {};
            await Promise.all(ports.filter(p => p.partner).map(async p => {
                pdoMap[p.name] = await readPartnerPdos(p.name);
            }));
            const [sources, battery, ac] = await Promise.all([
                readUcsiSources(),
                readBattery(),
                acOnline(),
            ]);
            this._snapshot = {ports, pdoMap, sources, battery, ac};
            this._render();
            this._ensurePolling();
        } catch (e) {
            console.error(`gnome-usb-mon: refresh failed: ${e}`);
        } finally {
            this._refreshBusy = false;
        }
    }

    _render() {
        if (!this._snapshot)
            return;
        const {ports, pdoMap, sources, battery, ac} = this._snapshot;

        const onlineSources = sources.filter(s => s.online);
        const chargerWatts = onlineSources.reduce((a, s) => a + (s.watts ?? 0), 0);
        this._chargerActive = onlineSources.length > 0;
        const hasPartner = ports.some(p => p.partner);

        const usbAll = this._udev?.client ? listUsbDevices(this._udev.client) : [];
        const ignore = this._settings.get_strv('hide-ignore-list');
        const externalUsb = usbAll.filter(d => d.external && !isIgnored(d, ignore));

        // Уведомления plug/unplug.
        this._diffNotify(onlineSources, pdoMap, usbAll);

        // Иконка панели + шапки по состоянию.
        const deviceConnected = externalUsb.length > 0 || hasPartner;
        let iconName;
        if (this._chargerActive || battery?.charging)
            iconName = 'battery-full-charging-symbolic';   // зарядник / идёт заряд
        else if (deviceConnected)
            iconName = 'drive-harddisk-usb-symbolic';      // подключено НЕ-зарядное устройство
        else if (ac)
            iconName = 'ac-adapter-symbolic';              // внешнее питание без PD
        else
            iconName = 'media-removable-symbolic';
        this._icon.icon_name = iconName;
        if (this._header.setIcon)
            this._header.setIcon(iconName);

        // Метка панели.
        const mode = this._settings.get_string('panel-mode');
        let panelTxt = '';
        if (mode !== 'icon-only' && this._chargerActive) {
            panelTxt = `${Math.round(chargerWatts)}W`;
            if (mode === 'icon-watts-percent' && battery?.capacity != null)
                panelTxt += ` ${battery.capacity}%`;
        }
        this._label.text = panelTxt;
        this._label.visible = panelTxt.length > 0;

        // Видимость.
        const hasExternal = this._chargerActive || hasPartner || externalUsb.length > 0;
        const hide = this._settings.get_boolean('hide-when-idle') && !hasExternal;
        this.container.visible = !hide;

        // Заголовок.
        this._header.label.text = this._headerText(chargerWatts, battery);

        // Порты (+ PDO submenu).
        this._renderPorts(ports, pdoMap, sources);

        // USB.
        this._renderUsb(usbAll);
    }

    _portTitle(p, src) {
        const pr = p.powerRole.active ?? '?';
        const dr = p.dataRole.active ?? '?';
        let t = `USB-C ${p.name}  [${pr}/${dr}]`;
        if (src && src.volts != null && src.amps != null)
            t += `  ${src.volts.toFixed(1)}V·${src.amps.toFixed(2)}A·${Math.round(src.watts)}W`;
        else
            t += p.partner ? '  подключено' : '  idle';
        return t;
    }

    _renderPorts(ports, pdoMap, sources) {
        const showPdo = this._settings.get_boolean('show-pdo-list');

        // Структурная сигнатура (без живых ватт). Пока не меняется — submenu НЕ
        // пересобираем, только обновляем ватты в label, иначе открытое меню схлопывается.
        const sig = JSON.stringify(ports.map(p => {
            const idx = parseInt(p.name.replace('port', ''), 10);
            const online = sources.some(s => s.portIndex === idx && s.online);
            const pdos = pdoMap[p.name] ?? [];
            const pdoLabels = showPdo && p.partner && pdos.length ? pdos.map(x => x.label) : 0;
            return [p.name, p.powerRole.active, p.dataRole.active, p.partner, online, pdoLabels];
        }));
        if (sig === this._portSig) {
            this._updatePortLabels(ports, sources);
            return;
        }
        this._portSig = sig;

        this._portSection.removeAll();
        this._portRows = [];
        for (const p of ports) {
            const idx = parseInt(p.name.replace('port', ''), 10);
            const src = sources.find(s => s.portIndex === idx && s.online);
            const title = this._portTitle(p, src);
            const pdos = pdoMap[p.name] ?? [];
            const icon = this._portIcon(p, src);

            let item;
            if (showPdo && p.partner && pdos.length) {
                item = new PopupMenu.PopupSubMenuMenuItem(title, true);
                item.icon.icon_name = icon;
                const negV = src?.volts ?? null;
                for (const pdo of pdos) {
                    let lbl = pdo.label;
                    if (pdo.type === 'fixed_supply' && negV != null &&
                        pdo.volts != null && Math.abs(pdo.volts - negV) < 0.6)
                        lbl += '  ← активно';
                    item.menu.addMenuItem(new PopupMenu.PopupMenuItem(lbl, {reactive: false}));
                }
            } else {
                item = new PopupMenu.PopupImageMenuItem(title, icon, {reactive: false});
            }
            this._portSection.addMenuItem(item);
            this._portRows.push({item, portName: p.name, idx});
        }
    }

    _updatePortLabels(ports, sources) {
        for (const row of this._portRows) {
            const p = ports.find(pp => pp.name === row.portName);
            if (!p)
                continue;
            const src = sources.find(s => s.portIndex === row.idx && s.online);
            row.item.label.text = this._portTitle(p, src);
        }
    }

    _renderUsb(usbAll) {
        const listMode = this._settings.get_string('usb-list-mode');
        if (listMode === 'off') {
            this._usbSep.visible = false;
            this._usbTitle.visible = false;
            this._usbSection.removeAll();
            this._usbSig = null;
            return;
        }
        this._usbSep.visible = true;
        this._usbTitle.visible = true;

        const scope = this._settings.get_string('usb-list-scope');
        const shown = scope === 'all' ? usbAll : usbAll.filter(d => d.external);
        this._usbTitle.label.text = `USB устройства (${shown.length})`;

        const sig = JSON.stringify(shown.map(d => [d.name, d.vidpid]));
        if (sig === this._usbSig)
            return;
        this._usbSig = sig;

        this._usbSection.removeAll();
        if (!shown.length) {
            const empty = scope === 'external' ? 'нет внешних устройств' : 'нет устройств';
            this._usbSection.addMenuItem(new PopupMenu.PopupMenuItem(empty, {reactive: false}));
            return;
        }
        for (const dev of shown)
            this._usbSection.addMenuItem(this._buildUsbItem(dev));
    }

    _portIcon(p, src) {
        if (src)
            return 'battery-full-charging-symbolic'; // активный PD-source
        if (p.partner)
            return 'drive-harddisk-usb-symbolic';    // устройство, но не заряжает
        return 'media-removable-symbolic';           // idle
    }

    _usbIcon(classHex) {
        switch (classHex) {
        case 0x08: return 'drive-harddisk-usb-symbolic'; // Mass Storage
        case 0x03: return 'input-keyboard-symbolic';     // HID
        case 0x01: return 'audio-headphones-symbolic';   // Audio
        case 0x06:
        case 0x0e: return 'camera-web-symbolic';         // Image / Video
        case 0x07: return 'printer-symbolic';            // Printer
        case 0x09: return 'view-grid-symbolic';          // Hub
        case 0x02:
        case 0xe0: return 'network-wireless-symbolic';   // Comm / Wireless
        default: return 'media-removable-symbolic';
        }
    }

    _buildUsbItem(dev) {
        const item = new PopupMenu.PopupSubMenuMenuItem(`${dev.title}   ${dev.speed}`, true);
        item.icon.icon_name = this._usbIcon(dev.classHex);
        const add = (k, v) => {
            if (v != null && v !== '')
                item.menu.addMenuItem(new PopupMenu.PopupMenuItem(`${k}: ${v}`, {reactive: false}));
        };
        add('VID:PID', dev.vidpid);
        add('Класс', dev.className);
        add('Скорость', dev.speed);
        add('Драйвер', dev.driver);
        add('Serial', dev.serial);
        add('Порт', dev.name);
        add('Тип', dev.removable);
        return item;
    }

    _diffNotify(onlineSources, pdoMap, usbAll) {
        const curCharger = new Map();
        for (const s of onlineSources) {
            const port = `port${s.portIndex}`;
            const maxW = pdoMaxWatts(pdoMap[port] ?? []);
            const w = maxW > 0 ? maxW : (s.watts ?? 0);
            curCharger.set(s.portIndex, `${Math.round(w)}W`);
        }
        const curUsb = new Map(usbAll.map(d => [d.name, d]));

        // Первый проход — только базлайн, без уведомлений о том, что уже воткнуто.
        if (this._prevCharger !== null) {
            if (this._settings.get_boolean('notify-charger')) {
                for (const [idx, lbl] of curCharger) {
                    if (!this._prevCharger.has(idx))
                        this._notifier.notify('Зарядник подключён',
                            `Порт ${idx} · ${lbl}`, 'battery-full-charging-symbolic');
                }
                for (const idx of this._prevCharger.keys()) {
                    if (!curCharger.has(idx))
                        this._notifier.notify('Зарядник отключён',
                            `Порт ${idx}`, 'battery-missing-symbolic');
                }
            }
            if (this._settings.get_boolean('notify-usb')) {
                for (const [k, d] of curUsb) {
                    if (!this._prevUsb.has(k))
                        this._notifier.notify('USB подключено',
                            `${d.title} · ${d.speed}`, 'media-removable-symbolic');
                }
                for (const [k, d] of this._prevUsb) {
                    if (!curUsb.has(k))
                        this._notifier.notify('USB отключено', d.title, 'media-removable-symbolic');
                }
            }
        }
        this._prevCharger = curCharger;
        this._prevUsb = curUsb;
    }

    _headerText(chargerWatts, battery) {
        if (this._chargerActive) {
            const pd = `PD ${chargerWatts.toFixed(0)}W`; // контракт (потолок), не живой замер
            const state = battery?.charging ? 'Заряд' : 'Питание';
            let s = state;
            if (battery?.capacity != null)
                s += ` · ${battery.capacity}%`;
            return `${s} · ${pd}`;
        }
        if (battery) {
            const state = battery.discharging ? 'Разряд'
                : battery.charging ? 'Заряд'
                : (battery.status ?? '');
            let s = `Батарея: ${state}`;
            if (battery.capacity != null)
                s += ` · ${battery.capacity}%`;
            return s;
        }
        return 'Нет внешнего питания';
    }

    // Polling только когда меню открыто ИЛИ идёт зарядка (живые ватты).
    _ensurePolling() {
        const need = this._menuOpen || this._chargerActive;
        if (need && !this._timerId) {
            const iv = this._settings.get_int('poll-interval');
            this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, iv, () => {
                this.refresh();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!need && this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }
    }

    destroy() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }
        if (this._udev) {
            this._udev.disconnect(this._udevId);
            this._udev.destroy();
            this._udev = null;
        }
        if (this._settingsId) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = 0;
        }
        this._notifier?.destroy();
        this._notifier = null;
        super.destroy();
    }
});
