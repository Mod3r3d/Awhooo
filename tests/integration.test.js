/**
 * Kiểm thử tích hợp — chạy trọn luồng lệnh với Discord/Kazagumo giả lập.
 *
 * Mục tiêu: xác minh hành vi cốt lõi mà người dùng yêu cầu
 * "khi bot phát nhạc thì bảng Now Playing là ephemeral, chỉ /nowplaying mới công khai".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { KazagumoTrack: Track } = require('kazagumo');
const CommandHandler = require('../src/core/CommandHandler');
const PlayerService = require('../src/services/player/PlayerService');
const SearchCache = require('../src/services/cache/SearchCache');
const StorageService = require('../src/services/storage/StorageService');
const { createContext } = require('../src/core/context');
const { getState } = require('../src/services/player/PlayerState');
const commandModules = require('../src/commands');

const silentLogger = {
    error: () => {},
    warn: () => {},
    info: () => {},
    debug: () => {},
    child() {
        return this;
    }
};

/** Tạo dữ liệu track thô đúng định dạng Lavalink mà KazagumoTrack yêu cầu */
function rawTrack(id, title) {
    return {
        encoded: `encoded-${id}`,
        info: {
            title: title || `Bài hát ${id}`,
            uri: `https://example.com/${id}`,
            identifier: id,
            author: 'Ca sĩ thử nghiệm',
            sourceName: 'youtube',
            isSeekable: true,
            isStream: false,
            length: 180000,
            artworkUrl: 'https://example.com/thumb.jpg'
        }
    };
}

/** Tạo player giả mô phỏng KazagumoPlayer */
function fakePlayer({ guildId, textId, voiceId, volume = 130 }) {
    const queue = [];
    queue.current = null;
    queue.add = (track) => {
        if (!queue.current) {
            queue.current = track;
            return queue;
        }
        queue.push(track);
        return queue;
    };

    return {
        guildId,
        textId,
        voiceId,
        volume,
        state: 1,
        playing: false,
        paused: false,
        queue,
        position: 0,
        get pausedOrPlaying() {
            return this.playing || this.paused;
        },
        async play() {
            if (!queue.current) queue.current = queue.shift() || null;
            this.playing = true;
            return this;
        },
        skip() {
            this.playing = false;
            queue.current = queue.shift() || null;
            return this;
        },
        pause(state) {
            this.paused = Boolean(state);
            return this;
        },
        async setVolume(v) {
            this.volume = v;
            return this;
        },
        async seek(position) {
            this.position = position;
            return this;
        },
        async setFilters() {
            return this;
        },
        setTextChannel(id) {
            this.textId = id;
            return this;
        },
        setVoiceChannel(id) {
            this.voiceId = id;
            return this;
        },
        async destroy() {
            this.state = 3;
            return this;
        }
    };
}

/** Tạo manager giả với kết quả tìm kiếm cố định */
function fakeManager(result) {
    const players = new Map();

    return {
        players,
        lastQuery: null,
        async search(query) {
            this.lastQuery = query;
            return typeof result === 'function' ? result(query) : result;
        },
        async createPlayer(options) {
            const player = fakePlayer(options);
            players.set(options.guildId, player);
            return player;
        }
    };
}

/** Tạo interaction giả ghi lại mọi lời gọi */
function fakeInteraction({ commandName, query, guildId = 'guild-int', userId = 'user-int' }) {
    const calls = { reply: [], editReply: [], deferReply: [], followUp: [], webhookEdit: [] };

    return {
        commandName,
        guild: { id: guildId },
        user: { id: userId, username: 'tester', globalName: 'Tester' },
        member: { voice: { channel: { id: 'voice-int' } } },
        channelId: 'text-int',
        deferred: false,
        replied: false,
        calls,
        options: {
            getString: (name) => (name === 'query' ? query : null),
            getInteger: () => null,
            getBoolean: () => null
        },
        async reply(payload) {
            calls.reply.push(payload);
            this.replied = true;
            return { id: 'msg-reply', channelId: this.channelId, edit: async () => {} };
        },
        async editReply(payload) {
            calls.editReply.push(payload);
            return { id: 'msg-edit', channelId: this.channelId, edit: async () => {} };
        },
        async deferReply(payload) {
            calls.deferReply.push(payload);
            this.deferred = true;
        },
        async fetchReply() {
            return { id: 'msg-reply', channelId: this.channelId, edit: async () => {} };
        },
        async followUp(payload) {
            calls.followUp.push(payload);
        },
        webhook: {
            async editMessage(messageId, payload) {
                calls.webhookEdit.push({ messageId, payload });
            }
        }
    };
}

