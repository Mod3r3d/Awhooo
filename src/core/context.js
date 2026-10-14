/**
 * context.js — Đối tượng ngữ cảnh dùng chung, được truyền vào mọi command/button.
 *
 * Nhờ có ctx, các command không cần `require` trực tiếp service nữa — giúp
 * dễ kiểm thử (có thể truyền service giả) và tránh phụ thuộc vòng.
 */

const { t } = require('../locales');
const { createLogger } = require('../services/logger');
const cooldown = require('../services/cooldown/CooldownService');
const queueService = require('../services/queue/QueueService');

/**
 * Tạo đối tượng ngữ cảnh.
 * @param {{
 *   client: import('discord.js').Client,
 *   manager: import('kazagumo').Kazagumo,
 *   playerService: object,
 *   storage?: object,
 *   voicePresence?: object,
 *   logger?: object
 * }} deps
 * @returns {object}
 */
function createContext(deps) {
    return {
        client: deps.client,
        manager: deps.manager,
        playerService: deps.playerService,
        storage: deps.storage || null,
        voicePresence: deps.voicePresence || null,
        cooldown,
        queueService,
        logger: deps.logger || createLogger('Bot'),
        t
    };
}

module.exports = { createContext };
