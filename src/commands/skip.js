/**
 * /skip & /skipto — Bỏ qua bài hiện tại hoặc nhảy đến vị trí trong queue.
 */

const definitions = [
    {
        name: 'skip',
        description: 'Bỏ qua bài hiện tại'
    },
    {
        name: 'skipto',
        description: 'Nhảy đến vị trí bài hát trong hàng đợi',
        options: [
            {
                name: 'index',
                type: 4, // INTEGER
                description: 'Nhập số thứ tự bài hát (VD: 5)',
                required: true,
                min_value: 1
            }
        ]
    }
];

const meta = {
    requiresPlayer: true,
    requiresPlaying: true,
    sameVoice: true,
    defer: 'ephemeral'
};

/**
 * /skip
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function skip(interaction, ctx) {
    ctx.playerService.skip(ctx.player);
    await interaction.editReply(ctx.t('commands.skip.skipped'));
}

/**
 * /skipto
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function skipto(interaction, ctx) {
    const position = interaction.options.getInteger('index');
    const result = ctx.playerService.skipTo(ctx.player, position);

    if (!result.ok) {
        return interaction.editReply(ctx.t(result.error, result.vars));
    }

    await interaction.editReply(ctx.t('commands.skipto.done', { position }));
}

module.exports = { definitions, meta, handlers: { skip, skipto } };
