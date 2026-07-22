// Async sysfs read helpers. Never sync-read in the shell process — it blocks the UI.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Dev mode: GNOME_USB_MON_SYSFS_ROOT=./fixtures overrides the sysfs root for tests.
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

/** Read a sysfs file async; resolves null on any error (optional attributes). */
export async function readStrOpt(path) {
    try {
        return await readStr(path);
    } catch {
        return null;
    }
}

/** Read an integer sysfs value; null if missing or NaN. */
export async function readInt(path) {
    const s = await readStrOpt(path);
    if (s === null)
        return null;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
}

/** Child names of a directory, optional regex filter. [] on error. Names only, cheap. */
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

/** Whether a path exists. */
export function pathExists(path) {
    return Gio.File.new_for_path(path).query_exists(null);
}
