/**
 * PlayerState — Trạng thái phát nhạc tập trung cho từng Guild.
 *
 * Lưu trữ: bài đang phát, lịch sử, chế độ lặp, generation guard,
 * cài đặt guild (âm lượng, bộ lọc, autoplay) và tham chiếu các bảng Now Playing.
 */

const { MAX_HISTORY, AUTOPLAY_DEFAULT, PANEL_IDLE_TIMEOUT_MS } = require('../../config/constants');
const FilterService = require('../filters/FilterService');

class PlayerState {
    /**
     * @param {string} guildId - ID của Discord guild
     */
    constructor(guildId) {
        /** ID guild */
        this.guildId = guildId;

        /**
         * Bộ đếm thế hệ phát nhạc (Playback Generation).
         * Tăng lên mỗi khi thực hiện skip/stop/playskip.
         * Các tác vụ resolve bất đồng bộ so sánh generation
         * trước khi phát để tránh phát nhầm bài hát cũ.
         */
        this.playbackGeneration = 0;

        /** Mảng lưu lịch sử các bài hát đã phát (mới nhất ở đầu) */
        this.history = [];

        /** Chế độ lặp: 'off' | 'track' | 'queue' */
        this.repeatMode = 'off';

        /** Tên bộ lọc âm thanh đang áp dụng */
        this.filter = FilterService.default;

        /** Bật/tắt tự động phát bài liên quan khi hết hàng đợi */
        this.autoplay = AUTOPLAY_DEFAULT;

        /** ID kênh chứa bảng Now Playing */
        this.nowPlayingChannelId = null;

        /** ID interval timer đang cập nhật progress bar (nếu có) */
        this.progressInterval = null;

        /**
         * Bối cảnh interaction dùng để gửi/cập nhật bảng Now Playing dạng EPHEMERAL
         * (chỉ người gọi lệnh nhìn thấy). Token của interaction chỉ sống 15 phút
         * nên phải lưu kèm thời điểm hết hạn.
         * @type {{ webhook: object, userId: string, channelId: string, expiresAt: number }|null}
         */
        this.ephemeralContext = null;

        /**
         * Bảng Now Playing gửi CÔNG KHAI vào kênh chat (chỉ tạo bởi lệnh /nowplaying).
         * @type {{ channelId: string, message: import('discord.js').Message }|null}
         */
        this.publicPanel = null;

        /** Ghi chú hiển thị phía trên bảng ephemeral (VD: "🟢 Đã thêm: ...") */
        this.panelNote = null;

        /** Khoá nhận dạng bài hát của lần vẽ bảng gần nhất (để biết khi nào chuyển bài) */
        this.panelTrackKey = null;

        /** Thời điểm tương tác gần nhất với bảng Now Playing (để tự vô hiệu hoá nút) */
        this.panelLastInteractionAt = Date.now();

        /** Bảng đã bị vô hiệu hoá nút do quá hạn tương tác hay chưa */
        this.panelDisabled = false;

        /** Đã khôi phục cài đặt từ đĩa cho guild này chưa (chỉ làm một lần) */
        this.restored = false;

        /** Bộ lọc cần được áp dụng lại lên player (sau khi khôi phục từ đĩa) */
        this.filterNeedsApply = false;
    }

    /**
     * Tăng playback generation, vô hiệu hoá các resolve cũ đang chờ.
     * @returns {number} Generation mới
     */
    incrementGeneration() {
        return ++this.playbackGeneration;
    }

    /**
     * Kiểm tra xem generation có còn hợp lệ không.
     * @param {number} generation - Generation lúc bắt đầu resolve
     * @returns {boolean} true nếu vẫn hợp lệ
     */
    isGenerationValid(generation) {
        return generation === this.playbackGeneration;
    }

    /**
     * Đẩy bài hát vừa phát xong vào lịch sử (đầu mảng).
     * Giới hạn tối đa MAX_HISTORY bài.
     * @param {object} track - Track object
     */
    addToHistory(track) {
        if (!track) return;
        this.history.unshift(track);
        if (this.history.length > MAX_HISTORY) {
            this.history.length = MAX_HISTORY;
        }
    }

    /**
     * Lấy bài hát gần nhất từ lịch sử (và xoá khỏi history).
     * @returns {object|null} Track hoặc null nếu history trống
     */
    popFromHistory() {
        if (this.history.length === 0) return null;
        return this.history.shift();
    }

