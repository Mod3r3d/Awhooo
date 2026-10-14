/**
 * Kiểm thử FilterService — preset bộ lọc âm thanh.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const FilterService = require('../src/services/filters/FilterService');

test('FilterService — có preset "off" và danh sách không rỗng', () => {
    assert.equal(FilterService.isValid('off'), true);
    assert.ok(FilterService.getNames().length >= 5);
});

test('FilterService — chuẩn hoá tên bộ lọc', () => {
    assert.equal(FilterService.normalise('  BASSBOOST '), 'bassboost');
    assert.equal(FilterService.isValid('NightCore'), true);
    assert.equal(FilterService.isValid('khong-ton-tai'), false);
});

test('FilterService — buildPayload luôn null hoá các bộ lọc khác', () => {
    const payload = FilterService.buildPayload('bassboost', 130);

    assert.equal(payload.volume, 1.3);
    assert.deepEqual(payload.timescale, null);
    assert.deepEqual(payload.rotation, null);
    assert.deepEqual(payload.lowPass, null);
    assert.deepEqual(payload.karaoke, null);
    assert.ok(Array.isArray(payload.equalizer));
    assert.ok(payload.equalizer.length > 0);
});

test('FilterService — buildPayload cho "off" xoá sạch bộ lọc nhưng giữ âm lượng', () => {
    const payload = FilterService.buildPayload('off', 80);

    assert.equal(payload.volume, 0.8);
    assert.deepEqual(payload.equalizer, []);
    assert.deepEqual(payload.timescale, null);
});

test('FilterService — buildPayload với tên không hợp lệ quy về "off"', () => {
    const payload = FilterService.buildPayload('khong-ton-tai', 100);

    assert.deepEqual(payload.equalizer, []);
    assert.equal(payload.volume, 1);
});

test('FilterService — âm lượng không hợp lệ quy về 100%', () => {
    assert.equal(FilterService.buildPayload('off', NaN).volume, 1);
    assert.equal(FilterService.buildPayload('off', 0).volume, 1);
});

test('FilterService — preset nightcore chỉ bật timescale', () => {
    const payload = FilterService.buildPayload('nightcore', 100);

    assert.deepEqual(payload.timescale, { speed: 1.2, pitch: 1.2, rate: 1.0 });
    assert.deepEqual(payload.rotation, null);
});

test('FilterService — nhãn và emoji luôn trả về giá trị', () => {
    assert.equal(FilterService.getLabel('8d'), '8D Audio');
    assert.equal(FilterService.getLabel('khong-co'), FilterService.getLabel('off'));
    assert.ok(FilterService.getEmoji('karaoke').length > 0);
});
