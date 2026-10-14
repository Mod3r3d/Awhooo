/**
 * Kiểm thử CommandHandler — sổ đăng ký lệnh và lớp kiểm tra dùng chung.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');

const CommandHandler = require('../src/core/CommandHandler');
const { createContext } = require('../src/core/context');

/** Logger im lặng để không làm ồn output kiểm thử */
const silentLogger = {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    child() {
        return this;
    }
};

/**
 * Tạo ngữ cảnh bot giả.
 * @param {{ players?: Map<string, object> }} [options]
 */
function mockContext(options = {}) {
    const players = options.players || new Map();
    return createContext({
        client: { channels: { cache: new Map() } },
        manager: { players },
        playerService: {},
        logger: silentLogger
    });
}

/**
 * Tạo interaction giả.
 * @param {{ commandName?: string, voice?: object|null, userId?: string, guildId?: string }} [options]
 */
function mockInteraction(options = {}) {
    const { commandName = 'play', voice = { id: 'voice-1' }, userId = 'user-1', guildId = 'guild-1' } = options;

    return {
        commandName,
        user: { id: userId },
        guild: { id: guildId },
        member: { voice: voice ? { channel: voice } : null },
        deferred: false,
        replied: false,
        calls: { reply: [], editReply: [], deferReply: [] },
        async reply(payload) {
            this.calls.reply.push(payload);
            this.replied = true;
        },
        async editReply(payload) {
            this.calls.editReply.push(payload);
        },
        async deferReply(payload) {
            this.calls.deferReply.push(payload);
            this.deferred = true;
        }
    };
}

test('CommandHandler — đăng ký và gom definition', () => {
    const handler = new CommandHandler(mockContext());
    handler.register({
        definitions: [{ name: 'alpha', description: 'A' }],
        meta: {},
        execute: async () => {}
    });
    handler.register({
        definitions: [
            { name: 'beta', description: 'B' },
            { name: 'gamma', description: 'C' }
        ],
        meta: {},
        handlers: { beta: async () => {}, gamma: async () => {} }
    });

    assert.equal(handler.getDefinitions().length, 3);
    assert.equal(handler.registry.size, 3);
});

test('CommandHandler — bỏ qua definition thiếu hàm xử lý', () => {
    const handler = new CommandHandler(mockContext());
    handler.register({ definitions: [{ name: 'broken', description: 'X' }], meta: {} });

    assert.equal(handler.registry.size, 0);
    assert.equal(handler.getDefinitions().length, 1);
});

test('CommandHandler — chặn khi người dùng không ở kênh thoại', async () => {
    const handler = new CommandHandler(mockContext());
    handler.register({
        definitions: [{ name: 'play', description: 'P' }],
        meta: { requiresVoice: true },
        execute: async () => {
            throw new Error('không được gọi');
        }
    });

    const interaction = mockInteraction({ voice: null });
    await handler.dispatch(interaction);

    assert.equal(interaction.calls.reply.length, 1);
    assert.match(interaction.calls.reply[0].content, /kênh thoại/);
    assert.equal(interaction.calls.reply[0].flags, MessageFlags.Ephemeral);
});

test('CommandHandler — chặn khi guild chưa có player', async () => {
    const handler = new CommandHandler(mockContext());
    handler.register({
        definitions: [{ name: 'pause', description: 'P' }],
        meta: { requiresPlayer: true },
        execute: async () => {
            throw new Error('không được gọi');
        }
    });

    const interaction = mockInteraction({ commandName: 'pause' });
    await handler.dispatch(interaction);

    assert.equal(interaction.calls.reply.length, 1);
    assert.match(interaction.calls.reply[0].content, /Không có kết nối âm thanh/);
});

test('CommandHandler — chặn khi người dùng ở khác kênh thoại với bot', async () => {
    const players = new Map([['guild-1', { voiceId: 'voice-khac' }]]);
    const handler = new CommandHandler(mockContext({ players }));

    handler.register({
        definitions: [{ name: 'skip', description: 'S' }],
        meta: { sameVoice: true },
        execute: async () => {
            throw new Error('không được gọi');
        }
    });

    const interaction = mockInteraction({ commandName: 'skip' });
    await handler.dispatch(interaction);

    assert.match(interaction.calls.reply[0].content, /cùng kênh thoại/);
});

test('CommandHandler — defer ephemeral rồi gọi execute', async () => {
    const handler = new CommandHandler(mockContext());
    let executed = false;

    handler.register({
        definitions: [{ name: 'volume', description: 'V' }],
        meta: { defer: 'ephemeral' },
        execute: async () => {
            executed = true;
        }
    });

    const interaction = mockInteraction({ commandName: 'volume' });
    await handler.dispatch(interaction);

    assert.equal(executed, true);
    assert.equal(interaction.calls.deferReply.length, 1);
    assert.equal(interaction.calls.deferReply[0].flags, MessageFlags.Ephemeral);
});

test('CommandHandler — defer công khai không truyền cờ ephemeral', async () => {
    const handler = new CommandHandler(mockContext());
    handler.register({
        definitions: [{ name: 'nowplaying', description: 'N' }],
        meta: { defer: 'public' },
        execute: async () => {}
    });

    const interaction = mockInteraction({ commandName: 'nowplaying' });
    await handler.dispatch(interaction);

    assert.equal(interaction.calls.deferReply.length, 1);
    assert.equal(interaction.calls.deferReply[0], undefined);
});

test('CommandHandler — bắt lỗi từ execute và phản hồi thân thiện', async () => {
    const handler = new CommandHandler(mockContext());
    handler.register({
        definitions: [{ name: 'play', description: 'P' }],
        meta: { defer: 'ephemeral' },
        execute: async () => {
            throw new Error('No node is available');
        }
    });

    const interaction = mockInteraction();
    await handler.dispatch(interaction);

    assert.equal(interaction.calls.editReply.length, 1);
    assert.match(interaction.calls.editReply[0].content, /Lavalink/);
});

test('CommandHandler — cooldown chặn lần gọi thứ hai', async () => {
    const handler = new CommandHandler(mockContext());
    let runs = 0;

    handler.register({
        definitions: [{ name: 'play', description: 'P' }],
        meta: { defer: 'ephemeral', cooldown: 10000 },
        execute: async () => {
            runs++;
        }
    });

    const first = mockInteraction({ userId: 'cooldown-user' });
    await handler.dispatch(first);

    const second = mockInteraction({ userId: 'cooldown-user' });
    await handler.dispatch(second);

    assert.equal(runs, 1);
    assert.equal(second.calls.reply.length, 1);
    assert.match(second.calls.reply[0].content, /Chậm đã/);
});

test('CommandHandler — lệnh không tồn tại thì bỏ qua an toàn', async () => {
    const handler = new CommandHandler(mockContext());
    const interaction = mockInteraction({ commandName: 'khong-ton-tai' });

    await handler.dispatch(interaction);

    assert.equal(interaction.calls.reply.length, 0);
    assert.equal(interaction.calls.deferReply.length, 0);
});
