/**
 * /shuffle — Xáo trộn hàng đợi.
 */

const definitions = [
    {
        name: 'shuffle',
        description: 'Xáo trộn ngẫu nhiên thứ tự các bài hát trong hàng đợi',
        options: [
            {
                name: 'mine',
                type: 5, // BOOLEAN
                description: 'Chỉ xáo trộn bài do bạn thêm (mặc định: toàn bộ)',
                required: false
            }
        ]
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
    const { player, queueService, t } = ctx;

    if (player.queue.length <= 1) {
        return interaction.editReply(t('commands.shuffle.needMore'));
    }

    const mineOnly = interaction.options.getBoolean('mine') || false;
    const count = queueService.shuffle(player, mineOnly ? interaction.user.id : null);

    await interaction.editReply(
        mineOnly ? t('commands.shuffle.doneMine', { count }) : t('commands.shuffle.done', { count })
    );
}

module.exports = { definitions, meta, execute };
