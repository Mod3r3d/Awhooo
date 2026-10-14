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
    requiresPlayer: true,
    sameVoice: true,
    defer: 'ephemeral'
};

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function execute(interaction, ctx) {
    // stop() sẽ tự chuyển các bảng Now Playing sang trạng thái "đã dừng"
    await ctx.playerService.stop(ctx.player);
    await interaction.editReply(ctx.t('commands.stop.done'));
}

module.exports = { definitions, meta, execute };
