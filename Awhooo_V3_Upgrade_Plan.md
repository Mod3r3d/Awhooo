# AWHOOO V3 — KẾ HOẠCH NÂNG CẤP TOÀN DIỆN

> **Repository:** https://github.com/Mod3r3d/Awhooo  
> **Nhánh tham chiếu:** `main`  
> **Ngày lập kế hoạch:** 16/11/2026  
> **Nền tảng hiện tại:** Node.js, Discord.js v14, Kazagumo, Shoukaku, Lavalink v4  
> **Mục tiêu:** Nâng cấp độ ổn định, khả năng phục hồi, tính an toàn, hiệu năng và trải nghiệm sử dụng; không viết lại dự án nếu chưa có lý do kỹ thuật rõ ràng.

---

## 1. Tổng quan và định hướng

Awhooo đã có nền tảng tương đối hoàn chỉnh cho một Discord Music Bot: kiến trúc tách lớp, slash commands, queue, player state theo Guild, cache tìm kiếm, autoplay, bộ lọc âm thanh, Now Playing UI, lưu trữ JSON, Docker và CI.

Vì vậy, V3 **không ưu tiên viết lại toàn bộ bot hoặc thay đổi stack công nghệ**. Trọng tâm là củng cố những luồng đang có và xử lý các vấn đề có thể gây lỗi khi hoạt động lâu dài hoặc khi nhiều người dùng thao tác cùng lúc.

### 1.1. Mục tiêu chính

1. Đảm bảo người dùng chỉ có thể điều khiển/dừng player theo đúng quyền hạn.
2. Đảm bảo bot phát hiện chính xác tình trạng Discord, Lavalink và Storage.
3. Tăng khả năng phục hồi khi Lavalink mất kết nối hoặc nguồn nhạc không phân giải được.
4. Giới hạn thời gian tìm kiếm và tránh truy vấn dư thừa khi node gặp sự cố.
5. Đồng bộ thao tác player và queue khi có nhiều yêu cầu đồng thời trong cùng Guild.
6. Cho phép nhiều người dùng có các phiên Now Playing độc lập.
7. Bảo đảm dữ liệu không bị mất do ghi JSON đồng thời hoặc do môi trường triển khai không có ổ đĩa bền vững.
8. Mở rộng kiểm thử để xác minh các tình huống lỗi thực tế, không chỉ các luồng thành công.

### 1.2. Nguyên tắc triển khai

- Giữ Node.js + Discord.js + Kazagumo + Shoukaku + Lavalink v4.
- Tiếp tục giữ các lớp `commands/`, `core/`, `interactions/`, `services/` và `utils/`.
- Không đưa logic nghiệp vụ vào `index.js` nếu có thể đặt trong service phù hợp.
- Không tạo thêm abstraction nếu chưa có nhu cầu sử dụng rõ ràng.
- Thay đổi theo từng giai đoạn nhỏ; mỗi giai đoạn phải có test và tiêu chí nghiệm thu.
- Không triển khai tự động chuyển player giữa các Lavalink node nếu chưa xác định được cách bảo toàn queue, track hiện tại, position và trạng thái voice.
- Không coi Docker `HEALTHCHECK` thất bại là cơ chế tự restart container. Cần cơ chế giám sát/orchestrator thực sự nếu muốn tự phục hồi tiến trình/container theo health status.
- Không đưa token, mật khẩu node hoặc thông tin nhạy cảm vào log, commit hay file cấu hình mẫu.

### 1.3. Ngoài phạm vi V3

Các hạng mục sau không phải ưu tiên của đợt nâng cấp nền tảng:

- Viết lại bot bằng Python hoặc framework khác.
- Chuyển ngay sang microservices.
- Triển khai Kubernetes khi quy mô hiện tại chưa cần.
- Chuyển ngay toàn bộ JSON sang PostgreSQL nếu bot chỉ chạy một instance và dung lượng dữ liệu còn nhỏ.
- Thêm hàng loạt command mới trước khi hoàn thiện độ ổn định của các command hiện có.

---

## 2. Đánh giá hiện trạng từ source code

> Đây là đánh giá tĩnh dựa trên mã nguồn và tài liệu trong repository tại nhánh `main`. Chưa chạy `npm test`, ESLint, Docker Compose hoặc thử phát nhạc trên Lavalink thực tế. Những kết luận liên quan đến runtime cần được xác minh bằng test ở các giai đoạn bên dưới.

### 2.1. Các thành phần đã có và nên giữ lại

| Thành phần | Hiện trạng quan sát được | Định hướng |
|---|---|---|
| Command routing | `CommandHandler`, `ButtonHandler`, `SelectHandler` | Giữ, bổ sung guard và xử lý đồng thời |
| Player | `PlayerService`, `PlayerState` | Giữ, giảm trách nhiệm tập trung và chuẩn hóa lifecycle |
| Queue | `QueueService` | Giữ, bổ sung thao tác an toàn/transactional |
| Search cache | LRU + TTL | Giữ, bổ sung giới hạn truy vấn và thống kê lỗi |
| Autoplay | `AutoplayService` | Giữ, dùng chung resolver với luồng `/play` |
| Voice presence | `VoicePresenceService` | Giữ, hợp nhất cơ chế cleanup |
| Storage | JSON, debounce, temp file + rename | Giữ ngắn hạn, sửa race condition và shutdown flush |
| Now Playing | Ephemeral/public panel, progress ticker | Giữ, chuyển sang quản lý nhiều session |
| Logging | Logger theo mức và phạm vi | Giữ, bổ sung correlation ID và metrics |
| Deployment | Dockerfile, Compose, GitHub Actions | Giữ, chuẩn hóa health/readiness và persistent storage |

### 2.2. Những vấn đề cần xử lý

| ID | Mức | Vấn đề | Vị trí chính |
|---|---|---|---|
| AWH-001 | P0 | `/stop` và nút `np_stop` cho phép dừng từ xa mà chưa kiểm tra quyền phù hợp | `src/commands/stop.js`, `src/interactions/nowPlayingButtons.js` |
| AWH-002 | P0 | Public Lavalink fallback được bật mặc định nếu không đặt biến môi trường | `src/config/lavalink.js` |
| AWH-003 | P0 | Health check chưa xét Discord readiness và Storage readiness; health hiện chỉ chấp nhận giai đoạn warming-up hoặc có node connected | `index.js` |
| AWH-004 | P1 | Node Keeper remove/add node đang `DISCONNECTED` mỗi chu kỳ; cần tránh xung đột với reconnect nội bộ của Shoukaku | `index.js` |
| AWH-005 | P1 | Search fallback tuần tự có thể kéo dài tổng thời gian rất lâu; `Promise.race` timeout không hủy Promise gốc | `PlayerService.js`, `utils/timeout.js` |
| AWH-006 | P1 | `ENABLE_SOUNDCLOUD_FALLBACK` có trong `.env.example` nhưng chưa thấy được nối vào luồng fallback thực tế | `.env.example`, `PlayerService.js`, `lavalink/application.yml` |
| AWH-007 | P1 | Tạo player và thao tác queue chưa được khóa theo Guild; các request đồng thời có nguy cơ cạnh tranh trạng thái | `PlayerService.js`, `QueueService.js`, `CommandHandler.js` |
| AWH-008 | P1 | `enqueue()` thêm bài vào queue trước `player.play()`; nếu play thất bại thì kết quả lỗi có thể để lại bài vừa thêm | `PlayerService.js` |
| AWH-009 | P1 | Một Guild chỉ lưu một `ephemeralContext`; yêu cầu `/play` tiếp theo có thể ghi đè context của người dùng trước | `PlayerState.js`, `PlayerService.js` |
| AWH-010 | P1 | `StorageService.flush()` chưa có cơ chế tuần tự hóa ghi; thay đổi phát sinh trong lúc flush có thể bị đánh dấu sạch không đúng thời điểm | `StorageService.js` |
| AWH-011 | P1 | Cleanup player/voice/state phân tán ở nhiều nơi; một số nhánh force cleanup chưa xóa PlayerState | `index.js`, `PlayerService.js`, `VoicePresenceService.js` |
| AWH-012 | P1 | Autoplay gọi `manager.search()` riêng, chưa dùng chung toàn bộ chiến lược resolver/cache/fallback của PlayerService | `AutoplayService.js`, `PlayerService.js` |
| AWH-013 | P2 | Cấu hình môi trường và tài liệu có biến chưa thấy được sử dụng; có tham chiếu `README_V2.md` không thấy trong danh sách root | `.env.example`, `README.md` |
| AWH-014 | P2 | `kazagumo-spotify` dùng version tag `latest`; Sentry được require tùy chọn nhưng chưa khai báo dependency tương ứng | `package.json`, `index.js` |
| AWH-015 | P2 | Chưa thấy kiểm thử bao phủ đầy đủ node recovery, race condition, multi-session, permission và lỗi playback | `tests/`, `.github/workflows/ci.yml` |

