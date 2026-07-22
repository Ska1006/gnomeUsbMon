// GUdev wrapper: hotplug events for usb/typec/power_supply.
// 'changed'(action, subsystem) signal — the consumer re-reads state.
import GObject from 'gi://GObject';
import GUdev from 'gi://GUdev';

export const UdevMonitor = GObject.registerClass({
    Signals: {
        'changed': {param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING]},
    },
}, class UdevMonitor extends GObject.Object {
    _init() {
        super._init();
        this._client = new GUdev.Client({
            subsystems: ['usb', 'typec', 'power_supply'],
        });
        this._handlerId = this._client.connect('uevent', (_c, action, device) => {
            let subsystem = '';
            try {
                subsystem = device.get_subsystem() ?? '';
            } catch {
                // device may be incomplete
            }
            this.emit('changed', action, subsystem);
        });
    }

    // shared GUdev.Client, reused for enumeration in usb.js
    get client() {
        return this._client;
    }

    destroy() {
        if (this._handlerId) {
            this._client.disconnect(this._handlerId);
            this._handlerId = 0;
        }
        this._client = null;
    }
});
