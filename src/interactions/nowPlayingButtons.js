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
const { respondEphemeral } = require('../utils/reply');
const { isEphemeralMessage } = require('../utils/interactions');
const { withTimeout } = require('../utils/timeout');

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
    const memberVoice = interaction.member?.voice?.channel;
    if (!memberVoice) return false;
    if (player && player.voiceId && memberVoice.id !== player.voiceId) return false;
    return true;
}

/**
 * Xử lý nút bấm trên bảng Now Playing.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} ctx
 * @param {string} customId
 */
async function handle(interaction, ctx, customId) {
    const player = ctx.manager.players.get(interaction.guild.id);

    // Nút dừng cũng phải kiểm tra kênh thoại để tránh bất kỳ ai ngoài phòng cũng dừng được
    if (customId === 'np_stop') {
        if (!isInSameVoice(interaction, player)) {
            return respondEphemeral(interaction, t('common.needSameVoice'));
        }
        if (player) {
            await ctx.playerService.stop(player);
        } else {
            await ctx.playerService.forceCleanupVoice(interaction.guild.id);
        }
        const embed = NowPlayingUI.createStopped('stopped');
        return interaction.update({ content: '', embeds: [embed], components: [] }).catch(() => {
            return interaction.editReply({ content: '', embeds: [embed], components: [] }).catch(() => {});
        });
    }

    // Player đã chết hoặc không tồn tại
    if (!player) {
        return respondEphemeral(interaction, t('common.noPlayer'));
    }

    if (!isInSameVoice(interaction, player)) {
        return respondEphemeral(interaction, t('common.needSameVoice'));
    }

    const state = getState(interaction.guild.id);

    if (isEphemeralMessage(interaction.message)) {
        ctx.playerService.registerEphemeralContext(interaction, player);
    }
    state.touchPanel();

    await interaction.deferUpdate();

    switch (customId) {
        case 'np_previous': {
            const result = await ctx.playerService.previous(player);
            if (!result.ok) {
                await respondEphemeral(interaction, t(result.error));
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
            if (!ok) await respondEphemeral(interaction, t('common.noPlaying'));
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
                await respondEphemeral(interaction, t('commands.shuffle.done', { count }));
            } else {
                await respondEphemeral(interaction, t('commands.shuffle.needMore'));
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
            await interaction.followUp({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
            return;
        }

        default:
            ctx.logger.debug(`Nút "${customId}" chưa được xử lý.`);
    }
}

module.exports = { handle, refreshPanel, prefix: 'np_' };
