/**
 * SearchUI — Menu chọn bài hát từ kết quả tìm kiếm (StringSelectMenu).
 *
 * Kết quả tìm kiếm được lưu tạm trong bộ nhớ theo cặp (guild, người dùng) với
 * thời gian sống ngắn, tránh phải nhồi dữ liệu track vào customId (giới hạn 100 ký tự).
 */

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const { formatDuration, truncate } = require('../../utils/formatters');
const { t } = require('../../locales');

/** ID của select menu chọn bài hát */
const SELECT_ID = 'search_select';

/** Thời gian sống của một phiên kết quả tìm kiếm (ms) */
const SESSION_TTL_MS = 5 * 60 * 1000;

/** Số kết quả tối đa Discord cho phép trong một select menu */
const MAX_OPTIONS = 25;

/** @type {Map<string, { tracks: object[], expiresAt: number }>} */
const sessions = new Map();

/**
 * Tạo khoá phiên tìm kiếm.
 * @param {string} guildId
 * @param {string} userId
 * @returns {string}
 */
function sessionKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

class SearchUI {
    /**
     * Lưu kết quả tìm kiếm của một người dùng để select menu tham chiếu tới.
     * @param {string} guildId
     * @param {string} userId
     * @param {object[]} tracks
     */
    static storeResults(guildId, userId, tracks) {
        sessions.set(sessionKey(guildId, userId), {
            tracks,
            expiresAt: Date.now() + SESSION_TTL_MS
        });
    }

    /**
     * Lấy kết quả tìm kiếm đã lưu của một người dùng.
     * @param {string} guildId
     * @param {string} userId
     * @returns {object[]|null}
     */
    static getResults(guildId, userId) {
        const key = sessionKey(guildId, userId);
        const session = sessions.get(key);
        if (!session) return null;

        if (session.expiresAt <= Date.now()) {
            sessions.delete(key);
            return null;
        }
        return session.tracks;
    }

    /**
     * Xoá phiên tìm kiếm của một người dùng.
     * @param {string} guildId
     * @param {string} userId
     */
    static clearResults(guildId, userId) {
        sessions.delete(sessionKey(guildId, userId));
    }

    /**
     * Dọn các phiên đã hết hạn.
     * @returns {number} Số phiên đã xoá
     */
    static prune() {
        const now = Date.now();
        let removed = 0;
        for (const [key, session] of sessions) {
            if (session.expiresAt <= now) {
                sessions.delete(key);
                removed++;
            }
        }
        return removed;
    }

    /**
     * Tạo embed + select menu cho kết quả tìm kiếm.
     * @param {string} query - Từ khoá người dùng nhập
     * @param {object[]} tracks - Danh sách track
     * @param {number} [limit=10] - Số kết quả hiển thị
     * @returns {{ embed: EmbedBuilder, components: ActionRowBuilder[] }}
     */
    static create(query, tracks, limit = 10) {
        const shown = tracks.slice(0, Math.min(limit, MAX_OPTIONS));

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🔎 ${truncate(query, 80)}`)
            .setDescription(t('commands.search.prompt', { query: truncate(query, 80) }))
            .setTimestamp();

        const lines = shown.map((track, index) => {
            const dur = formatDuration(track.length || track.duration || 0);
            const author = truncate(track.author || 'N/A', 30);
            return `\`${String(index + 1).padStart(2, '0')}.\` **${truncate(track.title || 'Unknown', 55)}** — ${author} \`${dur}\``;
        });

        embed.addFields({ name: '\u200b', value: lines.join('\n') || '—' });

        const select = new StringSelectMenuBuilder()
            .setCustomId(SELECT_ID)
            .setPlaceholder(t('commands.search.placeholder'))
            .addOptions(
                shown.map((track, index) => ({
                    label: truncate(track.title || 'Unknown', 95),
                    description: truncate(
                        `${track.author || 'N/A'} • ${formatDuration(track.length || track.duration || 0)}`,
                        95
                    ),
                    value: String(index)
                }))
            );

        return {
            embed,
            components: [new ActionRowBuilder().addComponents(select)]
        };
    }

    /** ID của select menu (dùng cho router). */
    static get SELECT_ID() {
        return SELECT_ID;
    }
}

module.exports = SearchUI;