/**
 * Dựng môi trường tích hợp hoàn chỉnh.
 * @param {object} searchResult - Kết quả mà manager.search trả về
 */
async function setup(searchResult) {
    const manager = fakeManager(searchResult);
    const client = { channels: { cache: new Map() } };

    const storage = new StorageService({ filePath: `./data/test-${Date.now()}-${Math.random()}.json` });
    // Không gọi init() để tránh ghi đĩa trong lúc kiểm thử
    storage.ready = false;

    const playerService = new PlayerService(client, manager, {
        storage,
        searchCache: new SearchCache({ max: 10, ttlMs: 60000 }),
        logger: silentLogger
    });

    const ctx = createContext({ client, manager, playerService, storage, logger: silentLogger });
    const handler = new CommandHandler(ctx);
    handler.registerAll(commandModules);

    // Cooldown là singleton dùng chung — xoá để các bài kiểm thử không chặn nhau
    ctx.cooldown.clear();

    return { manager, client, storage, playerService, handler, ctx };
}

/** Dọn ticker để tiến trình kiểm thử kết thúc sạch sẽ */
function cleanup(guildId) {
    getState(guildId).clearPanels();
}

// ============================================================
// /play
// ============================================================

test('tích hợp — /play defer ephemeral và vẽ bảng Now Playing dạng ephemeral', async () => {
    const track = new Track(rawTrack('a1', 'Bài hát A'), null);
    const { handler, manager } = await setup({ type: 'TRACK', tracks: [track] });

    const interaction = fakeInteraction({ commandName: 'play', query: 'bài hát a' });
    await handler.dispatch(interaction);

    // 1. Phải defer dạng ephemeral
    assert.equal(interaction.calls.deferReply.length, 1);
    assert.equal(interaction.calls.deferReply[0].flags, MessageFlags.Ephemeral);

    // 2. Không được gửi gì vào kênh chat
    assert.equal(interaction.calls.reply.length, 0);

    // 3. Bảng được vẽ qua webhook trên chính tin nhắn phản hồi ephemeral
    assert.ok(interaction.calls.webhookEdit.length >= 1, 'phải vẽ bảng Now Playing');

    const last = interaction.calls.webhookEdit.at(-1);
    assert.equal(last.messageId, '@original');
    assert.match(last.payload.embeds[0].data.title, /Bài hát A/);
    assert.match(last.payload.content, /Đã thêm/);

    // 4. Track đã được nạp vào player
    const player = manager.players.get('guild-int');
    assert.ok(player.queue.current, 'player phải có bài đang phát');

    cleanup('guild-int');
});

test('tích hợp — /play báo lỗi khi không tìm thấy kết quả', async () => {
    const { handler } = await setup({ type: 'SEARCH', tracks: [] });

    const interaction = fakeInteraction({ commandName: 'play', query: 'khong co gi' });
    await handler.dispatch(interaction);

    const lastReply = interaction.calls.editReply[interaction.calls.editReply.length - 1];
    assert.match(lastReply, /Không tìm thấy/);

    cleanup('guild-int');
});

// ============================================================
// /nowplaying
// ============================================================