### 2.3. Đối chiếu với `bao-cao.md`

Báo cáo cũ mô tả một số lỗi đã có thay đổi trong source hiện tại:

| Nội dung báo cáo cũ | Tình trạng trong source hiện tại |
|---|---|
| Node bị Shoukaku loại khỏi memory và không được thêm lại | Đã có Node Keeper phát hiện node thiếu và gọi `addNode()` |
| Health check coi danh sách node rỗng là khỏe | Điều kiện hiện tại không còn dùng `nodes.length === 0`; tuy nhiên chưa xét đủ Discord/Storage readiness |
| Player lỗi không tự skip | Đã có handler `playerResolveError`, `playerException`, `playerStuck` thực hiện skip/stop |
| `/stop` bắt buộc ở cùng voice | Đã bỏ yêu cầu voice trong command; tuy nhiên quyền điều khiển từ xa đang quá rộng |
| VoicePresence không cleanup khi không có player | Đã có nhánh schedule leave khi không có player; vẫn cần kiểm tra cleanup tập trung |

Không sao chép nguyên văn các kết luận trong `bao-cao.md` vào kế hoạch triển khai như thể tất cả còn tồn tại. Cần kiểm tra lại trên source và runtime trước khi mở issue.

---

## 3. Kiến trúc mục tiêu

### 3.1. Kiến trúc logic

```text
Discord Gateway
      |
      v
Interaction Router
  |      |       |
  |      |       +--> SelectHandler
  |      +----------> ButtonHandler
  +-----------------> CommandHandler
                         |
                         v
                GuildPlayerCoordinator
                  |       |        |
                  |       |        +--> PlayerSessionManager
                  |       +-----------> QueueService
                  +-------------------> PlayerService
                                          |
                    +---------------------+----------------------+
                    |                     |                      |
                    v                     v                      v
               SearchResolver       PlaybackLifecycle       NowPlayingSession
                    |                     |                      |
                    v                     v                      v
               SearchCache          Lavalink Manager          Discord UI
                    |
                    v
             Source Fallback

Infrastructure:
- Lavalink node monitor / recovery controller
- Health & readiness endpoints
- StorageService
- Logger / metrics / error reporting
```

### 3.2. Trách nhiệm module mục tiêu

| Module | Trách nhiệm |
|---|---|
| `GuildPlayerCoordinator` | Khóa thao tác theo Guild, điều phối tạo player, enqueue, skip, stop và cleanup |
| `SearchResolver` | Tìm kiếm, timeout tổng, timeout theo node, cache, source fallback, circuit breaker |
| `PlaybackLifecycle` | Xử lý track start/end/exception/stuck, generation guard, giới hạn skip lặp |
| `PlayerSessionManager` | Lưu/khôi phục trạng thái player theo Guild và quản lý vòng đời session |
| `NowPlayingSessionManager` | Quản lý nhiều ephemeral/public panel, timeout và ticker |
| `LavalinkNodeMonitor` | Theo dõi state, reconnect, backoff, node health và failover policy |
| `HealthService` | Tách liveness, readiness và diagnostics |
| `StorageService` | Ghi tuần tự, snapshot nhất quán, retry, migration và shutdown flush |
| `PermissionService` | Kiểm tra cùng voice, DJ role và quyền quản trị |

Không bắt buộc tạo toàn bộ module mới ngay lập tức. Có thể triển khai tăng dần bằng cách trích xuất từ các file hiện có.

---

## 4. Lộ trình triển khai

# Giai đoạn 0 — Chuẩn bị và thiết lập baseline

**Mức ưu tiên:** Bắt buộc trước khi sửa logic lớn  
**Mục tiêu:** Biết chính xác trạng thái hiện tại, có khả năng rollback và tái hiện lỗi.

### Công việc

- [ ] Checkout nhánh mới `feature/awhooo-v3-hardening` từ commit `main` đã xác nhận.
- [ ] Lưu lại commit SHA dùng làm baseline.
- [ ] Chạy `npm ci`.
- [ ] Chạy `npm test` và lưu kết quả.
- [ ] Chạy `npm run lint` và lưu kết quả.
- [ ] Build Docker image bằng Dockerfile hiện tại.
- [ ] Kiểm tra cấu hình `.env.example` với config loader thực tế.
- [ ] Kiểm tra `docker compose config` trên môi trường không chứa secret thật.
- [ ] Tạo test fixture/mock cho Discord Client, Kazagumo, Shoukaku và Storage.
- [ ] Ghi nhận các số liệu baseline: thời gian search, thời gian tạo player, tỷ lệ lỗi phát, số reconnect, số panel update.

### Tệp liên quan

- `package.json`
- `package-lock.json`
- `.env.example`
- `.github/workflows/ci.yml`
- `tests/`

### Tiêu chí nghiệm thu

- Baseline test/lint/build được lưu lại.
- Có thể dựng lại môi trường phát triển từ lockfile.
- Không có token hoặc mật khẩu thật trong artifact/log.
- Mọi thay đổi tiếp theo đều có test liên quan.

---

# Giai đoạn 1 — Security, Configuration và Health Check

**Mức ưu tiên:** P0  
**Mục tiêu:** Ngăn thao tác phá hoại trái phép, loại bỏ cấu hình production không an toàn và phát hiện đúng trạng thái hệ thống.

## 1.1. Permission cho Stop / DJ controls

**Tệp cần xem/sửa:**

- `src/commands/stop.js`
- `src/interactions/nowPlayingButtons.js`
- `src/core/CommandHandler.js`
- `src/utils/permissions.js`
- `src/config/constants.js`
- Có thể bổ sung `src/services/permissions/PermissionService.js`

**Thiết kế quyền đề xuất:**

| Đối tượng | Quyền điều khiển |
|---|---|
| Thành viên ở cùng voice channel với bot | Các thao tác thông thường theo chính sách DJ của server |
| DJ Role được cấu hình | Có thể điều khiển player theo chính sách server |
| Người có quyền quản trị phù hợp | Có thể Stop từ xa để xử lý sự cố |
| Thành viên không có quyền, ở ngoài voice | Không được Stop từ xa |

**Yêu cầu triển khai:**

- [ ] Xây dựng hàm permission dùng chung cho slash command và button.
- [ ] Kiểm tra `guildId`, user, voice channel hiện tại và bot voice channel.
- [ ] Cho phép cấu hình DJ role theo Guild; không hardcode một role ID dùng chung cho mọi server.
- [ ] Chọn quyền quản trị từ Discord permission phù hợp; ghi rõ trong README.
- [ ] Nút `np_stop` không được bỏ qua permission check chỉ vì là emergency action.
- [ ] `/stop` vẫn có thể hoạt động khi player object không còn trong manager nếu người gọi đủ quyền.
- [ ] Ghi audit log: Guild, user ID, action, kết quả, lý do từ chối.
- [ ] Không ghi token hoặc dữ liệu bí mật vào audit log.

**Test cần có:**

