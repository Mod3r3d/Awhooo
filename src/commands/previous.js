/**
 * /previous — Phát lại bài hát gần nhất từ lịch sử.
 */

const definitions = [
    {
        name: 'previous',
        description: 'Phát lại bài hát vừa nghe gần nhất'
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

    // Đăng ký trước để bảng Now Playing hiện trên chính tin nhắn phản hồi này
    playerService.registerEphemeralContext(interaction, player);

    const result = await playerService.previous(player);

    if (!result.ok) {
        playerService.releaseEphemeralContext(interaction.guild.id);
        return interaction.editReply(t(result.error));
    }

    await playerService.renderEphemeralPanel(
        player,
        result.track,
        t('commands.previous.playing', { title: result.track.title || 'Unknown' })
    );
}

module.exports = { definitions, meta, execute };