test('tích hợp — /nowplaying gửi CÔNG KHAI vào kênh chat', async () => {
    const track = new Track(rawTrack('n1', 'Bài hát N'), null);
    const { handler, manager } = await setup({ type: 'TRACK', tracks: [track] });

    // Chuẩn bị player đang phát
    const player = await manager.createPlayer({
        guildId: 'guild-int',
        textId: 'text-int',
        voiceId: 'voice-int',
        volume: 130
    });
    player.queue.current = track;
    player.playing = true;

    const interaction = fakeInteraction({ commandName: 'nowplaying' });
    await handler.dispatch(interaction);

    // 1. Không defer
    assert.equal(interaction.calls.deferReply.length, 0);

    // 2. Reply công khai — KHÔNG có cờ ephemeral
    assert.equal(interaction.calls.reply.length, 1);
    assert.equal(interaction.calls.reply[0].flags, undefined);
    assert.match(interaction.calls.reply[0].embeds[0].data.title, /Bài hát N/);

    // 3. Bảng công khai được theo dõi để ticker cập nhật tiếp
    assert.ok(getState('guild-int').publicPanel, 'phải đăng ký bảng công khai');

    cleanup('guild-int');
});

test('tích hợp — /nowplaying báo lỗi khi chưa có bài nào', async () => {
    const { handler, manager } = await setup({ type: 'SEARCH', tracks: [] });

    await manager.createPlayer({ guildId: 'guild-int', textId: 'text-int', voiceId: 'voice-int' });

    const interaction = fakeInteraction({ commandName: 'nowplaying' });
    await handler.dispatch(interaction);

    assert.equal(interaction.calls.reply.length, 1);
    assert.equal(interaction.calls.reply[0].flags, MessageFlags.Ephemeral);

    cleanup('guild-int');
});

// ============================================================
// Cache tìm kiếm
// ============================================================

test('tích hợp — lần tìm thứ hai dùng cache nhưng vẫn gắn đúng người yêu cầu', async () => {
    const track = new Track(rawTrack('c1', 'Bài hát C'), null);
    const { handler, manager } = await setup({ type: 'TRACK', tracks: [track] });

    const first = fakeInteraction({ commandName: 'play', query: 'bai hat c', userId: 'user-1' });
    await handler.dispatch(first);

    const second = fakeInteraction({ commandName: 'play', query: 'bai hat c', userId: 'user-2' });
    await handler.dispatch(second);

    const player = manager.players.get('guild-int');

    // Bài thứ hai nằm trong hàng đợi và phải mang người yêu cầu mới,
    // không được dùng lại requester đã gắn trong cache của lần tìm trước.
    assert.equal(player.queue.length, 1, 'bài thứ hai phải nằm trong hàng đợi');
    assert.equal(player.queue[0].requester.id, 'user-2');
    assert.equal(player.queue.current.requester.id, 'user-1');

    cleanup('guild-int');
});

// ============================================================
// Giới hạn hàng đợi
// ============================================================

test('tích hợp — /play báo lỗi khi hàng đợi đã đầy', async () => {
    const track = new Track(rawTrack('f1', 'Bài hát F'), null);
    const { handler, manager } = await setup({ type: 'TRACK', tracks: [track] });

    const player = await manager.createPlayer({
        guildId: 'guild-int',
        textId: 'text-int',
        voiceId: 'voice-int'
    });

    // Làm đầy hàng đợi bằng các bài giả
    const { MAX_QUEUE_SIZE } = require('../src/config/constants');
    player.queue.current = new Track(rawTrack('seed', 'Seed'), null);
    for (let i = 0; i < MAX_QUEUE_SIZE; i++) {
        player.queue.push(new Track(rawTrack(`x${i}`, `Bài ${i}`), null));
    }
    player.playing = true;

    const interaction = fakeInteraction({ commandName: 'play', query: 'bai hat f' });
    await handler.dispatch(interaction);

    const lastReply = interaction.calls.editReply[interaction.calls.editReply.length - 1];
    assert.match(lastReply, /đầy/);

    cleanup('guild-int');
});
