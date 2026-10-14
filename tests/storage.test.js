/**
 * Kiểm thử StorageService — lưu trữ bền vững bằng file JSON.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const StorageService = require('../src/services/storage/StorageService');

/**
 * Tạo thư mục tạm riêng cho mỗi bài kiểm thử.
 * @returns {Promise<string>}
 */
async function tempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'musicbot-test-'));
}

test('StorageService — tạo bản ghi mặc định cho guild mới', async () => {
    const dir = await tempDir();
    const storage = new StorageService({ filePath: path.join(dir, 'guilds.json') });
    await storage.init();

    const record = storage.getGuild('g1');
    assert.equal(record.repeatMode, 'off');
    assert.equal(record.filter, 'off');
    assert.deepEqual(record.history, []);

    await fs.rm(dir, { recursive: true, force: true });
});

test('StorageService — ghi và đọc lại sau khi khởi động lại', async () => {
    const dir = await tempDir();
    const filePath = path.join(dir, 'guilds.json');

    const first = new StorageService({ filePath });
    await first.init();
    first.setGuild('g1', { repeatMode: 'queue', volume: 75, filter: 'bassboost', autoplay: true });
    first.setHistory('g1', [{ title: 'Bài A' }, { title: 'Bài B' }]);
    await first.flush();

    const second = new StorageService({ filePath });
    await second.init();
    const record = second.getGuild('g1');

    assert.equal(record.repeatMode, 'queue');
    assert.equal(record.volume, 75);
    assert.equal(record.filter, 'bassboost');
    assert.equal(record.autoplay, true);
    assert.equal(record.history.length, 2);

    await fs.rm(dir, { recursive: true, force: true });
});

test('StorageService — setHistory cắt bớt theo maxHistory', async () => {
    const dir = await tempDir();
    const storage = new StorageService({ filePath: path.join(dir, 'guilds.json'), maxHistory: 3 });
    await storage.init();

    storage.setHistory('g1', [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }]);
    assert.equal(storage.getGuild('g1').history.length, 3);

    await fs.rm(dir, { recursive: true, force: true });
});

test('StorageService — flush không ghi gì khi dữ liệu không đổi', async () => {
    const dir = await tempDir();
    const storage = new StorageService({ filePath: path.join(dir, 'guilds.json') });
    await storage.init();

    assert.equal(await storage.flush(), false);

    storage.setGuild('g1', { volume: 50 });
    assert.equal(await storage.flush(), true);
    assert.equal(await storage.flush(), false);

    await fs.rm(dir, { recursive: true, force: true });
});

test('StorageService — file hỏng được sao lưu thay vì làm sập bot', async () => {
    const dir = await tempDir();
    const filePath = path.join(dir, 'guilds.json');
    await fs.writeFile(filePath, '{ day khong phai json', 'utf8');

    const storage = new StorageService({ filePath });
    await storage.init();

    assert.deepEqual(storage.data.guilds, {});

    const files = await fs.readdir(dir);
    assert.ok(
        files.some((f) => f.includes('corrupt-')),
        'phải có file sao lưu .corrupt-*'
    );

    await fs.rm(dir, { recursive: true, force: true });
});

test('StorageService — removeGuild xoá dữ liệu của guild', async () => {
    const dir = await tempDir();
    const storage = new StorageService({ filePath: path.join(dir, 'guilds.json') });
    await storage.init();

    storage.setGuild('g1', { volume: 50 });
    storage.removeGuild('g1');

    assert.equal(storage.data.guilds.g1, undefined);

    await fs.rm(dir, { recursive: true, force: true });
});
