// Статистика текущей сессии зарядки (in-memory, без персиста).
// Старт при переходе зарядника online 0→1, сброс при отключении.
import GLib from 'gi://GLib';

const US_PER_HOUR = 3.6e9; // 1 час = 3600 c = 3.6e9 µs

export class SessionStats {
    constructor() {
        this.reset();
    }

    reset() {
        this._active = false;
        this._start = 0;
        this._last = 0;
        this.peakW = 0;
        this.energyWh = 0;
        this._sum = 0;
        this._n = 0;
    }

    /** Вызывать каждый refresh: watts — суммарная мощность зарядника, active — идёт ли питание. */
    update(watts, active) {
        const now = GLib.get_monotonic_time();
        if (!active) {
            this._active = false;
            return;
        }
        if (!this._active) {
            // старт новой сессии
            this._active = true;
            this._start = now;
            this._last = now;
            this.peakW = 0;
            this.energyWh = 0;
            this._sum = 0;
            this._n = 0;
        }
        const dtHours = (now - this._last) / US_PER_HOUR;
        this._last = now;
        if (watts != null) {
            this.energyWh += watts * dtHours;
            if (watts > this.peakW)
                this.peakW = watts;
            this._sum += watts;
            this._n += 1;
        }
    }

    get active() {
        return this._active;
    }

    get durationSec() {
        return this._active ? (GLib.get_monotonic_time() - this._start) / 1e6 : 0;
    }

    get avgW() {
        return this._n ? this._sum / this._n : 0;
    }
}
