import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {readAllPorts} from '../lib/pd.js';

export const Indicator = GObject.registerClass(
class UsbPdIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'USB & PD Monitor');

        this._icon = new St.Icon({
            icon_name: 'media-removable-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        this._header = new PopupMenu.PopupMenuItem('USB & PD Monitor', {reactive: false});
        this.menu.addMenuItem(this._header);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._portSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._portSection);

        // Перечитываем при открытии меню (в M2 — живой polling).
        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this.refresh();
        });

        this.refresh();
    }

    async refresh() {
        try {
            const ports = await readAllPorts();
            this._portSection.removeAll();

            if (!ports.length) {
                this._portSection.addMenuItem(
                    new PopupMenu.PopupMenuItem('Type-C порты не найдены', {reactive: false}));
                return;
            }

            for (const p of ports) {
                const pr = p.powerRole.active ?? '?';
                const dr = p.dataRole.active ?? '?';
                const state = p.partner ? 'подключено' : 'idle';
                const label = `USB-C ${p.name}  [${pr}/${dr}]  ${state}`;
                this._portSection.addMenuItem(
                    new PopupMenu.PopupMenuItem(label, {reactive: false}));
            }
        } catch (e) {
            console.error(`gnome-usb-mon: refresh failed: ${e}`);
        }
    }
});
