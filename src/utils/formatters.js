/**
 * Utility functions — Định dạng thời gian và thanh tiến trình.
 */

/**
 * Chuyển mili-giây sang chuỗi thời gian đọc được.
 * @param {number} ms - Thời gian tính bằng mili-giây
 * @returns {string} Chuỗi dạng "mm:ss" hoặc "hh:mm:ss"
 *
 * @example
 * formatDuration(215000)  // "03:35"
 * formatDuration(3723000) // "01:02:03"
 */
function formatDuration(ms) {
    if (!ms || ms <= 0) return '00:00';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, '0');

    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Tạo thanh tiến trình dạng ký tự.
 * @param {number} currentMs - Vị trí phát hiện tại (mili-giây)
 * @param {number} totalMs - Tổng thời lượng (mili-giây)
 * @param {number} [length=15] - Số ký tự của thanh tiến trình
 * @returns {string} Thanh tiến trình, VD: "▶ ████████░░░░░░░ 02:15 / 04:30"
 */
function createProgressBar(currentMs, totalMs, length = 15) {
    if (!totalMs || totalMs <= 0) {
        return `🔴 LIVE — ${formatDuration(currentMs)}`;
    }

    const progress = Math.min(currentMs / totalMs, 1);
    const filledLength = Math.round(progress * length);
    const emptyLength = length - filledLength;

    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(emptyLength);

    return `▶ ${filled}${empty} ${formatDuration(currentMs)} / ${formatDuration(totalMs)}`;
}

/**
 * Rút gọn chuỗi nếu quá dài.
 * @param {string} str - Chuỗi gốc
 * @param {number} [maxLength=50] - Độ dài tối đa
 * @returns {string} Chuỗi đã rút gọn
 */
function truncate(str, maxLength = 50) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

/**
 * Tính tổng thời lượng của một mảng tracks (mili-giây).
 * @param {Array} tracks - Mảng các track object có thuộc tính duration hoặc length
 * @returns {number} Tổng thời lượng (ms)
 */
function totalDuration(tracks) {
    if (!tracks || !tracks.length) return 0;
    return tracks.reduce((sum, t) => {
        const dur = t.duration || t.length || 0;
        return sum + dur;
    }, 0);
}

/**
 * Phân tích chuỗi thời gian do người dùng nhập thành mili-giây.
 *
 * Hỗ trợ các định dạng:
 *  - `90`        → 90 giây
 *  - `1:30`      → 1 phút 30 giây
 *  - `1:02:03`   → 1 giờ 2 phút 3 giây
 *  - `1h2m3s`    → 1 giờ 2 phút 3 giây
 *
 * @param {string} input - Chuỗi thời gian
 * @returns {number|null} Thời gian (ms) hoặc null nếu không hợp lệ
 */
function parseTime(input) {
    if (input === null || input === undefined) return null;

    const raw = String(input).trim().toLowerCase();
    if (!raw) return null;

    // Dạng 1: 90  |  1:30  |  1:02:03
    if (/^\d+(:\d{1,2}){0,2}$/.test(raw)) {
        const parts = raw.split(':').map((n) => Number.parseInt(n, 10));
        if (parts.some((n) => !Number.isFinite(n))) return null;

        // Đảo ngược để tính theo trọng số 1 / 60 / 3600
        const seconds = parts.reverse().reduce((total, value, index) => total + value * 60 ** index, 0);
        return seconds * 1000;
    }

    // Dạng 2: 1h2m3s (mọi thành phần đều tùy chọn)
    const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match || (!match[1] && !match[2] && !match[3])) return null;

    const hours = Number.parseInt(match[1] || '0', 10);
    const minutes = Number.parseInt(match[2] || '0', 10);
    const seconds = Number.parseInt(match[3] || '0', 10);

    return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

module.exports = {
    formatDuration,
    createProgressBar,
    truncate,
    totalDuration,
    parseTime
};
