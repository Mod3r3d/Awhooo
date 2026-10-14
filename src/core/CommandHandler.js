/**
 * CommandHandler — Sổ đăng ký slash command + lớp kiểm tra dùng chung.
 *
 * Nhờ `meta`, mỗi command không còn phải lặp lại các bước:
 * kiểm tra voice → kiểm tra player → deferReply → try/catch.
 *
 * Định dạng một module command:
 * ```js
 * module.exports = {
 *   definitions: [{ name: 'play', description: '...', options: [...] }],
 *   meta: {
 *     requiresVoice: true,   // người dùng phải ở trong kênh thoại
 *     requiresPlayer: true,  // phải có player trong guild
 *     requiresPlaying: true, // phải đang phát hoặc đang tạm dừng
 *     sameVoice: true,       // phải ở cùng kênh thoại với bot
 *     defer: 'ephemeral',    // 'ephemeral' | 'public' | false
 *     cooldown: 3000         // ms, mặc định lấy từ constants
 *   },
 *   execute: async (interaction, ctx) => { ... }   // 1 definition
 *   // hoặc
 *   handlers: { skip: fn, skipto: fn }             // nhiều definition
 * };
 * ```
 */

const { MessageFlags } = require('discord.js');
const { respondEphemeral, respondError } = require('../utils/reply');

class CommandHandler {
    /**
     * @param {object} ctx - Ngữ cảnh bot
     */
    constructor(ctx) {
        this.ctx = ctx;
        /** @type {Map<string, { meta: object, execute: Function, module: string }>} */
        this.registry = new Map();
        /** @type {object[]} */
        this.definitions = [];
    }

    /**
     * Đăng ký một module command.
     * @param {object} commandModule
     */
    register(commandModule) {
        const { definitions = [], meta = {}, execute, handlers } = commandModule;

        if (!definitions.length) {
            this.ctx.logger.warn('Bỏ qua module command không có definitions.');
            return;
        }

        const moduleName = definitions[0].name;

        for (const definition of definitions) {
            const fn = handlers && handlers[definition.name] ? handlers[definition.name] : execute;
            if (typeof fn !== 'function') {
                this.ctx.logger.warn(`Command /${definition.name} không có hàm execute, đã bỏ qua.`);
                continue;
            }
            this.registry.set(definition.name, { meta, execute: fn, module: moduleName });
        }

        this.definitions.push(...definitions);
    }

    /**
     * Đăng ký nhiều module cùng lúc.
     * @param {object[]} modules
     */
    registerAll(modules) {
        for (const module of modules) this.register(module);
        this.ctx.logger.info(`Đã nạp ${this.registry.size} slash command vào bộ định tuyến.`);
    }

    /** Danh sách definition để gửi lên Discord API. */
    getDefinitions() {
        return this.definitions;
    }

    /**
     * Kiểm tra điều kiện tiên quyết dựa trên `meta`.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {object} meta
     * @returns {Promise<{ ok: boolean, player?: object, voiceChannel?: object }>}
     */
    async preflight(interaction, meta) {
        const ctx = this.ctx;
        const { t } = ctx;

        // --- Cooldown ---
        if (meta.cooldown) {
            const result = ctx.cooldown.check(`${interaction.user.id}:${interaction.commandName}`, meta.cooldown);
            if (!result.ok) {
                await respondEphemeral(
                    interaction,
                    t('common.cooldown', { seconds: Math.ceil(result.retryAfterMs / 1000) })
                );
                return { ok: false };
            }
        }

        // --- Kênh thoại ---
        let voiceChannel = null;
        if (meta.requiresVoice || meta.sameVoice) {
            voiceChannel = interaction.member?.voice?.channel || null;
            if (!voiceChannel) {
                await respondEphemeral(interaction, t('common.needVoice'));
                return { ok: false };
            }

            if (meta.requiresVoice && voiceChannel.permissionsFor && ctx.client.user) {
                const perms = voiceChannel.permissionsFor(ctx.client.user);
                if (perms) {
                    if (!perms.has('Connect')) {
                        await respondEphemeral(interaction, '❌ Bot không có quyền tham gia kênh thoại này (cần quyền **Connect**).');
                        return { ok: false };
                    }
                    if (!perms.has('Speak')) {
                        await respondEphemeral(interaction, '❌ Bot không có quyền phát âm thanh trong kênh thoại này (cần quyền **Speak**).');
                        return { ok: false };
                    }
                }
            }
        }

        // --- Player ---
        const player = ctx.manager.players.get(interaction.guild.id) || null;

        if (meta.requiresPlayer && !player) {
            await respondEphemeral(interaction, t('common.noPlayer'));
            return { ok: false };
        }

        if (meta.requiresPlaying && !(player && (player.playing || player.paused))) {
            await respondEphemeral(interaction, t('common.noPlaying'));
            return { ok: false };
        }

        if (meta.sameVoice && player && player.voiceId && voiceChannel.id !== player.voiceId) {
            await respondEphemeral(interaction, t('common.needSameVoice'));
            return { ok: false };
        }

        return { ok: true, player, voiceChannel };
    }

    /**
     * Xử lý một slash command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async dispatch(interaction) {
        const entry = this.registry.get(interaction.commandName);
        if (!entry) {
            this.ctx.logger.warn(`Không tìm thấy handler cho lệnh /${interaction.commandName}.`);
            return;
        }

        const { meta, execute } = entry;
        const ctx = this.ctx;
        const start = Date.now();

        try {
            const pre = await this.preflight(interaction, meta);
            if (!pre.ok) return;

            if (meta.defer === 'ephemeral') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            } else if (meta.defer === 'public') {
                await interaction.deferReply();
            }

            await execute(interaction, {
                ...ctx,
                player: pre.player,
                voiceChannel: pre.voiceChannel
            });
            ctx.logger.info(`[Command /${interaction.commandName}] hoàn thành sau ${Date.now() - start}ms.`);
        } catch (err) {
            ctx.logger.error(`Lỗi khi chạy lệnh /${interaction.commandName} (${Date.now() - start}ms):`, err);
            await respondError(interaction, err);
        }
    }
}

module.exports = CommandHandler;
