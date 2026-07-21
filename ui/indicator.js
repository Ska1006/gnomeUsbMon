import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {readAllPorts} from '../lib/pd.js';
import {readUcsiSources, readBattery, acOnline} from '../lib/power.js';
import {UdevMonitor} from '../lib/udev.js';

export const Indicator = GObject.registerClass(
class UsbPdIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.5, 'USB & PD Monitor');
        this._settings = settings;
        this._menuOpen = false;
        this._chargerActive = false;
        this._timerId = 0;
        this._refreshBusy = false;
        this._snapshot = null;

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
        this._header = new PopupMenu.PopupMenuItem('USB & PD Monitor', {reactive: false});
        this.menu.addMenuItem(this._header);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._portSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._portSection);

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

        // --- реакция на настройки ---
        this._settingsId = this._settings.connect('changed', () => {
            if (this._timerId) {
                GLib.Source.remove(this._timerId);
                this._timerId = 0;
            }
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
            const [ports, sources, battery, ac] = await Promise.all([
                readAllPorts(),
                readUcsiSources(),
                readBattery(),
                acOnline(),
            ]);
            this._snapshot = {ports, sources, battery, ac};
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
        const {ports, sources, battery, ac} = this._snapshot;

        const onlineSources = sources.filter(s => s.online);
        const chargerWatts = onlineSources.reduce((a, s) => a + (s.watts ?? 0), 0);
        this._chargerActive = onlineSources.length > 0;
        const hasPartner = ports.some(p => p.partner);

        // Иконка по состоянию питания.
        let iconName = 'media-removable-symbolic';
        if (battery?.charging || this._chargerActive)
            iconName = 'battery-full-charging-symbolic';
        else if (ac)
            iconName = 'ac-adapter-symbolic';
        this._icon.icon_name = iconName;

        // Метка в панели.
        const mode = this._settings.get_string('panel-mode');
        let panelTxt = '';
        if (mode !== 'icon-only' && this._chargerActive) {
            panelTxt = `${Math.round(chargerWatts)}W`;
            if (mode === 'icon-watts-percent' && battery?.capacity != null)
                panelTxt += ` ${battery.capacity}%`;
        }
        this._label.text = panelTxt;
        this._label.visible = panelTxt.length > 0;

        // Видимость индикатора (hide-when-idle).
        // M2: «внешнее» = зарядник/partner. USB-устройства учтутся в M3.
        const hasExternal = this._chargerActive || hasPartner;
        const hide = this._settings.get_boolean('hide-when-idle') && !hasExternal;
        this.container.visible = !hide;

        // Заголовок меню.
        this._header.label.text = this._headerText(chargerWatts, battery);

        // Порты.
        this._portSection.removeAll();
        for (const p of ports) {
            const idx = parseInt(p.name.replace('port', ''), 10);
            const src = sources.find(s => s.portIndex === idx && s.online);
            const pr = p.powerRole.active ?? '?';
            const dr = p.dataRole.active ?? '?';
            let line = `USB-C ${p.name}  [${pr}/${dr}]`;
            if (src && src.volts != null && src.amps != null)
                line += `  ${src.volts.toFixed(1)}V·${src.amps.toFixed(2)}A·${Math.round(src.watts)}W`;
            else
                line += p.partner ? '  подключено' : '  idle';
            this._portSection.addMenuItem(new PopupMenu.PopupMenuItem(line, {reactive: false}));
        }
    }

    _headerText(chargerWatts, battery) {
        if (this._chargerActive) {
            let s = `${battery?.charging ? 'Заряд' : 'Питание'} · ${chargerWatts.toFixed(1)} W`;
            if (battery?.capacity != null)
                s += ` · ${battery.capacity}%`;
            return s;
        }
        if (battery) {
            const state = battery.discharging ? 'Разряд'
                : battery.charging ? 'Заряд'
                : (battery.status ?? '');
            let s = `Батарея: ${state}`;
            if (battery.watts != null)
                s += ` · ${battery.watts.toFixed(1)} W`;
            if (battery.capacity != null)
                s += ` · ${battery.capacity}%`;
            return s;
        }
        return 'Нет внешнего питания';
    }

    // Polling нужен только когда меню открыто ИЛИ идёт зарядка (живые ватты).
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
        super.destroy();
    }
});
