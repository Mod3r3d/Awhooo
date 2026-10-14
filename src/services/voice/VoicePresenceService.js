/**
 * VoicePresenceService — Tự động rồi kênh thoại khi không còn ai nghe.
 *
 * Trước đây bot nằm mãi trong kênh thoại sau khi mọi ngưởi rồi đi, chiếm slot
 * và giữ kết nối tới Lavalink. Service này theo dõi sự kiện `voiceStateUpdate`
 * và hẹn giờ rồi phòng nếu kênh chỉ còn lại bot.
 */

const { createLogger } = require('../logger');
const { VOICE_EMPTY_LEAVE_MS } = require('../../config/constants');

const log = createLogger('VoicePresenceService');

/**
 * Đếm số thành viên KHÔNG phải bot trong một kênh thoại.
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
        log.info(`Đã bật tính năng tự rồi phòng sau ${Math.round(this.idleMs / 1000)}s khi kênh trống.`);
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

        const botId = this.client.user?.id;
        const player = this.manager?.players?.get(guild.id);

        // Nếu sự kiện này chính là của bot và bot vừa rồi khỏi kênh thoại
        // → chỉ huỷ timer, KHÔNG gọi onIdle (tránh thông báo sai ngữ cảnh và đệ quy)
        if (botId && newState.id === botId && !newState.channelId) {
            this.cancel(guild.id);
            return;
        }

        // Lấy kênh thoại thực tế của bot từ Discord trước
        const discordBotVoiceId =
            guild.voiceStates?.cache?.get(botId)?.channelId ?? guild.members?.me?.voice?.channelId;
        const botVoiceChannelId =
            discordBotVoiceId !== undefined
                ? discordBotVoiceId
                : player?.voiceId || this.manager?.shoukaku?.connections?.get(guild.id)?.channelId;

        if (!botVoiceChannelId) {
            this.cancel(guild.id);
            return;
        }

        // Đồng bộ lại voiceId của player nếu bot được chuyển sang phòng khác
        if (player && player.voiceId && player.voiceId !== botVoiceChannelId) {
            player.voiceId = botVoiceChannelId;
        }

        // Đếm số ngưởi dùng (không phải bot) trong kênh thoại
        let humans = 0;

        if (guild.voiceStates?.cache?.size) {
            for (const vs of guild.voiceStates.cache.values()) {
                if (vs.channelId !== botVoiceChannelId) continue;
                if (vs.id === botId) continue;
                if (vs.id === newState.id && newState.channelId !== botVoiceChannelId) continue;
                if (vs.member?.user?.bot) continue;
                humans++;
            }
        } else {
            const channel =
                guild.channels.cache.get(botVoiceChannelId) ||
                (await guild.channels.fetch(botVoiceChannelId).catch(() => null));
            if (channel?.members) {
                for (const member of channel.members.values()) {
                    if (member.id === botId || member.user?.bot) continue;
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
     * Hẹn giờ rồi phòng cho một guild.
     * @param {string} guildId
     */
    schedule(guildId) {
        if (this.timers.has(guildId)) return;

        log.debug(`Kênh thoại của guild ${guildId} đã trống, hẹn rồi sau ${Math.round(this.idleMs / 1000)}s.`);

        const timer = setTimeout(async () => {
            this.timers.delete(guildId);
            try {
                await this.onIdle(guildId);
            } catch (err) {
                log.error(`Không rồi được kênh thoại của guild ${guildId}:`, err);
            }
        }, this.idleMs);

        if (typeof timer.unref === 'function') timer.unref();
        this.timers.set(guildId, timer);
    }

    /**
     * Huỷ hẹn giờ rồi phòng.
     * @param {string} guildId
     */
    cancel(guildId) {
        const timer = this.timers.get(guildId);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(guildId);
            log.debug(`Có ngưởi quay lại kênh thoại guild ${guildId}, đã huỷ hẹn rồi phòng.`);
        }
    }

    /** Số guild đang trong trạng thái chờ rồi phòng. */
    get pendingCount() {
        return this.timers.size;
    }
}

module.exports = VoicePresenceService;
module.exports.countHumans = countHumans;