- Người cùng voice được Stop.
- Người không ở voice và không có quyền quản trị bị từ chối.
- DJ role được cấp quyền đúng cấu hình.
- Admin/operator được Stop từ xa theo policy.
- Người không đủ quyền không thể dùng nút `np_stop`.
- Player không còn trong manager nhưng bot vẫn còn trong voice: cleanup được thực hiện an toàn nếu người gọi đủ quyền.

## 1.2. Chuẩn hóa Lavalink configuration

**Tệp cần sửa:**

- `src/config/lavalink.js`
- `src/config/constants.js`
- `.env.example`
- `docker-compose.yml`
- `README.md`

**Yêu cầu:**

- [ ] Production không tự động sử dụng public fallback.
- [ ] Chỉ bật public node khi người triển khai chủ động cấu hình cho môi trường development/test.
- [ ] Chuẩn hóa parsing boolean, tránh so sánh chuỗi case-sensitive như `!== 'false'`.
- [ ] Validate `LAVALINK_NODES` khi startup và báo lỗi dễ hiểu nếu JSON sai.
- [ ] Phát hiện node trùng `name`, URL không hợp lệ hoặc thiếu auth.
- [ ] Không dùng password mặc định trong production.
- [ ] Kiểm tra thứ tự ưu tiên `LAVALINK_NODES`, custom node và public fallback; tài liệu phải phản ánh đúng.
- [ ] Log node name và host đã được che thông tin nhạy cảm khi cần; không log auth.

**Cấu hình môi trường mục tiêu:**

```env
NODE_ENV=production
LAVALINK_NODES=[{"name":"Primary","url":"lavalink.example.com:443","auth":"CHANGE_ME","secure":true}]
LAVALINK_USE_PUBLIC_FALLBACK=false
```

Ví dụ trên chỉ là mẫu, không phải node thật. Không commit secret vào repository.

## 1.3. Tách Health, Liveness và Readiness

**Tệp cần sửa:**

- `index.js`
- Có thể thêm `src/services/health/HealthService.js`
- `Dockerfile`
- `docker-compose.yml`

**Endpoint mục tiêu:**

| Endpoint | Ý nghĩa | Điều kiện |
|---|---|---|
| `GET /health/live` | Tiến trình Node.js còn phản hồi | Trả 200 khi HTTP server và event loop còn phục vụ request |
| `GET /health/ready` | Có thể nhận công việc phát nhạc | Discord Ready, storage initialized và tối thiểu một Lavalink node connected |
| `GET /health/diagnostics` | Thống kê chi tiết phục vụ quản trị | Trả trạng thái từng dependency, player, cache, memory và uptime |

**Yêu cầu:**

- [ ] Health response có `status`, `timestamp`, `uptime`, `checks` và `version`.
- [ ] Readiness xét Discord Client, Lavalink node và Storage.
- [ ] Có trạng thái warming-up với thời hạn cấu hình được; hết thời hạn phải báo not-ready nếu dependency chưa sẵn sàng.
- [ ] Không để `nodes=[]` mặc nhiên thành healthy.
- [ ] Diagnostics không trả token, auth, secret, nội dung `.env` hoặc thông tin cá nhân không cần thiết.
- [ ] Xem xét bảo vệ diagnostics bằng secret hoặc chỉ mở trong internal network.
- [ ] Không dựa vào Docker `HEALTHCHECK` như một cơ chế restart duy nhất.
- [ ] Nếu cần restart khi container unhealthy, chọn supervisor/orchestrator hoặc external monitor có hành vi restart rõ ràng.

**Tiêu chí nghiệm thu:**

- Discord offline → readiness thất bại.
- Không có Lavalink node → readiness thất bại sau thời gian warming-up.
- Storage không init → readiness thất bại.
- Node phục hồi và Discord Ready → readiness chuyển lại thành healthy.
- Liveness vẫn phân biệt được tiến trình sống với dependency đang lỗi.

---

# Giai đoạn 2 — Guild Player Coordinator và Queue Consistency

**Mức ưu tiên:** P1  
**Mục tiêu:** Không để các thao tác đồng thời tạo player trùng, thêm queue vượt giới hạn hoặc làm queue sai trạng thái.

## 2.1. Thêm keyed async lock theo Guild

**Tệp liên quan:**

- `src/services/player/PlayerService.js`
- `src/services/queue/QueueService.js`
- `src/core/CommandHandler.js`
- Có thể thêm `src/services/player/GuildPlayerCoordinator.js`
- Có thể thêm `src/utils/KeyedMutex.js`

**Yêu cầu:**

- [ ] Mỗi Guild có một lock độc lập; Guild A không chặn Guild B.
- [ ] Các thao tác cần tuần tự hóa: create player, enqueue, playskip, playtop, skipto, stop và cleanup.
- [ ] Không giữ lock trong thời gian network search dài nếu không cần thiết.
- [ ] Kiểm tra player sau khi lấy lock; không dùng tham chiếu player cũ nếu lifecycle đã thay đổi.
- [ ] Lock phải được giải phóng trong `finally` kể cả khi Promise reject hoặc timeout.
- [ ] Có timeout hoặc cơ chế chống lock bị giữ vô hạn.
- [ ] Không tạo lock map tăng không giới hạn; xóa lock khi không còn tác vụ chờ và Guild không còn session.

## 2.2. Sửa quy trình enqueue transactional

**Vấn đề cần xử lý:** `enqueue()` hiện thêm track vào queue rồi mới gọi `player.play()`. Nếu `play()` thất bại, hàm trả về lỗi nhưng các track có thể vẫn nằm trong queue.

**Thiết kế mục tiêu:**

1. Kiểm tra input và requester.
2. Lấy Guild lock.
3. Kiểm tra trạng thái player và queue capacity.
4. Thêm track theo một thao tác có thể xác định chính xác những phần tử vừa thêm.
5. Nếu player đang idle, bắt đầu playback.
6. Nếu playback khởi tạo thất bại, rollback những phần tử vừa thêm hoặc chuyển session sang trạng thái recoverable được xác định rõ.
7. Trả kết quả phản ánh chính xác số bài đã thêm, bị từ chối và còn trong queue.
8. Nhả lock.

**Yêu cầu bổ sung:**

- [ ] Đảm bảo queue limit không bị vượt khi hai request cùng lúc.
- [ ] Đảm bảo per-user limit không bị vượt khi hai request cùng user cùng lúc.
- [ ] Quy định rõ `MAX_QUEUE_SIZE` có tính bài đang phát hay chỉ tính bài chờ.
- [ ] Kiểm tra playlist lớn, playlist rỗng và playlist bị giới hạn bởi `MAX_PLAYLIST_LOAD`.
- [ ] Test rollback khi `player.play()` reject và khi timeout.
- [ ] Không rollback nhầm track do người khác thêm trong một thao tác tiếp theo.

## 2.3. Chuẩn hóa command cooldown đồng thời

**Tệp liên quan:**

- `src/core/CommandHandler.js`
- `src/services/cooldown/CooldownService.js`
- `tests/commandHandler.test.js`
- `tests/cooldown.test.js`

**Yêu cầu:**

- [ ] Dùng atomic reservation/lock cho cặp `userId + commandName`.
- [ ] Hai command đồng thời không được cùng vượt qua `peek()` trước khi command đầu tiên đặt cooldown.
- [ ] Nếu command thất bại do lỗi hệ thống, giải phóng reservation theo policy.
- [ ] Giữ nguyên nguyên tắc không phạt cooldown khi preflight thất bại do thiếu voice/permission.
- [ ] Có test hai interaction cùng đến trong một khoảng thời gian rất ngắn.

### Tiêu chí nghiệm thu giai đoạn 2

- 20 yêu cầu tạo player đồng thời trong một Guild không sinh nhiều player.
- Hai Guild khác nhau vẫn xử lý độc lập.
- Queue không vượt giới hạn ở tải đồng thời.
- `play()` thất bại không để lại track mồ côi ngoài policy đã định.
- Cooldown không bị bypass bởi request đồng thời.

---

# Giai đoạn 3 — Search Resolver, Source Fallback và Playback Reliability

