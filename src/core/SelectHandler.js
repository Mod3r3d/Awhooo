/**
 * SelectHandler — Định tuyến menu chọn (StringSelectMenu) theo customId chính xác.
 */

const { respondError } = require('../utils/reply');

class SelectHandler {
    /**
     * @param {object} ctx - Ngữ cảnh bot
     */
    constructor(ctx) {
        this.ctx = ctx;
        /** @type {Map<string, Function>} */
        this.registry = new Map();
    }

    /**
     * Đăng ký một menu chọn.
     * @param {string} customId
     * @param {(interaction: import('discord.js').StringSelectMenuInteraction, ctx: object) => Promise<void>} handler
     */
    register(customId, handler) {
        this.registry.set(customId, handler);
    }

    /**
     * Xử lý một tương tác menu chọn.
     * @param {import('discord.js').StringSelectMenuInteraction} interaction
     */
    async dispatch(interaction) {
        const handler = this.registry.get(interaction.customId);
        if (!handler) return;

        try {
            await handler(interaction, this.ctx);
        } catch (err) {
            this.ctx.logger.error(`Lỗi khi xử lý menu "${interaction.customId}":`, err);
            await respondError(interaction, err);
        }
    }
}

module.exports = SelectHandler;
