/**
 * nowPlayingButtons — Xử lý toàn bộ nút trên bảng Now Playing (tiền tố `np_`).
 *
 * Bảng có thể là ephemeral (chỉ người gọi lệnh thấy) hoặc công khai (do
 * `/nowplaying` tạo). Mọi nút đều yêu cầu người bấm ở cùng kênh thoại với bot.
 */

const { MessageFlags } = require('discord.js');

const { t } = require('../locales');
const NowPlayingUI = require('../services/ui/NowPlayingUI');
const QueueUI = require('../services/ui/QueueUI');
const { getState } = require('../services/player/PlayerState');
const { respondEphemeral } = require('../utils/reply');
const { isEphemeralMessage } = require('../utils/interactions');

/** Bước thay đổi âm lượng mỗi lần bấm nút */
const VOLUME_STEP = 10;

/** Giới hạn âm lượng */
const VOLUME_MIN = 1;
const VOLUME_MAX = 200;

/**
 * Vẽ lại bảng Now Playing ngay trên tin nhắn chứa nút vừa bấm.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} player - Kazagumo player
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
 * Xử lý nút bấm trên bảng Now Playing.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} ctx - Ngữ cảnh bot
 * @param {string} customId
 */
async function handle(interaction, ctx, customId) {
    const player = ctx.manager.players.get(interaction.guild.id);

    // Player đã chết → báo lỗi thay vì để Discord hiện "tương tác thất bại"
    if (!player) {
        return respondEphemeral(interaction, t('common.noPlayer'));
    }

    const memberVoice = interaction.member?.voice?.channel;
    if (!memberVoice || memberVoice.id !== player.voiceId) {
        return respondEphemeral(interaction, t('common.needSameVoice'));
    }

    const state = getState(interaction.guild.id);

    // Bảng ephemeral: mỗi lần bấm nút tạo một token mới (15 phút) →
    // gia hạn để ticker tiến trình tiếp tục cập nhật được bảng này.
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
            await player.setVolume(newVolume);
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

        case 'np_stop': {
            await ctx.playerService.stop(player);
            const embed = NowPlayingUI.createStopped('stopped');
            await interaction.editReply({ content: '', embeds: [embed], components: [] }).catch(() => {});
            return;
        }

        default:
            ctx.logger.debug(`Nút "${customId}" chưa được xử lý.`);
    }
}

module.exports = { handle, refreshPanel, prefix: 'np_' };
