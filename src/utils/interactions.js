/**
 * interactions.js — Tiện ích nhận diện tương tác.
 */

const { MessageFlags } = require('discord.js');

/**
 * Kiểm tra một tin nhắn có phải dạng ephemeral (chỉ người gọi thấy) hay không.
 * Hỗ trợ cả trường hợp `message.flags` là số (bản discord.js cũ) lẫn BitField.
 * @param {import('discord.js').Message} message
 * @returns {boolean}
 */
function isEphemeralMessage(message) {
    if (!message || message.flags === undefined || message.flags === null) return false;

    const flags = message.flags;
    if (typeof flags === 'number') return (flags & MessageFlags.Ephemeral) === MessageFlags.Ephemeral;
    return typeof flags.has === 'function' && flags.has(MessageFlags.Ephemeral);
}

module.exports = { isEphemeralMessage };
