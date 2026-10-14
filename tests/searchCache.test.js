/**
 * Kiểm thử SearchCache — LRU kèm TTL.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const SearchCache = require('../src/services/cache/SearchCache');

test('SearchCache — normaliseKey bỏ khác biệt hoa thường và khoảng trắng', () => {
    assert.equal(SearchCache.normaliseKey('  Bài   Hát '), SearchCache.normaliseKey('bài hát'));
    assert.notEqual(SearchCache.normaliseKey('abc', 'youtube'), SearchCache.normaliseKey('abc', 'soundcloud'));
});

test('SearchCache — lưu và đọc lại giá trị', () => {
    const cache = new SearchCache({ max: 10, ttlMs: 60000 });
    cache.set('k1', { value: 42 });

    assert.deepEqual(cache.get('k1'), { value: 42 });
    assert.equal(cache.get('khong-co'), undefined);
});

test('SearchCache — mục hết hạn bị coi như không tồn tại', () => {
    const cache = new SearchCache({ max: 10, ttlMs: 60000 });
    cache.set('k1', 'v1');
    cache.store.get('k1').expiresAt = Date.now() - 1;

    assert.equal(cache.get('k1'), undefined);
    assert.equal(cache.size, 0);
});

test('SearchCache — loại bỏ mục cũ nhất khi vượt ngưỡng (LRU)', () => {
    const cache = new SearchCache({ max: 2, ttlMs: 60000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    assert.equal(cache.size, 2);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('b'), 2);
    assert.equal(cache.get('c'), 3);
});

test('SearchCache — đọc lại đưa mục lên vị trí mới nhất', () => {
    const cache = new SearchCache({ max: 2, ttlMs: 60000 });
    cache.set('a', 1);
    cache.set('b', 2);

    cache.get('a'); // 'a' trở thành mới nhất
    cache.set('c', 3); // nên 'b' bị loại

    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('c'), 3);
});

test('SearchCache — thống kê hit/miss', () => {
    const cache = new SearchCache({ max: 10, ttlMs: 60000 });
    cache.set('a', 1);

    cache.get('a');
    cache.get('a');
    cache.get('x');

    const stats = cache.stats;
    assert.equal(stats.hits, 2);
    assert.equal(stats.misses, 1);
    assert.equal(stats.size, 1);
    assert.ok(stats.hitRate > 0.6);
});

test('SearchCache — prune xoá mục hết hạn', () => {
    const cache = new SearchCache({ max: 10, ttlMs: 60000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.store.get('a').expiresAt = Date.now() - 1;

    assert.equal(cache.prune(), 1);
    assert.equal(cache.size, 1);
});

test('SearchCache — clear xoá tất cả và reset thống kê', () => {
    const cache = new SearchCache({ max: 10, ttlMs: 60000 });
    cache.set('a', 1);
    cache.get('a');
    cache.clear();

    assert.equal(cache.size, 0);
    assert.equal(cache.stats.hits, 0);
    assert.equal(cache.stats.misses, 0);
});
