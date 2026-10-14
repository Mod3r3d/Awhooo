/**
 * reply.js — Tiện ích phản hồi interaction an toàn.
 *
 * Mọi phản hồi đều được bọc try/catch vì interaction có thể đã hết hạn (10062)
 * hoặc đã được phản hồi trước đó — những lỗi này không nên làm sập luồng xử lý.
 */

const { MessageFlags } = require('discord.js');
const { t } = require('../locales');

/** Cờ ephemeral của Discord */
const EPHEMERAL = MessageFlags.Ephemeral;

/**
 * Gửi một phản hồi ephemeral, tự chọn reply hay editReply tuỳ trạng thái interaction.
 * @param {import('discord.js').Interaction} interaction
 * @param {string|object} payload - Nội dung hoặc payload đầy đủ
 * @returns {Promise<unknown>}
 */
async function respondEphemeral(interaction, payload) {
    const body = typeof payload === 'string' ? { content: payload, embeds: [], components: [] } : payload;

    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(body);
        }
        return await interaction.reply({ ...body, flags: EPHEMERAL });
    } catch {
        return null;
    }
}

/**
 * Chuyển lỗi hệ thống thành thông báo thân thiện với người dùng.
 * @param {Error|unknown} err
 * @returns {string}
 */
function describeError(err) {
    const message = (err && err.message) || String(err);
    if (/no node/i.test(message)) return t('common.lavalinkDown');
    if (/quá thời gian|timeout/i.test(message)) return t('common.lavalinkDown');
    return t('common.loadError', { message });
}

/**
 * Gửi thông báo lỗi cho người dùng và trả về nội dung đã gửi.
 * @param {import('discord.js').Interaction} interaction
 * @param {Error|unknown} err
 * @returns {Promise<string>}
 */
async function respondError(interaction, err) {
    const content = describeError(err);
    await respondEphemeral(interaction, content);
    return content;
}

module.exports = { respondEphemeral, respondError, describeError, EPHEMERAL };
