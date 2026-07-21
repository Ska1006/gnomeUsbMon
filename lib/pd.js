// USB-C / Power Delivery reader: роли портов, наличие партнёра (зарядника).
// M1: роли + partner-флаг. PDO/негоциированные ватты — M2.
import {readStrOpt, listDir, SYS} from './sysfs.js';

const TYPEC = `${SYS}/sys/class/typec`;

/**
 * Parse "source [sink]" → {active:'sink', options:['source','sink']}.
 * Активная роль — в квадратных скобках.
 */
export function parseRole(raw) {
    if (!raw)
        return {active: null, options: []};
    const options = [];
    let active = null;
    for (const tok of raw.split(/\s+/)) {
        const m = tok.match(/^\[(.+)\]$/);
        if (m) {
            active = m[1];
            options.push(m[1]);
        } else {
            options.push(tok);
        }
    }
    return {active, options};
}

/** Имена typec-портов: ['port0','port1']. */
export function listPorts() {
    return listDir(TYPEC, /^port\d+$/);
}

/** Состояние одного порта. */
export async function readPort(name) {
    const base = `${TYPEC}/${name}`;
    const [powerRaw, dataRaw, mode, rev, orient] = await Promise.all([
        readStrOpt(`${base}/power_role`),
        readStrOpt(`${base}/data_role`),
        readStrOpt(`${base}/power_operation_mode`),
        readStrOpt(`${base}/usb_power_delivery_revision`),
        readStrOpt(`${base}/orientation`),
    ]);
    const partner = listDir(TYPEC, new RegExp(`^${name}-partner$`)).length > 0;
    return {
        name,
        powerRole: parseRole(powerRaw),
        dataRole: parseRole(dataRaw),
        mode,
        pdRevision: rev,
        orientation: orient,
        partner,
    };
}

/** Все порты. */
export async function readAllPorts() {
    return Promise.all(listPorts().map(readPort));
}

/** Есть ли вообще typec-подсистема (для graceful degrade). */
export function hasTypec() {
    return listPorts().length > 0;
}
