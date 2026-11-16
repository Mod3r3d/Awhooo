/**
 * filterSelect — Xử lý menu chọn bộ lọc âm thanh trên bảng Now Playing.
 */

const { MessageFlags } = require('discord.js');
const { t } = require('../locales');
const NowPlayingUI = require('../services/ui/NowPlayingUI');
const { getState } = require('../services/player/PlayerState');
const { isEphemeralMessage } = require('../utils/interactions');
const { refreshPanel } = require('./nowPlayingButtons');

/**
 * Xử lý khi người dùng chọn một bộ lọc.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {object} ctx - Ngữ cảnh bot
 */
async function handle(interaction, ctx) {
    // 1. Luôn xác nhận nhận lệnh ngay lập tức để không bị timeout 3s
    await interaction.deferUpdate().catch(() => {});

    const player = ctx.manager.players.get(interaction.guild.id);
    if (!player) {
        return interaction.followUp({ content: t('common.noPlayer'), flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    const memberVoiceId = interaction.member?.voice?.channelId || interaction.member?.voice?.channel?.id;
    if (!memberVoiceId || memberVoiceId !== player.voiceId) {
        return interaction
            .followUp({ content: t('common.needSameVoice'), flags: MessageFlags.Ephemeral })
            .catch(() => {});
    }

    const name = interaction.values[0];
    const state = getState(interaction.guild.id);

    // Gia hạn token nếu bảng là ephemeral
    if (isEphemeralMessage(interaction.message)) {
        ctx.playerService.registerEphemeralContext(interaction, player);
    }
    state.touchPanel();

    const result = await ctx.playerService.setFilter(player, name);
    if (!result.ok) {
        await interaction
            .followUp({ content: t('commands.filter.invalid', { name }), flags: MessageFlags.Ephemeral })
            .catch(() => {});
        return;
    }

    await refreshPanel(interaction, player, state);
}

module.exports = { handle, customId: NowPlayingUI.FILTER_SELECT_ID };
