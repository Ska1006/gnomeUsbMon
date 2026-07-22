// USB-C / Power Delivery reader: port roles, partner (charger) presence, PDOs.
import {readStrOpt, readInt, listDir, pathExists, SYS} from './sysfs.js';

const TYPEC = `${SYS}/sys/class/typec`;

/**
 * Parse "source [sink]" → {active:'sink', options:['source','sink']}.
 * The active role is the one in brackets.
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

/** Type-C port names: ['port0','port1']. */
export function listPorts() {
    return listDir(TYPEC, /^port\d+$/);
}

/** State of a single port. */
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

/** All ports. */
export async function readAllPorts() {
    return Promise.all(listPorts().map(readPort));
}

/** Whether the typec subsystem exists at all (graceful degrade). */
export function hasTypec() {
    return listPorts().length > 0;
}

const mv2v = mv => (mv == null ? null : mv / 1000);
const ma2a = ma => (ma == null ? null : ma / 1000);
const f1 = x => (x == null ? '?' : x.toFixed(1));
const f2 = x => (x == null ? '?' : x.toFixed(2));

/**
 * Partner source-capabilities directory. Layout depends on the kernel:
 *   new:    <partner>/pdN/source-capabilities            (N varies)
 *   legacy: <partner>/usb_power_delivery/source-capabilities
 * null if there is no partner / no PD.
 */
function partnerSourceCaps(port) {
    const partner = `${TYPEC}/${port}-partner`;
    const legacy = `${partner}/usb_power_delivery/source-capabilities`;
    if (pathExists(legacy))
        return legacy;
    for (const pd of listDir(partner, /^pd\d+$/)) {
        const cand = `${partner}/${pd}/source-capabilities`;
        if (pathExists(cand))
            return cand;
    }
    return null;
}

/**
 * Charger PDO profiles from the partner source-capabilities. [] if none.
 * sysfs values carry unit suffixes (5000mV / 3000mA) — parseInt strips them.
 * fixed: voltage/maximum_current; pps/variable: min/max_voltage,
 * maximum_current; battery: min/max_voltage, maximum_power.
 */
export async function readPartnerPdos(port) {
    const dir = partnerSourceCaps(port);
    if (!dir)
        return [];
    const entries = listDir(dir, /^\d+:/);
    const pdos = [];
    for (const e of entries) {
        const base = `${dir}/${e}`;
        const type = e.replace(/^\d+:/, '');

        if (type === 'fixed_supply') {
            const v = mv2v(await readInt(`${base}/voltage`));
            let iRaw = await readInt(`${base}/maximum_current`);
            if (iRaw == null)
                iRaw = await readInt(`${base}/operational_current`); // sink naming, fallback
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
                vmin: mv2v(vmin), vmax: mv2v(vmax), // numeric range for active highlight
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

/** Highest charger wattage across PDOs (for the notification). */
export function pdoMaxWatts(pdos) {
    let max = 0;
    for (const p of pdos) {
        if (p.watts != null && p.watts > max)
            max = p.watts;
    }
    return max;
}

/**
 * Index of the active PDO for the negotiated voltage negV (V).
 * Match a fixed PDO by voltage first, else a PPS whose range contains negV.
 * -1 if nothing matches.
 */
export function activePdoIndex(pdos, negV) {
    if (negV == null)
        return -1;
    let idx = pdos.findIndex(p => p.type === 'fixed_supply' &&
        p.volts != null && Math.abs(p.volts - negV) < 0.6);
    if (idx < 0) {
        idx = pdos.findIndex(p => p.type === 'programmable_supply' &&
            p.vmin != null && p.vmax != null &&
            negV >= p.vmin - 0.1 && negV <= p.vmax + 0.1);
    }
    return idx;
}
