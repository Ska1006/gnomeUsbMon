// Питание: негоциированный PD-контракт (UCSI) + скорость заряда батареи + AC.
import {readInt, readStrOpt, listDir, SYS} from './sysfs.js';

const PSY = `${SYS}/sys/class/power_supply`;

/**
 * UCSI source-PSY по коннекторам → живой негоциированный контракт.
 * voltage_now/current_now меняются без uevent → нужен polling.
 */
export async function readUcsiSources() {
    const names = listDir(PSY, /^ucsi-source-psy-/);
    const out = [];
    for (const name of names) {
        const base = `${PSY}/${name}`;
        const [online, vNow, cNow, vMax, cMax, usbType] = await Promise.all([
            readInt(`${base}/online`),
            readInt(`${base}/voltage_now`),
            readInt(`${base}/current_now`),
            readInt(`${base}/voltage_max`),
            readInt(`${base}/current_max`),
            readStrOpt(`${base}/usb_type`),
        ]);
        // Имя вида ucsi-source-psy-USBC000:001 → коннектор 1 (1-based) → port0 (0-based).
        const m = name.match(/:0*(\d+)$/);
        const connector = m ? parseInt(m[1], 10) : null;
        const volts = vNow != null ? vNow / 1e6 : null;
        const amps = cNow != null ? cNow / 1e6 : null;
        out.push({
            name,
            connector,
            portIndex: connector != null ? connector - 1 : null,
            online: online === 1,
            volts,
            amps,
            watts: volts != null && amps != null ? volts * amps : null,
            voltsMax: vMax != null ? vMax / 1e6 : null,
            ampsMax: cMax != null ? cMax / 1e6 : null,
            usbType, // напр. "[C] PD PD_PPS"
        });
    }
    return out;
}

/** Первая батарея: статус, %, мощность заряда/разряда (Вт). null если нет. */
export async function readBattery() {
    for (const name of listDir(PSY)) {
        const base = `${PSY}/${name}`;
        if ((await readStrOpt(`${base}/type`)) !== 'Battery')
            continue;
        const [status, capacity, powerNow, vNow, cNow] = await Promise.all([
            readStrOpt(`${base}/status`),
            readInt(`${base}/capacity`),
            readInt(`${base}/power_now`),   // energy-type: µW напрямую
            readInt(`${base}/voltage_now`), // charge-type: считаем V*A
            readInt(`${base}/current_now`),
        ]);
        let watts = null;
        if (powerNow != null)
            watts = powerNow / 1e6;
        else if (vNow != null && cNow != null)
            watts = Math.abs((vNow / 1e6) * (cNow / 1e6));
        return {
            name,
            status,
            capacity,
            watts,
            charging: status === 'Charging',
            discharging: status === 'Discharging',
        };
    }
    return null;
}

/** Есть ли внешнее питание (любой Mains online). */
export async function acOnline() {
    for (const name of listDir(PSY)) {
        const base = `${PSY}/${name}`;
        if ((await readStrOpt(`${base}/type`)) !== 'Mains')
            continue;
        if ((await readInt(`${base}/online`)) === 1)
            return true;
    }
    return false;
}
