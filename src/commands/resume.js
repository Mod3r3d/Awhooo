/**
 * /resume — Tiếp tục phát nhạc.
 */

const definitions = [
    {
        name: 'resume',
        description: 'Tiếp tục phát bài hát'
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
    ctx.playerService.resume(ctx.player);
    await ctx.playerService.refreshPanels(ctx.player);
    await interaction.editReply(ctx.t('commands.resume.done'));
}

module.exports = { definitions, meta, execute };
