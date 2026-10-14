/**
 * QueueUI — Tạo Embed hiển thị danh sách chờ với phân trang thông minh.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatDuration, truncate, totalDuration } = require('../../utils/formatters');
const { t } = require('../../locales');

/** Số bài mỗi trang */
const TRACKS_PER_PAGE = 10;

class QueueUI {
    /**
     * Tạo embed danh sách chờ phân trang.
     * @param {object} player - Kazagumo player
     * @param {number} [page=1] - Số trang hiện tại (1-based)
     * @returns {{ embed: EmbedBuilder, components: ActionRowBuilder[] }}
     */
    static create(player, page = 1) {
        const queue = player.queue;
        const current = player.queue.current;

        if (!current && queue.length === 0) {
            return {
                embed: new EmbedBuilder()
                    .setColor(0x95a5a6)
                    .setTitle(t('ui.queue.emptyTitle'))
                    .setDescription(t('ui.queue.emptyHint'))
                    .setTimestamp(),
                components: []
            };
        }

        const totalTracks = queue.length;
        const totalPages = Math.max(1, Math.ceil(totalTracks / TRACKS_PER_PAGE));
        const safePage = Math.max(1, Math.min(page, totalPages));

        const start = (safePage - 1) * TRACKS_PER_PAGE;
        const end = Math.min(start + TRACKS_PER_PAGE, totalTracks);

        // --- Xây dựng Embed ---
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(t('ui.queue.title')).setTimestamp();

        // Bài đang phát
        if (current) {
            const curDur = formatDuration(current.length || current.duration || 0);
            const curRequester = current.requester
                ? current.requester.globalName || current.requester.username
                : t('ui.queue.notAvailable');
            embed.addFields({
                name: t('ui.queue.nowPlaying'),
                value:
                    `**${truncate(current.title, 55)}** — ${current.author || t('ui.queue.notAvailable')}\n` +
                    `\`${curDur}\` • 👤 ${curRequester}`,
                inline: false
            });
        }

        // Danh sách hàng đợi
        if (totalTracks > 0) {
            const lines = [];
            for (let i = start; i < end; i++) {
                const track = queue[i];
                const num = String(i + 1).padStart(2, '0');
                const dur = formatDuration(track.length || track.duration || 0);
                const title = truncate(track.title || 'Unknown', 45);
                const requester = track.requester
                    ? track.requester.globalName || track.requester.username
                    : t('ui.queue.notAvailable');

                lines.push(`\`${num}.\` **${title}**\n　　\`${dur}\` • 👤 ${requester}`);
            }
            embed.addFields({
                name: t('ui.queue.listName', { count: totalTracks }),
                value: lines.join('\n') || '—',
                inline: false
            });
        }

        // Tổng thời lượng
        const queueDuration = totalDuration(Array.from(queue));
        const currentRemaining = current
            ? Math.max(0, (current.length || current.duration || 0) - (player.position || 0))
            : 0;

        embed.setFooter({
            text: t('ui.queue.footer', {
                page: safePage,
                totalPages,
                duration: formatDuration(queueDuration + currentRemaining),
                count: totalTracks
            })
        });

        // --- Nút phân trang ---
        const components = [];

        if (totalPages > 1) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('queue_first')
                    .setEmoji('⏮')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage <= 1),

                new ButtonBuilder()
                    .setCustomId(`queue_prev_${safePage}`)
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage <= 1),

                new ButtonBuilder()
                    .setCustomId('queue_page_indicator')
                    .setLabel(`${safePage} / ${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),

                new ButtonBuilder()
                    .setCustomId(`queue_next_${safePage}`)
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage >= totalPages),

                new ButtonBuilder()
                    .setCustomId(`queue_last_${totalPages}`)
                    .setEmoji('⏭')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage >= totalPages)
            );
            components.push(row);
        }

        return { embed, components };
    }

    /**
     * Phân tích customId của nút phân trang để lấy số trang đích.
     * @param {string} customId - Ví dụ: "queue_next_3", "queue_prev_5", "queue_first", "queue_last_10"
     * @param {number} [currentPage=1] - Trang hiện tại
     * @returns {number} Trang đích
     */
    static parsePageFromButton(customId, currentPage = 1) {
        if (customId === 'queue_first') return 1;
        if (customId.startsWith('queue_last_')) {
            return parseInt(customId.split('_')[2], 10) || 1;
        }
        if (customId.startsWith('queue_next_')) {
            const fromPage = parseInt(customId.split('_')[2], 10) || currentPage;
            return fromPage + 1;
        }
        if (customId.startsWith('queue_prev_')) {
            const fromPage = parseInt(customId.split('_')[2], 10) || currentPage;
            return Math.max(1, fromPage - 1);
        }
        return currentPage;
    }

    /** Số bài mỗi trang. */
    static get TRACKS_PER_PAGE() {
        return TRACKS_PER_PAGE;
    }
}

module.exports = QueueUI;
