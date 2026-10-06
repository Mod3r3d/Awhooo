/**
 * Cấu hình danh sách Lavalink Nodes (Lavalink v4) & fallback.
 * Đã kiểm tra và xác thực kết nối WebSocket op:ready thành công.
 */

const defaultNodes = [
    {
        name: 'Nazha_SSL',
        url: 'lavalink.nazha.online:443',
        auth: 'nazhafreelava',
        secure: true
    },
    {
        name: 'Millohost_SSL',
        url: 'lava-v4.millohost.my.id:443',
        auth: 'https://discord.gg/mjS5J2K3ep',
        secure: true
    },
    {
        name: 'GDjkhp_SSL',
        url: 'nodelink.gdjkhp.com:443',
        auth: 'youshallnotpass',
        secure: true
    }
];

let Nodes = [...defaultNodes];

// Nếu người dùng cấu hình node riêng qua biến môi trường trên Render/VPS
if (process.env.LAVALINK_HOST) {
    Nodes.unshift({
        name: 'Custom_Main_Node',
        url: process.env.LAVALINK_HOST,
        auth: process.env.LAVALINK_AUTH || 'youshallnotpass',
        secure: process.env.LAVALINK_SECURE ? process.env.LAVALINK_SECURE === 'true' : true
    });
}

module.exports = { Nodes };

