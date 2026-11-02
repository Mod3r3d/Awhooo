/**
 * Discord Music Bot — Entry Point
 *
 * index.js chỉ làm 4 việc:
 * 1. Khởi động HTTP health server (cho Render / Railway / uptime monitor)
 * 2. Khởi tạo Discord Client + Kazagumo/Shoukaku + các service
 * 3. Đăng ký slash command và gắn router tương tác
 * 4. Xử lý tắt máy an toàn (graceful shutdown)
 *
 * Toàn bộ logic nghiệp vụ nằm trong `src/` — xem `src/core/` cho phần định tuyến.
 */

require('dotenv').config();

const path = require('node:path');
const { Client, GatewayIntentBits, REST, Routes, Events } = require('discord.js');
const { Kazagumo } = require('kazagumo');
const KazagumoSpotify = require('kazagumo-spotify');
const { Connectors } = require('shoukaku');
const express = require('express');

// --- Cấu hình & hạ tầng ---
const { Nodes } = require('./src/config/lavalink');
const constants = require('./src/config/constants');
const { createLogger, attachErrorReporter } = require('./src/services/logger');

// --- Services ---
const PlayerService = require('./src/services/player/PlayerService');
const { getStateCount } = require('./src/services/player/PlayerState');
const StorageService = require('./src/services/storage/StorageService');
const VoicePresenceService = require('./src/services/voice/VoicePresenceService');
const SearchCache = require('./src/services/cache/SearchCache');
const AutoplayService = require('./src/services/autoplay/AutoplayService');
const cooldown = require('./src/services/cooldown/CooldownService');
const SearchUI = require('./src/services/ui/SearchUI');

// --- Lớp định tuyến ---
const { createContext } = require('./src/core/context');
const CommandHandler = require('./src/core/CommandHandler');
const ButtonHandler = require('./src/core/ButtonHandler');
const SelectHandler = require('./src/core/SelectHandler');

// --- Tương tác ---
const nowPlayingButtons = require('./src/interactions/nowPlayingButtons');
const queueButtons = require('./src/interactions/queueButtons');
const filterSelect = require('./src/interactions/filterSelect');
const searchSelect = require('./src/interactions/searchSelect');

// --- Danh sách lệnh ---
const commandModules = require('./src/commands');

const log = createLogger('Bootstrap');

// ============================================================
// 0. Thu thập lỗi bên ngoài (tùy chọn — Sentry)
// ============================================================
if (process.env.SENTRY_DSN) {
    try {
        const Sentry = require('@sentry/node');
        Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
        attachErrorReporter((error, context) => Sentry.captureException(error, { extra: context }));
        log.info('Đã bật Sentry để thu thập lỗi.');
    } catch {
        log.warn('Có SENTRY_DSN nhưng chưa cài @sentry/node — bỏ qua thu thập lỗi.');
    }
}

// ============================================================
// 1. HTTP Health Server
// ============================================================
const app = express();
const startedAt = Date.now();

/** Chuyển mã trạng thái node Lavalink thành tên dễ đọc (Shoukaku: 0=CONNECTING, 1=CONNECTED, 2=DISCONNECTING, 3=DISCONNECTED) */
const NODE_STATES = {
    0: 'connecting',
    1: 'connected',
    2: 'disconnecting',
    3: 'disconnected'
};

/** Các đối tượng được gán sau khi khởi tạo */
let client = null;
let manager = null;
let playerService = null;
let storage = null;
let voicePresence = null;

app.get('/', (_req, res) => res.send('Bot Node.js đang hoạt động!'));

