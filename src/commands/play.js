/**
 * /play — Phát nhạc từ URL hoặc từ khóa tìm kiếm.
 */

const { COMMAND_COOLDOWN_MS } = require('../config/constants');
const { enqueueErrorText, trimNote, combineNotes } = require('./helpers');

const definitions = [
    {
        name: 'play',
        description: 'Phát nhạc từ YouTube, Spotify hoặc từ khóa',
        options: [
            {
                name: 'query',
                type: 3, // STRING
                description: 'Tên bài hát hoặc URL (YouTube, Spotify, SoundCloud...)',
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
    const { playerService, voiceChannel, t } = ctx;
    const query = interaction.options.getString('query');
    const guildId = interaction.guild.id;

    ctx.logger.info(`[play] Bắt đầu tìm kiếm query="${query}" cho user=${interaction.user.tag}`);

    // Phản hồi ngay để người dùng biết bot đang tìm bài
    await interaction.editReply('🔍 Đang tìm kiếm bài hát...');

    // 1. Tìm kiếm bài hát trước
    const result = await playerService.search(query, interaction.user);

    if (!result.tracks.length) {
        return interaction.editReply(t('commands.play.noResult'));
    }

    ctx.logger.info(
        `[play] Tìm thấy ${result.tracks.length} bài (type=${result.type}), đang kết nối voice channel ${voiceChannel.id}...`
    );

    // 2. Có bài hát hợp lệ mới kết nối vào voice channel
    await interaction.editReply(`🟢 Đã tìm thấy **${result.tracks.length}** bài. Đang kết nối vào kênh thoại...`);

    const player = await playerService.getOrCreatePlayer({
        guildId,
        textId: interaction.channelId,
        voiceId: voiceChannel.id
    });

    playerService.registerEphemeralContext(interaction, player);

    if (result.type === 'PLAYLIST') {
        const enqueued = await playerService.enqueue(player, result.tracks, { requesterId: interaction.user.id });

        if (!enqueued.ok) {
            playerService.releaseEphemeralContext(guildId);
            return interaction.editReply(enqueueErrorText(enqueued, t));
        }

        const note = combineNotes(
            t('commands.play.playlistAdded', {
                name: result.playlistName || 'Playlist',
                count: enqueued.added
            }),
            trimNote(enqueued, result.tracks.length, t)
        );

        await playerService.renderEphemeralPanel(player, player.queue.current || result.tracks[0], note);
        return;
    }

    const track = result.tracks[0];
    const enqueued = await playerService.enqueue(player, [track], { requesterId: interaction.user.id });

    if (!enqueued.ok) {
        playerService.releaseEphemeralContext(guildId);
        return interaction.editReply(enqueueErrorText(enqueued, t));
    }

    await playerService.renderEphemeralPanel(
        player,
        player.queue.current || track,
        t('commands.play.added', { title: track.title })
    );
}

module.exports = { definitions, meta, execute };
