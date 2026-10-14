/**
 * Cấu hình danh sách Lavalink Nodes (Lavalink v4) & fallback.
 *
 * Thứ tự ưu tiên cấu hình:
 *  1. `LAVALINK_NODES` — mảng JSON đầy đủ, THAY THẾ hoàn toàn danh sách bên dưới.
 *     Ví dụ: LAVALINK_NODES=[{"name":"Node-1","url":"lavalink.example.com:443","auth":"mat-khau","secure":true}]
 *  2. `LAVALINK_HOST` + `LAVALINK_AUTH` + `LAVALINK_SECURE` — thêm một node chính
 *     lên đầu danh sách (các node công khai bên dưới vẫn làm dự phòng).
 *  3. Danh sách node công khai miễn phí bên dưới (chỉ dùng để thử nghiệm).
 *     Đặt `LAVALINK_USE_PUBLIC_FALLBACK=false` để tắt hoàn toàn nhóm này.
 *
 * LƯU Ý: các node công khai bên dưới là của cộng đồng, KHÔNG nên dùng cho
 * production. Hãy tự host Lavalink (xem docker-compose.yml) và khai báo qua
 * `LAVALINK_NODES`.
 */

const { createLogger } = require('../services/logger');

const log = createLogger('LavalinkConfig');

/** Danh sách node công khai miễn phí — chỉ phù hợp để thử nghiệm */
const PUBLIC_FALLBACK_NODES = [
    {
        name: 'Public-1',
        url: process.env.LAVALINK_PUBLIC_1_URL || 'lavalink.nazha.online:443',
        auth: process.env.LAVALINK_PUBLIC_1_AUTH || 'nazhafreelava',
        secure: true
    },
    {
        name: 'Public-2',
        url: process.env.LAVALINK_PUBLIC_2_URL || 'lava-v4.millohost.my.id:443',
        auth: process.env.LAVALINK_PUBLIC_2_AUTH || 'https://discord.gg/mjS5J2K3ep',
        secure: true
    },
    {
        name: 'Public-3',
        url: process.env.LAVALINK_PUBLIC_3_URL || 'nodelink.gdjkhp.com:443',
        auth: process.env.LAVALINK_PUBLIC_3_AUTH || 'youshallnotpass',
        secure: true
    }
];

/**
 * Kiểm tra một đối tượng node có đủ trường bắt buộc hay không.
 * @param {unknown} node
 * @returns {boolean}
 */
function isValidNode(node) {
    return Boolean(
        node &&
        typeof node === 'object' &&
        typeof node.name === 'string' &&
        node.name &&
        typeof node.url === 'string' &&
        node.url &&
        typeof node.auth === 'string'
    );
}

/**
 * Chuẩn hoá node về đúng định dạng Shoukaku yêu cầu.
 * @param {object} node
 * @returns {object}
 */
function normaliseNode(node) {
    return {
        name: node.name,
        url: node.url,
        auth: node.auth,
        secure: node.secure !== false,
        ...(node.group ? { group: node.group } : {})
    };
}

/**
 * Đọc danh sách node từ biến môi trường `LAVALINK_NODES` (JSON).
 * @returns {object[]|null} Danh sách node hoặc null nếu không cấu hình/biến không hợp lệ
 */
function parseNodesFromEnv() {
    const raw = process.env.LAVALINK_NODES;
    if (!raw || !String(raw).trim()) return null;

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('giá trị phải là một mảng JSON');
        const nodes = parsed.filter(isValidNode).map(normaliseNode);
        if (!nodes.length) throw new Error('không có node hợp lệ nào');
        return nodes;
    } catch (err) {
        log.error('LAVALINK_NODES không hợp lệ, sẽ dùng cấu hình mặc định.', err.message);
        return null;
    }
}

/**
 * Xây dựng danh sách node hoàn chỉnh.
 * @returns {object[]}
 */
function buildNodes() {
    const fromEnv = parseNodesFromEnv();
    if (fromEnv) {
        log.info(`Dùng ${fromEnv.length} node Lavalink từ biến môi trường LAVALINK_NODES.`);
        return fromEnv;
    }

    /** @type {object[]} */
    const nodes = [];

    // Node chính cấu hình thủ công luôn được ưu tiên
    if (process.env.LAVALINK_HOST) {
        nodes.push(
            normaliseNode({
                name: 'Custom-Main',
                url: process.env.LAVALINK_HOST,
                auth: process.env.LAVALINK_AUTH || 'youshallnotpass',
                secure: process.env.LAVALINK_SECURE ? process.env.LAVALINK_SECURE === 'true' : true
            })
        );
    }

    const usePublicFallback = process.env.LAVALINK_USE_PUBLIC_FALLBACK !== 'false';
    if (usePublicFallback) {
        nodes.push(...PUBLIC_FALLBACK_NODES.map(normaliseNode));
        log.warn('Đang dùng node Lavalink công khai miễn phí — không khuyến khích cho production.');
    }

    if (!nodes.length) {
        log.error('Không có node Lavalink nào được cấu hình! Bot sẽ không phát được nhạc.');
    }

    return nodes;
}

const Nodes = buildNodes();

module.exports = { Nodes, PUBLIC_FALLBACK_NODES, isValidNode };
