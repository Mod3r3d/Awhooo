# 🎵 Discord Music Bot (Node.js + Lavalink v4)

Bot phát nhạc Discord hiện đại, mượt mà được xây dựng trên nền tảng **Node.js (Discord.js v14)** kết hợp cùng **Kazagumo & Shoukaku** và hệ thống máy chủ âm thanh **Lavalink v4**. Dự án được tối ưu hóa đặc biệt để chạy ổn định 24/7 trên các nền tảng đám mây như **Render, Railway, VPS** hoặc bằng **Docker Compose**.

---

## ✨ Điểm nổi bật & Tính năng chính

### 🚀 Hiệu năng cao & mượt mà

- **Âm thanh chất lượng cao (Lavalink v4)**: Xử lý giải mã âm thanh trên node Lavalink chuyên dụng, không gây nghẽn CPU/RAM trên bot server.
- **Hỗ trợ đa nguồn**: Phát nhạc mượt mà từ **YouTube**, **Spotify** (bài hát, album, danh sách phát), **SoundCloud** và tìm kiếm từ khóa.
- **Cache kết quả tìm kiếm (LRU + TTL 5 phút)**: Người dùng tìm lại cùng một bài sẽ có phản hồi tức thì, giảm tải cho node Lavalink.
- **Fallback thông minh**: Tự động phân giải qua nhiều nguồn dự phòng khi nguồn chính gặp sự cố.

### 🎛️ Bảng điều khiển tương tác (Now Playing UI)

- **Không spam kênh chat**: Khi bot phát nhạc, bảng Now Playing được gửi ở dạng **ephemeral** — chỉ người vừa gọi lệnh (`/play`, `/playskip`, `/playtop`, `/previous`, `/search`) nhìn thấy. Cả kênh chat hoàn toàn sạch sẽ.
- **Bảng công khai khi cần**: Chỉ khi dùng lệnh **`/nowplaying`** (hoặc `/np`), bảng Now Playing mới được gửi **công khai** vào kênh chat cho mọi người cùng thấy và cùng bấm nút điều khiển.
- **Embed tự động cập nhật**: Hiển thị ảnh bìa sắc nét, thời lượng, người yêu cầu, trạng thái lặp, âm lượng, bộ lọc và autoplay.
- **Thanh tiến trình thời gian thực**: Tự động làm mới mỗi 10 giây (cho cả bảng ephemeral lẫn bảng công khai).
- **Nút tự vô hiệu hoá**: Sau khi dừng nhạc hoặc sau 10 phút không tương tác, nút trên bảng tự chuyển sang trạng thái vô hiệu — không còn tình trạng bấm vào nút "chết" và nhận lỗi.
- **Lưu ý về thời hạn**: Bảng ephemeral gắn với phiên lệnh nên chỉ tự cập nhật trong tối đa **15 phút** (mỗi lần bấm nút trên bảng sẽ tự gia hạn thêm). Hết hạn thì bảng đứng yên — chỉ cần gọi lại `/play` hoặc `/nowplaying` để mở bảng mới.

### 🎚️ Bộ lọc âm thanh & tiện ích phát nhạc

- **9 bộ lọc Lavalink**: bassboost, nightcore, vaporwave, 8D, karaoke, tremolo, vibrato, soft và off.
- **Tua nhạc**: `/seek` (nhảy tới mốc bất kỳ), `/forward`, `/rewind`.
- **Autoplay**: Khi hết hàng đợi, bot tự tìm và phát bài hát liên quan thay vì rời phòng.
- **Menu chọn bài `/search`**: Hiển thị danh sách kết quả để người dùng chọn đúng bài mong muốn.

### 🛡️ Ổn định & an toàn

