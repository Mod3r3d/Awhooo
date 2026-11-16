/**
 * Kiểm thử tính năng nâng cấp V3 — Permissions, KeyedMutex, Cooldown Reservation, Storage.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PermissionFlagsBits } = require('discord.js');

const { canStop, hasElevatedPermission } = require('../src/utils/permissions');
const KeyedMutex = require('../src/utils/KeyedMutex');
const cooldown = require('../src/services/cooldown/CooldownService');
const StorageService = require('../src/services/storage/StorageService');

// ============================================================
// 1. Permissions
// ============================================================

test('V3 Permissions — người ở cùng kênh thoại được phép stop', () => {
    const member = {
        permissions: { has: () => false },
        voice: { channel: { id: 'voice-1' } },
        roles: { cache: new Map() }
    };
    const player = { voiceId: 'voice-1' };

    const result = canStop(member, player);
    assert.equal(result.ok, true);
});

test('V3 Permissions — người không ở kênh thoại và không có quyền bị từ chối stop', () => {
    const member = {
        permissions: { has: () => false },
        voice: { channel: null },
        roles: { cache: new Map() }
    };
    const player = { voiceId: 'voice-1' };

    const result = canStop(member, player);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'common.noPermission');
});

test('V3 Permissions — quản trị viên được phép stop từ xa', () => {
    const member = {
        permissions: {
            has: (perm) => perm === PermissionFlagsBits.Administrator || perm === PermissionFlagsBits.ManageGuild
        },
        voice: { channel: null },
        roles: { cache: new Map() }
    };
    const player = { voiceId: 'voice-1' };

    assert.equal(hasElevatedPermission(member), true);
    assert.equal(canStop(member, player).ok, true);
});

test('V3 Permissions — thành viên có role DJ được phép stop từ xa', () => {
    const rolesMap = new Map([['role-dj', { id: 'role-dj', name: 'DJ' }]]);
    const member = {
        permissions: { has: () => false },
        voice: { channel: null },
        roles: { cache: rolesMap }
    };
    const player = { voiceId: 'voice-1' };

    assert.equal(hasElevatedPermission(member, 'role-dj'), true);
    assert.equal(canStop(member, player, 'role-dj').ok, true);
});

// ============================================================
// 2. KeyedMutex
// ============================================================

test('V3 KeyedMutex — tuần tự hóa các tác vụ trên cùng một guild', async () => {
    const mutex = new KeyedMutex();
    const order = [];

    const task1 = mutex.runExclusive('g1', async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(1);
    });

    const task2 = mutex.runExclusive('g1', async () => {
        order.push(2);
    });

    await Promise.all([task1, task2]);
    assert.deepEqual(order, [1, 2]);
    assert.equal(mutex.size, 0, 'phải dọn dẹp key sau khi xong');
});

test('V3 KeyedMutex — hai guild khác nhau chạy song song không chặn nhau', async () => {
    const mutex = new KeyedMutex();
    const finished = [];

    const task1 = mutex.runExclusive('g1', async () => {
        await new Promise((r) => setTimeout(r, 40));
        finished.push('g1');
    });

    const task2 = mutex.runExclusive('g2', async () => {
        await new Promise((r) => setTimeout(r, 10));
        finished.push('g2');
    });

    await Promise.all([task1, task2]);
    // g2 kết thúc trước vì timeout ngắn hơn và không bị g1 chặn
    assert.deepEqual(finished, ['g2', 'g1']);
});

test('V3 KeyedMutex — giải phóng lock ngay cả khi tác vụ bị lỗi', async () => {
    const mutex = new KeyedMutex();

    await assert.rejects(
        mutex.runExclusive('g1', async () => {
            throw new Error('Lỗi cố ý');
        }),
        /Lỗi cố ý/
    );

    // Tác vụ sau đó vẫn chạy được bình thường
    let ran = false;
    await mutex.runExclusive('g1', async () => {
        ran = true;
    });
    assert.equal(ran, true);
});

// ============================================================
// 3. Cooldown Reservation
// ============================================================

test('V3 Cooldown — reserve giữ chỗ ngay lập tức và release hoàn trả', () => {
    const key = 'test-reserve-user:command';
    cooldown.clear();

    const first = cooldown.reserve(key, 5000);
    assert.equal(first.ok, true);

    const second = cooldown.reserve(key, 5000);
    assert.equal(second.ok, false);
    assert.ok(second.retryAfterMs > 0);

    first.release();
    const third = cooldown.reserve(key, 5000);
    assert.equal(third.ok, true);

    third.release();
});

// ============================================================
// 4. Storage Serialized Flush
// ============================================================

test('V3 Storage — flush tuần tự hóa và không nuốt thay đổi mới', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'musicbot-v3-'));
    const filePath = path.join(dir, 'guilds.json');

    const storage = new StorageService({ filePath, flushDebounceMs: 50 });
    await storage.init();

    storage.setGuild('g1', { volume: 50 });
    const flush1 = storage.flush();

    // Thay đổi phát sinh trong khi flush đang chạy
    storage.setGuild('g1', { volume: 80 });

    await flush1;
    await storage.close();

    const verify = new StorageService({ filePath });
    await verify.init();
    assert.equal(verify.getGuild('g1').volume, 80);

    await fs.rm(dir, { recursive: true, force: true });
});

// ============================================================
// 5. Multi-Session Now Playing & Autoplay Shared Resolver
// ============================================================

const { PlayerState } = require('../src/services/player/PlayerState');
const AutoplayService = require('../src/services/autoplay/AutoplayService');

test('V3 Multi-Session — hỗ trợ nhiều phiên ephemeral độc lập theo User', () => {
    const state = new PlayerState('g1');

    state.setEphemeralContext({ webhook: { id: 'w1' }, userId: 'user1', channelId: 'c1' });
    state.setEphemeralContext({ webhook: { id: 'w2' }, userId: 'user2', channelId: 'c1' });

    const allSessions = state.getAllEphemeralSessions();
    assert.equal(allSessions.length, 2, 'phải giữ cả 2 phiên của 2 user');
    assert.equal(state.getEphemeralContext('user1').webhook.id, 'w1');
    assert.equal(state.getEphemeralContext('user2').webhook.id, 'w2');

    // Xóa session của user1 không làm mất session của user2
    state.clearEphemeralContext('user1');
    assert.equal(state.getAllEphemeralSessions().length, 1);
    assert.equal(state.getEphemeralContext('user2').webhook.id, 'w2');
});

test('V3 Autoplay — dùng searchFn dùng chung thay vì phụ thuộc manager cứng', async () => {
    let searchedQuery = null;
    const mockSearchFn = async (query) => {
        searchedQuery = query;
        return {
            tracks: [
                {
                    title: 'Bài liên quan',
                    author: 'Ca sĩ A',
                    identifier: 'related-1',
                    uri: 'https://youtube.com/watch?v=related1',
                    isStream: false
                }
            ]
        };
    };

    const autoplay = new AutoplayService(mockSearchFn);
    const seed = { title: 'Bài gốc', author: 'Ca sĩ A', identifier: 'seed-1' };

    const related = await autoplay.findRelated(seed, new Set(), null);
    assert.ok(related);
    assert.equal(related.title, 'Bài liên quan');
    assert.match(searchedQuery, /Ca sĩ A/);
});
