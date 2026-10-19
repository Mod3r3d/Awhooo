/**
 * /stop — Dừng nhạc, xóa hàng đợi, ngắt kết nối.
 */

const definitions = [
    {
        name: 'stop',
        description: 'Dừng nhạc và thoát khỏi kênh thoại'
    }
];

const meta = {
    requiresVoice: false,
    defer: 'ephemeral'
};

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function execute(interaction, ctx) {
    const player = ctx.player || ctx.manager.players.get(interaction.guild.id);

    // FIX: Cho phép /stop hoạt động trong mọi tình huống (Emergency Stop Override)
    // Không yêu cầu người dùng phải ở cùng voice channel với bot

    if (player) {
        await ctx.playerService.stop(player);
    } else {
        await ctx.playerService.forceCleanupVoice(interaction.guild.id);
    }

    await interaction.editReply(ctx.t('commands.stop.done'));
}

module.exports = { definitions, meta, execute };
