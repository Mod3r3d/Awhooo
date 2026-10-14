/**
 * queueButtons — Xử lý nút phân trang của bảng hàng đợi (tiền tố `queue_`).
 */

const QueueUI = require('../services/ui/QueueUI');
const { t } = require('../locales');
const { respondEphemeral } = require('../utils/reply');

/** customId của nút chỉ hiển thị số trang (không có hành động) */
const PAGE_INDICATOR = 'queue_page_indicator';

/**
 * Xử lý nút phân trang hàng đợi.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {object} ctx - Ngữ cảnh bot
 * @param {string} customId
 */
async function handle(interaction, ctx, customId) {
    if (customId === PAGE_INDICATOR) return;

    const player = ctx.manager.players.get(interaction.guild.id);
    if (!player) {
        return respondEphemeral(interaction, t('common.noPlayer'));
    }

    await interaction.deferUpdate();

    const targetPage = QueueUI.parsePageFromButton(customId);
    const { embed, components } = QueueUI.create(player, targetPage);
    await interaction.editReply({ embeds: [embed], components }).catch(() => {});
}

module.exports = { handle, prefix: 'queue_' };