app.get('/health', (_req, res) => {
    const memory = process.memoryUsage();
    const uptimeSeconds = Math.round((Date.now() - startedAt) / 1000);

    const nodes = manager
        ? [...manager.shoukaku.nodes.values()].map((node) => ({
              name: node.name,
              state: NODE_STATES[node.state] || String(node.state),
              players: node.stats?.playingPlayers ?? null,
              penalty: node.penalty ?? null
          }))
        : [];

    const connectedNodes = nodes.filter((node) => node.state === 'connected').length;
    // Cho phép thời gian khởi động (60s) để bot kết nối Discord và Lavalink mà không bị Render fail deploy
    const isWarmingUp = uptimeSeconds < 60;
    const healthy = isWarmingUp || connectedNodes > 0;

    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'unhealthy',
        warmingUp: isWarmingUp,
        uptimeSeconds,
        memory: {
            rssMb: Math.round(memory.rss / 1024 / 1024),
            heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024)
        },
        discord: {
            ready: Boolean(client?.isReady()),
            guilds: client?.guilds?.cache?.size ?? 0,
            ping: client?.ws?.ping ?? null
        },
        players: manager ? manager.players.size : 0,
        guildStates: getStateCount(),
        searchCache: playerService ? playerService.searchCache.stats : null,
        cooldownKeys: cooldown.size,
        pendingVoiceLeave: voicePresence ? voicePresence.pendingCount : 0,
        storage: storage ? { ready: storage.ready, guilds: Object.keys(storage.data.guilds).length } : null,
        lavalink: nodes
    });
});

const server = app.listen(process.env.PORT || 8080, '0.0.0.0', () => {
    log.info(`Health server đang lắng nghe trên cổng ${process.env.PORT || 8080}`);
});

// ============================================================
// 2. Anti-Crash Handlers
// ============================================================
process.on('unhandledRejection', (reason) => log.error('[ANTI-CRASH] Promise bị từ chối:', reason));
process.on('uncaughtException', (error) => log.error('[ANTI-CRASH] Lỗi hệ thống:', error));
process.on('uncaughtExceptionMonitor', (error) => log.error('[ANTI-CRASH] Giám sát:', error));

// ============================================================
// 3. Kiểm tra cấu hình Spotify
// ============================================================
const spotifyClientId = (process.env.SPOTIFY_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
const spotifyClientSecret = (process.env.SPOTIFY_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '');

if (!spotifyClientId || !spotifyClientSecret) {
    log.warn(
        'Chưa cấu hình SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET — bot sẽ dùng node Lavalink dự phòng để phát nhạc.'
    );
} else {
    log.info('Đã nhận diện Spotify API Key.');
}

// ============================================================
// 4. Discord Client + Kazagumo
// ============================================================
client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages]
});

manager = new Kazagumo(
    {
        defaultSearchEngine: 'youtube_music',
        plugins: [
            new KazagumoSpotify({
                clientId: spotifyClientId,
                clientSecret: spotifyClientSecret,
                playlistPageLimit: 1,
                albumPageLimit: 1,
                searchLimit: 10,
                searchMarket: 'VN'
            })
        ],
        send: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild && guild.shard) {
                guild.shard.send(payload);
            } else if (client.ws) {
                client.ws.broadcast(payload);
            }
        }
    },
    new Connectors.DiscordJS(client),
    Nodes,
    {
        moveOnDisconnect: true,
        resume: true,
        reconnectTries: 100,
        restTimeout: 30
    }
);

// ============================================================
// 5. Khởi tạo Services
// ============================================================
storage = new StorageService({
    filePath: path.join(constants.DATA_DIR, 'guilds.json'),
    maxHistory: constants.MAX_HISTORY
});

const searchCache = new SearchCache({
    max: constants.SEARCH_CACHE_MAX,
    ttlMs: constants.SEARCH_CACHE_TTL_MS
});

playerService = new PlayerService(client, manager, {
    storage,
    searchCache,
    autoplayService: new AutoplayService(manager),
    logger: createLogger('PlayerService')
});

