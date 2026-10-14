/**
 * /repeat — Chế độ lặp (off / track / queue).
 */

const { getState } = require('../services/player/PlayerState');

const REPEAT_EMOJIS = { off: '➡️', track: '🔂', queue: '🔁' };

const definitions = [
    {
        name: 'repeat',
        description: 'Đổi chế độ lặp (Off / Track / Queue)',
        options: [
            {
                name: 'mode',
                type: 3, // STRING
                description: 'Chế độ lặp mong muốn',
                required: false,
                choices: [
                    { name: '➡️ Tắt lặp', value: 'off' },
                    { name: '🔂 Lặp bài hiện tại', value: 'track' },
                    { name: '🔁 Lặp danh sách', value: 'queue' }
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
    const state = getState(interaction.guild.id);

    const modeArg = interaction.options.getString('mode');
    const newMode = modeArg || state.cycleRepeatMode();
    if (modeArg) state.setRepeatMode(modeArg);

    playerService.persistState(interaction.guild.id, state, player.volume);
    await playerService.refreshPanels(player);

    const emoji = REPEAT_EMOJIS[newMode] || '➡️';
    const label = t(`commands.repeat.mode${newMode.charAt(0).toUpperCase()}${newMode.slice(1)}`);

    await interaction.editReply(`${emoji} ${t('commands.repeat.changed', { mode: label })}`);
}

module.exports = { definitions, meta, execute };
