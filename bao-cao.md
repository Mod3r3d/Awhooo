# BÁO CÁO RÀ SOÁT LỖI TOÀN DIỆN & HƯỚNG GIẢI QUYẾT CHO DISCORD MUSIC BOT

> **Thời gian rà soát:** 19/10/2026  
> **Phiên bản hệ thống:** Node.js 20 LTS | Discord.js v14 | Kazagumo + Shoukaku v4  
> **Môi trường vận hành:** Render Web Service (Docker Container)  

---

## I. TỔNG QUAN HIỆN TRẠNG HỆ THỐNG (LIVE SYSTEM STATUS)

Kết quả kiểm tra trực tiếp từ endpoint giám sát thực tế của bot trên Render (`https://discord-music-bot-7k0g.onrender.com/health`):

```json
{
  "status": "ok",
  "uptimeSeconds": 418317,
  "discord": {
    "ready": true,
    "guilds": 3,
    "ping": 81
  },
  "players": 0,
  "guildStates": 0,
  "searchCache": { "size": 0, "max": 200, "hits": 0, "misses": 0, "hitRate": 0 },
  "cooldownKeys": 0,
  "pendingVoiceLeave": 0,
  "storage": { "ready": true, "guilds": 0 },
  "lavalink": []
}
```

### 🔴 Các điểm bất thường chí mạng:
1. **Container đã chạy liên tục 4 ngày 20 tiếng (418.317 giây) mà chưa từng được khởi động lại.**
2. **`lavalink: []` — Danh sách node Lavalink hiện tại HOÀN TOÀN RỖNG.**
3. **Bot đang ở trạng thái "chết lâm sàng":** Discord Gateway vẫn báo bot Online, nhận lệnh bình thường, nhưng vì **không có bất kỳ máy chủ âm thanh (Lavalink Node) nào kết nối**, mọi thao tác phát nhạc (`/play`, `/search`) đều sẽ bị treo hoặc báo lỗi ngay lập tức (`KazagumoError: No node is available`).
4. **Kiểm tra độc lập các node công khai từ bên ngoài:** Các node chính (`Kasawa_Direct` và `Nazha_SSL`) hiện tại **vẫn đang hoạt động bình thường và phản hồi 200 OK**. Điều này khẳng định lỗi không xuất phát từ việc máy chủ Lavalink bị sập hoàn toàn, mà do **cơ chế quản lý kết nối nội bộ của bot**.

---

## II. CHI TIẾT 6 LỖI GỐC RỄ ĐÃ ĐƯỢC RÀ SOÁT

### Lỗi 1: Toàn bộ Node Lavalink bị hủy kết nối vĩnh viễn (Lỗi nghiêm trọng nhất)
* **Vị trí file:** `index.js` (dòng 188)
* **Hiện trạng mã nguồn:**
  ```javascript
  reconnectTries: 10,
  restTimeout: 15
  ```
* **Bản chất lỗi:**
  Các node Lavalink công khai miễn phí là máy chủ cộng đồng, trong suốt 5 ngày hoạt động chắc chắn sẽ có lúc bị khởi động lại hoặc rớt mạng ngắn hạn (1–2 phút).
  Thư viện Shoukaku được cấu hình chỉ thử kết nối lại tối đa 10 lần (`reconnectTries: 10`). Sau 10 lần thử thất bại, Shoukaku **tự động xóa sổ vĩnh viễn các node này khỏi bộ nhớ** (`shoukaku.nodes`) và không bao giờ kết nối lại nữa. Hậu quả là sau vài ngày chạy, bot mất sạch toàn bộ node (`lavalink: []`).

---

### Lỗi 2: Health Check bị "lừa dối" (False Positive Health Status)
* **Vị trí file:** `index.js` (dòng 106–107)
* **Hiện trạng mã nguồn:**
  ```javascript
  const connectedNodes = nodes.filter((node) => node.state === 'connected').length;
  const healthy = connectedNodes > 0 || nodes.length === 0;
  ```
