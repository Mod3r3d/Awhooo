/**
 * /nowplaying & /np — Gửi bảng điều khiển bài hát đang phát vào kênh chat.
 *
 * Đây là lệnh DUY NHẤT gửi bảng Now Playing công khai cho mọi người thấy.
 * Mọi lệnh phát nhạc khác đều hiển thị bảng dạng ephemeral (chỉ người gọi thấy).
 */

const NowPlayingUI = require('../services/ui/NowPlayingUI');
const { getState } = require('../services/player/PlayerState');
const { respondEphemeral } = require('../utils/reply');

const definitions = [
    {
        name: 'nowplaying',
        description: 'Gửi công khai bảng điều khiển bài hát đang phát vào kênh chat'
    },
    {
        name: 'np',
        description: 'Gửi công khai bảng điều khiển bài hát đang phát vào kênh chat'
    }
];

const meta = {
    requiresPlayer: true,
    defer: false
};

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function execute(interaction, ctx) {
    const { playerService, player, t } = ctx;
    const currentTrack = player.queue.current;

    if (!currentTrack) {
        return respondEphemeral(interaction, t('commands.nowplaying.none'));
    }

    const state = getState(interaction.guild.id);
    const { embed, components } = NowPlayingUI.create(player, currentTrack, state);

    // CÔNG KHAI vào kênh chat — không truyền cờ EPHEMERAL
    await interaction.reply({ embeds: [embed], components });

    // Cho ticker tiến trình tiếp tục cập nhật bảng công khai này.
    // Dùng fetchReply() để tương thích cả discord.js 14.14 lẫn 14.16+.
    try {
        const message = await interaction.fetchReply();
        playerService.trackPublicPanel(player, message);
    } catch (err) {
        ctx.logger.warn('Không lấy được tin nhắn vừa gửi để theo dõi tiến trình:', err.message);
    }
}

module.exports = { definitions, meta, execute };
