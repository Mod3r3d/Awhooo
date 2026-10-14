/**
 * Kiểm thử các hàm định dạng thời gian và thanh tiến trình.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { formatDuration, createProgressBar, truncate, totalDuration, parseTime } = require('../src/utils/formatters');

test('formatDuration — định dạng mm:ss và hh:mm:ss', () => {
    assert.equal(formatDuration(0), '00:00');
    assert.equal(formatDuration(-5), '00:00');
    assert.equal(formatDuration(215000), '03:35');
    assert.equal(formatDuration(3723000), '01:02:03');
});

test('truncate — cắt chuỗi quá dài', () => {
    assert.equal(truncate('abc', 10), 'abc');
    assert.equal(truncate('', 10), '');
    assert.equal(truncate('abcdefghij', 5), 'ab...');
    assert.equal(truncate(null, 5), '');
});

test('totalDuration — cộng dồn thời lượng', () => {
    assert.equal(totalDuration([]), 0);
    assert.equal(totalDuration(null), 0);
    assert.equal(totalDuration([{ duration: 1000 }, { length: 2000 }]), 3000);
});

test('createProgressBar — có thanh tiến trình và mốc thời gian', () => {
    const bar = createProgressBar(60000, 120000);
    assert.match(bar, /01:00 \/ 02:00/);
    assert.match(bar, /█/);
    assert.match(bar, /░/);
});

test('createProgressBar — livestream không có tổng thời lượng', () => {
    const bar = createProgressBar(60000, 0);
    assert.match(bar, /LIVE/);
});

test('parseTime — chấp nhận số giây thuần', () => {
    assert.equal(parseTime('90'), 90000);
    assert.equal(parseTime('0'), 0);
});

test('parseTime — chấp nhận dạng mm:ss và hh:mm:ss', () => {
    assert.equal(parseTime('1:30'), 90000);
    assert.equal(parseTime('1:02:03'), 3723000);
    assert.equal(parseTime('10:00'), 600000);
});

test('parseTime — chấp nhận dạng 1h2m3s', () => {
    assert.equal(parseTime('1h'), 3600000);
    assert.equal(parseTime('2m30s'), 150000);
    assert.equal(parseTime('1h2m3s'), 3723000);
});

test('parseTime — trả về null với dữ liệu không hợp lệ', () => {
    assert.equal(parseTime(''), null);
    assert.equal(parseTime(null), null);
    assert.equal(parseTime('abc'), null);
    assert.equal(parseTime('1:2:3:4'), null);
    assert.equal(parseTime('h'), null);
});
