/**
 * /stop — Dừng nhạc, xóa hàng đợi, ngắt kết nối.
 */

const { canStop } = require('../utils/permissions');

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
    const djRoleId = ctx.storage?.getGuild?.(interaction.guild.id)?.djRoleId;

    const perm = canStop(interaction.member, player, djRoleId);
    if (!perm.ok) {
        return interaction.editReply(ctx.t(perm.error));
    }

    if (player) {
        await ctx.playerService.stop(player);
    } else {
        await ctx.playerService.forceCleanupVoice(interaction.guild.id);
    }

    await interaction.editReply(ctx.t('commands.stop.done'));
}

module.exports = { definitions, meta, execute };
