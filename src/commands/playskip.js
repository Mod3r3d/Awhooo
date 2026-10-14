/**
 * /playskip — Bỏ qua bài đang phát và phát ngay bài mới.
 */

const { COMMAND_COOLDOWN_MS } = require('../config/constants');

const definitions = [
    {
        name: 'playskip',
        description: 'Bỏ qua bài hiện tại và phát ngay bài mới',
        options: [
            {
                name: 'query',
                type: 3,
                description: 'Tên bài hát hoặc URL',
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

    const player = await playerService.getOrCreatePlayer({
        guildId,
        textId: interaction.channelId,
        voiceId: voiceChannel.id
    });

    playerService.registerEphemeralContext(interaction, player);

    const result = await playerService.search(query, interaction.user);
    if (!result.tracks.length) {
        playerService.releaseEphemeralContext(guildId);
        return interaction.editReply(t('commands.playskip.noResult'));
    }

    const track = result.tracks[0];
    playerService.playSkip(player, track);

    await playerService.renderEphemeralPanel(player, track, t('commands.playskip.playing', { title: track.title }));
}

module.exports = { definitions, meta, execute };