* **Bản chất lỗi:**
  Nhìn vào logic: `connectedNodes > 0 || nodes.length === 0`.
  Khi toàn bộ node đã bị Shoukaku xóa sạch khỏi bộ nhớ, `nodes.length` bằng `0`. Biểu thức `nodes.length === 0` trở thành `true`!
  ➡️ Endpoint `/health` trả về **HTTP 200 OK** và `status: "ok"` dù bot **không còn bất kỳ node nào**. Vì Render thấy HTTP 200, Docker HEALTHCHECK của Render cho rằng bot hoàn toàn bình thường nên **không bao giờ tự reboot container** để cứu vớt kết nối.

---

### Lỗi 3: Nạp bài thành công nhưng đứng im ở `00:00` và không phát ra âm thanh
* **Vị trí file:** `src/services/player/PlayerService.js` và các sự kiện của `Kazagumo` trong `index.js`
* **Bản chất lỗi:**
  Khi người dùng phát nhạc từ YouTube/Spotify:
  1. Node Lavalink công khai thường xuyên bị YouTube chặn IP (HTTP 403 Forbidden / Anti-bot check).
  2. Khi Lavalink nhận lệnh phát nhưng không lấy được luồng âm thanh thực tế từ YouTube, Lavalink sẽ phát ra sự kiện `playerException` hoặc `playerStuck`.
  3. Khi sự kiện này xảy ra, bot hiện tại không tự động chuyển sang nguồn dự phòng (như SoundCloud) và không tự động `skip()` bài lỗi, dẫn đến việc thanh phát nhạc hiển thị `00:00 / 03:33` và đứng im vĩnh viễn.

---

### Lỗi 4: Nút "Dừng" (`np_stop`) và lệnh `/stop` bị từ chối thực thi
* **Vị trí file:** `src/commands/stop.js` và `src/interactions/nowPlayingButtons.js`
* **Bản chất lỗi:**
  1. Trong `src/commands/stop.js`, lệnh vẫn giữ `requiresVoice: true` và kiểm tra `ctx.voiceChannel?.id !== botChannelId`. Nếu bot bị kẹt trong voice mà người dùng đã out voice hoặc ở phòng khác, bot từ chối dừng với thông báo lỗi.
  2. Mục đích của lệnh Dừng/Stop là **cứu hộ khẩn cấp**. Việc bắt buộc người dùng phải ở cùng phòng voice với một con bot đang bị lỗi/treo làm mất hoàn toàn khả năng can thiệp của người quản trị server.

---

### Lỗi 5: Thời gian hiển thị "Bảng 2" (Now Playing panel) quá chậm (10–15 giây)
* **Vị trí file:** `src/commands/play.js` và `src/services/player/PlayerService.js`
* **Bản chất lỗi:**
  Hiện tại tiến trình diễn ra theo dạng tuần tự chặn (blocking waterfall):
  `Tìm kiếm` ➡️ `Kết nối voice` ➡️ `Thêm vào queue` ➡️ `Đợi Lavalink resolve bài 1 qua mạng` ➡️ `Đợi player.play() phản hồi` ➡️ `Mới vẽ Bảng 2`.
  Nếu gặp bài hát Spotify cần bắc cầu sang YouTube, việc resolve bài đầu tiên trên các node công khai mất từ 3 đến 8 giây. Người dùng phải nhìn màn hình *"Đang kết nối vào kênh thoại..."* chờ đợi rất lâu.

---

### Lỗi 6: Không tự thoát khi phòng thoại không còn ai (Auto-Disconnect)
* **Vị trí file:** `src/services/voice/VoicePresenceService.js`
* **Bản chất lỗi:**
  1. Khi bot bị mất kết nối tới node Lavalink (như tình trạng hiện tại), `player` trong bộ nhớ của bot có thể bị mất đồng bộ với trạng thái voice thực tế trên Discord Gateway.
  2. Khi người dùng cuối cùng rời phòng thoại, sự kiện `voiceStateUpdate` kiểm tra `player`, nếu `player` không còn hợp lệ thì hàm rời phòng không kích hoạt dọn dẹp tầng Gateway của Discord (`guild.members.me.voice.disconnect()`), khiến bot vẫn hiển thị ngồi lì trong phòng thoại của Discord.

