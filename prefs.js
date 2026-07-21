import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GUdev from 'gi://GUdev';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {listUsbDevices} from './lib/usb.js';

function comboRow(title, subtitle, settings, key, nicks, labels) {
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
    settings.connect(`changed::${key}`, sync);
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
        const page = new Adw.PreferencesPage({
            title: 'Основное',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // --- Панель ---
        const gPanel = new Adw.PreferencesGroup({title: 'Панель'});
        page.add(gPanel);
        gPanel.add(comboRow(
            'Отображение', 'Что показывать в топ-баре',
            settings, 'panel-mode',
            ['icon-only', 'icon-watts', 'icon-watts-percent'],
            ['Только иконка', 'Иконка + ватты', 'Иконка + ватты + %']));
        gPanel.add(switchRow(
            'Скрывать когда пусто', 'Прятать индикатор без внешних устройств',
            settings, 'hide-when-idle'));

        const spin = new Adw.SpinRow({
            title: 'Интервал опроса',
            subtitle: 'Секунды между чтением живых ватт',
            adjustment: new Gtk.Adjustment({
                lower: 1, upper: 10, step_increment: 1, page_increment: 1,
            }),
        });
        settings.bind('poll-interval', spin, 'value', Gio.SettingsBindFlags.DEFAULT);
        gPanel.add(spin);

        // --- USB-список ---
        const gUsb = new Adw.PreferencesGroup({title: 'Список USB'});
        page.add(gUsb);
        gUsb.add(comboRow(
            'Показывать список', null,
            settings, 'usb-list-mode',
            ['basic', 'off'],
            ['Базовый', 'Выкл']));
        gUsb.add(comboRow(
            'Охват', 'Только внешние (removable) или все устройства',
            settings, 'usb-list-scope',
            ['external', 'all'],
            ['Только внешние', 'Все']));

        // --- Уведомления ---
        const gNotify = new Adw.PreferencesGroup({title: 'Уведомления'});
        page.add(gNotify);
        gNotify.add(switchRow('Зарядник', 'Подключение/отключение PD-зарядника',
            settings, 'notify-charger'));
        gNotify.add(switchRow('USB-устройства', 'Подключение/отключение прочих USB',
            settings, 'notify-usb'));

        // --- Доп-функции ---
        const gFeat = new Adw.PreferencesGroup({title: 'Дополнительно'});
        page.add(gFeat);
        gFeat.add(switchRow('PDO-профили', 'Submenu с профилями питания зарядника',
            settings, 'show-pdo-list'));

        // --- Игнор для авто-скрытия ---
        this._fillIgnoreGroup(page, settings);
    }

    _fillIgnoreGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Игнорировать для авто-скрытия',
            description: 'Внешние устройства, которые НЕ должны показывать индикатор',
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
                title: 'Нет внешних устройств',
                subtitle: 'Подключите устройство и снова откройте настройки',
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
