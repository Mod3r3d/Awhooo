/**
 * /history — Xem lịch sử các bài hát đã phát.
 */

const { EmbedBuilder } = require('discord.js');
const { getState } = require('../services/player/PlayerState');
const { formatDuration, truncate } = require('../utils/formatters');

/** Số bài tối đa hiển thị trong lịch sử */
const MAX_DISPLAY = 15;

const definitions = [
    {
        name: 'history',
        description: 'Xem lịch sử các bài hát đã phát trong máy chủ'
    }
];

const meta = {
    defer: 'ephemeral'
};

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function execute(interaction, ctx) {
    const state = getState(interaction.guild.id);
    const { t } = ctx;

    if (state.history.length === 0) {
        return interaction.editReply(t('commands.history.empty'));
    }

    const shown = Math.min(MAX_DISPLAY, state.history.length);
    const lines = [];

    for (let i = 0; i < shown; i++) {
        const track = state.history[i];
        const num = String(i + 1).padStart(2, '0');
        const dur = formatDuration(track.duration || 0);
        const title = truncate(track.title || 'Unknown', 45);
        const requester = track.requesterName || 'N/A';

        lines.push(`\`${num}.\` **${title}**\n　　\`${dur}\` • 👤 ${requester}`);
    }

    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(t('commands.history.title'))
        .setDescription(lines.join('\n'))
        .setFooter({ text: t('commands.history.footer', { shown, total: state.history.length }) })
        .setTimestamp();

    await interaction.editReply({ content: '', embeds: [embed], components: [] });
}

module.exports = { definitions, meta, execute };
