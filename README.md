# 🎲 Sảnh Trò Chơi — Tá lả · Poker · Cờ tướng · Cờ caro

Ứng dụng sảnh game nhiều người chơi thời gian thực.

- **Frontend:** React 18 + Vite
- **Backend:** Node.js + Express + Socket.IO (server giữ toàn bộ luật chơi, client không gian lận được)
- **Logic game dùng chung:** `shared/` (thuần JS, có unit test)

## Tính năng

**Sảnh / phòng**
- Đặt tên người chơi (lưu trên trình duyệt, tự kết nối lại khi F5 / rớt mạng, giữ ghế 60 giây)
- Tạo / vào / rời / xóa phòng, đặt và đổi tên phòng, lọc và tìm phòng theo trò chơi
- Vào chơi hoặc chỉ **xem**, ngồi / đứng dậy, chủ phòng mời người ra, chat trong phòng, chia sẻ link phòng
- Chủ phòng rời thì quyền chủ phòng tự chuyển cho người khác; phòng trống tự xóa
- **Báo bản deploy mới:** khi server được deploy bản mới, người đang mở app thấy thông báo "Đã có phiên bản mới" kèm nút **Tải lại** (tải lại vẫn giữ chỗ trong phòng). Phiên bản hiện tại xem ở `/health`

**Cờ tướng**
- Đủ luật: cản chân mã, cản mắt tượng, pháo cần ngòi, tốt qua sông, cấm lộ mặt tướng, cấm tự để bị chiếu, chiếu bí / hết nước là thua
- Đồng hồ **8 phút mỗi bên** (đổi được khi tạo bàn), hết giờ là thua
- **Xin thua**, **cầu hòa**, **xin đi lại** (đối thủ phải đồng ý), **chơi lại** (tự đổi màu)
- **Chế độ người xem**, biên bản nước đi theo ký hiệu Việt Nam (P2-5, M8.7…), lật bàn cờ

**Cờ caro**
- Bàn 15×15 (đổi được 10–20 khi tạo bàn), X đi trước, 5 quân liên tiếp (ngang / dọc / chéo) là thắng
- Luật **chặn hai đầu** (bật / tắt khi tạo bàn): dãy bị quân đối thủ chặn cả hai đầu thì không tính; kín bàn là hòa
- Đồng hồ **10 phút mỗi bên**, xin thua, cầu hòa, xin đi lại, chơi lại (đổi lượt đi trước), chế độ người xem
- Tô sáng nước vừa đi và dãy thắng, biên bản nước đi theo tọa độ (H8, J7…)
- **Bảng điểm** cộng dồn qua các ván (xem bên dưới)
- **Phím tắt:** `←↑→↓` di chuyển con trỏ · `Enter`/`Space` đánh · `Esc` ẩn con trỏ

**Bảng điểm (Cờ tướng và Cờ caro)**
- Thắng **+1**, hòa **+½**, thua **0**. Điểm tính theo người chơi nên chơi lại đổi màu vẫn cộng đúng người
- Bảng tỉ số (số ván / thắng / hòa / thua / điểm) và lịch sử 30 ván gần nhất (ai cầm quân gì, lý do thắng, số nước)
- Sau mỗi ván, phòng chat báo tỉ số hiện tại; chủ phòng có thể **đặt lại bảng điểm** khi không có ván đang chơi
- Bảng điểm gắn với phòng, xóa phòng hoặc khởi động lại server là mất

