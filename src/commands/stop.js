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

    if (player) {
        if (player.voiceId && ctx.voiceChannel?.id !== player.voiceId) {
            return interaction.editReply(ctx.t('common.needSameVoice'));
        }
        await ctx.playerService.stop(player);
    } else {
        // Giải phóng và ngắt kết nối voice ngay cả khi player không còn trong bộ nhớ
        try { await ctx.manager.destroyPlayer(interaction.guild.id); } catch (_) {}
        try { await ctx.manager.shoukaku.leaveVoiceChannel(interaction.guild.id); } catch (_) {}
        try {
            const guild = ctx.client.guilds.cache.get(interaction.guild.id);
            if (guild?.members?.me?.voice?.channelId) {
                await guild.members.me.voice.disconnect();
            }
        } catch (_) {}
    }

    await interaction.editReply(ctx.t('commands.stop.done'));
}

module.exports = { definitions, meta, execute };
