# 🎲 Sảnh Trò Chơi — Tá lả · Poker · Cờ tướng

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

**Cờ tướng**
- Đủ luật: cản chân mã, cản mắt tượng, pháo cần ngòi, tốt qua sông, cấm lộ mặt tướng, cấm tự để bị chiếu, chiếu bí / hết nước là thua
- Đồng hồ **8 phút mỗi bên** (đổi được khi tạo bàn), hết giờ là thua
- **Xin thua**, **cầu hòa**, **xin đi lại** (đối thủ phải đồng ý), **chơi lại** (tự đổi màu)
- **Chế độ người xem**, biên bản nước đi theo ký hiệu Việt Nam (P2-5, M8.7…), lật bàn cờ

**Poker (Texas Hold'em No-Limit)**
- Dealer / SB / BB xoay vòng, luật heads-up, side pot, chia pot hòa, all-in không đủ mức raise không mở lại quyền raise (luật TDA)
- Đếm giờ mỗi lượt (hết giờ tự check / bỏ), nạp thêm chip, nghỉ ván
- **Phím tắt:** `F` bỏ bài · `C` theo/check · `K` check · `B` cược · `R` tố · `A` all-in · `↑/↓` ±1 BB (`Shift` ±10 BB) · `1–4` mức ⅓, ½, ¾ pot, pot · `Enter` xác nhận

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

## Cấu trúc

```
shared/src/       Luật chơi thuần JS (dùng cho cả server và client)
  xiangqi.js      Sinh nước đi, chiếu, chiếu bí, ký hiệu nước đi
  poker.js        Chấm bài, ván cược, side pot
  tala.js         Phỏm, xếp phỏm tối ưu, ăn / hạ / gửi / Ù, tính điểm
shared/test/      Unit test (node --test)
server/src/       Express + Socket.IO, quản lý user, phòng, đồng hồ
server/src/games/ Lớp điều phối từng game (ghế, hẹn giờ, quyền thao tác)
client/src/       React UI: sảnh, phòng, bàn cờ, bàn bài, phím tắt
```

> Dữ liệu (người dùng, phòng, điểm) chỉ lưu trong bộ nhớ server, khởi động lại server là mất. Muốn lưu lâu dài thì cần thêm cơ sở dữ liệu (Redis / Postgres).
