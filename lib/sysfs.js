// Async sysfs read helpers. NEVER sync-read in the shell process — блокирует UI.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Dev-режим: GNOME_USB_MON_SYSFS_ROOT=./fixtures подменяет корень sysfs для тестов.
export const SYS = GLib.getenv('GNOME_USB_MON_SYSFS_ROOT') ?? '';

const _decoder = new TextDecoder();

/** Read a sysfs file async, trimmed. Rejects on error. */
export function readStr(path) {
    return new Promise((resolve, reject) => {
        const file = Gio.File.new_for_path(path);
        file.load_contents_async(null, (src, res) => {
            try {
                const [, bytes] = src.load_contents_finish(res);
                resolve(_decoder.decode(bytes).trim());
            } catch (e) {
                reject(e);
            }
        });
    });
}

/** Read a sysfs file async; resolves null on any error (для опциональных атрибутов). */
export async function readStrOpt(path) {
    try {
        return await readStr(path);
    } catch {
        return null;
    }
}

/** Read integer sysfs value; null если нет/NaN. */
export async function readInt(path) {
    const s = await readStrOpt(path);
    if (s === null)
        return null;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
}

/** Child-имена директории, опц. фильтр по regex. [] при ошибке. Sync — но только имена, дёшево. */
export function listDir(path, re = null) {
    const names = [];
    let en;
    try {
        const dir = Gio.File.new_for_path(path);
        en = dir.enumerate_children('standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    } catch {
        return names;
    }
    let info;
    while ((info = en.next_file(null)) !== null) {
        const name = info.get_name();
        if (!re || re.test(name))
            names.push(name);
    }
    en.close(null);
    return names.sort();
}

/** Существует ли путь. */
export function pathExists(path) {
    return Gio.File.new_for_path(path).query_exists(null);
}
