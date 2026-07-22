import Gio from 'gi://Gio';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Notifier {
    constructor() {
        this._source = null;
    }

    _ensureSource() {
        if (!this._source) {
            this._source = new MessageTray.Source({
                title: 'USB & PD Monitor',
                iconName: 'media-removable-symbolic',
            });
            Main.messageTray.add(this._source);
        }
        return this._source;
    }

    notify(title, body, iconName) {
        try {
            const source = this._ensureSource();
            const params = {source, title, body, isTransient: true};
            if (iconName)
                params.gicon = new Gio.ThemedIcon({name: iconName});
            source.addNotification(new MessageTray.Notification(params));
        } catch (e) {
            console.error(`gnome-usb-mon: notify failed: ${e}`);
        }
    }

    destroy() {
        this._source?.destroy();
        this._source = null;
    }
}
