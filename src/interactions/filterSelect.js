/**
 * filterSelect — Xử lý menu chọn bộ lọc âm thanh trên bảng Now Playing.
 */

const { t } = require('../locales');
const NowPlayingUI = require('../services/ui/NowPlayingUI');
const { getState } = require('../services/player/PlayerState');
const { respondEphemeral } = require('../utils/reply');
const { isEphemeralMessage } = require('../utils/interactions');
const { refreshPanel } = require('./nowPlayingButtons');

/**
 * Xử lý khi người dùng chọn một bộ lọc.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {object} ctx - Ngữ cảnh bot
 */
async function handle(interaction, ctx) {
    const player = ctx.manager.players.get(interaction.guild.id);
    if (!player) {
        return respondEphemeral(interaction, t('common.noPlayer'));
    }

    const memberVoice = interaction.member?.voice?.channel;
    if (!memberVoice || memberVoice.id !== player.voiceId) {
        return respondEphemeral(interaction, t('common.needSameVoice'));
    }

    const name = interaction.values[0];
    const state = getState(interaction.guild.id);

    // Gia hạn token nếu bảng là ephemeral
    if (isEphemeralMessage(interaction.message)) {
        ctx.playerService.registerEphemeralContext(interaction, player);
    }
    state.touchPanel();

    await interaction.deferUpdate();

    const result = await ctx.playerService.setFilter(player, name);
    if (!result.ok) {
        await respondEphemeral(interaction, t('commands.filter.invalid', { name }));
        return;
    }

    await refreshPanel(interaction, player, state);
}

module.exports = { handle, customId: NowPlayingUI.FILTER_SELECT_ID };
