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
        // Chỉ hoạt động nếu @sentry/node đã được cài; thiếu gói cũng không sao.
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

/** Chuyển mã trạng thái node Lavalink thành tên dễ đọc */
const NODE_STATES = {
    0: 'connecting',
    1: 'nearly',
    2: 'connected',
    3: 'reconnecting',
    4: 'disconnecting',
    5: 'disconnected'
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

    const nodes = manager
        ? [...manager.shoukaku.nodes.values()].map((node) => ({
              name: node.name,
              state: NODE_STATES[node.state] || String(node.state),
              players: node.stats?.playingPlayers ?? null,
              penalty: node.penalty ?? null
          }))
        : [];

    const connectedNodes = nodes.filter((node) => node.state === 'connected').length;
    const healthy = connectedNodes > 0 || nodes.length === 0;

    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'degraded',
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
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
        defaultSearchEngine: 'youtube',
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
        reconnectTries: 10,
        restTimeout: 10000
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
        log.info(`Không còn ai trong kênh thoại — rời phòng tại guild ${guildId}.`);
        const player = manager.players.get(guildId);

        if (player) {
            const channel = client.channels.cache.get(player.textId);
            await playerService.stop(player);
            if (channel && typeof channel.send === 'function') {
                await channel.send('👋 Không còn ai trong kênh thoại nên tôi đã rời phòng.').catch(() => {});
            }
        } else {
            try { await manager.destroyPlayer(guildId); } catch (_) {}
            try { await manager.shoukaku.leaveVoiceChannel(guildId); } catch (_) {}
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

manager.on('playerResolveError', (player, track, message) => {
    log.error(`Không phân giải được bài hát "${track?.title}":`, message);
});
manager.on('playerException', (_player, data) => log.error('Player exception:', data));
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
            log.info(`[Command /${interaction.commandName}] bởi ${interaction.user.tag} (guild: ${interaction.guildId})`);
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
