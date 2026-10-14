/**
 * NowPlayingUI — Tạo Embed "Now Playing" với thanh tiến trình & nút bấm tương tác.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const { formatDuration, createProgressBar, truncate } = require('../../utils/formatters');
const { t } = require('../../locales');
const FilterService = require('../filters/FilterService');

/** Màu sắc embed theo trạng thái */
const COLORS = {
    playing: 0x5865f2, // Discord Blurple
    paused: 0xfee75c, // Vàng
    stopped: 0xed4245 // Đỏ
};

/** Biểu tượng repeat mode */
const REPEAT_ICONS = {
    off: '➡️',
    track: '🔂',
    queue: '🔁'
};

/** Nhãn nút repeat theo chế độ */
const REPEAT_LABELS = {
    off: '🔁 Tắt',
    track: '🔂 Bài',
    queue: '🔁 DS'
};

/** ID của select menu chọn bộ lọc */
const FILTER_SELECT_ID = 'np_filter_select';

class NowPlayingUI {
    /**
     * Tạo embed Now Playing và các action row.
     * @param {object} player - Kazagumo player
     * @param {object} track - Track đang phát
     * @param {import('../player/PlayerState').PlayerState} state - PlayerState
     * @param {{ disabled?: boolean, withFilterSelect?: boolean }} [options]
     * @returns {{ embed: EmbedBuilder, components: ActionRowBuilder[] }}
     */
    static create(player, track, state, options = {}) {
        const { disabled = false, withFilterSelect = true } = options;

        if (!track) {
            return {
                embed: new EmbedBuilder().setColor(COLORS.stopped).setTitle(t('ui.nowPlaying.nothing')).setTimestamp(),
                components: []
            };
        }

        const isPaused = Boolean(player.paused);
        const position = player.position || 0;
        const duration = track.length || track.duration || 0;
        const isStream = Boolean(track.isStream);

        // --- Xây dựng Embed ---
        const embed = new EmbedBuilder()
            .setColor(isPaused ? COLORS.paused : COLORS.playing)
            .setAuthor({
                name: isPaused ? t('ui.nowPlaying.paused') : t('ui.nowPlaying.playing'),
                iconURL: 'https://cdn.discordapp.com/emojis/741605543046807626.gif'
            })
            .setTitle(truncate(track.title || t('ui.nowPlaying.unknown'), 95))
            .setURL(track.uri || null)
            .setTimestamp();

        if (track.thumbnail) embed.setThumbnail(track.thumbnail);

        if (track.author) {
            embed.addFields({ name: t('ui.nowPlaying.artist'), value: truncate(track.author, 60), inline: true });
        }

        const requester = track.requester;
        if (requester) {
            const name = requester.globalName || requester.username || t('ui.nowPlaying.unknown');
            embed.addFields({ name: t('ui.nowPlaying.requester'), value: name, inline: true });
        }

        // Trạng thái: repeat + volume + filter + autoplay
        const repeatIcon = REPEAT_ICONS[state.repeatMode] || '➡️';
        const repeatLabel =
            state.repeatMode === 'off'
                ? t('ui.nowPlaying.repeatOff')
                : state.repeatMode === 'track'
                  ? t('ui.nowPlaying.repeatTrack')
                  : t('ui.nowPlaying.repeatQueue');

        const filterLabel =
            state.filter && state.filter !== FilterService.default
                ? `${FilterService.getEmoji(state.filter)} ${FilterService.getLabel(state.filter)}`
                : t('ui.nowPlaying.filterOff');

        const statusParts = [
            `${repeatIcon} ${repeatLabel}`,
            `🔊 ${player.volume || 100}%`,
            `🎛️ ${filterLabel}`,
            state.autoplay ? t('ui.nowPlaying.autoplayOn') : t('ui.nowPlaying.autoplayOff')
        ];
        embed.addFields({ name: t('ui.nowPlaying.status'), value: statusParts.join(' │ '), inline: false });

        // Thanh tiến trình
        const progressStr = isStream ? t('ui.nowPlaying.live') : createProgressBar(position, duration);
        embed.addFields({ name: '\u200b', value: `\`\`\`${progressStr}\`\`\``, inline: false });

        // Bài kế tiếp
        if (player.queue.length > 0) {
            const nextTrack = player.queue[0];
            embed.setFooter({
                text: t('ui.nowPlaying.nextUp', {
                    title: truncate(nextTrack.title || t('ui.nowPlaying.unknown'), 45),
                    duration: formatDuration(nextTrack.length || nextTrack.duration || 0),
                    count: player.queue.length
                })
            });
        } else {
            embed.setFooter({ text: t('ui.nowPlaying.queueEmpty') });
        }

        // Avatar người yêu cầu
        if (requester && typeof requester.displayAvatarURL === 'function') {
            embed.setFooter({
                text: embed.data.footer?.text || '',
                iconURL: requester.displayAvatarURL({ size: 32 })
            });
        }

        // --- Hàng nút 1: điều khiển phát ---
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('np_previous')
                .setEmoji('⏮')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId('np_pause_resume')
                .setEmoji(isPaused ? '▶️' : '⏸️')
                .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId('np_skip')
                .setEmoji('⏭')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId('np_repeat')
                .setLabel(REPEAT_LABELS[state.repeatMode] || REPEAT_LABELS.off)
                .setStyle(state.repeatMode !== 'off' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId('np_shuffle')
                .setEmoji('🔀')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled)
        );

        // --- Hàng nút 2: âm lượng, hàng đợi, autoplay, dừng ---
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('np_vol_down')
                .setEmoji('🔉')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId('np_vol_up')
                .setEmoji('🔊')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId('np_queue')
                .setLabel('📜 Hàng đợi')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId('np_autoplay')
                .setEmoji('♾️')
                .setStyle(state.autoplay ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(disabled),

            new ButtonBuilder()
                .setCustomId('np_stop')
                .setLabel('🛑 Dừng')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled)
        );

        const components = [row1, row2];

        // --- Hàng 3: chọn bộ lọc âm thanh ---
        if (withFilterSelect) {
            const select = new StringSelectMenuBuilder()
                .setCustomId(FILTER_SELECT_ID)
                .setPlaceholder(`🎛️ ${FilterService.getLabel(state.filter)}`)
                .setDisabled(disabled)
                .addOptions(
                    FilterService.getNames()
                        .slice(0, 25)
                        .map((name) => ({
                            label: FilterService.getLabel(name),
                            value: name,
                            emoji: FilterService.getEmoji(name),
                            default: name === state.filter
                        }))
                );

            components.push(new ActionRowBuilder().addComponents(select));
        }

        return { embed, components };
    }

    /**
     * Embed hiển thị khi player đã dừng / hết hàng đợi (không còn nút bấm).
     * @param {'stopped'|'ended'} reason
     * @returns {EmbedBuilder}
     */
    static createStopped(reason = 'ended') {
        const title = reason === 'stopped' ? '🛑 Đã dừng phát nhạc' : '📭 Hàng đợi đã kết thúc';

        const description =
            reason === 'stopped'
                ? 'Bảng điều khiển đã được đóng. Dùng `/play` để bắt đầu lại.'
                : 'Không còn bài nào để phát. Dùng `/play` để thêm bài mới.';

        return new EmbedBuilder().setColor(COLORS.stopped).setTitle(title).setDescription(description).setTimestamp();
    }

    /** ID của select menu chọn bộ lọc (dùng cho router). */
    static get FILTER_SELECT_ID() {
        return FILTER_SELECT_ID;
    }
}

module.exports = NowPlayingUI;
