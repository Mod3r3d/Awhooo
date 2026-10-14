/**
 * CooldownService — Chống spam lệnh bằng cooldown theo (ngưởi dùng, lệnh).
 *
 * Tách thành 2 bước:
 *  - peek(): chỉ kiểm tra (dùng trong preflight)
 *  - set(): đặt cooldown (dùng sau khi lệnh thành công)
 */

/** Ngưỡng số khoá tối đa trước khi kích hoạt dọn rác */
const SWEEP_THRESHOLD = 1000;

class CooldownService {
    constructor() {
        /** @type {Map<string, number>} Khoá → thởi điểm hết cooldown (epoch ms) */
        this.entries = new Map();
    }

    /**
     * Chỉ kiểm tra cooldown — không đặt.
     * @param {string} key
     * @param {number} durationMs
     * @returns {{ ok: boolean, retryAfterMs: number }}
     */
    peek(key, durationMs) {
        if (!durationMs || durationMs <= 0) return { ok: true, retryAfterMs: 0 };
        const now = Date.now();
        if (this.entries.size > SWEEP_THRESHOLD) this.sweep(now);
        const expiresAt = this.entries.get(key);
        if (expiresAt && expiresAt > now) {
            return { ok: false, retryAfterMs: expiresAt - now };
        }
        return { ok: true, retryAfterMs: 0 };
    }

    /**
     * Đặt cooldown cho một khoá.
     * @param {string} key
     * @param {number} durationMs
     */
    set(key, durationMs) {
        if (!durationMs || durationMs <= 0) return;
        this.entries.set(key, Date.now() + durationMs);
    }

    /**
     * Kiểm tra và đặt cooldown trong một lần gọi (dùng cho các trường hợp đơn giản).
     * @param {string} key
     * @param {number} durationMs
     * @returns {{ ok: boolean, retryAfterMs: number }}
     */
    check(key, durationMs) {
        const result = this.peek(key, durationMs);
        if (result.ok) this.set(key, durationMs);
        return result;
    }

    /**
     * Xoá cooldown của một khoá.
     * @param {string} key
     */
    reset(key) {
        this.entries.delete(key);
    }

    /**
     * Dọn các khoá đã hết hạn.
     * @param {number} [now]
     * @returns {number}
     */
    sweep(now = Date.now()) {
        let removed = 0;
        for (const [key, expiresAt] of this.entries) {
            if (expiresAt <= now) {
                this.entries.delete(key);
                removed++;
            }
        }
        return removed;
    }

    /** Xoá toàn bộ cooldown. */
    clear() {
        this.entries.clear();
    }

    /** Số khoá đang được theo dõi. */
    get size() {
        return this.entries.size;
    }
}

module.exports = new CooldownService();
module.exports.CooldownService = CooldownService;
