// Юнит-тесты чистых функций (без sysfs/GUdev). Запуск: gjs -m tests/unit-test.js
import System from 'system';

import {parseRole, pdoMaxWatts, activePdoIndex} from '../lib/pd.js';
import {usbIconName, isIgnored} from '../lib/usb.js';

let failures = 0;
function eq(got, want, msg) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    print(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
    if (!ok)
        failures++;
}

// parseRole
eq(parseRole('source [sink]').active, 'sink', 'parseRole active=sink');
eq(parseRole('[host] device').active, 'host', 'parseRole active=host');
eq(parseRole('').active, null, 'parseRole empty→null');

// pdoMaxWatts
eq(pdoMaxWatts([{watts: 15}, {watts: 65}, {watts: null}]), 65, 'pdoMaxWatts=65');
eq(pdoMaxWatts([]), 0, 'pdoMaxWatts empty=0');

// activePdoIndex
const pdos = [
    {type: 'fixed_supply', volts: 5},
    {type: 'fixed_supply', volts: 9},
    {type: 'fixed_supply', volts: 20},
    {type: 'programmable_supply', vmin: 3.3, vmax: 21},
];
eq(activePdoIndex(pdos, 20), 2, 'active 20V → fixed idx 2');
eq(activePdoIndex(pdos, 11), 3, 'active 11V → PPS idx 3');
eq(activePdoIndex(pdos, null), -1, 'active null → -1');
eq(activePdoIndex([{type: 'fixed_supply', volts: 5}], 20), -1, 'no match → -1');

// usbIconName
eq(usbIconName(0x08), 'drive-harddisk-usb-symbolic', 'icon storage');
eq(usbIconName(0x03), 'input-keyboard-symbolic', 'icon HID');
eq(usbIconName(0xff), 'media-removable-symbolic', 'icon default');

// isIgnored
eq(isIgnored({vidpid: '1234:5678', classHex: 0x03}, ['1234:5678']), true, 'ignore by vid:pid');
eq(isIgnored({vidpid: '1234:5678', classHex: 0x03}, ['class:03']), true, 'ignore by class');
eq(isIgnored({vidpid: '1234:5678', classHex: 0x03}, []), false, 'not ignored (empty)');
eq(isIgnored({vidpid: '1234:5678', classHex: 0x03}, ['9999:0000']), false, 'not ignored (other)');

print(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
if (failures)
    System.exit(1);
