/**
 * CooldownService — Chống spam lệnh bằng cooldown theo (người dùng, lệnh).
 *
 * Lưu trong bộ nhớ với cơ chế dọn rác lười (lazy sweep) để không phình to
 * khi bot chạy lâu ngày.
 */

/** Ngưỡng số khoá tối đa trước khi kích hoạt dọn rác */
const SWEEP_THRESHOLD = 1000;

class CooldownService {
    constructor() {
        /** @type {Map<string, number>} Khoá → thời điểm hết cooldown (epoch ms) */
        this.entries = new Map();
    }

    /**
     * Kiểm tra và đặt cooldown cho một khoá.
     * @param {string} key - Khoá định danh, ví dụ `${userId}:play`
     * @param {number} durationMs - Thời gian cooldown (ms)
     * @returns {{ ok: boolean, retryAfterMs: number }} `ok=false` nghĩa là đang trong cooldown
     */
    check(key, durationMs) {
        if (!durationMs || durationMs <= 0) return { ok: true, retryAfterMs: 0 };

        const now = Date.now();

        if (this.entries.size > SWEEP_THRESHOLD) this.sweep(now);

        const expiresAt = this.entries.get(key);
        if (expiresAt && expiresAt > now) {
            return { ok: false, retryAfterMs: expiresAt - now };
        }

        this.entries.set(key, now + durationMs);
        return { ok: true, retryAfterMs: 0 };
    }

    /**
     * Xoá cooldown của một khoá (dùng khi muốn miễn phạt, ví dụ người dùng có role DJ).
     * @param {string} key
     */
    reset(key) {
        this.entries.delete(key);
    }

    /**
     * Dọn các khoá đã hết hạn.
     * @param {number} [now]
     * @returns {number} Số khoá đã xoá
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
