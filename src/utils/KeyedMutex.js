/**
 * KeyedMutex — Khóa bất đồng bộ theo khóa (Guild ID).
 *
 * Đảm bảo các tác vụ quan trọng trên cùng một Guild (tạo player, enqueue, stop...)
 * được thực thi tuần tự, không bị tranh chấp trạng thái (race conditions).
 * Các Guild khác nhau hoàn toàn độc lập và không chặn nhau.
 */

class KeyedMutex {
    constructor() {
        /** @type {Map<string, Promise<void>>} */
        this.locks = new Map();
    }

    /**
     * Chạy hàm độc quyền theo key đã cho.
     * @template T
     * @param {string} key - Ví dụ guildId
     * @param {() => Promise<T>|T} fn - Hàm cần thực thi độc quyền
     * @param {number} [timeoutMs=30000] - Thời gian tối đa chờ lock trước khi báo timeout
     * @returns {Promise<T>}
     */
    async runExclusive(key, fn, timeoutMs = 30000) {
        let release = null;
        const currentLock = this.locks.get(key) || Promise.resolve();

        let acquired = false;
        const nextLock = new Promise((resolve) => {
            release = resolve;
        });

        const chainedPromise = currentLock.then(
            () => nextLock,
            () => nextLock
        );

        // Cập nhật promise hàng đợi cho key
        this.locks.set(key, chainedPromise);

        let timeoutHandle = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
                if (!acquired) {
                    reject(new Error(`KeyedMutex: Quá thời gian chờ (${timeoutMs}ms) cho khóa "${key}"`));
                }
            }, timeoutMs);
            if (typeof timeoutHandle.unref === 'function') timeoutHandle.unref();
        });

        try {
            await Promise.race([currentLock.catch(() => {}), timeoutPromise]);
            acquired = true;
            clearTimeout(timeoutHandle);
            return await fn();
        } finally {
            acquired = true;
            clearTimeout(timeoutHandle);
            if (release) release();
            // Nếu không còn tác vụ nào chờ sau mình, xóa khỏi Map để giải phóng bộ nhớ
            if (this.locks.get(key) === chainedPromise) {
                this.locks.delete(key);
            }
        }
    }

    /**
     * Số lượng khóa đang được theo dõi.
     * @returns {number}
     */
    get size() {
        return this.locks.size;
    }
}

module.exports = KeyedMutex;
