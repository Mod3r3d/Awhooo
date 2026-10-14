/**
 * /seek — Nhảy tới một mốc thời gian trong bài hát.
 */

const { parseTime, formatDuration } = require('../utils/formatters');

const definitions = [
    {
        name: 'seek',
        description: 'Nhảy tới một mốc thời gian trong bài hát',
        options: [
            {
                name: 'time',
                type: 3, // STRING
                description: 'Mốc thời gian, ví dụ 1:30 hoặc 90 (giây)',
                required: true
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
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function execute(interaction, ctx) {
    const { playerService, player, t } = ctx;
    const raw = interaction.options.getString('time');
    const positionMs = parseTime(raw);

    if (positionMs === null) {
        return interaction.editReply(t('commands.seek.invalidTime'));
    }

    const result = await playerService.seek(player, positionMs);

    if (!result.ok) {
        return interaction.editReply(t(result.error, result.vars));
    }

    await playerService.refreshPanels(player);
    await interaction.editReply(t('commands.seek.done', { position: formatDuration(positionMs) }));
}

module.exports = { definitions, meta, execute };
