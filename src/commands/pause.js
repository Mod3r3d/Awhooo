/**
 * /pause — Tạm dừng nhạc.
 */

const definitions = [
    {
        name: 'pause',
        description: 'Tạm dừng phát nhạc'
    }
];

const meta = {
    requiresPlayer: true,
    requiresPlaying: true,
    sameVoice: true,
    defer: 'ephemeral'
};

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function execute(interaction, ctx) {
    ctx.playerService.pause(ctx.player);

    // Cập nhật ngay bảng Now Playing (ticker sẽ tự bỏ qua khi đang tạm dừng)
    await ctx.playerService.refreshPanels(ctx.player);

    await interaction.editReply(ctx.t('commands.pause.done'));
}

module.exports = { definitions, meta, execute };
