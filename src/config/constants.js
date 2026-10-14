/**
 * Constants — Hằng số cấu hình toàn cục, có thể ghi đè bằng biến môi trưởng.
 */

/**
 * Đọc số nguyên từ biến môi trưởng, trả về giá trị mặc định nếu không hợp lệ.
 * @param {string} name - Tên biến môi trưởng
 * @param {number} fallback - Giá trị mặc định
 * @returns {number}
 */
function envInt(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
    const parsed = Number.parseInt(String(raw).trim(), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Đọc giá trị boolean từ biến môi trưởng ("true"/"1"/"yes").
 * @param {string} name
 * @param {boolean} fallback
 * @returns {boolean}
 */
function envBool(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
    return ['true', '1', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

module.exports = {
    // --- Giới hạn hàng đợi ---
    /** Số bài tối đa trong hàng đợi của một guild */
    MAX_QUEUE_SIZE: envInt('MAX_QUEUE_SIZE', 500),
    /** Số bài tối đa một ngưởi dùng được thêm vào hàng đợi */
    MAX_QUEUE_SIZE_PER_USER: envInt('MAX_QUEUE_SIZE_PER_USER', 100),
    /** Số bài tối đa nạp từ một playlist trong một lần */
    MAX_PLAYLIST_LOAD: envInt('MAX_PLAYLIST_LOAD', 100),

    // --- Cooldown ---
    /** Cooldown mặc định cho các lệnh phát nhạc (ms) */
    COMMAND_COOLDOWN_MS: envInt('COMMAND_COOLDOWN_MS', 3000),

    // --- Cache tìm kiếm ---
    /** Thởi gian sống của kết quả tìm kiếm trong cache (ms) */
    SEARCH_CACHE_TTL_MS: envInt('SEARCH_CACHE_TTL_MS', 5 * 60 * 1000),
    /** Số kết quả tìm kiếm tối đa lưu trong cache */
    SEARCH_CACHE_MAX: envInt('SEARCH_CACHE_MAX', 200),

    // --- Voice ---
    /**
     * Thởi gian chờ trước khi bot rồi kênh thoại trống (ms).
     * Mặc định 180 giây (3 phút), đồng bộ với .env.example.
     */
    VOICE_EMPTY_LEAVE_MS: process.env.AUTO_DISCONNECT_SECONDS
        ? envInt('AUTO_DISCONNECT_SECONDS', 180) * 1000
        : envInt('VOICE_EMPTY_LEAVE_MS', 180 * 1000),

    // --- Giao diện Now Playing ---
    /** Thởi gian không tương tác trước khi vô hiệu hoá nút trên bảng (ms) */
    PANEL_IDLE_TIMEOUT_MS: envInt('PANEL_IDLE_TIMEOUT_MS', 10 * 60 * 1000),
    /** Chu kỳ cập nhật thanh tiến trình (ms) */
    PANEL_TICK_MS: envInt('PANEL_TICK_MS', 10 * 1000),
    /** Âm lượng mặc định khi tạo player */
    DEFAULT_VOLUME: envInt('DEFAULT_VOLUME', 130),

    // --- Khác ---
    /** Số bài tối đa lưu trong lịch sử */
    MAX_HISTORY: envInt('MAX_HISTORY', 50),
    /** Timeout cho một lượt tìm kiếm Lavalink (ms) */
    SEARCH_TIMEOUT_MS: envInt('SEARCH_TIMEOUT_MS', 35000),
    /** Số kết quả hiển thị trong menu /search */
    SEARCH_MENU_RESULTS: envInt('SEARCH_MENU_RESULTS', 10),
    /** Bật/tắt autoplay mặc định cho guild mới */
    AUTOPLAY_DEFAULT: envBool('AUTOPLAY_DEFAULT', false),
    /** Đường dẫn file lưu trữ dữ liệu bền vững */
    DATA_DIR: process.env.DATA_DIR || './data'
};
