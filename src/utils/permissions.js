const { PermissionFlagsBits } = require('discord.js');

/**
 * permissions.js — Kiểm tra điều kiện kênh thoại và trạng thái player.
 *
 * Các hàm ở đây trả về KHOÁ DỊCH (ví dụ `common.needVoice`) chứ không trả về
 * chuỗi đã dịch, để tầng gọi tự quyết định ngôn ngữ hiển thị.
 */

/**
 * Kiểm tra xem member có quyền quản trị hoặc DJ hay không.
 * @param {import('discord.js').GuildMember} member
 * @param {string} [djRoleId]
 * @returns {boolean}
 */
function hasElevatedPermission(member, djRoleId = null) {
    if (!member || !member.permissions) return false;
    if (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild)
    ) {
        return true;
    }
    if (djRoleId && member.roles?.cache?.has(djRoleId)) {
        return true;
    }
    if (member.roles?.cache) {
        const cache = member.roles.cache;
        if (typeof cache.some === 'function') {
            if (cache.some((role) => role?.name?.toLowerCase() === 'dj')) return true;
        } else if (typeof cache.values === 'function') {
            for (const role of cache.values()) {
                if (role?.name?.toLowerCase() === 'dj') return true;
            }
        }
    }
    return false;
}

/**
 * Kiểm tra xem member có quyền dừng player hay không (/stop hoặc np_stop).
 * @param {import('discord.js').GuildMember} member
 * @param {object} player - Kazagumo player
 * @param {string} [djRoleId]
 * @returns {{ ok: boolean, error?: string }}
 */
function canStop(member, player, djRoleId = null) {
    if (!member) return { ok: false, error: 'common.noPermission' };

    // 1. Quản trị viên hoặc DJ luôn có quyền dừng từ xa
    if (hasElevatedPermission(member, djRoleId)) {
        return { ok: true };
    }

    // 2. Nếu người dùng ở cùng kênh thoại với bot -> có quyền dừng
    if (player && player.voiceId) {
        const memberVoiceId = member.voice?.channel?.id;
        if (memberVoiceId && memberVoiceId === player.voiceId) {
            return { ok: true };
        }
    }

    // 3. Nếu bot bị kẹt/không ở cùng voice, từ chối người dùng thông thường
    return { ok: false, error: 'common.noPermission' };
}

/**
 * Kiểm tra xem member có ở trong voice channel hay không.
 * @param {import('discord.js').GuildMember} member
 * @returns {{ ok: boolean, channel?: import('discord.js').VoiceBasedChannel, error?: string }}
 */
function checkVoiceChannel(member) {
    const channel = member?.voice?.channel;
    if (!channel) {
        return { ok: false, error: 'common.needVoice' };
    }
    return { ok: true, channel };
}

/**
 * Kiểm tra xem member có ở CÙNG voice channel với bot hay không.
 * @param {import('discord.js').GuildMember} member
 * @param {object} player - Kazagumo player
 * @returns {{ ok: boolean, channel?: import('discord.js').VoiceBasedChannel, error?: string }}
 */
function checkSameVoiceChannel(member, player) {
    const voiceCheck = checkVoiceChannel(member);
    if (!voiceCheck.ok) return voiceCheck;

    if (player && player.voiceId && voiceCheck.channel.id !== player.voiceId) {
        return { ok: false, error: 'common.needSameVoice' };
    }
    return { ok: true, channel: voiceCheck.channel };
}

/**
 * Kiểm tra xem có player đang hoạt động trong guild hay không.
 * @param {import('kazagumo').Kazagumo} manager - Kazagumo manager
 * @param {string} guildId
 * @returns {{ ok: boolean, player?: object, error?: string }}
 */
function checkPlayer(manager, guildId) {
    const player = manager.players.get(guildId);
    if (!player) {
        return { ok: false, error: 'common.noPlayer' };
    }
    return { ok: true, player };
}

/**
 * Kiểm tra xem có bài nhạc đang phát không.
 * @param {object} player - Kazagumo player
 * @returns {{ ok: boolean, error?: string }}
 */
function checkPlaying(player) {
    if (!player || (!player.playing && !player.paused)) {
        return { ok: false, error: 'common.noPlaying' };
    }
    return { ok: true };
}

module.exports = {
    checkVoiceChannel,
    checkSameVoiceChannel,
    checkPlayer,
    checkPlaying,
    hasElevatedPermission,
    canStop
};