voicePresence = new VoicePresenceService(client, manager, {
    idleMs: constants.VOICE_EMPTY_LEAVE_MS,
    onIdle: async (guildId) => {
        log.info(`Không còn ai trong kênh thoại — rồi phòng tại guild ${guildId}.`);
        const player = manager.players.get(guildId);

        if (player) {
            await playerService.stop(player);
        } else {
            try {
                await manager.destroyPlayer(guildId);
            } catch (_) {}
            try {
                await manager.shoukaku.leaveVoiceChannel(guildId);
            } catch (_) {}
            try {
                const guild = client.guilds.cache.get(guildId);
                if (guild?.members?.me?.voice?.channelId) {
                    await guild.members.me.voice.disconnect();
                }
            } catch (_) {}
        }
    }
});

// ============================================================
// 6. Định tuyến tương tác
// ============================================================
const ctx = createContext({
    client,
    manager,
    playerService,
    storage,
    voicePresence,
    logger: log
});

const commandHandler = new CommandHandler(ctx);
commandHandler.registerAll(commandModules);

const buttonHandler = new ButtonHandler(ctx);
buttonHandler.register(nowPlayingButtons.prefix, nowPlayingButtons.handle);
buttonHandler.register(queueButtons.prefix, queueButtons.handle);

const selectHandler = new SelectHandler(ctx);
selectHandler.register(filterSelect.customId, filterSelect.handle);
selectHandler.register(searchSelect.customId, searchSelect.handle);

// ============================================================
// 7. Kazagumo / Shoukaku Events
// ============================================================
manager.shoukaku.on('ready', (name) => log.info(`Node Lavalink "${name}" đã kết nối.`));
manager.shoukaku.on('error', (name, error) => log.error(`Lỗi node Lavalink "${name}":`, error));
manager.shoukaku.on('close', (name, code, reason) => {
    log.warn(`Node Lavalink "${name}" đã ngắt kết nối (code ${code}): ${reason || 'không rõ lý do'}`);
});
manager.shoukaku.on('disconnect', (name, count) => {
    log.warn(`Node Lavalink "${name}" mất kết nối, đang thử lại (lần ${count})...`);
});

// Khi một node bị Shoukaku xóa sổ hoàn toàn (hết reconnectTries)
manager.shoukaku.on('raw', (name, json) => {
    // Shoukaku phát ra 'raw' với opcode close khi node bị loại bỏ hoàn toàn
    if (json && json.op === 'event' && json.type === 'WebSocketClosedEvent') {
        log.warn(`Node "${name}" WebSocket closed — Node Keeper sẽ xử lý kết nối lại.`);
    }
});

manager.on('playerStart', (player, track) => {
    playerService.onTrackStart(player, track).catch((err) => log.error('Lỗi trong onTrackStart:', err));
});

manager.on('playerEnd', (player) => {
    try {
        playerService.onTrackEnd(player, player.queue.current);
    } catch (err) {
        log.error('Lỗi trong onTrackEnd:', err);
    }
});

manager.on('playerEmpty', (player) => {
    playerService.onPlayerEmpty(player).catch((err) => log.error('Lỗi trong onPlayerEmpty:', err));
});

manager.on('playerDestroy', (player) => {
    playerService.onPlayerDestroy(player.guildId);
});

manager.on('playerResolveError', async (player, track, message) => {
    log.error(`Không phân giải được bài hát "${track?.title}":`, message);
    // Không gửi tin nhắn công khai để tránh spam — chỉ log
    if (player.queue.size > 0) {
        player.skip();
    } else {
        await playerService.stop(player).catch(() => {});
    }
});

manager.on('playerException', async (player, data) => {
    log.error(`Lỗi phát nhạc tại guild ${player.guildId}:`, data);
    // Thông báo lỗi vào kênh text để người dùng biết
    try {
        const channel = client.channels.cache.get(player.textId);
        const trackTitle = player.queue?.current?.title || 'Không rõ';
        if (channel) {
            await channel.send({
                content: `⚠️ Bài hát **${trackTitle}** gặp lỗi phát (có thể bị YouTube chặn). ${player.queue.size > 0 ? 'Đang chuyển bài tiếp theo...' : 'Dừng phát nhạc.'}`
            }).catch(() => {});
        }
    } catch (_) {}
    if (player.queue.size > 0) {
        player.skip();
    } else {
        await playerService.stop(player).catch(() => {});
    }
});

