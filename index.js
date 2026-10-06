/**
 * Discord Music Bot — Entry Point
 *
 * Kiến trúc mới: index.js chỉ làm 3 việc:
 * 1. Khởi động HTTP health server (cho Render)
 * 2. Khởi tạo Discord Client + Kazagumo/Shoukaku + PlayerService
 * 3. Đăng ký slash commands và điều hướng interaction/button/event
 */

require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, Events } = require('discord.js');
const { Kazagumo } = require('kazagumo');
const KazagumoSpotify = require('kazagumo-spotify');
const { Connectors } = require('shoukaku');
const express = require('express');

// --- Import modules ---
const { Nodes } = require('./src/config/lavalink');
const PlayerService = require('./src/services/player/PlayerService');
const { getState } = require('./src/services/player/PlayerState');
const QueueUI = require('./src/services/ui/QueueUI');
const queueService = require('./src/services/queue/QueueService');

// --- Import commands ---
const playCmd = require('./src/commands/play');
const playtopCmd = require('./src/commands/playtop');
const playskipCmd = require('./src/commands/playskip');
const skipCmd = require('./src/commands/skip');
const pauseCmd = require('./src/commands/pause');
const resumeCmd = require('./src/commands/resume');
const stopCmd = require('./src/commands/stop');
const queueCmd = require('./src/commands/queue');
const repeatCmd = require('./src/commands/repeat');
const shuffleCmd = require('./src/commands/shuffle');
const historyCmd = require('./src/commands/history');
const previousCmd = require('./src/commands/previous');
const volumeCmd = require('./src/commands/volume');
const nowplayingCmd = require('./src/commands/nowplaying');

// ============================================================
// 1. HTTP Health Server (độc lập, khởi động ngay lập tức)
// ============================================================
const app = express();
app.get('/', (_req, res) => res.send('Bot Node.js đang hoạt động!'));
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.listen(process.env.PORT || 8080, '0.0.0.0', () => {
    console.log(`🌐 Health server listening on port ${process.env.PORT || 8080}`);
});

// ============================================================
// 2. Anti-Crash Handlers
// ============================================================
process.on('unhandledRejection', (reason) => console.error('⚠️ [ANTI-CRASH] Promise:', reason));
process.on('uncaughtException', (error) => console.error('⚠️ [ANTI-CRASH] System:', error));
process.on('uncaughtExceptionMonitor', (error) => console.error('⚠️ [ANTI-CRASH] Monitor:', error));