- **Giới hạn hàng đợi**: Tối đa 500 bài/server và 100 bài/người — chống spam và tràn bộ nhớ.
- **Cooldown lệnh**: 3 giây giữa hai lần dùng lệnh phát nhạc của cùng một người.
- **Tự rời kênh thoại**: Bot tự rời phòng sau 3 phút nếu không còn ai nghe.
- **Lưu trữ bền vững**: Chế độ lặp, âm lượng, bộ lọc, autoplay và lịch sử phát nhạc được lưu xuống đĩa — không mất khi bot khởi động lại.
- **Logging có cấu trúc**: Log chia theo mức (`error`/`warn`/`info`/`debug`), xuất JSON ở production để dễ thu thập.
- **Health check nâng cao**: `/health` trả về trạng thái từng node Lavalink, số player, RAM, uptime, thống kê cache.

### 🧪 Chất lượng mã nguồn

- **110+ unit & integration test** chạy bằng test runner có sẵn của Node.js (không cần thư viện ngoài).
- **ESLint + Prettier** cấu hình sẵn, CI chạy tự động trên GitHub Actions.
- **Kiến trúc tách lớp rõ ràng**: `core/` (định tuyến), `services/` (nghiệp vụ), `interactions/` (nút & menu), `commands/` (khai báo lệnh).

---

## 📋 Danh sách Slash Commands

### Phát nhạc

| Lệnh | Tham số | Mô tả |
| :--- | :--- | :--- |
| `/play` | `query` *(bắt buộc)* | Phát bài hát từ tên bài, link YouTube, Spotify, SoundCloud |
| `/search` | `query` *(bắt buộc)* | Tìm kiếm và **chọn bài từ menu** kết quả |
| `/playskip` | `query` *(bắt buộc)* | Chèn bài hát mới và lập tức bỏ qua bài đang phát |
| `/playtop` | `query` *(bắt buộc)* | Chèn bài hát lên vị trí đầu tiên của hàng đợi |
| `/nowplaying` (hoặc `/np`) | *Không* | Gửi **công khai** bảng điều khiển bài đang phát vào kênh chat |

### Điều khiển

| Lệnh | Tham số | Mô tả |
| :--- | :--- | :--- |
| `/pause` | *Không* | Tạm dừng phát nhạc |
| `/resume` | *Không* | Tiếp tục phát bài hát |
| `/skip` | *Không* | Bỏ qua bài hát đang phát |
| `/skipto` | `index` *(bắt buộc)* | Nhảy thẳng tới bài hát số `index` trong danh sách chờ |
| `/previous` | *Không* | Phát lại bài hát vừa nghe từ lịch sử |
| `/stop` | *Không* | Dừng phát nhạc, xóa toàn bộ hàng đợi và rời kênh thoại |
| `/seek` | `time` *(bắt buộc)* | Nhảy tới mốc thời gian (`1:30`, `90`, `1h2m`) |
| `/forward` | `seconds` *(tùy chọn)* | Tua tới trước (mặc định 10 giây) |
| `/rewind` | `seconds` *(tùy chọn)* | Tua lại (mặc định 10 giây) |
| `/volume` | `level` *(tùy chọn: 1-200)* | Xem hoặc điều chỉnh âm lượng |

### Hàng đợi & cài đặt

| Lệnh | Tham số | Mô tả |
| :--- | :--- | :--- |
| `/queue` | `page`, `remove`, `move_from`, `move_to`, `clear` | Xem và quản lý hàng đợi phân trang |
| `/shuffle` | `mine` *(tùy chọn)* | Xáo trộn hàng đợi (toàn bộ hoặc chỉ bài của bạn) |
| `/repeat` | `mode` *(tùy chọn)* | Đổi chế độ lặp (Off / Track / Queue) |
| `/filter` | `name` *(tùy chọn)* | Bật/tắt bộ lọc âm thanh |
| `/autoplay` | `mode` *(tùy chọn)* | Bật/tắt tự động phát bài liên quan |
| `/history` | *Không* | Xem lịch sử các bài hát đã phát |

---

## 🏗️ Cấu trúc thư mục