**Mức ưu tiên:** P1  
**Mục tiêu:** Tìm kiếm có thời hạn rõ ràng, tránh retry kéo dài và xử lý lỗi nguồn phát có kiểm soát.

## 3.1. Tách SearchResolver khỏi PlayerService

**Tệp liên quan:**

- `src/services/player/PlayerService.js`
- `src/services/cache/SearchCache.js`
- `src/services/autoplay/AutoplayService.js`
- Có thể thêm `src/services/search/SearchResolver.js`
- Có thể thêm `src/services/search/NodeCircuitBreaker.js`
- `src/utils/timeout.js`

**Yêu cầu:**

- [ ] Resolver nhận query, requester, search mode và timeout budget.
- [ ] Có **global deadline** cho toàn bộ lần search, không để timeout mỗi node cộng dồn vô hạn.
- [ ] Có timeout riêng cho mỗi node.
- [ ] Không thử lại cùng một node/query không cần thiết.
- [ ] Chỉ chọn node state CONNECTED.
- [ ] Giới hạn số node được thử cho mỗi query.
- [ ] Có concurrency limit để nhiều user không tạo hàng loạt request tìm kiếm đồng thời.
- [ ] Cache chỉ kết quả hợp lệ; không cache lỗi/empty result quá lâu.
- [ ] Giữ cache key đã normalize và dựng track mới với requester hiện tại.
- [ ] Thống kê cache hit/miss, search latency, timeout, node failure và empty result.

**Timeout mục tiêu để bắt đầu tuning:**

| Hạng mục | Giá trị khởi điểm |
|---|---:|
| Tổng search deadline | 10–15 giây |
| Timeout mỗi node | 4–6 giây |
| Số node tối đa thử tuần tự | 2–3 node |
| Số search đồng thời | Cấu hình được bằng env |

Các con số trên là cấu hình khởi điểm cần benchmark, không phải cam kết hiệu năng. Không được để nhiều tầng timeout làm tổng thời gian vượt budget đã khai báo.

## 3.2. Xử lý Promise timeout và hủy request

Hiện `withTimeout()` dùng `Promise.race()`. Cơ chế này chỉ dừng chờ kết quả, không tự dừng Promise bên dưới.

**Yêu cầu:**

- [ ] Kiểm tra API của Kazagumo/Shoukaku có hỗ trợ cancellation/AbortSignal cho từng loại request hay không.
- [ ] Nếu API không hỗ trợ hủy, ghi nhận request timeout và giới hạn số tác vụ còn chạy nền.
- [ ] Không giả vờ rằng `Promise.race()` đã hủy network request.
- [ ] Bảo đảm listener/timer được dọn dẹp khi resolve, reject hoặc timeout.
- [ ] Có test Promise resolve trước timeout, reject trước timeout và timeout trước khi Promise kết thúc.

## 3.3. Circuit Breaker cho Lavalink nodes

**Yêu cầu:**

- [ ] Theo dõi tỷ lệ timeout/lỗi theo node trong một cửa sổ thời gian.
- [ ] Node vượt ngưỡng lỗi chuyển sang trạng thái open và tạm thời không được chọn để search.
- [ ] Sau cooldown chuyển half-open và thử một số request giới hạn.
- [ ] Thành công thì đóng circuit; thất bại thì mở lại với backoff.
- [ ] Circuit breaker không thay thế reconnect của Shoukaku.
- [ ] Dùng jitter cho backoff để tránh tất cả node reconnect cùng lúc.
- [ ] Không log cảnh báo liên tục mỗi vài giây cho cùng một lỗi kéo dài.

## 3.4. Hoàn thiện Lavalink Node Keeper

**Tệp cần xem/sửa:**

- `index.js`
- Có thể tách `src/services/lavalink/LavalinkNodeMonitor.js`
- `src/config/lavalink.js`

**Hiện trạng:** Node Keeper đang quét mỗi 60 giây, thêm lại node không còn trong Shoukaku và remove/add node có `state === 3`.

**Rủi ro:** Việc remove/add node mỗi chu kỳ có thể can thiệp vào retry/reconnect nội bộ của Shoukaku hoặc gây reconnect lặp khi node thực tế vẫn đang phục hồi.

**Yêu cầu:**

- [ ] Đọc đúng lifecycle/event của phiên bản Shoukaku đã khóa trong `package-lock.json`.
- [ ] Chỉ add lại node khi node thực sự đã bị loại khỏi manager hoặc đã quá thời gian reconnect policy.
- [ ] Không remove/add node chỉ vì quan sát thấy `state === 3` trong một lần poll.
- [ ] Thêm per-node lock và cooldown để không tạo nhiều lần `addNode()`.
- [ ] Backoff tăng dần có jitter.
- [ ] Ghi nhận thời điểm disconnect, số lần reconnect, thời gian phục hồi và nguyên nhân nếu có.
- [ ] Có test node missing, disconnected ngắn hạn, reconnect thành công và reconnect thất bại liên tục.

## 3.5. Source fallback YouTube Music → SoundCloud

**Tệp liên quan:**

- `src/services/player/PlayerService.js`
- `src/services/autoplay/AutoplayService.js`
- `src/config/constants.js`
- `.env.example`
- `lavalink/application.yml`

**Yêu cầu:**

- [ ] Kiểm tra chính xác cú pháp search prefix và khả năng phát của Lavalink/LavaSrc phiên bản đang dùng.
- [ ] Khi nguồn primary không tìm thấy hoặc không phát được, mới chuyển sang nguồn fallback.
- [ ] `ENABLE_SOUNDCLOUD_FALLBACK` phải thực sự điều khiển logic; nếu không triển khai thì xóa khỏi `.env.example`.
- [ ] Không fallback với mọi lỗi một cách mù quáng; phân biệt lỗi track không tồn tại, lỗi tạm thời, lỗi quyền và lỗi node.
- [ ] Bảo toàn requester, title/artist phù hợp, queue order và thông tin nguồn.
- [ ] Tránh phát trùng một track đã thử.
- [ ] Có giới hạn số lần fallback cho mỗi track.
- [ ] Nếu fallback thất bại, skip đúng một lần và thông báo có kiểm soát.

**Lưu ý:** Bật `soundcloud: true` trong `application.yml` chỉ cho phép source hoạt động; điều đó tự nó chưa chứng minh bot đã có fallback thực tế. Phải kiểm tra luồng search/play trong code.

## 3.6. Chuẩn hóa PlaybackLifecycle

**Tệp liên quan:**

- `index.js`
- `src/services/player/PlayerService.js`
- `src/services/player/PlayerState.js`
- Có thể thêm `src/services/player/PlaybackLifecycle.js`

**Yêu cầu:**

- [ ] Tập trung xử lý `playerStart`, `playerEnd`, `playerEmpty`, `playerResolveError`, `playerException`, `playerStuck`, `playerClosed`.
- [ ] Có guard để cùng một lỗi không gọi skip/stop nhiều lần.
- [ ] Dùng playback generation để vô hiệu hóa tác vụ cũ khi skip/stop/playskip.
- [ ] Kiểm tra generation trước khi tiếp tục tác vụ bất đồng bộ đã bắt đầu từ track cũ.
- [ ] Track lỗi không được lặp vô hạn do repeat mode hoặc autoplay.
- [ ] Không gửi thông báo công khai liên tục trong một chuỗi lỗi; có cooldown/dedupe theo track và Guild.
- [ ] Khi không còn track phát được, panel chuyển sang trạng thái kết thúc và player được cleanup.

## 3.7. Dùng chung resolver cho Autoplay

**Tệp cần sửa:** `src/services/autoplay/AutoplayService.js`, `src/services/player/PlayerService.js`

**Yêu cầu:**

- [ ] Autoplay dùng SearchResolver chung thay vì gọi `manager.search()` độc lập.
- [ ] Giữ loại trừ track đã phát gần đây.
- [ ] Có giới hạn số truy vấn autoplay và tổng timeout riêng.
- [ ] Không để autoplay chạy nhiều lần song song cho cùng một Guild.
- [ ] Khi autoplay thất bại, kết thúc player sạch sẽ và không tạo vòng retry vô hạn.
- [ ] Kiểm tra seed thiếu author/title/URI.

