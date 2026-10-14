/**
 * /filter — Bật/tắt các bộ lọc âm thanh của Lavalink.
 */

const { getState } = require('../services/player/PlayerState');
const FilterService = require('../services/filters/FilterService');

/** Danh sách choice gửi lên Discord (tối đa 25) */
const choices = FilterService.getNames()
    .slice(0, 25)
    .map((name) => ({
        name: `${FilterService.getEmoji(name)} ${FilterService.getLabel(name)}`.slice(0, 100),
        value: name
    }));

const definitions = [
    {
        name: 'filter',
        description: 'Bật/tắt bộ lọc âm thanh (bassboost, nightcore, 8D...)',
        options: [
            {
                name: 'name',
                type: 3, // STRING
                description: 'Tên bộ lọc muốn áp dụng (bỏ trống để xem bộ lọc hiện tại)',
                required: false,
                choices
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
    const name = interaction.options.getString('name');

    // Không truyền tên → hiển thị bộ lọc hiện tại kèm danh sách khả dụng
    if (!name) {
        const state = getState(interaction.guild.id);
        const current = state.filter || FilterService.default;
        const list = FilterService.getNames()
            .map((item) => `${FilterService.getEmoji(item)} \`${item}\``)
            .join(' · ');

        return interaction.editReply(
            `${t('commands.filter.current', { name: FilterService.getLabel(current) })}\n` +
                t('commands.filter.list', { list })
        );
    }

    const result = await playerService.setFilter(player, name);

    if (!result.ok) {
        return interaction.editReply(t('commands.filter.invalid', { name }));
    }

    await playerService.refreshPanels(player);
    await interaction.editReply(t('commands.filter.applied', { name: result.label }));
}

module.exports = { definitions, meta, execute };
