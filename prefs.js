import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GUdev from 'gi://GUdev';

import * as PrefsMod from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {listUsbDevices} from './lib/usb.js';

const {ExtensionPreferences} = PrefsMod;
const _ = PrefsMod.gettext ?? (s => s);

function comboRow(title, subtitle, settings, key, nicks, labels, handlers) {
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: Gtk.StringList.new(labels),
    });
    const sync = () => {
        const i = nicks.indexOf(settings.get_string(key));
        if (i >= 0 && i !== row.selected)
            row.selected = i;
    };
    sync();
    row.connect('notify::selected', () => {
        const nick = nicks[row.selected];
        if (nick && nick !== settings.get_string(key))
            settings.set_string(key, nick);
    });
    // Сигнал на settings живёт дольше окна → регистрируем для disconnect при закрытии.
    handlers.push(settings.connect(`changed::${key}`, sync));
    return row;
}

function switchRow(title, subtitle, settings, key) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export default class GnomeUsbMonPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const handlers = [];
        window.connect('destroy', () => {
            for (const id of handlers)
                settings.disconnect(id);
        });
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // --- Panel ---
        const gPanel = new Adw.PreferencesGroup({title: _('Panel')});
        page.add(gPanel);
        gPanel.add(comboRow(
            _('Display'), _('What to show in the top bar'),
            settings, 'panel-mode',
            ['icon-only', 'icon-watts', 'icon-watts-percent'],
            [_('Icon only'), _('Icon + watts'), _('Icon + watts + %')], handlers));
        gPanel.add(switchRow(
            _('Hide when empty'), _('Hide the indicator when there are no external devices'),
            settings, 'hide-when-idle'));

        // --- USB list ---
        const gUsb = new Adw.PreferencesGroup({title: _('USB list')});
        page.add(gUsb);
        gUsb.add(comboRow(
            _('Show list'), null,
            settings, 'usb-list-mode',
            ['basic', 'off'],
            [_('Basic'), _('Off')], handlers));
        gUsb.add(comboRow(
            _('Scope'), _('External (removable) only, or all devices'),
            settings, 'usb-list-scope',
            ['external', 'all'],
            [_('External only'), _('All')], handlers));

        // --- Notifications ---
        const gNotify = new Adw.PreferencesGroup({title: _('Notifications')});
        page.add(gNotify);
        gNotify.add(switchRow(_('Charger'), _('PD charger plug/unplug'),
            settings, 'notify-charger'));
        gNotify.add(switchRow(_('USB devices'), _('Other USB devices plug/unplug'),
            settings, 'notify-usb'));

        // --- Advanced ---
        const gFeat = new Adw.PreferencesGroup({title: _('Advanced')});
        page.add(gFeat);
        gFeat.add(switchRow(_('PDO profiles'), _('Submenu with charger power profiles'),
            settings, 'show-pdo-list'));

        // --- Игнор для авто-скрытия ---
        this._fillIgnoreGroup(page, settings);
    }

    _fillIgnoreGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Ignore for auto-hide'),
            description: _('External devices that should NOT show the indicator'),
        });
        page.add(group);

        let devs = [];
        try {
            const client = new GUdev.Client({subsystems: ['usb']});
            devs = listUsbDevices(client).filter(d => d.external);
        } catch (e) {
            logError(e, 'gnome-usb-mon prefs: usb enum');
        }

        if (!devs.length) {
            group.add(new Adw.ActionRow({
                title: _('No external devices'),
                subtitle: _('Plug a device and reopen settings'),
            }));
            return;
        }

        for (const d of devs) {
            const row = new Adw.SwitchRow({
                title: d.title,
                subtitle: `${d.vidpid} · ${d.className} · ${d.speed}`,
            });
            row.active = settings.get_strv('hide-ignore-list').includes(d.vidpid);
            row.connect('notify::active', () => {
                let cur = settings.get_strv('hide-ignore-list');
                if (row.active) {
                    if (!cur.includes(d.vidpid))
                        cur.push(d.vidpid);
                } else {
                    cur = cur.filter(x => x !== d.vidpid);
                }
                settings.set_strv('hide-ignore-list', cur);
            });
            group.add(row);
        }
    }
}