### Tiêu chí nghiệm thu giai đoạn 3

- Search luôn kết thúc trong global deadline cấu hình.
- Node timeout không làm tổng thời gian search tăng theo số node không giới hạn.
- Node đang mất kết nối không bị chọn liên tục.
- Search/Autoplay dùng chung chiến lược resolver.
- Fallback chỉ chạy khi được bật và theo đúng lỗi policy.
- Một track gặp nhiều event lỗi không gây skip nhiều lần hoặc vòng lặp vô hạn.

---

# Giai đoạn 4 — Now Playing Multi-session và UI Responsiveness

**Mức ưu tiên:** P1  
**Mục tiêu:** Cho phép nhiều người cùng sử dụng player mà không ghi đè context của nhau, giảm cập nhật UI không cần thiết.

## 4.1. Quản lý nhiều ephemeral sessions

**Tệp cần sửa:**

- `src/services/player/PlayerState.js`
- `src/services/player/PlayerService.js`
- `src/services/ui/NowPlayingUI.js`
- `src/interactions/nowPlayingButtons.js`
- `src/services/ui/QueueUI.js`

**Hiện trạng:** `PlayerState` có một `ephemeralContext`. Khi user khác gọi `/play`, context mới có thể ghi đè context cũ.

**Thiết kế mục tiêu:**

```text
PlayerState
  ephemeralSessions: Map<sessionId, {
    userId,
    channelId,
    webhook,
    expiresAt,
    lastInteractionAt
  }>
  publicPanels: Map<messageId, {
    channelId,
    message,
    createdAt,
    lastInteractionAt
  }>
```

**Yêu cầu:**

- [ ] Mỗi interaction tạo session riêng.
- [ ] Session có TTL; không lưu webhook token lâu hơn mức cần thiết.
- [ ] Có giới hạn số session trên mỗi Guild.
- [ ] Tương tác với panel nào thì chỉ refresh session/panel đó.
- [ ] Lỗi edit một panel không làm ảnh hưởng các panel khác.
- [ ] Dọn session khi expired, message deleted, webhook expired hoặc user session không còn hợp lệ.
- [ ] Chống tạo ticker trùng cho cùng một Guild.
- [ ] Có test hai hoặc nhiều user gọi `/play` gần như đồng thời.

## 4.2. Tối ưu progress ticker

**Hiện trạng:** `PANEL_TICK_MS` mặc định 10 giây; ticker gọi edit cho các panel còn sống.

**Yêu cầu:**

- [ ] Chỉ cập nhật panel thực sự còn hiệu lực.
- [ ] Không tạo `setInterval` riêng cho từng user nếu có thể dùng một scheduler theo Guild.
- [ ] Không gửi edit nếu embed/position hiển thị không thay đổi đáng kể.
- [ ] Xử lý rate limit và lỗi Discord API.
- [ ] Dừng ticker ngay khi stop, destroy hoặc không còn panel.
- [ ] Không cập nhật khi bot đang shutdown.
- [ ] Đo số lần edit/minute và số edit thất bại.

## 4.3. Tối ưu phản hồi `/play`

**Tệp liên quan:** `src/commands/play.js`, `src/services/player/PlayerService.js`, `src/services/ui/NowPlayingUI.js`

**Yêu cầu:**

- [ ] Interaction được defer/acknowledge đúng hạn.
- [ ] Hiển thị trạng thái tìm kiếm, kết nối voice và enqueue rõ ràng.
- [ ] Không hiển thị bảng Now Playing với trạng thái phát thành công trước khi có xác nhận track start nếu thiết kế yêu cầu xác nhận playback.
- [ ] Có trạng thái “đang chờ phát” nếu queue đã nhận bài nhưng Lavalink chưa phát.
- [ ] Khi resolve/play thất bại, cập nhật panel thành lỗi hoặc trạng thái kết thúc phù hợp.
- [ ] Không tạo thêm nhiều message công khai để báo trạng thái cho mỗi bước.

### Tiêu chí nghiệm thu giai đoạn 4

- Hai user có thể gọi `/play` và có ephemeral panel riêng.
- Panel của user A không bị user B ghi đè.
- Stop/skip cập nhật mọi panel còn hợp lệ.
- Ticker không tiếp tục chạy sau khi panel/player kết thúc.
- Không có lỗi interaction token/webhook hết hạn gây spam log.

---

# Giai đoạn 5 — Storage Reliability và Persistence

**Mức ưu tiên:** P1  
**Mục tiêu:** Không mất thay đổi mới khi flush đang chạy; khôi phục dữ liệu có kiểm soát.

## 5.1. Tuần tự hóa flush và snapshot nhất quán

**Tệp cần sửa:** `src/services/storage/StorageService.js`, `tests/storage.test.js`

**Vấn đề cần xử lý:**

- Nhiều lệnh gọi `flush()` có thể chạy chồng.
- Cùng dùng một `.tmp` path.
- Nếu data thay đổi trong lúc một flush đang ghi, việc set `dirty = false` ở cuối flush có thể che mất thay đổi mới phát sinh.

**Yêu cầu:**

- [ ] Chỉ cho phép một flush chạy tại một thời điểm.
- [ ] Tạo snapshot/sequence version trước khi serialize.
- [ ] Chỉ đánh dấu snapshot là persisted nếu không có mutation mới hơn trong lúc ghi.
- [ ] Nếu dữ liệu đổi trong khi đang ghi, lên lịch flush tiếp.
- [ ] Temp file phải nằm cùng filesystem/thư mục với file đích để rename atomic.
- [ ] Xử lý lỗi write/rename và retry có backoff.
- [ ] `close()` phải chờ toàn bộ flush đang chạy và ghi hết dirty data.
- [ ] Có test mutation xảy ra trong lúc `fs.writeFile()` đang pending.
- [ ] Có test process shutdown trong lúc flush pending.

## 5.2. Schema validation và migration

**Yêu cầu:**

- [ ] Kiểm tra kiểu dữ liệu của từng guild record khi load.
- [ ] Không tin tưởng hoàn toàn JSON trên đĩa.
- [ ] Có migration theo `version`.
- [ ] Dữ liệu không hợp lệ được backup và báo cáo; tránh reset toàn bộ dữ liệu nếu chỉ một guild record hỏng.
- [ ] Có giới hạn số history entry và kích thước payload.
- [ ] Chỉ lưu trường cần thiết; không serialize Discord object đầy đủ.

## 5.3. Chính sách persistence theo môi trường

| Môi trường | Đề xuất |
|---|---|
| Local development | JSON trong `./data` |
| Một instance production | JSON + persistent disk hoặc SQLite |
| Nhiều bot instance/replica | Database dùng chung như PostgreSQL |

**Yêu cầu triển khai:**

- [ ] README nói rõ filesystem nào ephemeral và cách gắn Persistent Disk.
- [ ] `DATA_DIR` trỏ vào mount point bền vững khi chạy production.
- [ ] Có backup định kỳ và hướng dẫn restore.
- [ ] Không dùng chung một file JSON trên nhiều replica.
- [ ] Nếu chuyển SQLite, phải có migration/import tool từ JSON.

### Tiêu chí nghiệm thu giai đoạn 5

- Thay đổi trong lúc flush không bị mất.
- Nhiều lệnh setGuild liên tiếp được ghi đầy đủ.
- Restart có kiểm soát giữ lại settings/history.
- File JSON hỏng có backup và không làm bot crash không cần thiết.
- Shutdown chờ hoàn tất thao tác ghi dữ liệu trong giới hạn hợp lý.

---

# Giai đoạn 6 — Cleanup, Lifecycle và Graceful Shutdown

**Mức ưu tiên:** P1  
**Mục tiêu:** Mọi con đường dừng player đều kết thúc ở một trạng thái nhất quán.

## 6.1. Hợp nhất cleanup

