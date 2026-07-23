// Power: negotiated PD contract (UCSI) + battery charge rate + AC.
import {readInt, readStrOpt, listDir, pathExists, SYS} from './sysfs.js';

const PSY = `${SYS}/sys/class/power_supply`;

// Cache PSY paths by type (Battery/Mains) so we don't read every entry's `type` each poll.
const _typeCache = new Map();

/** Clear the path cache; called from disable() so nothing persists across enable/disable. */
export function resetCaches() {
    _typeCache.clear();
}

async function resolveByType(type) {
    const cached = _typeCache.get(type);
    if (cached !== undefined && (cached === null || pathExists(cached)))
        return cached;
    let found = null;
    for (const name of listDir(PSY)) {
        const base = `${PSY}/${name}`;
        if ((await readStrOpt(`${base}/type`)) === type) {
            found = base;
            break;
        }
    }
    _typeCache.set(type, found);
    return found;
}

/**
 * UCSI source-PSY per connector → live negotiated contract.
 * voltage_now/current_now change without a uevent → needs polling.
 */
export async function readUcsiSources() {
    const names = listDir(PSY, /^ucsi-source-psy-/);
    const out = [];
    for (const name of names) {
        const base = `${PSY}/${name}`;
        const [online, vNow, cNow] = await Promise.all([
            readInt(`${base}/online`),
            readInt(`${base}/voltage_now`),
            readInt(`${base}/current_now`),
        ]);
        // Name like ucsi-source-psy-USBC000:001 → connector 1 (1-based) → port0 (0-based).
        const m = name.match(/:0*(\d+)$/);
        const connector = m ? parseInt(m[1], 10) : null;
        const volts = vNow != null ? vNow / 1e6 : null;
        const amps = cNow != null ? cNow / 1e6 : null;
        out.push({
            portIndex: connector != null ? connector - 1 : null,
            online: online === 1,
            volts,
            amps,
            watts: volts != null && amps != null ? volts * amps : null,
        });
    }
    return out;
}

/** First battery: status, %, charge/discharge power (W). null if none. */
export async function readBattery() {
    const base = await resolveByType('Battery');
    if (base) {
        const [status, capacity, powerNow, vNow, cNow] = await Promise.all([
            readStrOpt(`${base}/status`),
            readInt(`${base}/capacity`),
            readInt(`${base}/power_now`),   // energy-type: µW directly
            readInt(`${base}/voltage_now`), // charge-type: compute V*A
            readInt(`${base}/current_now`),
        ]);
        let watts = null;
        if (powerNow != null)
            watts = powerNow / 1e6;
        else if (vNow != null && cNow != null)
            watts = Math.abs((vNow / 1e6) * (cNow / 1e6));
        return {
            status,
            capacity,
            watts,
            charging: status === 'Charging',
            discharging: status === 'Discharging',
        };
    }
    return null;
}

/** Whether external power is present (Mains online). */
export async function acOnline() {
    const base = await resolveByType('Mains');
    if (!base)
        return false;
    return (await readInt(`${base}/online`)) === 1;
}