**Poker (Texas Hold'em No-Limit)**
- Dealer / SB / BB xoay vòng, luật heads-up, side pot, chia pot hòa, all-in không đủ mức raise không mở lại quyền raise (luật TDA)
- Đếm giờ mỗi lượt (hết giờ tự check / bỏ), nạp thêm chip, nghỉ ván
- **Hands log:** 50 ván gần nhất của bàn — stack đầu ván, D/SB/BB, từng hành động theo vòng (preflop / flop / turn / river), showdown, các pot và lời/lỗ của từng người; chuyển ván bằng `←/→`, sao chép ván dạng text. Chỉ thấy bài tẩy của mình và bài đã lật ở showdown, bài bỏ không bao giờ bị lộ
- **Phím tắt:** `F` bỏ bài · `C` theo/check · `K` check · `B` cược · `R` tố · `A` all-in · `↑/↓` ±1 BB (`Shift` ±10 BB) · `1–4` mức ⅓, ½, ¾ pot, pot · `Enter` xác nhận · `H` mở Hands log

**Tá lả (Phỏm)**
- Bốc / ăn / đánh, ăn phải tạo phỏm, lá đã ăn bị khóa, hai lá ăn không chung phỏm
- Lượt cuối: hạ phỏm (chọn tay hoặc tự động tối ưu), gửi bài, đánh lá cuối
- Ù (kể cả Ù đền), Móm, tính Nhất / Nhì / Ba / Bét, phạt bị ăn và bị ăn chốt, cộng dồn điểm qua các ván
- Gợi ý lá có thể tạo phỏm, máy đánh hộ khi hết giờ hoặc người chơi rời bàn
- **Phím tắt:** `D`/`Space` bốc · `E` ăn · `←/→` di chuyển · `↑`/`Space` chọn lá · `Enter` đánh · `H` hạ · `X` hạ tự động · `G` gửi · `U` Ù · `S` xếp bài · `N` ván mới

Bấm `?` trong phòng để xem bảng phím tắt.

### Luật tham khảo
- Cờ tướng: luật của Liên đoàn Cờ tướng châu Á (AXF). Chưa xử lý luật cấm chiếu dai / đuổi dai; người chơi có thể cầu hòa.
- Poker: Robert's Rules of Poker và luật của Poker TDA.
- Tá lả: luật miền Bắc phổ biến. Mức trả: Nhì 1, Ba 2, Bét 3, Móm 4, bị ăn 1, bị ăn chốt 4, Ù 5 mỗi nhà. Luật Tá lả khác nhau theo vùng, có thể chỉnh trong `TALA_RULES` ở [shared/src/tala.js](shared/src/tala.js).

## Chạy trên máy

```bash
npm install
npm run dev        # server :3001 + Vite :5173 (proxy socket sang server)
```
Mở http://localhost:5173 ở vài tab (hoặc tab ẩn danh) để thử nhiều người chơi.

```bash
npm test                     # unit test luật chơi
npm run build                # build client vào client/dist
npm start                    # server phục vụ luôn client đã build tại :3001
npm run test:e2e -- http://localhost:3001   # kiểm thử tích hợp (server phải đang chạy)
```

## Deploy bằng GitHub Actions

Mỗi lần push lên `main`, workflow [deploy.yml](.github/workflows/deploy.yml) sẽ: chạy test → build Docker image → đẩy lên `ghcr.io/<owner>/<repo>` → deploy theo các secret bạn đã thêm. Nhánh khác và pull request chỉ chạy [ci.yml](.github/workflows/ci.yml).

Chọn **một** trong các cách sau:

### A. Render (miễn phí, dễ nhất)
1. Render → **New → Blueprint** → chọn repo (dùng sẵn [render.yaml](render.yaml)).
2. Trong service: **Settings → Deploy Hook** → copy URL.
3. GitHub repo → **Settings → Secrets and variables → Actions** → thêm secret `RENDER_DEPLOY_HOOK_URL`.

### B. VPS của bạn (đã cài Docker)
Thêm các secret: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (private key), tùy chọn `VPS_PORT` (mặc định 22), `APP_PORT` (mặc định 80).
Workflow sẽ SSH vào máy, `docker pull` image mới rồi chạy lại container `game-lobby`.
> Nếu package GHCR để private, máy VPS cần đăng nhập được GHCR; cách đơn giản nhất là đổi package sang public.

### C. Client trên GitHub Pages, server ở nơi khác
1. Deploy server bằng cách A hoặc B, đặt biến môi trường `CORS_ORIGIN=https://<user>.github.io` cho server.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables**: thêm `VITE_SERVER_URL=https://server-cua-ban`.
4. Workflow [pages.yml](.github/workflows/pages.yml) sẽ tự build và đăng client.

### Chạy bằng Docker
```bash
docker build -t game-lobby .
docker run -p 3001:3001 game-lobby
```

### Biến môi trường của server
| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3001` | Cổng HTTP |
| `CORS_ORIGIN` | `*` | Origin được phép khi client ở domain khác |
| `CLIENT_DIST` | `client/dist` | Thư mục client đã build |
| `APP_PASSWORD` | _(trống)_ | Mật khẩu để vào app (auth gate). Để trống = ai cũng vào được |
| `APP_SERVERS` | _(trống)_ | Chia app thành nhiều server, mỗi server một mật khẩu (JSON). Có biến này thì `APP_PASSWORD` bị bỏ qua |
| `TRUST_PROXY` | _(trống)_ | Đặt `1` khi chạy sau reverse proxy để giới hạn nhập sai mật khẩu theo IP thật |

### Auth gate (mật khẩu vào app)
Khi đặt `APP_PASSWORD`, mọi kết nối Socket.IO phải gửi đúng mật khẩu, nếu không sẽ bị từ chối. Người dùng thấy màn hình nhập mật khẩu, nhập đúng thì trình duyệt nhớ lại cho lần sau. Mỗi IP nhập sai quá 10 lần sẽ bị khóa 10 phút.
- **Chạy local:** `APP_PASSWORD=bimat npm run dev`
- **Docker:** `docker run -p 3001:3001 -e APP_PASSWORD=bimat game-lobby`
- **Render:** nhập `APP_PASSWORD` trong tab Environment của service
- **VPS (GitHub Actions):** thêm secret `APP_PASSWORD` (và tùy chọn variable `TRUST_PROXY=1` nếu có Nginx phía trước)

Đổi mật khẩu thì khởi động lại server; người đang dùng sẽ phải nhập mật khẩu mới khi kết nối lại.

### Nhiều server (mỗi server một mật khẩu)
Đặt `APP_SERVERS` là JSON dạng `{"tên server": "mật khẩu"}`, ví dụ:
```
APP_SERVERS={"Bên A":"mat-khau-A","Bên B":"mat-khau-B"}
```
- Nhập mật khẩu nào thì vào server đó. Mỗi server có **sảnh, phòng chơi, người chơi riêng**: bên A không thấy và không vào được phòng của bên B.
- Tên server hiện ở góc trên; nút **⇄ Đổi server** để nhập mật khẩu của server khác. Trình duyệt nhớ danh tính riêng cho từng server.
- Danh sách server không hiện cho người chưa nhập mật khẩu. Tên và mật khẩu không được trùng nhau; cấu hình sai thì server báo lỗi và không khởi động (tránh vô tình mở app không mật khẩu).
- Thêm / bớt server: sửa biến rồi deploy lại. Đổi tên server sẽ tạo server mới (người chơi phải đặt lại tên).

## Cấu trúc

```
shared/src/       Luật chơi thuần JS (dùng cho cả server và client)
  xiangqi.js      Sinh nước đi, chiếu, chiếu bí, ký hiệu nước đi
  caro.js         Đặt quân, kiểm tra 5 liên tiếp, luật chặn hai đầu
  poker.js        Chấm bài, ván cược, side pot
  tala.js         Phỏm, xếp phỏm tối ưu, ăn / hạ / gửi / Ù, tính điểm
shared/test/      Unit test (node --test)
server/src/       Express + Socket.IO, quản lý user, phòng, đồng hồ
server/src/games/ Lớp điều phối từng game (ghế, hẹn giờ, quyền thao tác)
client/src/       React UI: sảnh, phòng, bàn cờ, bàn bài, phím tắt
```

> Dữ liệu (người dùng, phòng, điểm) chỉ lưu trong bộ nhớ server, khởi động lại server là mất. Muốn lưu lâu dài thì cần thêm cơ sở dữ liệu (Redis / Postgres).