**Tệp liên quan:**

- `src/services/player/PlayerService.js`
- `src/services/voice/VoicePresenceService.js`
- `src/services/player/PlayerState.js`
- `index.js`

**Yêu cầu:**

- [ ] Tạo một cleanup flow duy nhất, idempotent.
- [ ] Cleanup gồm panel/ticker, queue, player, Shoukaku voice connection, Discord voice state và PlayerState.
- [ ] Không gọi nhiều lần `destroyPlayer()`/`leaveVoiceChannel()` gây side effect khó đoán.
- [ ] Có timeout cho các thao tác network.
- [ ] Dù một bước cleanup lỗi, các bước độc lập tiếp theo vẫn được thử.
- [ ] Phân biệt `stop playback`, `destroy player` và `force cleanup`.
- [ ] `forceCleanupVoice()` phải dọn state/session đúng policy ngay cả khi player không tồn tại.
- [ ] VoicePresence dùng cleanup flow thay vì tự triển khai một nhánh khác.

## 6.2. Graceful shutdown và fatal errors

**Tệp cần sửa:** `index.js`, `StorageService.js`, `VoicePresenceService.js`

**Yêu cầu:**

- [ ] Khi nhận SIGTERM/SIGINT: ngừng nhận công việc mới, ngừng maintenance timer, dừng voice presence.
- [ ] Có thời hạn tổng cho shutdown.
- [ ] Dừng/destroy player theo policy đã định.
- [ ] Flush storage và đợi hoàn tất.
- [ ] Đóng Discord client và HTTP server.
- [ ] Không gọi `process.exit(0)` trước khi các tác vụ quan trọng kết thúc.
- [ ] `uncaughtException` phải được coi là trạng thái fatal: log, thử cleanup tối thiểu và thoát với mã lỗi khác 0 để supervisor xử lý.
- [ ] `unhandledRejection` phải được theo dõi; phân loại lỗi có thể phục hồi và lỗi nghiêm trọng, không chỉ log rồi tiếp tục vô thời hạn.
- [ ] Tránh đăng ký listener/timer lặp khi bootstrap hoặc test khởi tạo nhiều lần.

### Tiêu chí nghiệm thu giai đoạn 6

- Dừng bot không để lại timer/player/voice session nội bộ.
- Storage flush xong trước khi process exit bình thường.
- Fatal exception không để tiến trình tiếp tục với trạng thái không xác định.
- Cleanup gọi hai lần không gây lỗi hoặc tạo trạng thái sai.

---

# Giai đoạn 7 — Testing, Observability và Production Readiness

**Mức ưu tiên:** P1/P2  
**Mục tiêu:** Có thể phát hiện regression trước deploy và xác định lỗi production bằng số liệu.

## 7.1. Bổ sung unit/integration tests

**Các test bắt buộc:**

| Nhóm | Test case |
|---|---|
| Permission | Same voice, DJ role, admin, user không quyền, button Stop |
| Health | Discord offline, Lavalink offline, storage offline, warming-up, ready |
| Node monitor | Node missing, disconnected ngắn, reconnect success/failure, backoff |
| Search | Global timeout, per-node timeout, duplicate node, cache hit/miss, concurrency limit |
| Fallback | Primary success, primary 403/exception, SoundCloud success, all source failure |
| Playback | Resolve error, exception, stuck, skip dedupe, repeat mode, autoplay fail |
| Coordinator | Create player đồng thời, enqueue đồng thời, stop trong lúc enqueue |
| Queue | Guild limit, per-user limit, playlist limit, rollback khi play reject |
| Now Playing | Nhiều ephemeral sessions, public panel, expired token, deleted message |
| Storage | Concurrent flush, mutation while flush, corrupt file, migration, close while dirty |
| Cleanup | Player tồn tại, player không tồn tại, voice còn kết nối, cleanup lặp |
| Shutdown | SIGTERM flow, timeout, storage flush, HTTP close |

## 7.2. Metrics và logging

**Metric đề xuất:**

- `discord_gateway_ready` / gateway reconnect count.
- `lavalink_nodes_connected` theo node name.
- `lavalink_reconnect_total` và reconnect duration.
- `search_requests_total` theo source/result/error.
- `search_duration_ms`.
- `search_timeout_total`.
- `playback_start_total`, `playback_exception_total`, `playback_stuck_total`.
- `playback_fallback_total` theo nguồn primary/fallback.
- `queue_size` theo Guild (ẩn ID nhạy cảm hoặc dùng label giới hạn).
- `player_active_total`.
- `nowplaying_edit_total` và lỗi edit.
- `storage_flush_duration_ms`, `storage_flush_error_total`.
- `process_memory_rss_bytes`, `process_uptime_seconds`.

**Logging:**

- [ ] Có correlation ID cho mỗi interaction/search/playback attempt.
- [ ] Log Guild ID và user ID ở dạng phù hợp; không log nội dung bí mật.
- [ ] Có log level và component name nhất quán.
- [ ] Dedupe log cho lỗi node lặp lại.
- [ ] Không log toàn bộ object Discord/Kazagumo quá lớn.
- [ ] Có thể bật debug theo môi trường mà không làm lộ secret.

## 7.3. CI/CD

**Tệp cần sửa:** `.github/workflows/ci.yml`, `package.json`, `Dockerfile`

**Yêu cầu:**

- [ ] Chạy lint.
- [ ] Chạy unit tests.
- [ ] Chạy integration tests với mock/service container nếu phù hợp.
- [ ] Build Docker image.
- [ ] Kiểm tra `npm ci` từ lockfile.
- [ ] Chuẩn hóa Node.js matrix theo các phiên bản mà dự án thực sự hỗ trợ.
- [ ] Chạy `npm audit` hoặc công cụ dependency scanning theo policy; review kết quả thay vì tự động cập nhật major version.
- [ ] Khóa version dependency quan trọng, không dùng `latest` cho dependency runtime.
- [ ] Nếu bật Sentry, thêm dependency chính thức hoặc dùng dynamic optional integration có tài liệu rõ ràng.

### Tiêu chí nghiệm thu giai đoạn 7

- CI chặn merge khi lint/test/build thất bại.
- Có test regression cho từng lỗi P0/P1 đã xử lý.
- Có metric đủ để biết lỗi nằm ở Discord, Lavalink, source nhạc, queue hay storage.
- Có hướng dẫn triển khai, rollback và restore dữ liệu.

---

## 5. Danh sách tệp dự kiến thay đổi

> Danh sách dưới đây là dự kiến dựa trên source hiện tại. Có thể thêm file mới khi trích xuất module; không nên chỉnh sửa hàng loạt nếu chưa cần.

| Tệp | Thay đổi dự kiến |
|---|---|
| `index.js` | Giảm logic nghiệp vụ, gắn services, health routes, event wiring, shutdown |
| `src/config/lavalink.js` | Validate config, public fallback opt-in, normalize node definitions |
| `src/config/constants.js` | Thêm cấu hình search budget, permission/session limit, node backoff |
| `src/core/CommandHandler.js` | Atomic cooldown reservation và gọi permission policy phù hợp |
| `src/utils/permissions.js` | Bổ sung policy kiểm tra DJ/admin/same voice |
| `src/services/player/PlayerService.js` | Điều phối lifecycle, transactional enqueue, cleanup, resolver integration |
| `src/services/player/PlayerState.js` | Nhiều panel sessions, lifecycle cleanup, generation consistency |
| `src/services/queue/QueueService.js` | Kiểm tra và mutation queue an toàn theo coordinator |
| `src/services/autoplay/AutoplayService.js` | Dùng chung SearchResolver và chống chạy trùng |
| `src/services/storage/StorageService.js` | Serialized flush, snapshot version, retry, migration |
| `src/services/voice/VoicePresenceService.js` | Dùng cleanup flow thống nhất |
| `src/interactions/nowPlayingButtons.js` | Permission check dùng chung, session-aware update |
| `src/commands/stop.js` | Áp dụng Stop permission policy |
| `src/services/ui/NowPlayingUI.js` | UI hỗ trợ session và trạng thái pending/error nếu cần |
| `src/services/health/HealthService.js` | Mới: liveness/readiness/diagnostics |
| `src/services/player/GuildPlayerCoordinator.js` | Mới: keyed lock và điều phối thao tác Guild |
| `src/services/search/SearchResolver.js` | Mới: global deadline, node fallback, cache và source fallback |
| `src/services/lavalink/LavalinkNodeMonitor.js` | Mới: node recovery controller nếu tách khỏi `index.js` |
| `src/services/permissions/PermissionService.js` | Mới: policy quyền thống nhất nếu `utils/permissions.js` không còn phù hợp |
| `tests/*.test.js` | Mở rộng test theo từng module và regression |
| `.env.example` | Chỉ giữ biến thực sự được sử dụng và ghi rõ default |
| `README.md` | Cập nhật setup, config, persistent storage, health, production deployment |
| `bao-cao.md` | Đánh dấu báo cáo cũ/đưa vào archive hoặc cập nhật theo source mới |
| `package.json` | Khóa dependency và chuẩn hóa scripts/Node engine |
| `.github/workflows/ci.yml` | Mở rộng CI test/build/security checks |
| `Dockerfile`, `docker-compose.yml` | Health/readiness, storage mount, secret/config policy |