manager.on('playerStuck', async (player, track, thresholdMs) => {
    log.warn(`Bài hát "${track?.title}" bị nghẽn phát (${thresholdMs}ms) tại guild ${player.guildId}.`);
    // Thông báo vào kênh text
    try {
        const channel = client.channels.cache.get(player.textId);
        const trackTitle = track?.title || 'Không rõ';
        if (channel) {
            await channel.send({
                content: `⚠️ Bài hát **${trackTitle}** bị nghẽn phát (${Math.round(thresholdMs / 1000)}s). ${player.queue.size > 0 ? 'Đang chuyển bài tiếp theo...' : 'Dừng phát nhạc.'}`
            }).catch(() => {});
        }
    } catch (_) {}
    if (player.queue.size > 0) {
        player.skip();
    } else {
        await playerService.stop(player).catch(() => {});
    }
});

manager.on('playerClosed', (_player, data) => log.warn('Kết nối thoại bị đóng:', data));

// ============================================================
// 8. Đăng ký Slash Commands
// ============================================================
client.once(Events.ClientReady, async () => {
    log.info(`Bot đã online: ${client.user.tag}`);

    await storage.init();

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const body = commandHandler.getDefinitions();

    try {
        log.info(`Đang đăng ký ${body.length} slash command...`);

        if (process.env.DEV_GUILD_ID) {
            try {
                await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.DEV_GUILD_ID), { body });
                log.info(`Đã đăng ký ${body.length} slash command cho guild ${process.env.DEV_GUILD_ID}.`);
            } catch (guildErr) {
                log.warn('Không thể đăng ký guild slash commands:', guildErr.message);
            }
        }

        await rest.put(Routes.applicationCommands(client.user.id), { body });
        log.info(`Đã đăng ký ${body.length} global slash command.`);
    } catch (err) {
        log.error('Lỗi đăng ký slash commands:', err);
    }

    voicePresence.start();
    startMaintenanceJobs();
});

// ============================================================
// 9. Interaction Router
// ============================================================
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            log.info(
                `[Command /${interaction.commandName}] bởi ${interaction.user.tag} (guild: ${interaction.guildId})`
            );
            return await commandHandler.dispatch(interaction);
        }

        if (interaction.isButton()) {
            log.info(`[Button ${interaction.customId}] bởi ${interaction.user.tag} (guild: ${interaction.guildId})`);
            return await buttonHandler.dispatch(interaction);
        }

        if (interaction.isStringSelectMenu()) {
            log.info(`[Select ${interaction.customId}] bởi ${interaction.user.tag} (guild: ${interaction.guildId})`);
            return await selectHandler.dispatch(interaction);
        }
    } catch (err) {
        log.error('Lỗi không mong đợi khi xử lý tương tác:', err);
    }
});

// ============================================================
// 10. Dọn dẹp định kỳ (cache, cooldown, phiên tìm kiếm)
// ============================================================
let maintenanceInterval = null;
let nodeKeeperInterval = null;

function startMaintenanceJobs() {
    const run = () => {
        const removedCache = searchCache.prune();
        const removedSessions = SearchUI.prune();
        const removedCooldown = cooldown.sweep();
        if (removedCache || removedSessions || removedCooldown) {
            log.debug(
                `Dọn dẹp định kỳ: cache=${removedCache}, phiên tìm kiếm=${removedSessions}, cooldown=${removedCooldown}`
            );
        }
    };

    maintenanceInterval = setInterval(run, 5 * 60 * 1000);
    if (typeof maintenanceInterval.unref === 'function') maintenanceInterval.unref();

    // ── Node Keeper: tự phục hồi node Lavalink bị mất ──
    startNodeKeeper();
}

