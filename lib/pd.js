// USB-C / Power Delivery reader: роли портов, наличие партнёра (зарядника).
// M1: роли + partner-флаг. PDO/негоциированные ватты — M2.
import {readStrOpt, readInt, listDir, SYS} from './sysfs.js';

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

// --- PDO зарядника (source-capabilities партнёра) ---

const mv2v = mv => (mv == null ? null : mv / 1000);
const ma2a = ma => (ma == null ? null : ma / 1000);
const f1 = x => (x == null ? '?' : x.toFixed(1));
const f2 = x => (x == null ? '?' : x.toFixed(2));

/**
 * PDO-профили зарядника из
 * /sys/class/typec/<port>-partner/usb_power_delivery/source-capabilities/.
 * [] если партнёра/PD нет. Поля по kernel usb_power_delivery ABI:
 * fixed: voltage/maximum_current (mV/mA); pps/variable: min/max_voltage,
 * maximum_current; battery: min/max_voltage, maximum_power.
 */
export async function readPartnerPdos(port) {
    const dir = `${TYPEC}/${port}-partner/usb_power_delivery/source-capabilities`;
    const entries = listDir(dir, /^\d+:/);
    const pdos = [];
    for (const e of entries) {
        const base = `${dir}/${e}`;
        const type = e.replace(/^\d+:/, '');

        if (type === 'fixed_supply') {
            const v = mv2v(await readInt(`${base}/voltage`));
            let iRaw = await readInt(`${base}/maximum_current`);
            if (iRaw == null)
                iRaw = await readInt(`${base}/operational_current`); // sink-именование, fallback
            const a = ma2a(iRaw);
            const watts = v != null && a != null ? v * a : null;
            pdos.push({
                type, volts: v, amps: a, watts,
                label: `${f1(v)}V · ${f2(a)}A · ${watts != null ? Math.round(watts) : '?'}W`,
            });
        } else if (type === 'programmable_supply') {
            const [vmax, vmin, imax] = await Promise.all([
                readInt(`${base}/maximum_voltage`),
                readInt(`${base}/minimum_voltage`),
                readInt(`${base}/maximum_current`),
            ]);
            pdos.push({
                type, watts: null,
                label: `PPS ${f1(mv2v(vmin))}–${f1(mv2v(vmax))}V · ${f2(ma2a(imax))}A`,
            });
        } else if (type === 'variable_supply') {
            const [vmax, vmin, imax] = await Promise.all([
                readInt(`${base}/maximum_voltage`),
                readInt(`${base}/minimum_voltage`),
                readInt(`${base}/maximum_current`),
            ]);
            pdos.push({
                type, watts: null,
                label: `${f1(mv2v(vmin))}–${f1(mv2v(vmax))}V · ${f2(ma2a(imax))}A`,
            });
        } else if (type === 'battery') {
            const [vmax, vmin, pmax] = await Promise.all([
                readInt(`${base}/maximum_voltage`),
                readInt(`${base}/minimum_voltage`),
                readInt(`${base}/maximum_power`),
            ]);
            const w = pmax != null ? pmax / 1000 : null;
            pdos.push({
                type, watts: w,
                label: `Battery ${f1(mv2v(vmin))}–${f1(mv2v(vmax))}V · ${w != null ? Math.round(w) : '?'}W`,
            });
        }
    }
    return pdos;
}

/** Максимальная мощность зарядника по PDO (для уведомления). */
export function pdoMaxWatts(pdos) {
    let max = 0;
    for (const p of pdos) {
        if (p.watts != null && p.watts > max)
            max = p.watts;
    }
    return max;
}