---

## 6. Chuẩn hóa Environment Variables

Chỉ giữ biến thực sự có tác động đến code runtime. Mọi biến phải được khai báo, validate, có default hợp lý và được mô tả trong README.

| Biến | Mục đích | Yêu cầu |
|---|---|---|
| `DISCORD_TOKEN` | Token bot | Bắt buộc; validate trước khi startup |
| `NODE_ENV` | Môi trường chạy | `development`, `test`, `production` |
| `PORT` | HTTP server | Parse và validate số port |
| `DATA_DIR` | Thư mục lưu dữ liệu | Production phải mount disk bền vững |
| `LAVALINK_NODES` | Danh sách node | Validate JSON, không log auth |
| `LAVALINK_USE_PUBLIC_FALLBACK` | Cho phép public node | Mặc định false trong production |
| `LAVALINK_HOST` | Node custom đơn | Chỉ dùng nếu policy config cho phép |
| `LAVALINK_AUTH` | Node password | Secret, không commit |
| `LAVALINK_SECURE` | TLS của node custom | Parse boolean chuẩn |
| `SPOTIFY_CLIENT_ID` | Spotify integration | Optional; validate theo cặp với secret |
| `SPOTIFY_CLIENT_SECRET` | Spotify integration | Secret |
| `SEARCH_TIMEOUT_MS` | Tổng search budget hoặc giá trị tương thích | Định nghĩa rõ là tổng hay per-node; tránh nhập nhằng |
| `SEARCH_NODE_TIMEOUT_MS` | Timeout cho mỗi node | Mới đề xuất |
| `SEARCH_MAX_CONCURRENCY` | Giới hạn search đồng thời | Mới đề xuất |
| `ENABLE_SOUNDCLOUD_FALLBACK` | Bật fallback nguồn | Chỉ giữ nếu đã nối vào logic |
| `AUTO_DISCONNECT_SECONDS` | Thời gian chờ voice empty | Parse số nguyên và giới hạn min/max |
| `MAX_QUEUE_SIZE` | Giới hạn queue Guild | Validate số dương |
| `MAX_QUEUE_SIZE_PER_USER` | Giới hạn queue mỗi user | Validate số dương |
| `MAX_PLAYLIST_LOAD` | Giới hạn playlist mỗi lần | Validate số dương |
| `COMMAND_COOLDOWN_MS` | Cooldown command | Validate số không âm |
| `SEARCH_CACHE_TTL_MS` | TTL cache | Validate số không âm |
| `SEARCH_CACHE_MAX` | Số cache entry | Validate số nguyên dương |
| `DEFAULT_VOLUME` | Âm lượng mặc định | Giữ trong range Discord/Lavalink được hỗ trợ |
| `MAX_HISTORY` | Giới hạn history | Validate số nguyên dương |
| `DEFAULT_LOCALE` | Ngôn ngữ | Chỉ nhận locale có file tương ứng |
| `LOG_LEVEL` | Log level | Validate enum |
| `SENTRY_DSN` | Error reporting | Chỉ hỗ trợ khi dependency đã được cài và khởi tạo |
| `DEV_GUILD_ID` | Đăng ký command cho môi trường dev | Không sử dụng nhầm trong production |

### Biến cần rà soát đặc biệt

Các biến như `DENO_PATH`, `YTDLP_COOKIES_FILE`, `POT_PROVIDER_URL`, `PREFETCH_LEAD_SECONDS` có trong `.env.example`. Cần xác định chúng còn thuộc kiến trúc runtime hiện tại hay chỉ sót lại từ phiên bản khác. Nếu không được code sử dụng thì loại khỏi file mẫu hoặc triển khai đầy đủ trước khi giữ lại.

---

## 7. Thứ tự ưu tiên và Definition of Done

### 7.1. Ưu tiên triển khai

| Thứ tự | Hạng mục | Mức | Phụ thuộc |
|---:|---|---|---|
| 1 | Baseline test/build và lưu commit SHA | P0 | Không |
| 2 | Stop permission policy | P0 | Baseline |
| 3 | Lavalink production config an toàn | P0 | Baseline |
| 4 | Health/liveness/readiness | P0 | Lavalink config |
| 5 | Guild coordinator và atomic cooldown | P1 | Baseline |
| 6 | Transactional queue | P1 | Guild coordinator |
| 7 | SearchResolver và timeout budget | P1 | Lavalink config |
| 8 | Node recovery/circuit breaker | P1 | SearchResolver, Shoukaku lifecycle verification |
| 9 | Playback fallback/lifecycle | P1 | SearchResolver |
| 10 | Multi-session Now Playing | P1 | PlayerState lifecycle |
| 11 | Storage serialized flush | P1 | Baseline |
| 12 | Cleanup/shutdown thống nhất | P1 | Player coordinator, Storage |
| 13 | Integration tests/metrics/docs | P1/P2 | Các giai đoạn trước |

### 7.2. Definition of Done cho mỗi Pull Request

Một hạng mục chỉ được coi là hoàn thành khi:

- [ ] Có mô tả lỗi/nhu cầu và phạm vi thay đổi.
- [ ] Có test tái hiện vấn đề trước khi sửa nếu đây là bug.
- [ ] Có test cho luồng thành công và ít nhất một luồng lỗi liên quan.
- [ ] `npm test` pass.
- [ ] `npm run lint` pass.
- [ ] Docker build pass nếu thay đổi ảnh hưởng runtime/deployment.
- [ ] Không thêm secret hoặc dữ liệu production vào code/test fixture.
- [ ] README và `.env.example` được cập nhật nếu thay đổi cấu hình/hành vi.
- [ ] Không làm hỏng command hoặc behavior hiện có ngoài phạm vi đã thống nhất.
- [ ] Có ghi chú migration/rollback khi thay đổi schema hoặc persistence.

### 7.3. Definition of Done cho V3

- Tất cả P0 hoàn thành và có regression test.
- Các hạng mục P1 về concurrency, search, node recovery, queue, panel session, storage và cleanup đã được triển khai.
- CI chạy lint, test và Docker build thành công.
- Có integration test cho các tình huống lỗi chính.
- Production không phụ thuộc public Lavalink node theo mặc định.
- Có liveness/readiness/diagnostics rõ ràng.
- Có tài liệu deploy, backup, restore, rollback và troubleshooting.
- Có số liệu runtime để đánh giá hiệu năng sau triển khai.

---

## 8. Kế hoạch kiểm thử thủ công trước production

### 8.1. Discord và permission

- [ ] Mời bot vào server thử nghiệm.
- [ ] Người A vào voice và gọi `/play`.
- [ ] Người B không vào voice thử `/stop`.
- [ ] Người B có DJ role thử các command điều khiển.
- [ ] Người có quyền quản trị thử Stop từ xa.
- [ ] Thử nút Stop trên ephemeral panel và public panel.

