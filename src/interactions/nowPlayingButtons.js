/**
 * nowPlayingButtons — Xử lý toàn bộ nút trên bảng Now Playing (tiền tố `np_`).
 *
 * Bảng có thể là ephemeral (chỉ ngưởi gọi lệnh thấy) hoặc công khai.
 * Mọi nút đều yêu cầu ngưởi bấm ở cùng kênh thoại với bot (kể cả 🛑 Dừng).
 */

const { MessageFlags } = require('discord.js');

const { t } = require('../locales');
const NowPlayingUI = require('../services/ui/NowPlayingUI');
const QueueUI = require('../services/ui/QueueUI');
const { getState } = require('../services/player/PlayerState');
const { isEphemeralMessage } = require('../utils/interactions');
const { withTimeout } = require('../utils/timeout');
const { canStop } = require('../utils/permissions');

/** Bước thay đổi âm lượng mỗi lần bấm nút */
const VOLUME_STEP = 10;

/** Giới hạn âm lượng */
const VOLUME_MIN = 1;
const VOLUME_MAX = 200;

/** Thởi gian chờ Lavalink REST cho các lệnh đơn giản (ms) */
const REST_TIMEOUT_MS = 10000;

/**
 * Vẽ lại bảng Now Playing ngay trên tin nhắn chứa nút vừa bấm.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} player
 * @param {import('../services/player/PlayerState').PlayerState} state
 */
async function refreshPanel(interaction, player, state) {
    const track = player.queue.current;
    if (!track) return;

    const { embed, components } = NowPlayingUI.create(player, track, state);
    await interaction
        .editReply({
            content: state.panelNote || '',
            embeds: [embed],
            components
        })
        .catch(() => {});
}

/**
 * Kiểm tra ngưởi dùng có ở cùng kênh thoại với bot không.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} player
 * @returns {boolean}
 */
function isInSameVoice(interaction, player) {
    const memberVoiceId = interaction.member?.voice?.channelId || interaction.member?.voice?.channel?.id;
    if (!memberVoiceId) return false;
    if (player && player.voiceId && memberVoiceId !== player.voiceId) return false;
    return true;
}

/**
 * Xử lý nút bấm trên bảng Now Playing.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} ctx
 * @param {string} customId
 */
async function handle(interaction, ctx, customId) {
    // 1. Phản hồi Discord NGAY LẬP TỨC để tránh lỗi "Tương tác này không thành công" (hết hạn 3s)
    await interaction.deferUpdate().catch(() => {});

    const player = ctx.manager.players.get(interaction.guild.id);

    // Nút dừng: kiểm tra quyền phù hợp (ở cùng voice, DJ hoặc quản trị viên)
    if (customId === 'np_stop') {
        const djRoleId = ctx.storage?.getGuild?.(interaction.guild.id)?.djRoleId;
        const perm = canStop(interaction.member, player, djRoleId);
        if (!perm.ok) {
            await interaction.followUp({ content: t(perm.error), flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }

        if (player) {
            await ctx.playerService.stop(player);
        } else {
            await ctx.playerService.forceCleanupVoice(interaction.guild.id);
        }
        const embed = NowPlayingUI.createStopped('stopped');
        await interaction.editReply({ content: '', embeds: [embed], components: [] }).catch(() => {});
        return;
    }

    // Player đã chết hoặc không tồn tại
    if (!player) {
        await interaction.followUp({ content: t('common.noPlayer'), flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
    }

    if (!isInSameVoice(interaction, player)) {
        await interaction.followUp({ content: t('common.needSameVoice'), flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
    }

    const state = getState(interaction.guild.id);

    if (isEphemeralMessage(interaction.message)) {
        ctx.playerService.registerEphemeralContext(interaction, player);
    }
    state.touchPanel();

    switch (customId) {
        case 'np_previous': {
            const result = await ctx.playerService.previous(player);
            if (!result.ok) {
                await interaction.followUp({ content: t(result.error), flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_pause_resume': {
            if (player.paused) ctx.playerService.resume(player);
            else ctx.playerService.pause(player);
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_skip': {
            const ok = ctx.playerService.skip(player);
            if (!ok) {
                await interaction.followUp({ content: t('common.noPlaying'), flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            return;
        }

        case 'np_repeat': {
            state.cycleRepeatMode();
            ctx.playerService.persistState(interaction.guild.id, state, player.volume);
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_shuffle': {
            if (player.queue.length > 1) {
                const count = ctx.queueService.shuffle(player);
                await refreshPanel(interaction, player, state);
                await interaction
                    .followUp({ content: t('commands.shuffle.done', { count }), flags: MessageFlags.Ephemeral })
                    .catch(() => {});
            } else {
                await interaction
                    .followUp({ content: t('commands.shuffle.needMore'), flags: MessageFlags.Ephemeral })
                    .catch(() => {});
            }
            return;
        }

        case 'np_vol_down':
        case 'np_vol_up': {
            const delta = customId === 'np_vol_up' ? VOLUME_STEP : -VOLUME_STEP;
            const newVolume = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, (player.volume || 100) + delta));
            try {
                await withTimeout(player.setVolume(newVolume), REST_TIMEOUT_MS, 'player.setVolume');
            } catch (err) {
                ctx.logger.warn('Lỗi setVolume từ nút:', err.message);
            }
            ctx.playerService.persistState(interaction.guild.id, state, newVolume);
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_autoplay': {
            ctx.playerService.setAutoplay(player, !state.autoplay);
            await refreshPanel(interaction, player, state);
            return;
        }

        case 'np_queue': {
            const { embed, components } = QueueUI.create(player, 1);
            await interaction.followUp({ embeds: [embed], components, flags: MessageFlags.Ephemeral }).catch(() => {});
            return;
        }

        default:
            ctx.logger.debug(`Nút "${customId}" chưa được xử lý.`);
    }
}

module.exports = { handle, refreshPanel, prefix: 'np_' };
