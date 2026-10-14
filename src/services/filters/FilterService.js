/**
 * FilterService — Áp dụng các bộ lọc âm thanh của Lavalink (bassboost, nightcore, 8D...).
 *
 * Mỗi lần áp dụng một bộ lọc, ta gửi lên Lavalink MỘT payload đầy đủ (đã null hoá
 * các bộ lọc khác) thay vì gọi `clearFilters()` rồi `setFilters()`.
 * Lý do: `clearFilters()` của Shoukaku đặt luôn `volume = 1`, sẽ ghi đè âm lượng
 * mà Kazagumo đang quản lý. Payload đầy đủ giữ đúng âm lượng hiện tại.
 */

/** Bộ đệm equalizer dùng cho các preset cần chỉnh dải tần */
const BASSBOOST_EQ = [
    { band: 0, gain: 0.6 },
    { band: 1, gain: 0.67 },
    { band: 2, gain: 0.67 },
    { band: 3, gain: 0.0 },
    { band: 4, gain: -0.5 },
    { band: 5, gain: 0.15 },
    { band: 6, gain: -0.45 },
    { band: 7, gain: 0.23 },
    { band: 8, gain: 0.35 },
    { band: 9, gain: 0.45 },
    { band: 10, gain: 0.4 },
    { band: 11, gain: 0.1 },
    { band: 12, gain: 0.0 },
    { band: 13, gain: 0.0 },
    { band: 14, gain: 0.0 }
];

/**
 * Danh sách preset bộ lọc.
 * `payload` chỉ chứa các trường khác rỗng; các trường còn lại sẽ bị null hoá.
 */
const PRESETS = {
    off: {
        label: 'Tắt',
        emoji: '🚫',
        payload: {}
    },
    bassboost: {
        label: 'Bass Boost',
        emoji: '🔊',
        payload: { equalizer: BASSBOOST_EQ }
    },
    nightcore: {
        label: 'Nightcore',
        emoji: '🌙',
        payload: { timescale: { speed: 1.2, pitch: 1.2, rate: 1.0 } }
    },
    vaporwave: {
        label: 'Vaporwave',
        emoji: '🌊',
        payload: {
            timescale: { speed: 0.85, pitch: 0.9, rate: 1.0 },
            tremolo: { frequency: 2.0, depth: 0.3 }
        }
    },
    '8d': {
        label: '8D Audio',
        emoji: '🎧',
        payload: { rotation: { rotationHz: 0.2 } }
    },
    karaoke: {
        label: 'Karaoke',
        emoji: '🎤',
        payload: { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } }
    },
    tremolo: {
        label: 'Tremolo',
        emoji: '〰️',
        payload: { tremolo: { frequency: 4.0, depth: 0.75 } }
    },
    vibrato: {
        label: 'Vibrato',
        emoji: '📳',
        payload: { vibrato: { frequency: 4.0, depth: 0.75 } }
    },
    soft: {
        label: 'Soft',
        emoji: '🕊️',
        payload: { lowPass: { smoothing: 20.0 } }
    }
};

/** Trạng thái bộ lọc khi không áp dụng gì */
const DEFAULT_FILTER = 'off';

class FilterService {
    /**
     * Danh sách tên bộ lọc khả dụng.
     * @returns {string[]}
     */
    static getNames() {
        return Object.keys(PRESETS);
    }

    /**
     * Kiểm tra tên bộ lọc có hợp lệ không.
     * @param {string} name
     * @returns {boolean}
     */
    static isValid(name) {
        return Object.prototype.hasOwnProperty.call(PRESETS, String(name || '').toLowerCase());
    }

    /**
     * Chuẩn hoá tên bộ lọc (viết thường, bỏ khoảng trắng).
     * @param {string} name
     * @returns {string}
     */
    static normalise(name) {
        return String(name || '')
            .trim()
            .toLowerCase();
    }

    /**
     * Nhãn hiển thị của một bộ lọc.
     * @param {string} name
     * @returns {string}
     */
    static getLabel(name) {
        const preset = PRESETS[FilterService.normalise(name)];
        return preset ? preset.label : PRESETS[DEFAULT_FILTER].label;
    }

    /**
     * Biểu tượng của một bộ lọc.
     * @param {string} name
     * @returns {string}
     */
    static getEmoji(name) {
        const preset = PRESETS[FilterService.normalise(name)];
        return preset ? preset.emoji : PRESETS[DEFAULT_FILTER].emoji;
    }

    /**
     * Tạo payload filter đầy đủ (đã null hoá mọi bộ lọc khác).
     * @param {string} name - Tên bộ lọc
     * @param {number} [volumePercent=100] - Âm lượng hiện tại của player (phần trăm)
     * @returns {object} Payload gửi cho `player.setFilters()`
     */
    static buildPayload(name, volumePercent = 100) {
        const preset = PRESETS[FilterService.normalise(name)] || PRESETS[DEFAULT_FILTER];
        const safeVolume = Number.isFinite(volumePercent) && volumePercent > 0 ? volumePercent : 100;

        return {
            volume: safeVolume / 100,
            equalizer: [],
            karaoke: null,
            timescale: null,
            tremolo: null,
            vibrato: null,
            rotation: null,
            distortion: null,
            channelMix: null,
            lowPass: null,
            ...preset.payload
        };
    }

    /**
     * Áp dụng bộ lọc lên player.
     * @param {object} player - Kazagumo player
     * @param {string} name - Tên bộ lọc
     * @returns {Promise<{ ok: boolean, filter: string, label: string }>}
     */
    static async apply(player, name) {
        const normalised = FilterService.normalise(name);

        if (!FilterService.isValid(normalised)) {
            return { ok: false, filter: DEFAULT_FILTER, label: PRESETS[DEFAULT_FILTER].label };
        }

        const payload = FilterService.buildPayload(normalised, player.volume || 100);
        await player.setFilters(payload);

        return { ok: true, filter: normalised, label: PRESETS[normalised].label };
    }

    /**
     * Tắt toàn bộ bộ lọc.
     * @param {object} player - Kazagumo player
     * @returns {Promise<{ ok: boolean, filter: string, label: string }>}
     */
    static async reset(player) {
        await player.setFilters(FilterService.buildPayload(DEFAULT_FILTER, player.volume || 100));
        return { ok: true, filter: DEFAULT_FILTER, label: PRESETS[DEFAULT_FILTER].label };
    }

    /** Tên bộ lọc mặc định. */
    static get default() {
        return DEFAULT_FILTER;
    }

    /** Bảng preset gốc (chỉ đọc). */
    static get presets() {
        return PRESETS;
    }
}

module.exports = FilterService;