    /**
     * Danh sách khoá định danh các bài đã phát gần đây (dùng cho autoplay).
     * @returns {Set<string>}
     */
    getRecentKeys() {
        const keys = new Set();
        for (const entry of this.history) {
            const key = entry.identifier || entry.uri || `${entry.title}|${entry.author}`;
            if (key) keys.add(key);
        }
        return keys;
    }

    /**
     * Chuyển đổi chế độ lặp theo vòng: off → track → queue → off
     * @returns {string} Chế độ lặp mới
     */
    cycleRepeatMode() {
        const modes = ['off', 'track', 'queue'];
        const currentIndex = modes.indexOf(this.repeatMode);
        this.repeatMode = modes[(currentIndex + 1) % modes.length];
        return this.repeatMode;
    }

    /**
     * Đặt chế độ lặp trực tiếp.
     * @param {'off'|'track'|'queue'} mode
     */
    setRepeatMode(mode) {
        if (['off', 'track', 'queue'].includes(mode)) {
            this.repeatMode = mode;
        }
    }

    /**
     * Lưu bối cảnh interaction để gửi/cập nhật bảng Now Playing dạng ephemeral.
     * @param {{ webhook: object, userId: string, channelId: string }} ctx
     */
    setEphemeralContext({ webhook, userId, channelId }) {
        this.ephemeralContext = {
            webhook,
            userId,
            channelId,
            // Token interaction sống 15 phút → chừa 1 phút an toàn
            expiresAt: Date.now() + 14 * 60 * 1000
        };
        this.touchPanel();
    }

    /**
     * Lấy bối cảnh ephemeral nếu vẫn còn hiệu lực (tự dọn nếu đã hết hạn).
     * @returns {{ webhook: object, userId: string, channelId: string, expiresAt: number }|null}
     */
    getEphemeralContext() {
        if (!this.ephemeralContext) return null;
        if (Date.now() >= this.ephemeralContext.expiresAt) {
            this.ephemeralContext = null;
            return null;
        }
        return this.ephemeralContext;
    }

    /** Xoá bối cảnh ephemeral (token hết hạn hoặc bảng đã bị xoá). */
    clearEphemeralContext() {
        this.ephemeralContext = null;
    }

    /** Ghi nhận có tương tác với bảng Now Playing (làm mới đồng hồ đếm hết hạn nút). */
    touchPanel() {
        this.panelLastInteractionAt = Date.now();
        this.panelDisabled = false;
    }

    /**
     * Bảng đã quá hạn tương tác chưa?
     * @returns {boolean}
     */
    isPanelIdle() {
        return Date.now() - this.panelLastInteractionAt >= PANEL_IDLE_TIMEOUT_MS;
    }

    /**
     * Dọn dẹp interval và reset tin nhắn Now Playing.
     */
    clearNowPlaying() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        this.nowPlayingChannelId = null;
    }

    /**
     * Dừng ticker và xoá mọi tham chiếu bảng Now Playing (cả ephemeral lẫn public).
     */
    clearPanels() {
        this.clearNowPlaying();
        this.clearEphemeralContext();
        this.publicPanel = null;
        this.panelNote = null;
        this.panelTrackKey = null;
        this.panelDisabled = false;
    }

    /**
     * Reset toàn bộ state về mặc định.
     */
    reset() {
        this.clearPanels();
        this.playbackGeneration = 0;
        this.history = [];
        this.repeatMode = 'off';
        this.filter = FilterService.default;
        this.autoplay = AUTOPLAY_DEFAULT;
        this.restored = false;
        this.filterNeedsApply = false;
    }
}

// --- Registry: Quản lý PlayerState theo Guild ---

/** @type {Map<string, PlayerState>} */
const stateMap = new Map();

/**
 * Lấy hoặc tạo PlayerState cho một guild.
 * @param {string} guildId
 * @returns {PlayerState}
 */
function getState(guildId) {
    if (!stateMap.has(guildId)) {
        stateMap.set(guildId, new PlayerState(guildId));
    }
    return stateMap.get(guildId);
}

/**
 * Xóa PlayerState của một guild (khi bot rời khỏi guild).
 * @param {string} guildId
 */
function removeState(guildId) {
    const state = stateMap.get(guildId);
    if (state) {
        state.reset();
        stateMap.delete(guildId);
    }
}

/**
 * Số guild đang có state (dùng cho endpoint /health).
 * @returns {number}
 */
function getStateCount() {
    return stateMap.size;
}

module.exports = {
    PlayerState,
    getState,
    removeState,
    getStateCount,
    MAX_HISTORY
};
