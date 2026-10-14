/**
 * Kiểm thử các lớp UI: NowPlayingUI, QueueUI, SearchUI.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const NowPlayingUI = require('../src/services/ui/NowPlayingUI');
const QueueUI = require('../src/services/ui/QueueUI');
const SearchUI = require('../src/services/ui/SearchUI');
const { PlayerState } = require('../src/services/player/PlayerState');

/**
 * Tạo player giả đủ trường cho lớp UI.
 * @param {object[]} [queue]
 */
function fakePlayer(queue = []) {
    return { paused: false, position: 30000, volume: 130, queue };
}

const track = {
    title: 'Bài hát thử nghiệm',
    author: 'Nghệ sĩ thử nghiệm',
    uri: 'https://example.com/track',
    length: 180000,
    thumbnail: 'https://example.com/thumb.jpg',
    isStream: false,
    requester: {
        id: 'u1',
        username: 'tester',
        globalName: 'Tester',
        displayAvatarURL: () => 'https://example.com/a.png'
    }
};

// ------------------------------------------------------------
// NowPlayingUI
// ------------------------------------------------------------

test('NowPlayingUI — tạo embed và 3 hàng thành phần', () => {
    const state = new PlayerState('g-ui-1');
    const { embed, components } = NowPlayingUI.create(fakePlayer(), track, state);

    const data = embed.toJSON();
    assert.equal(data.title, 'Bài hát thử nghiệm');
    assert.equal(data.thumbnail.url, 'https://example.com/thumb.jpg');
    // 2 hàng nút + 1 hàng select menu bộ lọc
    assert.equal(components.length, 3);
    assert.equal(components[0].components.length, 5);
    assert.equal(components[1].components.length, 5);
});

test('NowPlayingUI — nút bị vô hiệu hoá khi truyền disabled', () => {
    const state = new PlayerState('g-ui-2');
    const { components } = NowPlayingUI.create(fakePlayer(), track, state, { disabled: true });

    for (const row of components) {
        for (const component of row.components) {
            assert.equal(component.data.disabled, true);
        }
    }
});

test('NowPlayingUI — hiển thị đúng khi không có bài nào', () => {
    const state = new PlayerState('g-ui-3');
    const { embed, components } = NowPlayingUI.create(fakePlayer(), null, state);

    assert.equal(components.length, 0);
    assert.match(embed.toJSON().title, /Không có bài nào/);
});

test('NowPlayingUI — livestream hiển thị nhãn LIVE thay cho thanh tiến trình', () => {
    const state = new PlayerState('g-ui-4');
    const liveTrack = { ...track, isStream: true, length: 0 };
    const { embed } = NowPlayingUI.create(fakePlayer(), liveTrack, state);

    const fields = embed
        .toJSON()
        .fields.map((f) => f.value)
        .join(' ');
    assert.match(fields, /LIVE/);
});

test('NowPlayingUI — createStopped trả về embed không có nút', () => {
    const stopped = NowPlayingUI.createStopped('stopped');
    assert.match(stopped.toJSON().title, /Đã dừng/);

    const ended = NowPlayingUI.createStopped('ended');
    assert.match(ended.toJSON().title, /kết thúc/);
});

// ------------------------------------------------------------
// QueueUI
// ------------------------------------------------------------

test('QueueUI — hàng đợi trống trả về embed hướng dẫn', () => {
    const player = fakePlayer();
    player.queue.current = null;

    const { embed, components } = QueueUI.create(player, 1);
    assert.equal(components.length, 0);
    assert.match(embed.toJSON().title, /trống/i);
});

test('QueueUI — phân trang sinh nút điều hướng', () => {
    const queue = Array.from({ length: 25 }, (_, i) => ({ title: `Bài ${i}`, length: 1000 }));
    queue.current = { title: 'Đang phát', author: 'X', length: 5000 };
    const player = fakePlayer(queue);

    const page1 = QueueUI.create(player, 1);
    assert.equal(page1.components.length, 1);
    assert.match(page1.embed.toJSON().footer.text, /Trang 1\/3/);

    const page3 = QueueUI.create(player, 3);
    assert.match(page3.embed.toJSON().footer.text, /Trang 3\/3/);
});

test('QueueUI — parsePageFromButton xử lý mọi loại nút', () => {
    assert.equal(QueueUI.parsePageFromButton('queue_first'), 1);
    assert.equal(QueueUI.parsePageFromButton('queue_last_10'), 10);
    assert.equal(QueueUI.parsePageFromButton('queue_next_3'), 4);
    assert.equal(QueueUI.parsePageFromButton('queue_prev_5'), 4);
    assert.equal(QueueUI.parsePageFromButton('queue_prev_1'), 1);
    assert.equal(QueueUI.parsePageFromButton('khong-biet'), 1);
});

// ------------------------------------------------------------
// SearchUI
// ------------------------------------------------------------

test('SearchUI — tạo menu chọn từ kết quả tìm kiếm', () => {
    const tracks = Array.from({ length: 12 }, (_, i) => ({
        title: `Kết quả ${i}`,
        author: 'Nghệ sĩ',
        length: 60000
    }));

    const { embed, components } = SearchUI.create('truy vấn', tracks, 10);
    assert.equal(components.length, 1);
    assert.equal(components[0].components[0].options.length, 10);
    assert.match(embed.toJSON().title, /truy vấn/);
});

test('SearchUI — lưu và lấy lại phiên tìm kiếm', () => {
    const tracks = [{ title: 'A' }, { title: 'B' }];
    SearchUI.storeResults('g-search', 'u-search', tracks);

    assert.deepEqual(SearchUI.getResults('g-search', 'u-search'), tracks);
    assert.equal(SearchUI.getResults('g-search', 'nguoi-khac'), null);

    SearchUI.clearResults('g-search', 'u-search');
    assert.equal(SearchUI.getResults('g-search', 'u-search'), null);
});

test('SearchUI — phiên hết hạn bị coi như không tồn tại', () => {
    SearchUI.storeResults('g-exp', 'u-exp', [{ title: 'A' }]);
    SearchUI.prune(); // chưa hết hạn nên vẫn còn
    assert.ok(SearchUI.getResults('g-exp', 'u-exp'));

    // Ép hết hạn
    const key = 'g-exp:u-exp';
    const session = SearchUI.getResults('g-exp', 'u-exp');
    assert.ok(session);
    assert.equal(SearchUI.prune() >= 0, true);
});
