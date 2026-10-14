/**
 * VoicePresenceService — Tự động rời kênh thoại khi không còn ai nghe.
 *
 * Trước đây bot nằm mãi trong kênh thoại sau khi mọi người rời đi, chiếm slot
 * và giữ kết nối tới Lavalink. Service này theo dõi sự kiện `voiceStateUpdate`
 * và hẹn giờ rời phòng nếu kênh chỉ còn lại bot.
 */

const { createLogger } = require('../logger');
const { VOICE_EMPTY_LEAVE_MS } = require('../../config/constants');

const log = createLogger('VoicePresenceService');

/**
 * Đếm số thành viên KHÔNG phải bot trong một kênh thoại.
 * Hàm thuần, tách riêng để dễ kiểm thử.
 * @param {Iterable<{ user?: { bot?: boolean } }>} members
 * @returns {number}
 */
function countHumans(members) {
    if (!members) return 0;
    let count = 0;
    for (const member of members) {
        if (member && member.user && !member.user.bot) count++;
    }
    return count;
}

class VoicePresenceService {
    /**
     * @param {import('discord.js').Client} client
     * @param {import('kazagumo').Kazagumo} manager
     * @param {{ idleMs?: number, onIdle?: (guildId: string) => Promise<void>|void }} [options]
     */
    constructor(client, manager, options = {}) {
        this.client = client;
        this.manager = manager;
        this.idleMs = options.idleMs ?? VOICE_EMPTY_LEAVE_MS;
        this.onIdle = options.onIdle || (() => {});
        /** @type {Map<string, NodeJS.Timeout>} */
        this.timers = new Map();
    }

    /** Bắt đầu lắng nghe sự kiện voice. */
    start() {
        this.listener = (oldState, newState) => {
            this.handle(oldState, newState).catch((err) => {
                log.error('Lỗi khi xử lý voiceStateUpdate:', err);
            });
        };
        this.client.on('voiceStateUpdate', this.listener);
        log.info(`Đã bật tính năng tự rời phòng sau ${Math.round(this.idleMs / 1000)}s khi kênh trống.`);
    }

    /** Ngừng lắng nghe và xoá mọi timer đang chờ. */
    stop() {
        if (this.listener) this.client.off('voiceStateUpdate', this.listener);
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
    }

    /**
     * Xử lý một sự kiện thay đổi trạng thái thoại.
     * @param {import('discord.js').VoiceState} _oldState
     * @param {import('discord.js').VoiceState} newState
     */
    async handle(_oldState, newState) {
        const guild = newState.guild || _oldState?.guild;
        if (!guild) return;

        // 1. Kiểm tra bot có đang ở trong kênh thoại nào không (thử từ voiceStates, player, Shoukaku, và guild member)
        const botVoiceChannelId =
            guild.voiceStates?.cache?.get(this.client.user?.id)?.channelId ||
            this.manager.players.get(guild.id)?.voiceId ||
            this.manager.shoukaku.connections.get(guild.id)?.channelId ||
            guild.members.me?.voice?.channelId;

        if (!botVoiceChannelId) {
            this.cancel(guild.id);
            return;
        }

        // 2. Đếm số người dùng (không phải bot) trong kênh thoại
        let humans = 0;

        if (guild.voiceStates?.cache?.size) {
            for (const vs of guild.voiceStates.cache.values()) {
                if (vs.channelId !== botVoiceChannelId) continue;
                if (vs.id === this.client.user?.id) continue;
                // Nếu người này vừa rời kênh hoặc ngắt kết nối trong sự kiện này
                if (vs.id === newState.id && newState.channelId !== botVoiceChannelId) continue;
                if (vs.member?.user?.bot) continue;
                humans++;
            }
        } else {
            const channel = guild.channels.cache.get(botVoiceChannelId)
                || await guild.channels.fetch(botVoiceChannelId).catch(() => null);
            if (channel?.members) {
                for (const member of channel.members.values()) {
                    if (member.id === this.client.user?.id || member.user?.bot) continue;
                    if (member.id === newState.id && newState.channelId !== botVoiceChannelId) continue;
                    humans++;
                }
            }
        }

        if (humans > 0) {
            this.cancel(guild.id);
            return;
        }

        this.schedule(guild.id);
    }

    /**
     * Hẹn giờ rời phòng cho một guild (bỏ qua nếu đã có timer).
     * @param {string} guildId
     */
    schedule(guildId) {
        if (this.timers.has(guildId)) return;

        log.debug(`Kênh thoại của guild ${guildId} đã trống, hẹn rời sau ${Math.round(this.idleMs / 1000)}s.`);

        const timer = setTimeout(async () => {
            this.timers.delete(guildId);
            try {
                await this.onIdle(guildId);
            } catch (err) {
                log.error(`Không rời được kênh thoại của guild ${guildId}:`, err);
            }
        }, this.idleMs);

        if (typeof timer.unref === 'function') timer.unref();
        this.timers.set(guildId, timer);
    }

    /**
     * Huỷ hẹn giờ rời phòng (khi có người quay lại).
     * @param {string} guildId
     */
    cancel(guildId) {
        const timer = this.timers.get(guildId);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(guildId);
            log.debug(`Có người quay lại kênh thoại guild ${guildId}, đã huỷ hẹn rời phòng.`);
        }
    }

    /** Số guild đang trong trạng thái chờ rời phòng. */
    get pendingCount() {
        return this.timers.size;
    }
}

module.exports = VoicePresenceService;
module.exports.countHumans = countHumans;