### 8.2. Lavalink và playback

- [ ] Khởi động với primary node hoạt động.
- [ ] Ngắt primary node trong lúc đang phát.
- [ ] Khôi phục node trước khi hết reconnect policy.
- [ ] Thử node bị loại khỏi Shoukaku manager.
- [ ] Cho search timeout trên node đầu và xác nhận node fallback hoạt động.
- [ ] Thử track không tồn tại, source exception và track stuck.
- [ ] Thử SoundCloud fallback khi được bật và xác nhận không fallback khi bị tắt.
- [ ] Xác nhận bot không skip liên tiếp nhiều lần cho cùng một event lỗi.

### 8.3. Concurrency

- [ ] Hai user gọi `/play` đồng thời trong cùng Guild.
- [ ] Nhiều user enqueue cùng lúc gần đầy queue.
- [ ] Một user gọi `/stop` trong khi user khác enqueue.
- [ ] Hai user gọi `/play` cùng lúc khi chưa có player.
- [ ] Hai interaction giống nhau đến trong cooldown window.

### 8.4. UI

- [ ] Hai user có hai ephemeral panels độc lập.
- [ ] Public panel vẫn cập nhật khi ephemeral session hết hạn.
- [ ] User thao tác nút trên panel cũ.
- [ ] Xóa message public panel rồi chờ ticker.
- [ ] Stop player và xác nhận mọi panel kết thúc, ticker dừng.

### 8.5. Persistence và shutdown

- [ ] Đổi repeat, volume, filter, autoplay và history.
- [ ] Restart bot bình thường.
- [ ] Kill tiến trình trong lúc có write pending trên môi trường test.
- [ ] Làm hỏng JSON fixture và xác nhận backup/recovery.
- [ ] Thay đổi dữ liệu trong lúc flush đang chạy.
- [ ] Kiểm tra dữ liệu vẫn còn sau khi container được recreate trên persistent disk.

---

## 9. Triển khai production, rollback và vận hành

### 9.1. Trước deploy

- [ ] Sao lưu `DATA_DIR`.
- [ ] Ghi lại commit SHA hiện tại và commit SHA mới.
- [ ] Xác nhận persistent disk được mount đúng.
- [ ] Xác nhận Lavalink node primary/backup truy cập được từ bot.
- [ ] Kiểm tra secrets đã cấu hình trong deployment platform.
- [ ] Chạy CI đầy đủ.
- [ ] Xác nhận health/readiness endpoint không lộ secret.

### 9.2. Sau deploy

- [ ] Kiểm tra Discord Client Ready.
- [ ] Kiểm tra Lavalink node connected.
- [ ] Kiểm tra `/play`, `/search`, `/queue`, `/pause`, `/resume`, `/skip`, `/stop`.
- [ ] Kiểm tra playlist và SoundCloud fallback nếu được bật.
- [ ] Kiểm tra `/health/ready` và `/health/diagnostics`.
- [ ] Theo dõi search latency, playback exception, reconnect và storage flush error.
- [ ] Kiểm tra logs trong giai đoạn đầu sau deploy.

### 9.3. Rollback

- [ ] Nếu lỗi nghiêm trọng, rollback về commit SHA trước đó.
- [ ] Không rollback binary/code mà bỏ qua migration dữ liệu nếu schema đã thay đổi.
- [ ] Giữ bản backup trước migration.
- [ ] Có hướng dẫn khôi phục JSON/SQLite và xác minh dữ liệu sau restore.
- [ ] Ghi nhận lỗi và bổ sung regression test trước lần deploy tiếp theo.

---

## 10. Hướng dẫn cho AI coding agent (Antigravity / Codex)

Có thể dùng file này làm tài liệu giao việc cho AI coding agent. Agent phải tuân theo các nguyên tắc dưới đây:

1. Đọc source code thực tế của nhánh làm việc trước khi sửa; không giả định báo cáo cũ vẫn đúng.
2. Không triển khai tất cả giai đoạn trong một thay đổi lớn.
3. Bắt đầu từ Giai đoạn 0 và Giai đoạn 1; chỉ chuyển tiếp khi test/tiêu chí giai đoạn hiện tại đạt.
4. Trước khi thêm dependency, kiểm tra package hiện có và tính tương thích với Node.js, Discord.js, Kazagumo, Shoukaku và Lavalink đang khóa trong lockfile.
5. Với API Shoukaku/Kazagumo, phải kiểm tra đúng version được cài; không tự suy đoán event, state hoặc method.
6. Không dùng `Promise.race()` rồi tuyên bố request gốc đã bị hủy.
7. Không tự động remove/add node đang reconnect nếu chưa chứng minh điều đó phù hợp với lifecycle của Shoukaku.
8. Không để quyền Stop từ xa mở cho tất cả thành viên.
9. Không làm mất queue hoặc session người dùng khi refactor player.
10. Mọi thao tác queue/player cạnh tranh phải có test đồng thời.
11. Mọi thay đổi persistence phải có test mutation trong lúc flush và test restart.
12. Cập nhật `.env.example`, README và test khi thêm/đổi biến cấu hình.
13. Không commit `.env`, token Discord, Lavalink password, Spotify secret hoặc log production có dữ liệu nhạy cảm.
14. Sau mỗi giai đoạn, báo cáo: file đã sửa, logic đã đổi, test đã chạy, kết quả test, rủi ro còn lại và cách rollback.
15. Nếu phát hiện khác biệt giữa kế hoạch và source code mới nhất, ưu tiên source hiện tại, giải thích khác biệt và cập nhật kế hoạch trước khi tiếp tục.

### Prompt triển khai gợi ý

```text
Hãy đọc toàn bộ file AWhooo_V3_Upgrade_Plan.md và source code repository Awhooo.

Triển khai theo đúng từng giai đoạn, bắt đầu từ Giai đoạn 0 và Giai đoạn 1.
Không triển khai đồng loạt toàn bộ kế hoạch trong một lần.

Trước khi sửa:
- Kiểm tra source hiện tại và xác định các mục trong plan còn đúng.
- Chạy test/lint/build baseline.
- Liệt kê file dự kiến sửa và lý do.

Trong quá trình sửa:
- Giữ nguyên stack Node.js + Discord.js + Kazagumo + Shoukaku + Lavalink v4.
- Không phá vỡ behavior hiện tại ngoài phạm vi yêu cầu.
- Viết regression test cho từng bug.
- Không tự suy đoán API của dependency; kiểm tra version thực tế trong package-lock.json.
- Không commit secret.

Sau khi hoàn thành mỗi giai đoạn:
- Chạy npm test và npm run lint.
- Build Docker nếu thay đổi ảnh hưởng runtime.
- Báo cáo file đã sửa, kết quả test, rủi ro còn lại và cách rollback.
- Chỉ chuyển sang giai đoạn tiếp theo khi tiêu chí nghiệm thu hiện tại đạt.

Nếu source khác với kế hoạch, hãy ghi rõ điểm khác biệt và đề xuất điều chỉnh trước khi sửa.
```

---

## 11. Kết luận

Awhooo không cần viết lại từ đầu. Nền tảng hiện tại đã có nhiều thành phần phù hợp để tiếp tục phát triển. V3 nên tập trung vào việc làm cho các thành phần đó hoạt động nhất quán trong điều kiện lỗi mạng, node Lavalink không ổn định và nhiều người dùng thao tác đồng thời.

**Thứ tự khuyến nghị:**

1. Security và cấu hình production.
2. Health/readiness và node recovery.
3. Guild concurrency và queue consistency.
4. Search resolver, source fallback và playback lifecycle.
5. Multi-session Now Playing.
6. Storage và cleanup/shutdown.
7. Testing, metrics và tài liệu production.

Hoàn thành các mục này sẽ tạo nền tảng đáng tin cậy hơn để Awhooo tiếp tục bổ sung tính năng mà không làm tăng đáng kể rủi ro lỗi vận hành.
