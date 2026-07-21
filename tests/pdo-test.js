// Офлайн-тест парсинга PD/PSY против синтетической фикстуры.
// Запуск: make test  (генерит фикстуру и выставляет GNOME_USB_MON_SYSFS_ROOT).
import System from 'system';
import GLib from 'gi://GLib';

import {readAllPorts, readPartnerPdos, pdoMaxWatts} from '../lib/pd.js';
import {readUcsiSources, readBattery, acOnline} from '../lib/power.js';

let failures = 0;
function assert(cond, msg) {
    if (cond)
        print(`  ok   ${msg}`);
    else {
        print(`  FAIL ${msg}`);
        failures++;
    }
}

const loop = new GLib.MainLoop(null, false);
(async () => {
    try {
        const ports = await readAllPorts();
        assert(ports.length === 2, '2 порта');
        const p0 = ports.find(p => p.name === 'port0');
        assert(p0?.partner === true, 'port0: partner присутствует');
        assert(p0?.powerRole.active === 'sink', 'port0: активная роль sink');
        assert(p0?.dataRole.active === 'host', 'port0: data host');

        const pdos = await readPartnerPdos('port0');
        assert(pdos.length === 5, '5 PDO');
        assert(pdoMaxWatts(pdos) === 100, 'макс мощность 100W');
        assert(pdos[0].label === '5.0V · 3.00A · 15W', 'PDO1 = 5V/3A/15W');
        assert(pdos[3].label === '20.0V · 5.00A · 100W', 'PDO4 = 20V/5A/100W');
        assert(pdos[4].type === 'programmable_supply', 'PDO5 = PPS');
        assert(pdos[4].label === 'PPS 3.3–21.0V · 5.00A', 'PPS диапазон');

        const src = (await readUcsiSources()).find(s => s.portIndex === 0);
        assert(src?.online === true, 'ucsi port0 online');
        assert(Math.round(src.watts) === 45, 'негоциировано 45W');

        const bat = await readBattery();
        assert(bat?.charging === true, 'батарея заряжается');
        assert(Math.round(bat.watts) === 42, 'мощность заряда 42W');

        assert((await acOnline()) === true, 'AC online');
    } catch (e) {
        print(`ERR ${e}\n${e.stack ?? ''}`);
        failures++;
    } finally {
        print(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
        loop.quit();
    }
})();
loop.run();

if (failures)
    System.exit(1);
