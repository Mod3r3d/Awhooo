/**
 * i18n — Bộ dịch chuỗi giao diện.
 *
 * Cách dùng:
 *   const { t } = require('../locales');
 *   t('commands.play.added', { title: 'Bài hát' });
 *
 * Nếu thiếu khoá, hàm trả về chính khoá đó (kèm cảnh báo ở mức debug) để
 * bot không bao giờ hiển thị `undefined` cho người dùng.
 */

const vi = require('./vi.json');

/** Từ điển theo mã ngôn ngữ */
const dictionaries = { vi };

/** Ngôn ngữ mặc định, có thể đổi bằng biến môi trường */
const DEFAULT_LOCALE = dictionaries[process.env.DEFAULT_LOCALE] ? process.env.DEFAULT_LOCALE : 'vi';

/**
 * Tra một khoá dạng "a.b.c" trong object lồng nhau.
 * @param {object} source
 * @param {string} key
 * @returns {unknown}
 */
function lookup(source, key) {
    return key.split('.').reduce((node, part) => {
        if (node && typeof node === 'object' && part in node) return node[part];
        return undefined;
    }, source);
}

/**
 * Thay các biến dạng `{ten}` trong chuỗi bằng giá trị tương ứng.
 * @param {string} template
 * @param {Record<string, unknown>} vars
 * @returns {string}
 */
function interpolate(template, vars) {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => {
        return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match;
    });
}

/**
 * Dịch một khoá sang chuỗi hiển thị.
 * @param {string} key - Khoá dạng "commands.play.added"
 * @param {Record<string, unknown>} [vars] - Biến nội suy
 * @param {string} [locale] - Mã ngôn ngữ, mặc định lấy từ biến môi trường
 * @returns {string}
 */
function t(key, vars = {}, locale = DEFAULT_LOCALE) {
    const dict = dictionaries[locale] || dictionaries[DEFAULT_LOCALE];
    let value = lookup(dict, key);

    // Fallback sang tiếng Việt nếu ngôn ngữ đang dùng thiếu khoá
    if (value === undefined && locale !== DEFAULT_LOCALE) {
        value = lookup(dictionaries[DEFAULT_LOCALE], key);
    }

    if (typeof value !== 'string') return key;

    return interpolate(value, vars);
}

/**
 * Danh sách ngôn ngữ đang hỗ trợ.
 * @returns {string[]}
 */
function getAvailableLocales() {
    return Object.keys(dictionaries);
}

module.exports = { t, getAvailableLocales, DEFAULT_LOCALE, dictionaries };