```text
Discord-Music-Bot/
├── index.js                     # Bootstrap: health server, client, router, shutdown
├── package.json                 # Dependencies + script (start / test / lint / format)
├── Dockerfile                   # Image Node 20 Alpine, multi-stage, chạy non-root
├── docker-compose.yml           # Chạy bot + Lavalink v4 chỉ bằng một lệnh
├── eslint.config.js             # Cấu hình ESLint (flat config)
├── .prettierrc.json             # Cấu hình Prettier
├── lavalink/
│   └── application.yml          # Cấu hình Lavalink v4 + plugin LavaSrc (Spotify)
├── tests/                       # Unit & integration test (node:test)
├── .github/workflows/ci.yml     # CI: lint + test + build Docker
└── src/
    ├── commands/                # Khai báo slash command (mỗi file một nhóm lệnh)
    │   ├── index.js             # Danh sách toàn bộ lệnh
    │   ├── helpers.js           # Hàm dùng chung cho lệnh phát nhạc
    │   └── play.js, search.js, filter.js, seek.js, autoplay.js, ...
    ├── config/
    │   ├── constants.js         # Hằng số + đọc biến môi trường
    │   └── lavalink.js          # Danh sách node Lavalink & failover
    ├── core/                    # Lớp định tuyến
    │   ├── context.js           # Ngữ cảnh dùng chung cho mọi lệnh
    │   ├── CommandHandler.js    # Sổ đăng ký lệnh + kiểm tra quyền/cooldown/defer
    │   ├── ButtonHandler.js     # Định tuyến nút bấm theo tiền tố customId
    │   └── SelectHandler.js     # Định tuyến menu chọn
    ├── interactions/            # Xử lý nút & menu cụ thể
    │   └── nowPlayingButtons.js, queueButtons.js, filterSelect.js, searchSelect.js
    ├── locales/                 # Chuỗi giao diện (i18n)
    │   ├── index.js             # Hàm t() + nội suy biến
    │   └── vi.json              # Từ điển tiếng Việt
    ├── services/
    │   ├── logger.js            # Log có cấu trúc theo mức & phạm vi
    │   ├── player/
    │   │   ├── PlayerService.js # Điều phối phát nhạc, cache, panel, autoplay
    │   │   └── PlayerState.js   # Trạng thái & cài đặt theo guild
    │   ├── queue/QueueService.js        # Hàng đợi + giới hạn
    │   ├── filters/FilterService.js     # Preset bộ lọc âm thanh
    │   ├── autoplay/AutoplayService.js
    │   ├── cache/SearchCache.js         # LRU + TTL
    │   ├── cooldown/CooldownService.js
    │   ├── storage/StorageService.js    # Lưu JSON bền vững
    │   ├── voice/VoicePresenceService.js # Tự rời phòng khi kênh trống
    │   └── ui/
    │       └── NowPlayingUI.js, QueueUI.js, SearchUI.js
    └── utils/
        ├── formatters.js        # Định dạng thời gian, thanh tiến trình, parse thời gian
        ├── permissions.js       # Kiểm tra kênh thoại & player
        ├── reply.js             # Phản hồi interaction an toàn
        └── interactions.js      # Nhận diện tin nhắn ephemeral
```

---

## ⚙️ Biến môi trường (Environment Variables)

Xem file `.env.example` để có danh sách đầy đủ kèm chú thích. Các biến quan trọng:

