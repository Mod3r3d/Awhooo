/**
 * /search — Tìm kiếm và chọn bài hát từ danh sách kết quả.
 *
 * Thay vì tự động lấy kết quả đầu tiên như /play, lệnh này hiển thị một menu
 * để người dùng chọn đúng bài mình muốn.
 */

const { COMMAND_COOLDOWN_MS, SEARCH_MENU_RESULTS } = require('../config/constants');
const SearchUI = require('../services/ui/SearchUI');

const definitions = [
    {
        name: 'search',
        description: 'Tìm kiếm và chọn bài hát từ danh sách kết quả',
        options: [
            {
                name: 'query',
                type: 3, // STRING
                description: 'Từ khóa tìm kiếm',
                required: true
            }
        ]
    }
];

const meta = {
    requiresVoice: true,
    defer: 'ephemeral',
    cooldown: COMMAND_COOLDOWN_MS
};

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx - Ngữ cảnh bot
 */
async function execute(interaction, ctx) {
    const { playerService, t } = ctx;
    const query = interaction.options.getString('query');
    const guildId = interaction.guild.id;

    const result = await playerService.search(query, interaction.user);

    if (!result.tracks.length) {
        return interaction.editReply(t('commands.search.noResult', { query }));
    }

    // Lưu kết quả để menu chọn bài tham chiếu tới
    SearchUI.storeResults(guildId, interaction.user.id, result.tracks);

    const { embed, components } = SearchUI.create(query, result.tracks, SEARCH_MENU_RESULTS);

    await interaction.editReply({ content: '', embeds: [embed], components });
}

module.exports = { definitions, meta, execute };
