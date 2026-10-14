/**
 * Kiểm thử PlayerState — trạng thái phát nhạc theo guild.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { PlayerState, getState, removeState } = require('../src/services/player/PlayerState');
const FilterService = require('../src/services/filters/FilterService');

test('PlayerState — giá trị khởi tạo hợp lý', () => {
    const state = new PlayerState('g1');
    assert.equal(state.repeatMode, 'off');
    assert.equal(state.filter, FilterService.default);
    assert.equal(state.playbackGeneration, 0);
    assert.deepEqual(state.history, []);
    assert.equal(state.getEphemeralContext(), null);
    assert.equal(state.publicPanel, null);
});

test('PlayerState — generation guard tăng và kiểm tra đúng', () => {
    const state = new PlayerState('g1');
    const first = state.incrementGeneration();
    assert.equal(first, 1);
    assert.equal(state.isGenerationValid(first), true);

    const second = state.incrementGeneration();
    assert.equal(second, 2);
    assert.equal(state.isGenerationValid(first), false);
    assert.equal(state.isGenerationValid(second), true);
});

test('PlayerState — cycleRepeatMode xoay vòng off → track → queue → off', () => {
    const state = new PlayerState('g1');
    assert.equal(state.cycleRepeatMode(), 'track');
    assert.equal(state.cycleRepeatMode(), 'queue');
    assert.equal(state.cycleRepeatMode(), 'off');
});

test('PlayerState — setRepeatMode chỉ nhận giá trị hợp lệ', () => {
    const state = new PlayerState('g1');
    state.setRepeatMode('track');
    assert.equal(state.repeatMode, 'track');
    state.setRepeatMode('khong-hop-le');
    assert.equal(state.repeatMode, 'track');
});

test('PlayerState — history thêm vào đầu và giới hạn số lượng', () => {
    const state = new PlayerState('g1');
    state.addToHistory({ title: 'A' });
    state.addToHistory({ title: 'B' });

    assert.equal(state.history[0].title, 'B');
    assert.equal(state.history.length, 2);
    assert.equal(state.popFromHistory().title, 'B');
    assert.equal(state.history.length, 1);
});

test('PlayerState — getRecentKeys gom khoá định danh', () => {
    const state = new PlayerState('g1');
    state.addToHistory({ identifier: 'id-1', title: 'A', author: 'X' });
    state.addToHistory({ uri: 'https://x/y', title: 'B', author: 'Y' });

    const keys = state.getRecentKeys();
    assert.equal(keys.has('id-1'), true);
    assert.equal(keys.has('https://x/y'), true);
});

test('PlayerState — ephemeral context hợp lệ rồi tự hết hạn', () => {
    const state = new PlayerState('g1');
    state.setEphemeralContext({ webhook: {}, userId: 'u1', channelId: 'c1' });

    const ctx = state.getEphemeralContext();
    assert.ok(ctx);
    assert.equal(ctx.userId, 'u1');

    // Giả lập token đã hết hạn
    state.ephemeralContext.expiresAt = Date.now() - 1;
    assert.equal(state.getEphemeralContext(), null);
});

test('PlayerState — clearPanels xoá toàn bộ tham chiếu bảng', () => {
    const state = new PlayerState('g1');
    state.setEphemeralContext({ webhook: {}, userId: 'u1', channelId: 'c1' });
    state.publicPanel = { channelId: 'c1', message: {} };
    state.panelNote = 'ghi chú';
    state.panelTrackKey = 'k';

    state.clearPanels();

    assert.equal(state.getEphemeralContext(), null);
    assert.equal(state.publicPanel, null);
    assert.equal(state.panelNote, null);
    assert.equal(state.panelTrackKey, null);
    assert.equal(state.progressInterval, null);
});

test('PlayerState — touchPanel làm mới đồng hồ và bật lại nút', () => {
    const state = new PlayerState('g1');
    state.panelDisabled = true;
    state.panelLastInteractionAt = Date.now() - 10 * 60 * 1000;

    assert.equal(state.isPanelIdle(), true);

    state.touchPanel();
    assert.equal(state.panelDisabled, false);
    assert.equal(state.isPanelIdle(), false);
});

test('getState — trả về cùng một instance cho cùng guild', () => {
    const a = getState('guild-abc');
    const b = getState('guild-abc');
    assert.equal(a, b);

    removeState('guild-abc');
    const c = getState('guild-abc');
    assert.notEqual(a, c);
});