// ============================================================
// 3. Kiểm tra cấu hình Spotify
// ============================================================
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID ? process.env.SPOTIFY_CLIENT_ID.trim().replace(/^["']|["']$/g, '') : '';
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET ? process.env.SPOTIFY_CLIENT_SECRET.trim().replace(/^["']|["']$/g, '') : '';
const hasSpotifyCredentials = Boolean(spotifyClientId && spotifyClientSecret);

if (!hasSpotifyCredentials) {
    console.log("⚠️ CẢNH BÁO: Chưa cấu hình SPOTIFY_CLIENT_ID hoặc SECRET!");
    console.log("⚠️ Bot sẽ dùng máy chủ Lavalink dự phòng để phát nhạc.");
} else {
    console.log("✅ Đã nhận diện Spotify API Key! Sẵn sàng tải hàng ngàn bài hát.");
}

// ============================================================
// 4. Discord Client + Kazagumo
// ============================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

client.manager = new Kazagumo({
    defaultSearchEngine: "youtube",
    plugins: [
        new KazagumoSpotify({
            clientId: spotifyClientId,
            clientSecret: spotifyClientSecret,
            playlistPageLimit: 50,
            albumPageLimit: 10,
            searchLimit: 10,
            searchMarket: 'VN',
            lavalinkPluginTries: 2 // Luôn dùng Lavalink LavaSrc để phân giải Spotify an toàn và mượt mà, tránh 403 Forbidden từ Spotify Web API
        })
    ],
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
}, new Connectors.DiscordJS(client), Nodes, {
    moveOnDisconnect: true,
    resume: true,
    reconnectTries: 10,
    restTimeout: 10000
});

// --- Khởi tạo PlayerService ---
const playerService = new PlayerService(client, client.manager);

// ============================================================
// 5. Kazagumo / Shoukaku Events
// ============================================================
client.manager.shoukaku.on('ready', (name) => {
    console.log(`✅ Lavalink Node: ${name} đã kết nối!`);
});
client.manager.shoukaku.on('error', (name, error) => {
    console.error(`❌ Lỗi Lavalink Node ${name}:`, error?.message || error);
});
client.manager.shoukaku.on('close', (name, code, reason) => {
    console.warn(`⚠️ Lavalink Node ${name} đã ngắt kết nối (code: ${code}, lý do: ${reason || 'Không rõ'})`);
});
client.manager.shoukaku.on('disconnect', (name, count) => {
    console.warn(`⚠️ Lavalink Node ${name} bị mất kết nối, đang thử kết nối lại (lần ${count})...`);
});

// Bài hát bắt đầu phát → gửi Now Playing embed
client.manager.on('playerStart', (player, track) => {
    playerService.onTrackStart(player, track);
});

// Bài hát kết thúc → lưu history, xử lý repeat
client.manager.on('playerEnd', (player) => {
    const track = player.queue.current;
    playerService.onTrackEnd(player, track);
});

// Hàng đợi hết bài → hủy player
client.manager.on('playerEmpty', (player) => {
    playerService.onPlayerEmpty(player);
});

// Player bị hủy → dọn state
client.manager.on('playerDestroy', (player) => {
    playerService.onPlayerDestroy(player.guildId);
});

// Bắt lỗi playback & resolve để debug trên Render
client.manager.on('playerResolveError', (player, track, message) => {
    console.error(`❌ [Kazagumo] Lỗi resolve bài hát "${track?.title}":`, message);
});
client.manager.on('playerException', (player, data) => {
    console.error('❌ [Kazagumo] Player exception:', data);
});
client.manager.on('playerClosed', (player, data) => {
    console.warn('⚠️ [Kazagumo] Player voice connection closed:', data);
});

// ============================================================
// 6. Đăng ký Slash Commands
// ============================================================
const slashCommands = [
    playCmd.definition,
    playtopCmd.definition,
    playskipCmd.definition,
    ...skipCmd.definitions,  // skip có 2 definitions: skip + skipto
    pauseCmd.definition,
    resumeCmd.definition,
    stopCmd.definition,
    queueCmd.definition,
    repeatCmd.definition,
    shuffleCmd.definition,
    historyCmd.definition,
    previousCmd.definition,
    volumeCmd.definition,
    ...nowplayingCmd.definitions
];

client.once(Events.ClientReady, async () => {
    console.log(`🎉 Bot đã online: ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('🔄 Đang đăng ký slash commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
        console.log(`✅ Đã đăng ký ${slashCommands.length} slash commands!`);
    } catch (err) {
        console.error('❌ Lỗi đăng ký slash commands:', err);
    }
});

// ============================================================
// 7. Interaction Router (Commands + Buttons)
// ============================================================
client.on('interactionCreate', async (interaction) => {
    try {
        // --- Slash Commands ---
        if (interaction.isChatInputCommand()) {
            switch (interaction.commandName) {
                case 'play':
                    return await playCmd.execute(interaction, playerService);
                case 'playtop':
                    return await playtopCmd.execute(interaction, playerService);
                case 'playskip':
                    return await playskipCmd.execute(interaction, playerService);
                case 'skip':
                    return await skipCmd.executeSkip(interaction, playerService);
                case 'skipto':
                    return await skipCmd.executeSkipTo(interaction, playerService);
                case 'pause':
                    return await pauseCmd.execute(interaction, playerService);
                case 'resume':
                    return await resumeCmd.execute(interaction, playerService);
                case 'stop':
                    return await stopCmd.execute(interaction, playerService);
                case 'queue':
                    return await queueCmd.execute(interaction, playerService);
                case 'repeat':
                    return await repeatCmd.execute(interaction, playerService);
                case 'shuffle':
                    return await shuffleCmd.execute(interaction, playerService);
                case 'history':
                    return await historyCmd.execute(interaction, playerService);
                case 'previous':
                    return await previousCmd.execute(interaction, playerService);
                case 'volume':
                    return await volumeCmd.execute(interaction, playerService);
                case 'nowplaying':
                case 'np':
                    return await nowplayingCmd.execute(interaction, playerService);
            }
        }

        // --- Button Interactions (Now Playing & Queue pagination) ---
        if (interaction.isButton()) {
            const customId = interaction.customId;

            // Now Playing buttons
            if (customId.startsWith('np_')) {
                const player = client.manager.players.get(interaction.guild.id);
                if (!player) {
                    return interaction.reply({ content: '❌ Không có kết nối âm thanh.', ephemeral: true });
                }

                // Kiểm tra user ở cùng voice channel
                const memberVoice = interaction.member.voice?.channel;
                if (!memberVoice || memberVoice.id !== player.voiceId) {
                    return interaction.reply({ content: '❌ Bạn cần ở cùng kênh thoại với bot!', ephemeral: true });
                }

                await interaction.deferUpdate();

                switch (customId) {
                    case 'np_previous': {
                        const result = playerService.previous(player);
                        if (!result.ok) {
                            await interaction.followUp({ content: result.error, ephemeral: true });
                        }
                        break;
                    }
                    case 'np_pause_resume': {
                        if (player.paused) {
                            playerService.resume(player);
                        } else {
                            playerService.pause(player);
                        }
                        // Update embed ngay lập tức
                        const state = getState(interaction.guild.id);
                        const NowPlayingUI = require('./src/services/ui/NowPlayingUI');
                        const updated = NowPlayingUI.create(player, player.queue.current, state);
                        await interaction.editReply({ embeds: [updated.embed], components: updated.components });
                        break;
                    }
                    case 'np_skip': {
                        playerService.skip(player);
                        break;
                    }
                    case 'np_repeat': {
                        const state = getState(interaction.guild.id);
                        state.cycleRepeatMode();
                        const NowPlayingUI = require('./src/services/ui/NowPlayingUI');
                        const updated = NowPlayingUI.create(player, player.queue.current, state);
                        await interaction.editReply({ embeds: [updated.embed], components: updated.components });
                        break;
                    }
                    case 'np_shuffle': {
                        if (player.queue.length > 1) {
                            queueService.shuffle(player);
                            await interaction.followUp({ content: `🔀 Đã xáo trộn **${player.queue.length}** bài!`, ephemeral: true });
                        } else {
                            await interaction.followUp({ content: '❌ Cần ít nhất 2 bài để xáo trộn.', ephemeral: true });
                        }
                        break;
                    }
                    case 'np_vol_down': {
                        const newVol = Math.max(10, (player.volume || 100) - 10);
                        await player.setVolume(newVol);
                        const state = getState(interaction.guild.id);
                        const NowPlayingUI = require('./src/services/ui/NowPlayingUI');
                        const updated = NowPlayingUI.create(player, player.queue.current, state);
                        await interaction.editReply({ embeds: [updated.embed], components: updated.components });
                        break;
                    }
                    case 'np_vol_up': {
                        const newVol = Math.min(200, (player.volume || 100) + 10);
                        await player.setVolume(newVol);
                        const state = getState(interaction.guild.id);
                        const NowPlayingUI = require('./src/services/ui/NowPlayingUI');
                        const updated = NowPlayingUI.create(player, player.queue.current, state);
                        await interaction.editReply({ embeds: [updated.embed], components: updated.components });
                        break;
                    }
                    case 'np_queue': {
                        const { embed, components } = QueueUI.create(player, 1);
                        await interaction.followUp({ embeds: [embed], components, ephemeral: true });
                        break;
                    }
                    case 'np_stop': {
                        playerService.stop(player);
                        await interaction.editReply({
                            embeds: [],
                            components: [],
                            content: '🛑 Đã dừng nhạc và xóa toàn bộ hàng đợi.'
                        });
                        break;
                    }
                }
                return;
            }

            // Queue pagination buttons
            if (customId.startsWith('queue_') && customId !== 'queue_page_indicator') {
                const player = client.manager.players.get(interaction.guild.id);
                if (!player) {
                    return interaction.reply({ content: '❌ Không có kết nối âm thanh.', ephemeral: true });
                }

                await interaction.deferUpdate();
                const targetPage = QueueUI.parsePageFromButton(customId);
                const { embed, components } = QueueUI.create(player, targetPage);
                await interaction.editReply({ embeds: [embed], components });
                return;
            }
        }

    } catch (globalErr) {
        console.error("🚨 LỖI CHI TIẾT KHI CHẠY LỆNH:", globalErr);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply("❌ Lỗi hệ thống! Tôi đã ghi chi tiết lỗi vào log.").catch(() => {});
            } else {
                await interaction.reply({ content: "❌ Lỗi hệ thống! Hãy kiểm tra log.", ephemeral: true }).catch(() => {});
            }
        } catch { /* Bỏ qua lỗi khi cố phản hồi interaction đã hết hạn */ }
    }
});

// ============================================================
// 8. Đăng nhập Discord
// ============================================================
client.login(process.env.DISCORD_TOKEN);