/**
 * Node Keeper — Quét và tự động kết nối lại các node Lavalink bị mất.
 * Chạy mỗi 60 giây. Nếu một node đã bị Shoukaku xóa khỏi bộ nhớ
 * (sau khi hết reconnectTries), Node Keeper sẽ gọi addNode() để đưa
 * node trở lại hoạt động mà không cần restart bot.
 */
function startNodeKeeper() {
    const NODE_KEEPER_INTERVAL_MS = 60_000; // 60 giây
    const nodeKeeperLog = createLogger('NodeKeeper');

    const run = () => {
        if (!manager || !manager.shoukaku) return;

        const currentNodeNames = new Set();
        for (const node of manager.shoukaku.nodes.values()) {
            currentNodeNames.add(node.name);
        }

        // Kiểm tra xem có node nào trong cấu hình ban đầu bị thiếu không
        for (const nodeConfig of Nodes) {
            if (!currentNodeNames.has(nodeConfig.name)) {
                nodeKeeperLog.warn(
                    `Node "${nodeConfig.name}" không còn trong bộ nhớ Shoukaku — đang thêm lại...`
                );
                try {
                    manager.shoukaku.addNode(nodeConfig);
                    nodeKeeperLog.info(`Đã yêu cầu kết nối lại node "${nodeConfig.name}".`);
                } catch (err) {
                    nodeKeeperLog.error(`Không thêm lại được node "${nodeConfig.name}":`, err.message);
                }
            }
        }

        // Kiểm tra các node đang ở trạng thái DISCONNECTED (state === 3)
        for (const node of manager.shoukaku.nodes.values()) {
            if (node.state === 3) {
                nodeKeeperLog.warn(
                    `Node "${node.name}" đang ở trạng thái DISCONNECTED — đang thử reconnect...`
                );
                try {
                    // Xóa node cũ và thêm lại
                    const config = Nodes.find((n) => n.name === node.name);
                    if (config) {
                        manager.shoukaku.removeNode(node.name);
                        manager.shoukaku.addNode(config);
                        nodeKeeperLog.info(`Đã yêu cầu reconnect node "${node.name}".`);
                    }
                } catch (err) {
                    nodeKeeperLog.error(`Không reconnect được node "${node.name}":`, err.message);
                }
            }
        }
    };

    nodeKeeperInterval = setInterval(run, NODE_KEEPER_INTERVAL_MS);
    if (typeof nodeKeeperInterval.unref === 'function') nodeKeeperInterval.unref();
    nodeKeeperLog.info('Node Keeper đã khởi động, quét mỗi 60 giây.');
}

// ============================================================
// 11. Graceful Shutdown
// ============================================================
let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Nhận tín hiệu ${signal} — đang tắt bot an toàn...`);

    try {
        if (voicePresence) voicePresence.stop();
    } catch {
        /* bỏ qua */
    }
    try {
        if (maintenanceInterval) clearInterval(maintenanceInterval);
        if (nodeKeeperInterval) clearInterval(nodeKeeperInterval);
    } catch {
        /* bỏ qua */
    }

    try {
        for (const player of manager.players.values()) {
            await player.destroy().catch(() => {});
        }
    } catch (err) {
        log.warn('Không hủy được toàn bộ player:', err.message);
    }

    try {
        await storage.close();
    } catch (err) {
        log.warn('Không ghi nốt dữ liệu:', err.message);
    }
    try {
        server.close();
    } catch {
        /* bỏ qua */
    }
    try {
        client.destroy();
    } catch {
        /* bỏ qua */
    }

    log.info('Đã tắt bot.');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================================
// 12. Đăng nhập Discord
// ============================================================
client.login(process.env.DISCORD_TOKEN);
