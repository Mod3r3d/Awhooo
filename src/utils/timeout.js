/**
 * timeout.js — Bọc Promise với thởi gian chờ tối đa.
 *
 * Dùng cho mọi lởi gọi Lavalink REST (player.play, setFilters, seek, destroy...)
 * để tránh treo vĩnh viễn khi node công khai quá tải.
 */

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms — thởi gian chờ (mili-giây)
 * @param {string} desc — mô tả dùng cho thông báo lỗi
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, desc) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Quá thởi gian (${ms / 1000}s): ${desc}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout };
