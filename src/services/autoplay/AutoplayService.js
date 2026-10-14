/**
 * AutoplayService — Tự động tìm và phát bài hát liên quan khi hàng đợi hết bài.
 *
 * Cách hoạt động: lấy bài vừa phát làm "hạt giống", tìm trên YouTube theo vài
 * mẫu truy vấn (mix / radio / tên bài + nghệ sĩ), rồi chọn kết quả đầu tiên
 * chưa từng phát gần đây để tránh lặp lại.
 */

const { createLogger } = require('../logger');

const log = createLogger('AutoplayService');

/** Các mẫu truy vấn, thử lần lượt cho tới khi có kết quả phù hợp */
const QUERY_TEMPLATES = [
    (seed) => `${seed.author} mix`,
    (seed) => `${seed.author} radio`,
    (seed) => `${seed.title} ${seed.author}`
];

/** Lấy khoá định danh duy nhất của một track */
function trackKey(track) {
    if (!track) return '';
    return track.identifier || track.uri || `${track.title}|${track.author}`;
}

/**
 * Chọn bài hát chưa từng phát trong danh sách kết quả.
 * Hàm thuần, tách riêng để dễ kiểm thử.
 * @param {object[]} tracks - Danh sách track ứng viên
 * @param {Set<string>} excludedKeys - Các khoá định danh cần loại trừ
 * @returns {object|null} Track được chọn hoặc null
 */
function pickRelated(tracks, excludedKeys) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    for (const track of tracks) {
        if (!track) continue;
        if (track.isStream) continue; // Bỏ qua livestream để tránh phát vô tận
        if (!excludedKeys.has(trackKey(track))) return track;
    }
    return null;
}

class AutoplayService {
    /**
     * @param {import('kazagumo').Kazagumo} manager - Kazagumo manager
     */
    constructor(manager) {
        this.manager = manager;
    }

    /**
     * Tìm một bài hát liên quan tới bài vừa phát.
     * @param {object} seedTrack - Bài hát vừa phát xong
     * @param {Set<string>|string[]} excluded - Khoá định danh các bài cần tránh
     * @param {object} [requester] - Người dùng được gán làm người yêu cầu
     * @returns {Promise<object|null>} Track tìm được hoặc null
     */
    async findRelated(seedTrack, excluded, requester) {
        if (!seedTrack) return null;

        const excludedKeys = excluded instanceof Set ? excluded : new Set(excluded || []);
        excludedKeys.add(trackKey(seedTrack));

        for (const buildQuery of QUERY_TEMPLATES) {
            const query = buildQuery(seedTrack);
            if (!query || !query.trim()) continue;

            try {
                const result = await this.manager.search(query, { requester });
                const picked = pickRelated(result?.tracks, excludedKeys);
                if (picked) {
                    log.debug(`Autoplay chọn "${picked.title}" từ truy vấn "${query}"`);
                    return picked;
                }
            } catch (err) {
                log.warn(`Autoplay không tìm được kết quả cho "${query}":`, err.message);
            }
        }

        return null;
    }
}

module.exports = AutoplayService;
module.exports.pickRelated = pickRelated;
module.exports.trackKey = trackKey;
