/**
 * searchSelect — Xử lý menu chọn bài hát của lệnh /search.
 */

const { t } = require('../locales');
const SearchUI = require('../services/ui/SearchUI');
const { respondEphemeral } = require('../utils/reply');

/**
 * Xử lý khi người dùng chọn một bài trong menu /search.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {object} ctx - Ngữ cảnh bot
 */
async function handle(interaction, ctx) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const tracks = SearchUI.getResults(guildId, userId);
    if (!tracks) {
        await interaction.deferUpdate();
        await interaction
            .editReply({
                content: t('commands.search.expired'),
                embeds: [],
                components: []
            })
            .catch(() => {});
        return;
    }

    const index = Number.parseInt(interaction.values[0], 10);
    const track = tracks[index];
    if (!track) {
        return respondEphemeral(interaction, t('commands.search.expired'));
    }

    const memberVoice = interaction.member?.voice?.channel;
    if (!memberVoice) {
        return respondEphemeral(interaction, t('common.needVoice'));
    }

    const existing = ctx.manager.players.get(guildId);
    if (existing && existing.voiceId && existing.voiceId !== memberVoice.id) {
        return respondEphemeral(interaction, t('common.needSameVoice'));
    }

    await interaction.deferUpdate();

    try {
        const player = await ctx.playerService.getOrCreatePlayer({
            guildId,
            textId: interaction.channelId,
            voiceId: memberVoice.id
        });

        // Biến chính tin nhắn chứa menu thành bảng Now Playing dạng ephemeral
        ctx.playerService.registerEphemeralContext(interaction, player);

        const result = await ctx.playerService.enqueue(player, track, { requesterId: userId });

        if (!result.ok) {
            const key = result.error === 'userQueueFull' ? 'common.userQueueFull' : 'common.queueFull';
            const vars = result.vars || { max: 0 };
            await interaction.editReply({ content: t(key, vars), embeds: [], components: [] }).catch(() => {});
            return;
        }

        SearchUI.clearResults(guildId, userId);

        await ctx.playerService.renderEphemeralPanel(
            player,
            player.queue.current || track,
            t('commands.search.added', { title: track.title })
        );
    } catch (err) {
        ctx.logger.error('Lỗi khi phát bài từ menu /search:', err);
        await respondEphemeral(interaction, t('common.loadError', { message: err.message }));
    }
}

module.exports = { handle, customId: SearchUI.SELECT_ID };
