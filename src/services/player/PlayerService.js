/**
 * PlayerService — Điều phối phát nhạc, tích hợp Generation Guard.
 *
 * Là lớp trung gian giữa commands/buttons và Kazagumo Player.
 * Mọi hành động phát nhạc đều đi qua service này.
 *
 * Trách nhiệm chính:
 *  - Tạo/quản lý player, áp dụng cài đặt đã lưu của guild
 *  - Tìm kiếm có cache + fallback công khai (không dùng API nội bộ của Kazagumo)
 *  - Thực thi giới hạn hàng đợi
 *  - Vẽ bảng Now Playing dạng ephemeral / công khai và tự vô hiệu hoá khi hết hạn
 *  - Autoplay khi hết hàng đợi
 *  - Lưu cài đặt + lịch sử xuống đĩa
 */

const { KazagumoTrack } = require('kazagumo');

const { getState, removeState } = require('./PlayerState');
const queueService = require('../queue/QueueService');
const NowPlayingUI = require('../ui/NowPlayingUI');
const FilterService = require('../filters/FilterService');
const AutoplayService = require('../autoplay/AutoplayService');
const SearchCache = require('../cache/SearchCache');
const { createLogger } = require('../logger');
const {
    SEARCH_TIMEOUT_MS,
    PANEL_TICK_MS,
    DEFAULT_VOLUME,
    SEARCH_CACHE_MAX,
    SEARCH_CACHE_TTL_MS
} = require('../../config/constants');

class PlayerService {
    /**
     * @param {import('discord.js').Client} client - Discord client
     * @param {import('kazagumo').Kazagumo} manager - Kazagumo manager
     * @param {{ storage?: object, searchCache?: SearchCache, autoplayService?: object, logger?: object }} [deps]
     */
    constructor(client, manager, deps = {}) {
        this.client = client;
        this.manager = manager;
        this.log = deps.logger || createLogger('PlayerService');
        this.storage = deps.storage || null;
        this.searchCache = deps.searchCache || new SearchCache({ max: SEARCH_CACHE_MAX, ttlMs: SEARCH_CACHE_TTL_MS });
        this.autoplay = deps.autoplayService || new AutoplayService(manager);
    }

    // ==========================================================
    // Tiện ích nội bộ
    // ==========================================================

