/**
 * Kiểm thử định nghĩa slash command.
 *
 * Các ràng buộc dưới đây là của Discord API — vi phạm sẽ khiến việc đăng ký
 * lệnh thất bại trên production, nên cần chặn ngay từ CI.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const commandModules = require('../src/commands');
const SearchUI = require('../src/services/ui/SearchUI');
const NowPlayingUI = require('../src/services/ui/NowPlayingUI');
const { PlayerState } = require('../src/services/player/PlayerState');
const { t } = require('../src/locales');

/** Discord giới hạn mô tả trong khoảng 1..100 ký tự */
const NAME_PATTERN = /^[\w-]{1,32}$/;

/**
 * Thu thập mọi definition từ tất cả module.
 * @returns {{ module: object, definition: object }[]}
 */
function collectDefinitions() {
    const list = [];
    for (const module of commandModules) {
        for (const definition of module.definitions || []) {
            list.push({ module, definition });
        }
    }
    return list;
}

const definitions = collectDefinitions();

test('commands — có ít nhất 15 lệnh được đăng ký', () => {
    assert.ok(definitions.length >= 15, `chỉ có ${definitions.length} lệnh`);
});

test('commands — tên lệnh hợp lệ và không trùng nhau', () => {
    const seen = new Set();

    for (const { definition } of definitions) {
        assert.match(definition.name, NAME_PATTERN, `tên lệnh "${definition.name}" không hợp lệ`);
        assert.equal(seen.has(definition.name), false, `lệnh "${definition.name}" bị trùng`);
        seen.add(definition.name);
    }
});

test('commands — mô tả lệnh dài từ 1 đến 100 ký tự', () => {
    for (const { definition } of definitions) {
        assert.ok(typeof definition.description === 'string', `lệnh /${definition.name} thiếu mô tả`);
        assert.ok(definition.description.length >= 1, `lệnh /${definition.name} mô tả rỗng`);
        assert.ok(
            definition.description.length <= 100,
            `lệnh /${definition.name} mô tả dài ${definition.description.length} ký tự (tối đa 100)`
        );
    }
});

test('commands — tùy chọn hợp lệ, choice không vượt 25 mục', () => {
    for (const { definition } of definitions) {
        for (const option of definition.options || []) {
            const label = `/${definition.name} → ${option.name}`;
            assert.match(option.name, /^[\w-]{1,32}$/, `${label}: tên tùy chọn không hợp lệ`);
            assert.ok(
                typeof option.description === 'string' && option.description.length <= 100,
                `${label}: mô tả không hợp lệ`
            );
            assert.ok(Number.isInteger(option.type), `${label}: thiếu type`);

            if (option.choices) {
                assert.ok(option.choices.length <= 25, `${label}: có ${option.choices.length} choice (tối đa 25)`);
                for (const choice of option.choices) {
                    assert.ok(choice.name.length <= 100, `${label}: choice name quá dài`);
                    assert.ok(String(choice.value).length <= 100, `${label}: choice value quá dài`);
                }
            }
        }
    }
});

test('commands — mọi module đều có hàm xử lý cho từng definition', () => {
    for (const { module, definition } of definitions) {
        const hasHandler = typeof module.execute === 'function';
        const hasNamedHandler = module.handlers && typeof module.handlers[definition.name] === 'function';

        assert.ok(hasHandler || hasNamedHandler, `lệnh /${definition.name} không có hàm xử lý`);
    }
});

test('commands — meta.defer chỉ nhận giá trị hợp lệ', () => {
    for (const { module, definition } of definitions) {
        const defer = module.meta?.defer;
        assert.ok(
            defer === undefined || defer === false || defer === 'ephemeral' || defer === 'public',
            `lệnh /${definition.name} có meta.defer không hợp lệ: ${defer}`
        );
    }
});

test('commands — lệnh phát nhạc đều yêu cầu ở kênh thoại', () => {
    const musicCommands = ['play', 'playtop', 'playskip', 'search'];

    for (const name of musicCommands) {
        const entry = definitions.find((d) => d.definition.name === name);
        assert.ok(entry, `thiếu lệnh /${name}`);
        assert.equal(entry.module.meta?.requiresVoice, true, `/${name} phải yêu cầu requiresVoice`);
    }
});

test('commands — /nowplaying là lệnh duy nhất gửi công khai', () => {
    for (const { module, definition } of definitions) {
        if (definition.name === 'nowplaying' || definition.name === 'np') {
            assert.equal(module.meta?.defer, false, `/${definition.name} phải tự reply công khai`);
        } else if (module.meta?.defer) {
            assert.equal(module.meta.defer, 'ephemeral', `/${definition.name} không được defer công khai`);
        }
    }
});

// ------------------------------------------------------------
// Ràng buộc của component (nút / menu)
// ------------------------------------------------------------

test('component — nhãn nút và option của menu không vượt giới hạn Discord', () => {
    const state = new PlayerState('g-cmd-1');
    const track = { title: 'Bài', author: 'Ca sĩ', length: 1000, isStream: false };
    const player = { paused: false, position: 0, volume: 100, queue: [] };

    const { components } = NowPlayingUI.create(player, track, state);

    for (const row of components) {
        for (const component of row.components) {
            const data = component.data;
            if (data.label !== undefined) {
                assert.ok(data.label.length <= 80, `nhãn nút quá dài: "${data.label}"`);
            }
            if (data.placeholder !== undefined) {
                assert.ok(data.placeholder.length <= 150, 'placeholder quá dài');
            }
            for (const option of data.options || []) {
                assert.ok(option.label.length <= 100, `option label quá dài: "${option.label}"`);
                assert.ok(String(option.value).length <= 100, 'option value quá dài');
                if (option.description !== undefined) {
                    assert.ok(option.description.length <= 100, 'option description quá dài');
                }
            }
        }
    }
});

test('component — menu /search giới hạn tối đa 25 kết quả', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ title: `Bài ${i}`, author: 'X', length: 1000 }));
    const { components } = SearchUI.create('q', many, 40);

    const select = components[0].components[0];
    assert.ok(select.options.length <= 25, `menu có ${select.options.length} option (tối đa 25)`);
});

// ------------------------------------------------------------
// Khoá dịch
// ------------------------------------------------------------

test('locales — mọi khoá dùng trong meta/UI đều tồn tại', () => {
    const keys = [
        'common.needVoice',
        'common.needSameVoice',
        'common.noPlayer',
        'common.noPlaying',
        'common.cooldown',
        'common.queueFull',
        'common.userQueueFull',
        'common.playlistTrimmed',
        'ui.nowPlaying.playing',
        'ui.nowPlaying.paused',
        'ui.nowPlaying.status',
        'ui.queue.title',
        'ui.queue.footer'
    ];

    for (const key of keys) {
        assert.notEqual(t(key), key, `thiếu khoá dịch "${key}"`);
    }
});
