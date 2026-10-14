/**
 * Kiểm thử QueueService — thao tác và giới hạn hàng đợi.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const queueService = require('../src/services/queue/QueueService');
const { MAX_QUEUE_SIZE, MAX_QUEUE_SIZE_PER_USER, MAX_PLAYLIST_LOAD } = require('../src/config/constants');

/**
 * Tạo player giả với hàng đợi cho trước.
 *
 * KazagumoQueue là một mảng có thêm phương thức `add()`, nên mock cũng mô phỏng
 * đúng như vậy để kiểm thử QueueService sát với thực tế.
 * @param {object[]} tracks
 */
function fakePlayer(tracks = []) {
    const queue = [...tracks];
    queue.current = null;
    queue.add = (track) => {
        queue.push(track);
        return queue;
    };
    return { queue };
}

test('QueueService — add một và nhiều track', () => {
    const player = fakePlayer();
    queueService.add(player, { title: 'A' });
    queueService.add(player, [{ title: 'B' }, { title: 'C' }]);

    assert.equal(player.queue.length, 3);
    assert.equal(player.queue[2].title, 'C');
});

test('QueueService — addTop chèn lên đầu', () => {
    const player = fakePlayer([{ title: 'A' }]);
    queueService.addTop(player, { title: 'B' });
    assert.equal(player.queue[0].title, 'B');
});

test('QueueService — remove theo index 0-based', () => {
    const player = fakePlayer([{ title: 'A' }, { title: 'B' }]);
    const removed = queueService.remove(player, 0);
    assert.equal(removed.title, 'A');
    assert.equal(player.queue.length, 1);
    assert.equal(queueService.remove(player, 5), null);
});

test('QueueService — move đổi vị trí', () => {
    const player = fakePlayer([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
    assert.equal(queueService.move(player, 0, 2), true);
    assert.deepEqual(
        player.queue.map((t) => t.title),
        ['B', 'C', 'A']
    );
    assert.equal(queueService.move(player, 9, 0), false);
});

test('QueueService — clear xoá toàn bộ', () => {
    const player = fakePlayer([{ title: 'A' }, { title: 'B' }]);
    assert.equal(queueService.clear(player), 2);
    assert.equal(player.queue.length, 0);
});

test('QueueService — shuffle toàn bộ giữ nguyên số lượng', () => {
    const player = fakePlayer(Array.from({ length: 20 }, (_, i) => ({ title: `T${i}` })));
    const count = queueService.shuffle(player);
    assert.equal(count, 20);
    assert.equal(new Set(player.queue.map((t) => t.title)).size, 20);
});

test('QueueService — shuffle theo người yêu cầu chỉ đụng bài của họ', () => {
    const player = fakePlayer([
        { title: 'A', requesterId: 'u1' },
        { title: 'B', requesterId: 'u2' },
        { title: 'C', requesterId: 'u1' },
        { title: 'D', requesterId: 'u1' }
    ]);

    queueService.shuffle(player, 'u1');

    // Bài của u2 phải giữ nguyên vị trí
    assert.equal(player.queue[1].title, 'B');
    // Bài của u1 vẫn nằm ở các vị trí 0, 2, 3
    assert.deepEqual(
        [player.queue[0].requesterId, player.queue[2].requesterId, player.queue[3].requesterId],
        ['u1', 'u1', 'u1']
    );
});

test('QueueService — countByRequester đếm đúng', () => {
    const player = fakePlayer([{ requesterId: 'u1' }, { requester: { id: 'u1' } }, { requesterId: 'u2' }]);
    assert.equal(queueService.countByRequester(player, 'u1'), 2);
    assert.equal(queueService.countByRequester(player, 'u2'), 1);
    assert.equal(queueService.countByRequester(player, null), 0);
});

test('QueueService — canAdd cho phép khi hàng đợi còn chỗ', () => {
    const player = fakePlayer([{ requesterId: 'u1' }]);
    const result = queueService.canAdd(player, 3, 'u1');

    assert.equal(result.ok, true);
    assert.equal(result.allowed, 3);
});

test('QueueService — canAdd cắt bớt theo giới hạn playlist', () => {
    const player = fakePlayer();
    const result = queueService.canAdd(player, MAX_PLAYLIST_LOAD + 50, null);

    assert.equal(result.ok, true);
    assert.equal(result.allowed, MAX_PLAYLIST_LOAD);
});

test('QueueService — canAdd báo lỗi khi hàng đợi đầy', () => {
    const full = Array.from({ length: MAX_QUEUE_SIZE }, () => ({ requesterId: 'u2' }));
    const result = queueService.canAdd(fakePlayer(full), 1, 'u1');

    assert.equal(result.ok, false);
    assert.equal(result.error, 'queueFull');
    assert.equal(result.vars.max, MAX_QUEUE_SIZE);
});

test('QueueService — canAdd báo lỗi khi người dùng vượt hạn mức', () => {
    const mine = Array.from({ length: MAX_QUEUE_SIZE_PER_USER }, () => ({ requesterId: 'u1' }));
    const result = queueService.canAdd(fakePlayer(mine), 1, 'u1');

    assert.equal(result.ok, false);
    assert.equal(result.error, 'userQueueFull');
    assert.equal(result.vars.max, MAX_QUEUE_SIZE_PER_USER);
});

test('QueueService — getPage phân trang đúng', () => {
    const player = fakePlayer(Array.from({ length: 25 }, (_, i) => ({ title: `T${i}` })));
    const page2 = queueService.getPage(player, 2, 10);

    assert.equal(page2.page, 2);
    assert.equal(page2.totalPages, 3);
    assert.equal(page2.tracks.length, 10);
    assert.equal(page2.tracks[0].title, 'T10');
});

test('QueueService — getPage kẹp trang vượt biên', () => {
    const player = fakePlayer([{ title: 'A' }]);
    assert.equal(queueService.getPage(player, 99, 10).page, 1);
    assert.equal(queueService.getPage(player, 0, 10).page, 1);
});
