/**
 * /playtop — Chèn bài hát lên đầu hàng đợi (phát kế tiếp).
 */

const { checkVoiceChannel } = require('../utils/permissions');

const definition = {
    name: 'playtop',
    description: 'Thêm bài hát lên đầu hàng đợi (phát kế tiếp)',
    options: [{
        name: 'query',
        type: 3,
        description: 'Tên bài hát hoặc URL',
        required: true
    }]
};

async function execute(interaction, playerService) {
    const query = interaction.options.getString('query');

    const voiceCheck = checkVoiceChannel(interaction.member);
    if (!voiceCheck.ok) {
        return interaction.reply({ content: voiceCheck.error, ephemeral: true });
    }

    await interaction.deferReply();

    try {
        const player = await playerService.getOrCreatePlayer({
            guildId: interaction.guild.id,
            textId: interaction.channel.id,
            voiceId: voiceCheck.channel.id
        });

        const result = await playerService.search(query, interaction.user);
        if (!result || !result.tracks.length) {
            return interaction.editReply('❌ Không tìm thấy bài hát!');
        }

        const track = result.tracks[0];
        playerService.enqueueTop(player, track);
        await interaction.editReply(`📌 Đã chèn lên đầu hàng đợi: **${track.title}**`);
    } catch (err) {
        console.error('[playtop] Error:', err);
        const errMsg = err?.message || String(err);
        const userMsg = errMsg.includes('No node')
            ? '❌ Máy chủ phát nhạc (Lavalink) hiện đang kết nối lại. Vui lòng thử lại sau vài giây!'
            : `❌ Lỗi khi tải nhạc: ${errMsg}`;
        await interaction.editReply(userMsg);
    }
}

module.exports = { definition, execute };
