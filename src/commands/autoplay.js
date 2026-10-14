/**
 * /autoplay — Bật/tắt tự động phát bài hát liên quan khi hết hàng đợi.
 */

const { getState } = require('../services/player/PlayerState');

const definitions = [
    {
        name: 'autoplay',
        description: 'Bật/tắt tự động phát bài hát liên quan khi hết hàng đợi',
        options: [
            {
                name: 'mode',
                type: 3, // STRING
                description: 'Bật hay tắt (bỏ trống để xem trạng thái hiện tại)',
                required: false,
                choices: [
                    { name: '♾️ Bật', value: 'on' },
                    { name: '⏹️ Tắt', value: 'off' }
                ]
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
    const { playerService, player, t } = ctx;
    const mode = interaction.options.getString('mode');
    const state = getState(interaction.guild.id);

    if (!mode) {
        return interaction.editReply(
            state.autoplay ? t('commands.autoplay.currentOn') : t('commands.autoplay.currentOff')
        );
    }

    const enabled = mode === 'on';
    playerService.setAutoplay(player, enabled);
    await playerService.refreshPanels(player);

    await interaction.editReply(enabled ? t('commands.autoplay.enabled') : t('commands.autoplay.disabled'));
}

module.exports = { definitions, meta, execute };
