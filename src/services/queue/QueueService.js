/**
 * QueueService — Quản lý tập trung mọi thao tác hàng đợi (queue).
 *
 * Không cho command gọi trực tiếp player.queue.add()/splice().
 * Tất cả đi qua service này để đảm bảo nhất quán và dễ mở rộng.
 */

const { MAX_QUEUE_SIZE, MAX_QUEUE_SIZE_PER_USER, MAX_PLAYLIST_LOAD } = require('../../config/constants');

class QueueService {
    /**
     * Thêm một hoặc nhiều track vào cuối hàng đợi.
     * @param {object} player - Kazagumo player
     * @param {object|object[]} tracks - Track(s) Kazagumo hoặc mảng
     */
    add(player, tracks) {
        if (Array.isArray(tracks)) {
            for (const t of tracks) {
                player.queue.add(t);
            }
        } else {
            player.queue.add(tracks);
        }
    }

    /**
     * Chèn track vào đầu hàng đợi (vị trí 0 = phát kế tiếp).
     * @param {object} player - Kazagumo player
     * @param {object} track - Track Kazagumo
     */
    addTop(player, track) {
        // Kazagumo queue là một mảng, unshift để chèn đầu
        player.queue.unshift(track);
    }

    /**
     * Xóa một track tại vị trí index (0-based).
     * @param {object} player - Kazagumo player
     * @param {number} index - Vị trí (0-based)
     * @returns {object|null} Track bị xóa hoặc null nếu index không hợp lệ
     */
    remove(player, index) {
        if (index < 0 || index >= player.queue.length) return null;
        const removed = player.queue.splice(index, 1);
        return removed[0] || null;
    }

    /**
     * Di chuyển track từ vị trí from sang vị trí to (0-based).
     * @param {object} player - Kazagumo player
     * @param {number} from - Vị trí nguồn (0-based)
     * @param {number} to - Vị trí đích (0-based)
     * @returns {boolean} true nếu thành công
     */
    move(player, from, to) {
        if (from < 0 || from >= player.queue.length) return false;
        if (to < 0 || to >= player.queue.length) return false;
        if (from === to) return true;

        const [track] = player.queue.splice(from, 1);
        player.queue.splice(to, 0, track);
        return true;
    }

    /**
     * Xóa toàn bộ hàng đợi nhưng KHÔNG dừng bài đang phát.
     * @param {object} player - Kazagumo player
     * @returns {number} Số bài đã xóa
     */
    clear(player) {
        const count = player.queue.length;
        player.queue.length = 0;
        return count;
    }

    /**
     * Shuffle (xáo trộn) hàng đợi.
     * @param {object} player - Kazagumo player
     * @param {string} [requesterId] - Nếu cung cấp, chỉ shuffle bài do user này thêm
     * @returns {number} Số bài đã được xáo trộn
     */
    shuffle(player, requesterId = null) {
        if (player.queue.length <= 1) return player.queue.length;

        if (requesterId) {
            // Shuffle chỉ bài của người yêu cầu, giữ nguyên vị trí bài người khác
            const myIndices = [];
            const myTracks = [];

            for (let i = 0; i < player.queue.length; i++) {
                const track = player.queue[i];
                const reqId = track.requesterId || (track.requester && track.requester.id);
                if (reqId === requesterId) {
                    myIndices.push(i);
                    myTracks.push(track);
                }
            }

            if (myTracks.length <= 1) return myTracks.length;

            // Fisher-Yates shuffle trên subset
            for (let i = myTracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [myTracks[i], myTracks[j]] = [myTracks[j], myTracks[i]];
            }

            // Đặt lại các bài đã shuffle vào đúng vị trí index gốc
            for (let k = 0; k < myIndices.length; k++) {
                player.queue[myIndices[k]] = myTracks[k];
            }

            return myTracks.length;
        }

        // Shuffle toàn bộ (Fisher-Yates)
        const queue = player.queue;
        for (let i = queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue[i], queue[j]] = [queue[j], queue[i]];
        }

        return queue.length;
    }

    /**
     * Lấy số lượng bài trong hàng đợi.
     * @param {object} player - Kazagumo player
     * @returns {number}
     */
    size(player) {
        return player.queue.length;
    }

    /**
     * Đếm số bài trong hàng đợi do một người dùng thêm vào.
     * @param {object} player - Kazagumo player
     * @param {string} requesterId
     * @returns {number}
     */
    countByRequester(player, requesterId) {
        if (!requesterId) return 0;
        return Array.from(player.queue).filter((track) => {
            const id = track.requesterId || (track.requester && track.requester.id);
            return id === requesterId;
        }).length;
    }

    /**
     * Kiểm tra còn chỗ để thêm bài hay không (theo giới hạn guild và theo người dùng).
     * @param {object} player - Kazagumo player
     * @param {number} count - Số bài muốn thêm
     * @param {string} [requesterId] - ID người yêu cầu (bỏ qua nếu không cần giới hạn theo người)
     * @returns {{ ok: boolean, allowed: number, error?: 'queueFull'|'userQueueFull', vars?: object }}
     */
    canAdd(player, count, requesterId) {
        const currentSize = player.queue.length;
        const guildSpace = MAX_QUEUE_SIZE - currentSize;

        if (guildSpace <= 0) {
            return { ok: false, allowed: 0, error: 'queueFull', vars: { max: MAX_QUEUE_SIZE } };
        }

        let allowed = Math.min(count, guildSpace, MAX_PLAYLIST_LOAD);

        if (requesterId) {
            const userCount = this.countByRequester(player, requesterId);
            const userSpace = MAX_QUEUE_SIZE_PER_USER - userCount;
            if (userSpace <= 0) {
                return {
                    ok: false,
                    allowed: 0,
                    error: 'userQueueFull',
                    vars: { count: userCount, max: MAX_QUEUE_SIZE_PER_USER }
                };
            }
            allowed = Math.min(allowed, userSpace);
        }

        return { ok: allowed > 0, allowed };
    }

    /**
     * Tính tổng thời lượng hàng đợi (mili-giây).
     * @param {object} player - Kazagumo player
     * @returns {number}
     */
    getTotalDuration(player) {
        return player.queue.reduce((sum, track) => {
            return sum + (track.length || track.duration || 0);
        }, 0);
    }

    /**
     * Lấy slice (phần cắt) của hàng đợi cho phân trang.
     * @param {object} player - Kazagumo player
     * @param {number} page - Số trang (1-based)
     * @param {number} [perPage=10] - Số bài mỗi trang
     * @returns {{ tracks: object[], page: number, totalPages: number, totalTracks: number }}
     */
    getPage(player, page = 1, perPage = 10) {
        const totalTracks = player.queue.length;
        const totalPages = Math.max(1, Math.ceil(totalTracks / perPage));
        const safePage = Math.max(1, Math.min(page, totalPages));

        const start = (safePage - 1) * perPage;
        const end = Math.min(start + perPage, totalTracks);
        const tracks = player.queue.slice(start, end);

        return {
            tracks,
            page: safePage,
            totalPages,
            totalTracks,
            startIndex: start
        };
    }
}

// Singleton instance
module.exports = new QueueService();
