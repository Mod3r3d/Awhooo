/**
 * helpers.js — Hàm dùng chung cho các lệnh phát nhạc.
 */

/**
 * Chuyển kết quả `playerService.enqueue()` thành thông báo lỗi hiển thị cho người dùng.
 * @param {{ error: string|null, vars: object|null }} result
 * @param {(key: string, vars?: object) => string} t - Hàm dịch
 * @returns {string}
 */
function enqueueErrorText(result, t) {
    switch (result.error) {
        case 'userQueueFull':
            return t('common.userQueueFull', result.vars);
        case 'queueFull':
            return t('common.queueFull', result.vars);
        default:
            return t('common.systemError');
    }
}

/**
 * Tạo ghi chú cảnh báo khi playlist bị cắt bớt do vượt giới hạn hàng đợi.
 * @param {{ added: number, trimmed: number }} result
 * @param {number} total - Tổng số bài người dùng yêu cầu
 * @param {(key: string, vars?: object) => string} t - Hàm dịch
 * @returns {string|null}
 */
function trimNote(result, total, t) {
    if (!result.trimmed) return null;
    return t('common.playlistTrimmed', { total, loaded: result.added });
}

/**
 * Ghép ghi chú chính và ghi chú cảnh báo thành một chuỗi.
 * @param {string} main
 * @param {string|null} extra
 * @returns {string}
 */
function combineNotes(main, extra) {
    return extra ? `${main}\n${extra}` : main;
}

module.exports = { enqueueErrorText, trimNote, combineNotes };
