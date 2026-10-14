/**
 * StorageService — Lưu trữ bền vững (persistence) bằng file JSON.
 *
 * Phạm vi lưu trữ:
 *  - Cài đặt theo guild: chế độ lặp, âm lượng, bộ lọc, autoplay
 *  - Lịch sử bài hát đã phát (để `/history` và `/previous` sống sót qua restart)
 *
 * Ghi file theo cơ chế debounce + ghi nguyên tử (ghi file tạm rồi rename)
 * để không bao giờ để lại file JSON hỏng nếu tiến trình bị kill giữa chừng.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { createLogger } = require('../logger');

const log = createLogger('StorageService');

/** Phiên bản schema dữ liệu — tăng lên khi cấu trúc thay đổi */
const SCHEMA_VERSION = 1;

/** Cấu hình mặc định cho một guild chưa từng được lưu */
function defaultGuildRecord() {
    return {
        repeatMode: 'off',
        volume: null,
        filter: 'off',
        autoplay: null,
        history: []
    };
}

class StorageService {
    /**
     * @param {{ filePath: string, flushDebounceMs?: number, maxHistory?: number }} options
     */
    constructor({ filePath, flushDebounceMs = 2000, maxHistory = 50 }) {
        this.filePath = filePath;
        this.tmpPath = `${filePath}.tmp`;
        this.flushDebounceMs = flushDebounceMs;
        this.maxHistory = maxHistory;

        /** @type {{ version: number, guilds: Record<string, object> }} */
        this.data = { version: SCHEMA_VERSION, guilds: {} };

        /** @type {NodeJS.Timeout|null} */
        this.flushTimer = null;
        this.dirty = false;
        this.ready = false;
    }

    /**
     * Nạp dữ liệu từ đĩa. An toàn khi gọi nhiều lần.
     * @returns {Promise<void>}
     */
    async init() {
        try {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        } catch (err) {
            log.warn('Không tạo được thư mục dữ liệu, persistence sẽ tạm tắt.', err.message);
            this.ready = false;
            return;
        }

        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && parsed.guilds) {
                this.data = { version: parsed.version || SCHEMA_VERSION, guilds: parsed.guilds };
                log.info(`Đã nạp dữ liệu cho ${Object.keys(this.data.guilds).length} guild từ ${this.filePath}`);
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                log.info('Chưa có file dữ liệu, sẽ tạo mới khi cần.');
            } else {
                // File hỏng: sao lưu lại rồi bắt đầu từ đầu thay vì crash
                log.warn('File dữ liệu không đọc được, sao lưu và tạo mới.', err.message);
                await fs.rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`).catch(() => {});
            }
        }

        this.ready = true;
    }

    /**
     * Lấy bản ghi của một guild (tự tạo nếu chưa có).
     * @param {string} guildId
     * @returns {object}
     */
    getGuild(guildId) {
        if (!this.data.guilds[guildId]) {
            this.data.guilds[guildId] = defaultGuildRecord();
        }
        return this.data.guilds[guildId];
    }

    /**
     * Ghi đè một phần bản ghi của guild.
     * @param {string} guildId
     * @param {object} patch
     */
    setGuild(guildId, patch) {
        this.data.guilds[guildId] = { ...this.getGuild(guildId), ...patch };
        this.scheduleFlush();
    }

    /**
     * Lưu lịch sử phát nhạc của guild (chỉ giữ tối đa `maxHistory` bài).
     * @param {string} guildId
     * @param {object[]} history
     */
    setHistory(guildId, history) {
        const trimmed = Array.isArray(history) ? history.slice(0, this.maxHistory) : [];
        this.setGuild(guildId, { history: trimmed });
    }

    /**
     * Xoá dữ liệu của một guild.
     * @param {string} guildId
     */
    removeGuild(guildId) {
        if (this.data.guilds[guildId]) {
            delete this.data.guilds[guildId];
            this.scheduleFlush();
        }
    }

    /** Đặt lịch ghi đĩa (gộp nhiều thay đổi liên tiếp thành một lần ghi). */
    scheduleFlush() {
        if (!this.ready) return;
        this.dirty = true;
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flush().catch((err) => log.error('Ghi dữ liệu thất bại:', err));
        }, this.flushDebounceMs);
        // Không giữ tiến trình sống chỉ vì timer này
        if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
    }

    /**
     * Ghi dữ liệu xuống đĩa ngay lập tức (ghi nguyên tử).
     * @returns {Promise<boolean>} true nếu có ghi thành công
     */
    async flush() {
        if (!this.ready || !this.dirty) return false;

        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        try {
            const payload = JSON.stringify({ version: SCHEMA_VERSION, guilds: this.data.guilds }, null, 2);
            await fs.writeFile(this.tmpPath, payload, 'utf8');
            await fs.rename(this.tmpPath, this.filePath);
            this.dirty = false;
            return true;
        } catch (err) {
            log.error('Không ghi được file dữ liệu:', err);
            return false;
        }
    }

    /** Ghi nốt dữ liệu còn tồn rồi dọn timer (dùng khi shutdown). */
    async close() {
        await this.flush();
    }
}

module.exports = StorageService;
