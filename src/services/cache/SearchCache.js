/**
 * SearchCache — Cache kết quả tìm kiếm theo thuật toán LRU kèm thời gian sống (TTL).
 *
 * Mục đích: người dùng hay tìm lại cùng một bài/playlist, cache giúp phản hồi
 * tức thì và giảm tải cho các node Lavalink.
 *
 * Dùng Map (giữ thứ tự chèn) làm danh sách LRU: khoá vừa đọc sẽ được đưa về cuối.
 */

class SearchCache {
    /**
     * @param {{ max?: number, ttlMs?: number }} [options]
     */
    constructor({ max = 200, ttlMs = 5 * 60 * 1000 } = {}) {
        this.max = Math.max(1, max);
        this.ttlMs = Math.max(1000, ttlMs);
        /** @type {Map<string, { value: unknown, expiresAt: number }>} */
        this.store = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Chuẩn hoá khoá cache để "Bài Hát" và "bài hát" dùng chung một mục.
     * @param {string} query
     * @param {string} [engine]
     * @returns {string}
     */
    static normaliseKey(query, engine = 'default') {
        return `${engine}:${String(query).trim().toLowerCase().replace(/\s+/g, ' ')}`;
    }

    /**
     * Lấy giá trị trong cache.
     * @param {string} key
     * @returns {unknown|undefined} `undefined` nếu không có hoặc đã hết hạn
     */
    get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            this.misses++;
            return undefined;
        }

        if (entry.expiresAt <= Date.now()) {
            this.store.delete(key);
            this.misses++;
            return undefined;
        }

        // Đưa lên vị trí mới nhất (LRU)
        this.store.delete(key);
        this.store.set(key, entry);
        this.hits++;
        return entry.value;
    }

    /**
     * Lưu giá trị vào cache.
     * @param {string} key
     * @param {unknown} value
     */
    set(key, value) {
        if (this.store.has(key)) this.store.delete(key);
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });

        // Loại bỏ các mục cũ nhất khi vượt ngưỡng
        while (this.store.size > this.max) {
            const oldest = this.store.keys().next();
            if (oldest.done) break;
            this.store.delete(oldest.value);
        }
    }

    /**
     * Xoá các mục đã hết hạn.
     * @returns {number} Số mục đã xoá
     */
    prune() {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.store) {
            if (entry.expiresAt <= now) {
                this.store.delete(key);
                removed++;
            }
        }
        return removed;
    }

    /** Xoá toàn bộ cache. */
    clear() {
        this.store.clear();
        this.hits = 0;
        this.misses = 0;
    }

    /** Số mục đang lưu. */
    get size() {
        return this.store.size;
    }

    /** Thống kê hiệu quả cache. */
    get stats() {
        const total = this.hits + this.misses;
        return {
            size: this.store.size,
            max: this.max,
            hits: this.hits,
            misses: this.misses,
            hitRate: total === 0 ? 0 : Number((this.hits / total).toFixed(3))
        };
    }
}

module.exports = SearchCache;
