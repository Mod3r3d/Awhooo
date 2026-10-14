/**
 * /volume — Điều chỉnh âm lượng phát nhạc (1 - 200%).
 */

const { getState } = require('../services/player/PlayerState');

const definitions = [
    {
        name: 'volume',
        description: 'Xem hoặc điều chỉnh âm lượng phát nhạc (1 - 200%)',
        options: [
            {
                name: 'level',
                type: 4, // INTEGER
                description: 'Mức âm lượng (từ 1 đến 200%)',
                required: false,
                min_value: 1,
                max_value: 200
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
    const level = interaction.options.getInteger('level');

    if (level === null || level === undefined) {
        return interaction.editReply(t('commands.volume.current', { level: player.volume || 100 }));
    }

    const clamped = Math.max(1, Math.min(200, level));
    await player.setVolume(clamped);

    // Lưu cài đặt và cập nhật bảng Now Playing đang mở
    const state = getState(interaction.guild.id);
    playerService.persistState(interaction.guild.id, state, clamped);
    await playerService.refreshPanels(player);

    await interaction.editReply(t('commands.volume.changed', { level: clamped }));
}

module.exports = { definitions, meta, execute };
