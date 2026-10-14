/**
 * Kiểm thử CooldownService.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { CooldownService } = require('../src/services/cooldown/CooldownService');

test('CooldownService — lần đầu luôn được phép', () => {
    const service = new CooldownService();
    const result = service.check('u1:play', 1000);

    assert.equal(result.ok, true);
    assert.equal(result.retryAfterMs, 0);
});

test('CooldownService — lần thứ hai bị chặn kèm thời gian chờ', () => {
    const service = new CooldownService();
    service.check('u1:play', 5000);

    const second = service.check('u1:play', 5000);
    assert.equal(second.ok, false);
    assert.ok(second.retryAfterMs > 0);
    assert.ok(second.retryAfterMs <= 5000);
});

test('CooldownService — khoá khác nhau không ảnh hưởng nhau', () => {
    const service = new CooldownService();
    service.check('u1:play', 5000);

    assert.equal(service.check('u2:play', 5000).ok, true);
    assert.equal(service.check('u1:search', 5000).ok, true);
});

test('CooldownService — duration = 0 nghĩa là không giới hạn', () => {
    const service = new CooldownService();
    assert.equal(service.check('u1:play', 0).ok, true);
    assert.equal(service.check('u1:play', 0).ok, true);
    assert.equal(service.size, 0);
});

test('CooldownService — reset xoá cooldown của một khoá', () => {
    const service = new CooldownService();
    service.check('u1:play', 5000);
    service.reset('u1:play');

    assert.equal(service.check('u1:play', 5000).ok, true);
});

test('CooldownService — sweep dọn các khoá đã hết hạn', () => {
    const service = new CooldownService();
    service.entries.set('expired', Date.now() - 1);
    service.entries.set('alive', Date.now() + 60000);

    assert.equal(service.sweep(), 1);
    assert.equal(service.size, 1);
    assert.equal(service.entries.has('alive'), true);
});
