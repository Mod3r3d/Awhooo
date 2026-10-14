/**
 * /queue — Xem, quản lý danh sách chờ (view, remove, move, clear).
 */

const QueueUI = require('../services/ui/QueueUI');
const { checkSameVoiceChannel } = require('../utils/permissions');
const { respondEphemeral } = require('../utils/reply');

const definitions = [
    {
        name: 'queue',
        description: 'Xem và quản lý danh sách chờ',
        options: [
            {
                name: 'page',
                type: 4, // INTEGER
                description: 'Số trang muốn xem (mặc định: 1)',
                required: false,
                min_value: 1
            },
            {
                name: 'remove',
                type: 4, // INTEGER
                description: 'Xóa bài hát tại vị trí này (VD: 3)',
                required: false,
                min_value: 1
            },
            {
                name: 'move_from',
                type: 4,
                description: 'Di chuyển bài: vị trí nguồn',
                required: false,
                min_value: 1
            },
            {
                name: 'move_to',
                type: 4,
                description: 'Di chuyển bài: vị trí đích',
                required: false,
                min_value: 1
            },
            {
                name: 'clear',
                type: 5, // BOOLEAN
                description: 'Xóa toàn bộ hàng đợi (giữ bài đang phát)',
                required: false
            }
        ]
    }
];

const meta = {
    // Bảng hàng đợi chỉ hiện cho người gọi lệnh để kênh chat không bị rác.
    // Chỉ /nowplaying mới gửi công khai.
    defer: 'ephemeral'
};

/**
 * Kiểm tra quyền thao tác hàng đợi (phải ở cùng kênh thoại với bot).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 * @param {object} player
 * @returns {boolean} true nếu được phép
 */
async function ensureCanModify(interaction, ctx, player) {
    const check = checkSameVoiceChannel(interaction.member, player);
    if (!check.ok) {
        await respondEphemeral(interaction, ctx.t(check.error));
        return false;
    }
    return true;
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 */
async function execute(interaction, ctx) {
    const { playerService, manager, queueService, t } = ctx;

    const player = manager.players.get(interaction.guild.id);
    if (!player) {
        return interaction.editReply(t('commands.queue.empty'));
    }

    // --- /queue clear ---
    if (interaction.options.getBoolean('clear')) {
        if (!(await ensureCanModify(interaction, ctx, player))) return;
        const count = queueService.clear(player);
        return interaction.editReply(t('commands.queue.cleared', { count }));
    }

    // --- /queue remove <index> ---
    const removeIndex = interaction.options.getInteger('remove');
    if (removeIndex !== null && removeIndex !== undefined) {
        if (!(await ensureCanModify(interaction, ctx, player))) return;

        // Người dùng nhập 1-based, service dùng 0-based
        const removed = queueService.remove(player, removeIndex - 1);
        if (!removed) {
            return interaction.editReply(t('commands.queue.invalidPosition', { position: removeIndex }));
        }
        return interaction.editReply(
            t('commands.queue.removed', {
                title: removed.title || 'Unknown',
                position: removeIndex
            })
        );
    }

    // --- /queue move <from> <to> ---
    const moveFrom = interaction.options.getInteger('move_from');
    const moveTo = interaction.options.getInteger('move_to');
    if (moveFrom !== null && moveFrom !== undefined && moveTo !== null && moveTo !== undefined) {
        if (!(await ensureCanModify(interaction, ctx, player))) return;

        const success = queueService.move(player, moveFrom - 1, moveTo - 1);
        if (!success) {
            return interaction.editReply(t('commands.queue.invalidPosition', { position: moveFrom }));
        }
        return interaction.editReply(t('commands.queue.moved', { from: moveFrom, to: moveTo }));
    }

    // --- /queue [page] — Hiển thị danh sách ---
    const page = interaction.options.getInteger('page') || 1;
    const { embed, components } = QueueUI.create(player, page);
    await interaction.editReply({ embeds: [embed], components });

    // Không dùng playerService ở đây nhưng giữ tham số để đồng nhất chữ ký
    void playerService;
}

module.exports = { definitions, meta, execute };
