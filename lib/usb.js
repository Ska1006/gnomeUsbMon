// Enumeration USB-устройств через GUdev. Sync (быстрые C-вызовы + мелкие sysfs-attr).
import GUdev from 'gi://GUdev';

// bDeviceClass (hex) → человекочитаемое. 00 = класс задан на уровне интерфейса.
const CLASS_NAMES = {
    0x00: 'по интерфейсу',
    0x01: 'Audio',
    0x02: 'Communications',
    0x03: 'HID',
    0x05: 'Physical',
    0x06: 'Image',
    0x07: 'Printer',
    0x08: 'Mass Storage',
    0x09: 'Hub',
    0x0a: 'CDC-Data',
    0x0b: 'Smart Card',
    0x0d: 'Content Security',
    0x0e: 'Video',
    0x0f: 'Healthcare',
    0x10: 'Audio/Video',
    0x11: 'Billboard',
    0xdc: 'Diagnostic',
    0xe0: 'Wireless',
    0xef: 'Misc',
    0xfe: 'App Specific',
    0xff: 'Vendor Specific',
};

function className(hex) {
    return CLASS_NAMES[hex] ?? `0x${hex.toString(16).padStart(2, '0')}`;
}

// bDeviceClass → symbolic-иконка (все проверены в Adwaita).
const CLASS_ICONS = {
    0x08: 'drive-harddisk-usb-symbolic', // Mass Storage
    0x03: 'input-keyboard-symbolic',     // HID
    0x01: 'audio-headphones-symbolic',   // Audio
    0x06: 'camera-web-symbolic',         // Image
    0x0e: 'camera-web-symbolic',         // Video
    0x07: 'printer-symbolic',            // Printer
    0x09: 'view-grid-symbolic',          // Hub
    0x02: 'network-wireless-symbolic',   // Communications
    0xe0: 'network-wireless-symbolic',   // Wireless
};

/** Иконка для устройства по bDeviceClass. */
export function usbIconName(classHex) {
    return CLASS_ICONS[classHex] ?? 'media-removable-symbolic';
}

/** Mbps → метка поколения USB. */
function speedLabel(mbps) {
    switch (mbps) {
    case 1: case 2: return 'LS 1.5M';
    case 12: return 'FS 12M';
    case 480: return 'HS 480M';
    case 5000: return '5G';
    case 10000: return '10G';
    case 20000: return '20G';
    default: return mbps ? `${mbps}M` : '—';
    }
}

/**
 * Список внешних USB-устройств. Root-hubs (usbN) отфильтрованы.
 * @param {GUdev.Client} client — переиспользуемый клиент (из UdevMonitor).
 */
export function listUsbDevices(client) {
    const out = [];
    let devices;
    try {
        devices = client.query_by_subsystem('usb');
    } catch {
        return out;
    }
    for (const d of devices) {
        if (d.get_devtype() !== 'usb_device')
            continue;
        const name = d.get_name(); // '1-2' | 'usb1'
        if (/^usb\d+$/.test(name))
            continue; // root hub

        const prop = k => d.get_property(k);
        const attr = a => d.get_sysfs_attr(a);

        const vendor = prop('ID_VENDOR') || attr('manufacturer') || '';
        const model = prop('ID_MODEL') || attr('product') || '';
        const vid = (prop('ID_VENDOR_ID') || attr('idVendor') || '').toLowerCase();
        const pid = (prop('ID_MODEL_ID') || attr('idProduct') || '').toLowerCase();
        const speedRaw = parseInt(attr('speed') || '0', 10);
        const classHex = parseInt(attr('bDeviceClass') || '00', 16) || 0;
        // removable: 'removable' (внешний порт) | 'fixed' (встроенный) | 'unknown'
        const removable = attr('removable') || 'unknown';
        const maxPower = attr('bMaxPower') || ''; // запрошенный ток, напр. "500mA"

        const title = (`${vendor} ${model}`).trim() || `USB ${vid}:${pid}`;

        out.push({
            name,
            title,
            vendor,
            model,
            vid,
            pid,
            vidpid: `${vid}:${pid}`,
            classHex,
            className: className(classHex),
            speedMbps: speedRaw,
            speed: speedLabel(speedRaw),
            removable,
            external: removable === 'removable',
            maxPower,
            driver: d.get_driver() || attr('driver') || '',
            serial: prop('ID_SERIAL_SHORT') || attr('serial') || '',
            busnum: prop('BUSNUM') || attr('busnum') || '',
            devnum: prop('DEVNUM') || attr('devnum') || '',
            isHub: classHex === 0x09,
        });
    }
    // Стабильный порядок по пути порта.
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    return out;
}

/**
 * Игнорируется ли устройство для hide-when-idle.
 * ignoreList: строки "vid:pid" или "class:XX" (hex).
 */
export function isIgnored(dev, ignoreList) {
    if (!ignoreList || !ignoreList.length)
        return false;
    const classTok = `class:${dev.classHex.toString(16).padStart(2, '0')}`;
    return ignoreList.includes(dev.vidpid) || ignoreList.includes(classTok);
}