    /**
     * Bọc một promise với thời gian chờ tối đa.
     * @template T
     * @param {Promise<T>} promise
     * @param {number} ms
     * @param {string} desc - Mô tả dùng cho thông báo lỗi
     * @returns {Promise<T>}
     */
    withTimeout(promise, ms, desc) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Quá thời gian (${ms / 1000}s): ${desc}`)), ms);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    /**
     * Lưu cài đặt + lịch sử của guild xuống đĩa.
     * @param {string} guildId
     * @param {import('./PlayerState').PlayerState} state
     * @param {number} [volume]
     */
    persistState(guildId, state, volume) {
        if (!this.storage) return;
        const history = state.history.map((entry) => {
            const copy = { ...entry };
            delete copy.raw; // Không lưu object track gốc để file dữ liệu gọn nhẹ
            return copy;
        });
        this.storage.setGuild(guildId, {
            repeatMode: state.repeatMode,
            filter: state.filter,
            autoplay: state.autoplay,
            volume: Number.isFinite(volume) ? volume : null,
            history
        });
    }

    // ==========================================================
    // Tìm kiếm
    // ==========================================================

    /**
     * Chuyển kết quả Kazagumo thành dạng dữ liệu thô để cache (không kèm requester).
     * @param {{ type?: string, playlistName?: string, tracks?: object[] }} result
     * @returns {{ type: string, playlistName: string|undefined, raws: object[] }}
     */
    toRawResult(result) {
        return {
            type: result?.type || 'SEARCH',
            playlistName: result?.playlistName,
            raws: (result?.tracks || []).map((track) => track.raw).filter(Boolean)
        };
    }

    /**
     * Dựng lại kết quả tìm kiếm với người yêu cầu mới (không dùng lại instance cũ).
     * @param {{ type: string, playlistName?: string, raws: object[] }} raw
     * @param {object} requester
     * @returns {{ type: string, playlistName?: string, tracks: object[] }}
     */
    buildResult(raw, requester) {
        return {
            type: raw.type,
            playlistName: raw.playlistName,
            tracks: raw.raws.map((trackRaw) => new KazagumoTrack(trackRaw, requester))
        };
    }

    /**
     * Phân giải truy vấn trực tiếp qua Kazagumo (có fallback ép tiền tố tìm kiếm).
     * Trả về dữ liệu thô, KHÔNG gắn requester để cache dùng chung được.
     * @param {string} query
     * @returns {Promise<{ type: string, playlistName?: string, raws: object[] }>}
     */
    async resolveRaw(query) {
        const empty = { type: 'SEARCH', playlistName: undefined, raws: [] };

        try {
            const result = await this.withTimeout(this.manager.search(query), SEARCH_TIMEOUT_MS, 'Kazagumo search');
            if (result && result.tracks && result.tracks.length) return this.toRawResult(result);
        } catch (err) {
            this.log.warn(`Tìm kiếm thất bại cho "${query}":`, err.message);
        }

        // Fallback: nếu là từ khoá (không phải URL) thì ép tìm trên YouTube
        if (!/^https?:\/\//i.test(query)) {
            try {
                const forced = await this.withTimeout(
                    this.manager.search(`ytsearch:${query}`),
                    SEARCH_TIMEOUT_MS,
                    'ytsearch'
                );
                if (forced && forced.tracks && forced.tracks.length) return this.toRawResult(forced);
            } catch (err) {
                this.log.warn(`Fallback ytsearch thất bại cho "${query}":`, err.message);
            }
        }

        return empty;
    }

    /**
     * Tìm kiếm bài hát kèm cache và fallback.
     * @param {string} query - Từ khóa hoặc URL
     * @param {object} requester - Discord user
     * @returns {Promise<{ type: string, playlistName?: string, tracks: object[] }>}
     */
    async search(query, requester) {
        const key = SearchCache.normaliseKey(query);
        let raw = this.searchCache.get(key);

        if (raw) {
            this.log.debug(`Cache hit cho "${query}" (${raw.raws.length} kết quả).`);
        } else {
            raw = await this.resolveRaw(query);
            if (raw.raws.length) this.searchCache.set(key, raw);
        }

        return this.buildResult(raw, requester);
    }

    // ==========================================================
    // Player & hàng đợi
    // ==========================================================

    /**
     * Lấy hoặc tạo player cho guild, đồng thời áp dụng cài đặt đã lưu.
     * @param {{ guildId: string, textId: string, voiceId: string }} opts
     * @returns {Promise<object>} Kazagumo player
     */
    async getOrCreatePlayer({ guildId, textId, voiceId }) {
        const state = getState(guildId);
        const stored = this.storage ? this.storage.getGuild(guildId) : null;

        // Khôi phục cài đặt + lịch sử đã lưu (chỉ áp dụng một lần cho state mới)
        if (stored && !state.restored) {
            state.restored = true;
            if (stored.repeatMode) state.setRepeatMode(stored.repeatMode);
            if (stored.filter && FilterService.isValid(stored.filter)) {
                state.filter = FilterService.normalise(stored.filter);
                state.filterNeedsApply = state.filter !== FilterService.default;
            }
            if (typeof stored.autoplay === 'boolean') state.autoplay = stored.autoplay;
            if (!state.history.length && Array.isArray(stored.history)) state.history = stored.history;
            this.log.debug(`Đã khôi phục cài đặt guild ${guildId}.`);
        }

        let player = this.manager.players.get(guildId);

        // Nếu player đã bị destroy hoặc mất kết nối voice, dọn dẹp để tạo mới
        // Trong Shoukaku / Kazagumo: State = CONNECTING: 0, CONNECTED: 1, DISCONNECTING: 2, DISCONNECTED: 3
        if (player && ((player.state !== 1 && player.state !== 0) || !player.voiceId)) {
            try {
                await player.destroy();
            } catch {
                /* player đã chết */
            }
            this.manager.players.delete(guildId);
            player = null;
        }

        if (!player) {
            player = await this.manager.createPlayer({
                guildId,
                textId,
                voiceId,
                volume: stored && Number.isFinite(stored.volume) ? stored.volume : DEFAULT_VOLUME,
                deaf: true
            });
            this.log.info(`Đã tạo player mới cho guild ${guildId}.`);
        } else {
            if (textId && player.textId !== textId) player.setTextChannel(textId);
            if (voiceId && player.voiceId !== voiceId) player.setVoiceChannel(voiceId);
        }

        return player;
    }

    /**
     * Thêm bài hát vào hàng đợi (có kiểm tra giới hạn) và phát nếu đang rảnh.
     * @param {object} player - Kazagumo player
     * @param {object|object[]} tracks - Một track hoặc mảng track
     * @param {{ requesterId?: string, top?: boolean }} [options]
     * @returns {Promise<{ ok: boolean, added: number, trimmed: number, error: string|null, vars: object|null }>}
     */
    async enqueue(player, tracks, options = {}) {
        const list = (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean);
        if (!list.length) return { ok: false, added: 0, trimmed: 0, error: 'empty', vars: null };

        const { requesterId = null, top = false } = options;
        const check = queueService.canAdd(player, list.length, requesterId);

        if (!check.ok) {
            return { ok: false, added: 0, trimmed: list.length, error: check.error, vars: check.vars };
        }

        const accepted = list.slice(0, check.allowed);
        if (top) {
            // Chèn ngược để giữ đúng thứ tự ban đầu ở đầu hàng đợi
            for (let i = accepted.length - 1; i >= 0; i--) queueService.addTop(player, accepted[i]);
        } else {
            queueService.add(player, accepted);
        }

        if (!player.playing && !player.paused) {
            await player.play();
        }

        return {
            ok: true,
            added: accepted.length,
            trimmed: list.length - accepted.length,
            error: null,
            vars: null
        };
    }

    /**
     * Bỏ qua bài hiện tại, phát ngay bài mới (Play Skip).
     * @param {object} player - Kazagumo player
     * @param {object} track - Kazagumo track
     */
    playSkip(player, track) {
        const state = getState(player.guildId);
        state.incrementGeneration();

        queueService.addTop(player, track);
        if (player.playing || player.paused) {
            player.skip();
        } else {
            player.play();
        }
    }

    /**
     * Bỏ qua bài hiện tại (Skip).
     * @param {object} player - Kazagumo player
     * @returns {boolean} true nếu thành công
     */
    skip(player) {
        const state = getState(player.guildId);
        state.incrementGeneration();

        if (!player.playing && !player.paused) return false;
        player.skip();
        return true;
    }

    /**
     * Nhảy đến vị trí bài hát trong queue (Skip To).
     * @param {object} player - Kazagumo player
     * @param {number} position - Vị trí bài hát (1-based, hiển thị cho user)
     * @returns {{ ok: boolean, error?: string, vars?: object }}
     */
    skipTo(player, position) {
        const state = getState(player.guildId);

        if (!player.playing && !player.paused) {
            return { ok: false, error: 'common.noPlaying' };
        }
        if (position < 1 || position > player.queue.length) {
            return { ok: false, error: 'commands.skipto.invalidPosition', vars: { count: player.queue.length } };
        }

        state.incrementGeneration();

        // Xóa (position - 1) bài trước vị trí đó
        player.queue.splice(0, position - 1);
        player.skip();
        return { ok: true };
    }

    /**
     * Tạm dừng phát nhạc.
     * @param {object} player
     */
    pause(player) {
        player.pause(true);
    }

    /**
     * Tiếp tục phát nhạc.
     * @param {object} player
     */
    resume(player) {
        player.pause(false);
    }

    /**
     * Nhảy tới một mốc thời gian trong bài đang phát.
     * @param {object} player - Kazagumo player
     * @param {number} positionMs - Vị trí đích (ms)
     * @returns {Promise<{ ok: boolean, error?: string, vars?: object, position?: number }>}
     */
    async seek(player, positionMs) {
        const current = player.queue.current;
        if (!current) return { ok: false, error: 'common.noPlaying' };
        if (current.isStream || current.isSeekable === false) {
            return { ok: false, error: 'commands.seek.live' };
        }

        const duration = current.length || 0;
        if (positionMs < 0 || (duration && positionMs > duration)) {
            return { ok: false, error: 'commands.seek.outOfRange', vars: { duration: this.formatMs(duration) } };
        }

        await player.seek(positionMs);
        return { ok: true, position: positionMs };
    }

    /**
     * Định dạng nhanh mili-giây thành mm:ss (dùng cho thông báo lỗi).
     * @param {number} ms
     * @returns {string}
     */
    formatMs(ms) {
        const total = Math.floor((ms || 0) / 1000);
        const m = String(Math.floor(total / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        return `${m}:${s}`;
    }

    /**
     * Áp dụng bộ lọc âm thanh cho guild.
     * @param {object} player - Kazagumo player
     * @param {string} name - Tên bộ lọc
     * @returns {Promise<{ ok: boolean, filter: string, label: string }>}
     */
    async setFilter(player, name) {
        const state = getState(player.guildId);
        const result = await FilterService.apply(player, name);

        if (result.ok) {
            state.filter = result.filter;
            state.filterNeedsApply = false;
            this.persistState(player.guildId, state, player.volume);
        }

        return result;
    }

    /**
     * Bật/tắt autoplay cho guild.
     * @param {object} player - Kazagumo player
     * @param {boolean} enabled
     * @returns {boolean} Trạng thái mới
     */
    setAutoplay(player, enabled) {
        const state = getState(player.guildId);
        state.autoplay = Boolean(enabled);
        this.persistState(player.guildId, state, player.volume);
        return state.autoplay;
    }

    /**
     * Dừng phát, xoá hàng đợi và ngắt kết nối.
     * @param {object} player - Kazagumo player
     */
    async stop(player) {
        const state = getState(player.guildId);
        state.incrementGeneration();

        await this.finalisePanels(state, 'stopped');
        state.clearPanels();

        player.queue.length = 0;
        player.queue.current = null;
        try {
            await player.destroy();
        } catch {
            /* player đã chết */
        }
        this.manager.players.delete(player.guildId);

        this.persistState(player.guildId, state, player.volume);
    }

    /**
     * Phát lại bài vừa nghe gần nhất từ lịch sử.
     * Hỗ trợ cả lịch sử khôi phục từ đĩa (chưa có object track gốc → tìm lại theo URI).
     * @param {object} player - Kazagumo player
     * @returns {Promise<{ ok: boolean, track?: object, error?: string }>}
     */
    async previous(player) {
        const state = getState(player.guildId);

        if (state.history.length === 0) {
            return { ok: false, error: 'commands.previous.empty' };
        }

        const prevTrack = state.popFromHistory();

        let rawTrack = prevTrack.raw;
        if (!rawTrack) {
            // Lịch sử nạp từ đĩa: tìm lại bài hát theo URI hoặc tên
            const query = prevTrack.uri || `${prevTrack.title} ${prevTrack.author || ''}`.trim();
            const result = await this.search(query, player.queue.current?.requester || null);
            if (!result.tracks.length) {
                return { ok: false, error: 'commands.previous.empty' };
            }
            rawTrack = result.tracks[0];
        }

        state.incrementGeneration();

        queueService.addTop(player, rawTrack);
        if (player.playing || player.paused) {
            player.skip();
        } else {
            await player.play();
        }

        return { ok: true, track: rawTrack };
    }

    // ==========================================================
    // Bảng Now Playing
    // ==========================================================

    /**
     * Đăng ký bối cảnh interaction làm "kênh" hiển thị bảng Now Playing dạng ephemeral.
     * Gọi ngay sau khi command đã deferReply với cờ EPHEMERAL.
     * @param {import('discord.js').Interaction} interaction
     * @param {object} player - Kazagumo player
     * @returns {import('./PlayerState').PlayerState}
     */
    registerEphemeralContext(interaction, player) {
        const state = getState(player.guildId);
        state.setEphemeralContext({
            webhook: interaction.webhook,
            userId: interaction.user.id,
            channelId: interaction.channelId
        });
        return state;
    }

    /**
     * Xoá bối cảnh ephemeral của guild (dùng khi gặp lỗi để bảng không bị ghi đè).
     * @param {string} guildId
     */
    releaseEphemeralContext(guildId) {
        const state = getState(guildId);
        state.clearEphemeralContext();
        // Chỉ dừng ticker nếu không còn bảng công khai nào cần cập nhật
        if (!state.publicPanel) state.clearNowPlaying();
    }

    /**
     * Đăng ký bảng Now Playing công khai (do lệnh /nowplaying tạo) để ticker
     * tiến trình tiếp tục cập nhật nó.
     * @param {object} player - Kazagumo player
     * @param {import('discord.js').Message} message - Tin nhắn công khai vừa gửi
     */
    trackPublicPanel(player, message) {
        const state = getState(player.guildId);
        state.publicPanel = { channelId: message.channelId, message };
        state.touchPanel();
        this.startProgressTicker(player, state);
    }

    /**
     * Vẽ lại bảng Now Playing (ephemeral + public nếu có).
     * @param {object} player - Kazagumo player
     * @param {object} track - Track cần hiển thị
     * @param {import('./PlayerState').PlayerState} state
     * @param {string|null} [note] - Ghi chú hiển thị phía trên bảng (chỉ bảng ephemeral)
     */
    async renderPanels(player, track, state, note = null) {
        if (!track) return;

        // Ghi chú chỉ biến mất khi CHUYỂN BÀI, tránh bị xoá ngay sau khi hiện
        const trackKey = track.uri || track.title || String(track.identifier || '');
        const trackChanged = state.panelTrackKey !== trackKey;
        state.panelTrackKey = trackKey;
        if (note) {
            state.panelNote = note;
        } else if (trackChanged) {
            state.panelNote = null;
        }

        // Nút tự vô hiệu hoá nếu bảng bị bỏ quên quá lâu
        if (state.isPanelIdle()) state.panelDisabled = true;
        const disabled = state.panelDisabled;

        const { embed, components } = NowPlayingUI.create(player, track, state, { disabled });

        // --- 1. Bảng ephemeral (chỉ người gọi lệnh thấy) ---
        const ctx = state.getEphemeralContext();
        if (ctx) {
            try {
                // '@original' = tin nhắn trả lời gốc của interaction (chính là bảng này)
                await ctx.webhook.editMessage('@original', {
                    content: state.panelNote || '',
                    embeds: [embed],
                    components
                });
                state.nowPlayingChannelId = ctx.channelId;
            } catch (err) {
                // 10062: interaction hết hạn, 10008: tin nhắn đã bị xoá
                this.log.warn('Bảng Now Playing ephemeral không còn chỉnh sửa được:', err.message);
                state.clearEphemeralContext();
            }
        }

        // --- 2. Bảng công khai trong kênh chat (chỉ có khi dùng /nowplaying) ---
        if (state.publicPanel) {
            try {
                await state.publicPanel.message.edit({ embeds: [embed], components });
            } catch (err) {
                if (err && err.code === 10008) {
                    // Tin nhắn đã bị người dùng xoá
                    state.publicPanel = null;
                }
            }
        }
    }

    /**
     * Vẽ lại mọi bảng Now Playing đang mở của guild (tiện dụng cho các lệnh
     * thay đổi trạng thái như /pause, /volume, /repeat).
     * @param {object} player - Kazagumo player
     */
    async refreshPanels(player) {
        const state = getState(player.guildId);
        await this.renderPanels(player, player.queue.current, state);
    }

    /**
     * Vẽ lại bảng Now Playing ephemeral và khởi động ticker tiến trình.
     * @param {object} player - Kazagumo player
     * @param {object} track - Track cần hiển thị
     * @param {string|null} [note] - Ghi chú hiển thị phía trên bảng
     * @returns {Promise<boolean>} true nếu đã vẽ được bảng ephemeral
     */
    async renderEphemeralPanel(player, track, note = null) {
        const state = getState(player.guildId);
        const hasEphemeral = Boolean(state.getEphemeralContext());
        await this.renderPanels(player, track, state, note);
        this.startProgressTicker(player, state);
        return hasEphemeral;
    }

    /**
     * Chuyển mọi bảng đang mở sang trạng thái "đã kết thúc" và xoá nút bấm,
     * tránh để lại nút chết khiến người dùng bấm vào bị lỗi.
     * @param {import('./PlayerState').PlayerState} state
     * @param {'stopped'|'ended'} reason
     */
    async finalisePanels(state, reason) {
        const embed = NowPlayingUI.createStopped(reason);
        const payload = { content: '', embeds: [embed], components: [] };

        const ctx = state.getEphemeralContext();
        if (ctx) {
            await ctx.webhook.editMessage('@original', payload).catch(() => {});
        }

        if (state.publicPanel) {
            await state.publicPanel.message.edit({ embeds: [embed], components: [] }).catch(() => {});
        }
    }

    /**
     * Khởi động (hoặc khởi động lại) ticker cập nhật thanh tiến trình.
     * Chỉ chạy khi thực sự có bảng cần cập nhật.
     * @param {object} player - Kazagumo player
     * @param {import('./PlayerState').PlayerState} state
     */
    startProgressTicker(player, state) {
        if (state.progressInterval) {
            clearInterval(state.progressInterval);
            state.progressInterval = null;
        }
        if (!state.getEphemeralContext() && !state.publicPanel) return;

        state.progressInterval = setInterval(async () => {
            try {
                if (player.paused) return; // Đang tạm dừng thì giữ nguyên UI
                const currentTrack = player.queue.current;
                if (!currentTrack) {
                    state.clearNowPlaying();
                    return;
                }
                await this.renderPanels(player, currentTrack, state);
                if (!state.getEphemeralContext() && !state.publicPanel) {
                    state.clearNowPlaying();
                }
            } catch (err) {
                this.log.error('Lỗi cập nhật tiến trình Now Playing:', err);
            }
        }, PANEL_TICK_MS);

        // Không giữ tiến trình sống chỉ vì ticker này
        if (typeof state.progressInterval.unref === 'function') state.progressInterval.unref();
    }

    // ==========================================================
    // Vòng đời bài hát
    // ==========================================================

    /**
     * Xử lý sự kiện khi bài hát bắt đầu phát.
     * KHÔNG gửi tin nhắn vào kênh chat — chỉ cập nhật bảng Now Playing đang mở.
     * @param {object} player - Kazagumo player
     * @param {object} track - Track đang phát
     */
    async onTrackStart(player, track) {
        const state = getState(player.guildId);
        this.log.debug(`Bắt đầu phát "${track?.title}" tại guild ${player.guildId}.`);

        // Áp dụng bộ lọc đã lưu (chỉ một lần sau khi khôi phục từ đĩa)
        if (state.filterNeedsApply && state.filter !== FilterService.default) {
            try {
                await FilterService.apply(player, state.filter);
            } catch (err) {
                this.log.warn('Không áp dụng được bộ lọc đã lưu:', err.message);
            }
            state.filterNeedsApply = false;
        }

        if (state.progressInterval) {
            clearInterval(state.progressInterval);
            state.progressInterval = null;
        }

        await this.renderPanels(player, track, state);
        this.startProgressTicker(player, state);
    }

    /**
     * Xử lý sự kiện khi bài hát kết thúc.
     * Đưa bài vào history, lưu xuống đĩa, xử lý repeat mode.
     * @param {object} player - Kazagumo player
     * @param {object} track - Track vừa phát xong
     */
    onTrackEnd(player, track) {
        const state = getState(player.guildId);
        state.clearNowPlaying();

        if (track) {
            state.addToHistory({
                title: track.title,
                author: track.author,
                uri: track.uri,
                identifier: track.identifier,
                duration: track.length || track.duration || 0,
                thumbnail: track.thumbnail,
                requesterId: track.requester ? track.requester.id : null,
                requesterName: track.requester ? track.requester.globalName || track.requester.username : 'Unknown',
                raw: track,
                source: track.sourceName || 'unknown'
            });
            this.persistState(player.guildId, state, player.volume);
        }

        // Xử lý Repeat mode
        if (state.repeatMode === 'track' && track) {
            queueService.addTop(player, track);
        } else if (state.repeatMode === 'queue' && track) {
            queueService.add(player, track);
        }
    }

    /**
     * Xử lý khi player hết bài trong queue: thử autoplay, nếu không thì dọn dẹp.
     * @param {object} player - Kazagumo player
     */
    async onPlayerEmpty(player) {
        const state = getState(player.guildId);

        if (state.autoplay) {
            const seed = state.history[0];
            if (seed) {
                try {
                    const next = await this.autoplay.findRelated(
                        seed.raw || seed,
                        state.getRecentKeys(),
                        seed.raw?.requester || null
                    );
                    if (next) {
                        this.log.info(`Autoplay phát tiếp "${next.title}" tại guild ${player.guildId}.`);
                        state.incrementGeneration();
                        queueService.add(player, next);
                        await player.play();
                        return;
                    }
                } catch (err) {
                    this.log.warn('Autoplay thất bại, sẽ dừng player:', err.message);
                }
            }
        }

        await this.finalisePanels(state, 'ended');
        state.clearPanels();
        this.persistState(player.guildId, state, player.volume);
        player.destroy();
    }

    /**
     * Xử lý khi player bị hủy.
     * @param {string} guildId
     */
    onPlayerDestroy(guildId) {
        removeState(guildId);
    }
}

module.exports = PlayerService;
