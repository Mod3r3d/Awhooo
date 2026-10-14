/**
 * index.js — Danh sách toàn bộ slash command của bot.
 *
 * Thêm lệnh mới chỉ cần thêm một dòng vào mảng bên dưới.
 */

module.exports = [
    // Phát nhạc
    require('./play'),
    require('./playtop'),
    require('./playskip'),
    require('./search'),

    // Điều khiển phát
    require('./skip'),
    require('./pause'),
    require('./resume'),
    require('./stop'),

    // Hàng đợi & cài đặt
    require('./queue'),
    require('./repeat'),
    require('./shuffle'),
    require('./history'),
    require('./previous'),
    require('./volume'),

    // Hiển thị
    require('./nowplaying'),

    // Tính năng nâng cao
    require('./filter'),
    require('./seek'),
    require('./forward'),
    require('./rewind'),
    require('./autoplay')
];