| Biến | Bắt buộc | Mặc định | Mô tả |
| :--- | :---: | :---: | :--- |
| `DISCORD_TOKEN` | ✅ | - | Token của Discord Bot |
| `PORT` | ❌ | `8080` | Port của health server |
| `DEV_GUILD_ID` | ❌ | Rỗng | Đăng ký lệnh vào 1 server khi phát triển (lệnh hiện ngay thay vì chờ ~1h) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | ❌ | Rỗng | Thông tin Spotify API |
| `LAVALINK_NODES` | ❌ | Node công khai | Danh sách node dạng JSON (khuyên dùng cho production) |
| `LAVALINK_HOST` / `LAVALINK_AUTH` / `LAVALINK_SECURE` | ❌ | - | Node Lavalink chính |
| `LAVALINK_USE_PUBLIC_FALLBACK` | ❌ | `true` | Đặt `false` để tắt node công khai |
| `MAX_QUEUE_SIZE` | ❌ | `500` | Số bài tối đa trong hàng đợi |
| `MAX_QUEUE_SIZE_PER_USER` | ❌ | `100` | Số bài tối đa mỗi người được thêm |
| `COMMAND_COOLDOWN_MS` | ❌ | `3000` | Cooldown giữa hai lần dùng lệnh (ms) |
| `AUTO_DISCONNECT_SECONDS` | ❌ | `180` | Số giây chờ trước khi rời phòng khi kênh trống |
| `LOG_LEVEL` | ❌ | `info` | `error` / `warn` / `info` / `debug` |
| `DATA_DIR` | ❌ | `./data` | Thư mục lưu dữ liệu bền vững |
| `DEFAULT_LOCALE` | ❌ | `vi` | Ngôn ngữ giao diện |
| `SENTRY_DSN` | ❌ | Rỗng | DSN Sentry để thu thập lỗi (cần cài `@sentry/node`) |

---

## 🚀 Hướng dẫn triển khai

### 1. Chạy bằng Docker Compose (khuyên dùng — có sẵn Lavalink)

```bash
# 1. Tạo file .env và điền DISCORD_TOKEN
cp .env.example .env

# 2. Khởi chạy bot + Lavalink v4
docker compose up -d --build

# 3. Xem log
docker compose logs -f bot
```

Dữ liệu bền vững nằm trong thư mục `./data` trên máy host nên không mất khi build lại image.

> **Lưu ý**: kiểm tra phiên bản plugin LavaSrc trong `lavalink/application.yml` và cập nhật nếu có bản mới hơn tại <https://github.com/topi314/LavaSrc/releases>.

### 2. Triển khai lên Render.com

1. Fork hoặc đẩy dự án lên repository GitHub.
2. Đăng nhập vào [Render.com](https://render.com) → **New Web Service**.
3. Kết nối với GitHub Repository.
4. Chọn **Docker** làm môi trường chạy (Render tự dùng `Dockerfile` có sẵn).
5. Thêm biến môi trường: `DISCORD_TOKEN` và `PORT=8080`.
6. Bấm **Create Web Service**. Bot sẽ tự build và online sau ~1-2 phút.

> Nếu không muốn phụ thuộc node Lavalink công khai, hãy tự host Lavalink trên một VPS riêng rồi khai báo `LAVALINK_NODES`.

### 3. Chạy trên máy cá nhân / VPS

Yêu cầu: **Node.js 18 trở lên**.

```bash
git clone https://github.com/Mod3r3d/Discord-Music-Bot.git
cd Discord-Music-Bot

npm ci                  # cài đúng theo package-lock.json
cp .env.example .env    # rồi điền DISCORD_TOKEN
node index.js
```

---

## 🧪 Kiểm thử & chất lượng mã nguồn

```bash
npm test              # chạy toàn bộ unit + integration test
npm run test:watch    # chế độ theo dõi khi phát triển
npm run lint          # kiểm tra ESLint
npm run lint:fix      # tự sửa lỗi lint
npm run format        # định dạng lại mã nguồn bằng Prettier
npm run check         # lint + test (dùng trong CI)
```

Bộ kiểm thử bao phủ: định dạng thời gian, `PlayerState`, `QueueService` (kể cả giới hạn hàng đợi), `CooldownService`, `SearchCache`, `FilterService`, `StorageService`, các lớp UI, `CommandHandler`, tính hợp lệ của slash command, và **kiểm thử tích hợp** xác minh luồng ephemeral/công khai.

---

## 🛡️ Bản quyền & Giấy phép

Dự án được phát triển và tối ưu cho cộng đồng sử dụng.
