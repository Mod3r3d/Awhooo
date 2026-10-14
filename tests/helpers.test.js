/**
 * Kiểm thử các hàm thuần: autoplay, voice presence, locales.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { pickRelated, trackKey } = require('../src/services/autoplay/AutoplayService');
const { countHumans } = require('../src/services/voice/VoicePresenceService');
const { t, getAvailableLocales } = require('../src/locales');

// ------------------------------------------------------------
// AutoplayService.pickRelated
// ------------------------------------------------------------

test('pickRelated — chọn bài đầu tiên chưa từng phát', () => {
    const tracks = [
        { identifier: 'a', title: 'A' },
        { identifier: 'b', title: 'B' }
    ];
    const picked = pickRelated(tracks, new Set(['a']));

    assert.equal(picked.identifier, 'b');
});

test('pickRelated — bỏ qua livestream', () => {
    const tracks = [
        { identifier: 'live', title: 'Live', isStream: true },
        { identifier: 'song', title: 'Song' }
    ];
    const picked = pickRelated(tracks, new Set());

    assert.equal(picked.identifier, 'song');
});

test('pickRelated — trả về null khi không còn ứng viên', () => {
    assert.equal(pickRelated([], new Set()), null);
    assert.equal(pickRelated(null, new Set()), null);
    assert.equal(pickRelated([{ identifier: 'a', title: 'A' }], new Set(['a'])), null);
});

test('trackKey — ưu tiên identifier, rồi uri, rồi tiêu đề', () => {
    assert.equal(trackKey({ identifier: 'id', uri: 'u' }), 'id');
    assert.equal(trackKey({ uri: 'u', title: 'T', author: 'A' }), 'u');
    assert.equal(trackKey({ title: 'T', author: 'A' }), 'T|A');
    assert.equal(trackKey(null), '');
});

// ------------------------------------------------------------
// VoicePresenceService.countHumans
// ------------------------------------------------------------

test('countHumans — chỉ đếm người, không đếm bot', () => {
    const members = [{ user: { bot: false } }, { user: { bot: true } }, { user: { bot: false } }];
    assert.equal(countHumans(members), 2);
});

test('countHumans — an toàn với dữ liệu rỗng', () => {
    assert.equal(countHumans(null), 0);
    assert.equal(countHumans([]), 0);
    // Phần tử không có trường `user` bị bỏ qua
    assert.equal(countHumans([{}]), 0);
});

test('countHumans — thiếu cờ bot thì coi là người (fail-open, tránh rời phòng oan)', () => {
    // Trong thực tế GuildMember luôn có user.bot, nhưng nếu thiếu thì KHÔNG
    // được rời phòng, vì rời nhầm khi còn người nghe là lỗi tệ hơn.
    assert.equal(countHumans([{ user: {} }]), 1);
});

// ------------------------------------------------------------
// locales
// ------------------------------------------------------------

test('locales — dịch khoá đơn giản', () => {
    assert.equal(t('common.needVoice'), '❌ Bạn cần vào kênh thoại trước!');
});

test('locales — nội suy biến', () => {
    assert.equal(t('commands.volume.changed', { level: 55 }), '🔊 Đã chỉnh âm lượng thành: **55%**');
});

test('locales — khoá thiếu trả về chính khoá đó (không trả undefined)', () => {
    assert.equal(t('khong.ton.tai'), 'khong.ton.tai');
});

test('locales — có ít nhất một ngôn ngữ và khoá tiếng Việt', () => {
    assert.ok(getAvailableLocales().includes('vi'));
});
