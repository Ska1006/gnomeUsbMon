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
            title: _('Основное'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // --- Панель ---
        const gPanel = new Adw.PreferencesGroup({title: _('Панель')});
        page.add(gPanel);
        gPanel.add(comboRow(
            _('Отображение'), _('Что показывать в топ-баре'),
            settings, 'panel-mode',
            ['icon-only', 'icon-watts', 'icon-watts-percent'],
            [_('Только иконка'), _('Иконка + ватты'), _('Иконка + ватты + %')], handlers));
        gPanel.add(switchRow(
            _('Скрывать когда пусто'), _('Прятать индикатор без внешних устройств'),
            settings, 'hide-when-idle'));

        // --- USB-список ---
        const gUsb = new Adw.PreferencesGroup({title: _('Список USB')});
        page.add(gUsb);
        gUsb.add(comboRow(
            _('Показывать список'), null,
            settings, 'usb-list-mode',
            ['basic', 'off'],
            [_('Базовый'), _('Выкл')], handlers));
        gUsb.add(comboRow(
            _('Охват'), _('Только внешние (removable) или все устройства'),
            settings, 'usb-list-scope',
            ['external', 'all'],
            [_('Только внешние'), _('Все')], handlers));

        // --- Уведомления ---
        const gNotify = new Adw.PreferencesGroup({title: _('Уведомления')});
        page.add(gNotify);
        gNotify.add(switchRow(_('Зарядник'), _('Подключение/отключение PD-зарядника'),
            settings, 'notify-charger'));
        gNotify.add(switchRow(_('USB-устройства'), _('Подключение/отключение прочих USB'),
            settings, 'notify-usb'));

        // --- Доп-функции ---
        const gFeat = new Adw.PreferencesGroup({title: _('Дополнительно')});
        page.add(gFeat);
        gFeat.add(switchRow(_('PDO-профили'), _('Submenu с профилями питания зарядника'),
            settings, 'show-pdo-list'));

        // --- Игнор для авто-скрытия ---
        this._fillIgnoreGroup(page, settings);
    }

    _fillIgnoreGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Игнорировать для авто-скрытия'),
            description: _('Внешние устройства, которые НЕ должны показывать индикатор'),
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
                title: _('Нет внешних устройств'),
                subtitle: _('Подключите устройство и снова откройте настройки'),
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
