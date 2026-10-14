/**
 * /playtop — Chèn bài hát lên đầu hàng đợi (phát kế tiếp).
 */

const { COMMAND_COOLDOWN_MS } = require('../config/constants');
const { enqueueErrorText } = require('./helpers');

const definitions = [
    {
        name: 'playtop',
        description: 'Thêm bài hát lên đầu hàng đợi (phát kế tiếp)',
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
        return interaction.editReply(t('commands.playtop.noResult'));
    }

    const track = result.tracks[0];
    const enqueued = await playerService.enqueue(player, [track], {
        requesterId: interaction.user.id,
        top: true
    });

    if (!enqueued.ok) {
        playerService.releaseEphemeralContext(guildId);
        return interaction.editReply(enqueueErrorText(enqueued, t));
    }

    await playerService.renderEphemeralPanel(
        player,
        player.queue.current || track,
        t('commands.playtop.added', { title: track.title })
    );
}

module.exports = { definitions, meta, execute };
