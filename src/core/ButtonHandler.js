/**
 * ButtonHandler — Định tuyến nút bấm theo tiền tố customId.
 *
 * Mỗi nhóm nút đăng ký một tiền tố (ví dụ `np_`, `queue_`) cùng hàm xử lý.
 * Nhờ vậy index.js không còn phải chứa một khối `switch` khổng lồ.
 */

const { respondError } = require('../utils/reply');

class ButtonHandler {
    /**
     * @param {object} ctx - Ngữ cảnh bot
     */
    constructor(ctx) {
        this.ctx = ctx;
        /** @type {{ prefix: string, handler: Function }[]} */
        this.routes = [];
    }

    /**
     * Đăng ký một nhóm nút theo tiền tố.
     * @param {string} prefix - Tiền tố customId
     * @param {(interaction: import('discord.js').ButtonInteraction, ctx: object, customId: string) => Promise<void>} handler
     */
    register(prefix, handler) {
        this.routes.push({ prefix, handler });
    }

    /**
     * Xử lý một tương tác nút bấm.
     * @param {import('discord.js').ButtonInteraction} interaction
     */
    async dispatch(interaction) {
        const customId = interaction.customId;
        const route = this.routes.find((r) => customId.startsWith(r.prefix));
        if (!route) return;

        try {
            await route.handler(interaction, this.ctx, customId);
        } catch (err) {
            this.ctx.logger.error(`Lỗi khi xử lý nút "${customId}":`, err);
            await respondError(interaction, err);
        }
    }
}

module.exports = ButtonHandler;
