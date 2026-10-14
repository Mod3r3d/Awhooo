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
    requiresVoice: true,
    defer: 'ephemeral'
};

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function execute(interaction, ctx) {
    const player = ctx.player || ctx.manager.players.get(interaction.guild.id);
    const botChannelId =
        ctx.client.guilds?.cache?.get(interaction.guild.id)?.members?.me?.voice?.channelId || player?.voiceId;

    if (botChannelId && ctx.voiceChannel?.id !== botChannelId) {
        return interaction.editReply(ctx.t('common.needSameVoice'));
    }

    if (player) {
        await ctx.playerService.stop(player);
    } else {
        await ctx.playerService.forceCleanupVoice(interaction.guild.id);
    }

    await interaction.editReply(ctx.t('commands.stop.done'));
}

module.exports = { definitions, meta, execute };