---

## III. HƯỚNG GIẢI QUYẾT CHI TIẾT (ACTIONABLE PROPOSAL)

### 1. Xây dựng cơ chế "Node Keeper" tự phục hồi vĩnh viễn cho Lavalink
* **Giải pháp kỹ thuật:**
  - Trong `index.js`, cấu hình Shoukaku `reconnectTries: Infinity` (hoặc `100`) thay vì `10`.
  - Bổ sung một tiến trình nền định kỳ (**Node Keeper**, chạy mỗi 60 giây): Quét danh sách node trong `manager.shoukaku.nodes`. Nếu phát hiện bất kỳ node nào bị thiếu hoặc đang ở trạng thái `DISCONNECTED`, tự động gọi `manager.shoukaku.addNode()` để đưa node trở lại hoạt động mà không cần restart bot.

### 2. Sửa triệt để logic Health Check của Render
* **Giải pháp kỹ thuật:**
  - Đổi điều kiện `healthy` thành:
    ```javascript
    const healthy = connectedNodes > 0;
    ```
  - Khi số node kết nối bằng 0, `/health` bắt buộc phải trả về **HTTP 503 Service Unavailable**.
  - Khi đó, cơ chế tự động của Docker / Render sẽ phát hiện bot không thể phát nhạc và kích hoạt khởi động lại container mới, giúp bot tự hồi sinh ngay trong vòng 1 phút mà không cần can thiệp thủ công.

### 3. Đa dạng hóa nguồn phát & Tự động bỏ qua bài lỗi (Failover & Auto-Skip)
* **Giải pháp kỹ thuật:**
  - Đặt engine mặc định ưu tiên `youtube_music`, nếu phân giải thất bại sẽ tự động fallback sang `soundcloud`.
  - Trong `manager.on('playerException')` và `manager.on('playerStuck')`: Ngay khi Lavalink phát hiện luồng phát bị YouTube từ chối, bot sẽ lập tức thông báo vào kênh text và gọi `player.skip()` để chuyển sang bài tiếp theo, không để thanh phát nhạc bị kẹt tại `00:00`.

### 4. Mở khóa cưỡng chế cho `/stop` và nút Dừng (Emergency Stop Override)
* **Giải pháp kỹ thuật:**
  - Cho phép `/stop` hoạt động độc lập không cần kiểm tra quyền `requiresVoice` hay `needSameVoice`.
  - Trong cả `/stop` và nút `np_stop`: Gọi trực tiếp cơ chế dọn dẹp đa tầng (`player.destroy()`, `shoukaku.leaveVoiceChannel()`, và `guild.members.me.voice.disconnect()`) để ngắt kết nối voice ngay lập tức trong mọi tình huống.

### 5. Tối ưu tốc độ hiển thị Bảng Now Playing (UI Responsiveness)
* **Giải pháp kỹ thuật:**
  - Sau khi kết nối voice và thêm bài vào hàng đợi, hiển thị ngay Bảng Now Playing cho người dùng.
  - Quá trình resolve và stream âm thanh của Lavalink được chạy nền không đồng bộ (non-blocking). Người dùng sẽ thấy giao diện bot phản hồi tức thì (< 1 giây) thay vì phải đợi 10–15 giây.

---

## IV. HÀNH ĐỘNG KHUYẾN NGHỊ TRƯỚC MẮT (QUICK RECOVERY)

Vì bot trên Render hiện tại đã mất toàn bộ node do chạy liên tục gần 5 ngày:
* **Hành động bạn có thể làm ngay lúc này:** Truy cập vào [dashboard.render.com](https://dashboard.render.com/) ➡️ Chọn dịch vụ bot ➡️ Nhấp **Manual Deploy** ➡️ **Restart Service** (hoặc Deploy latest commit). Container sẽ khởi động lại và kết nối lại ngay lập tức với các node Lavalink đang hoạt động.
