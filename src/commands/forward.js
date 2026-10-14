/**
 * /forward — Tua tới trước một số giây.
 */

const { formatDuration } = require('../utils/formatters');

/** Số giây tua mặc định */
const DEFAULT_SECONDS = 10;

const definitions = [
    {
        name: 'forward',
        description: 'Tua tới trước một số giây',
        options: [
            {
                name: 'seconds',
                type: 4, // INTEGER
                description: `Số giây muốn tua tới (mặc định ${DEFAULT_SECONDS})`,
                required: false,
                min_value: 1,
                max_value: 600
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
    const seconds = interaction.options.getInteger('seconds') || DEFAULT_SECONDS;

    const target = Math.max(0, (player.position || 0) + seconds * 1000);
    const result = await playerService.seek(player, target);

    if (!result.ok) {
        return interaction.editReply(t(result.error, result.vars));
    }

    await playerService.refreshPanels(player);
    await interaction.editReply(t('commands.forward.done', { position: formatDuration(target) }));
}

module.exports = { definitions, meta, execute };
