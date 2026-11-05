# Tên miền riêng cho Sảnh Trò Chơi

App đang chạy ở `game-lobby-96o7.onrender.com`. Có thể gắn tên miền riêng (vd. `sanhtrochoi.com`, `choi.tenban.id.vn`) mà không cần đổi code.

## Chọn tên miền

| Loại | Ví dụ | Chi phí (tham khảo, 11/2026) | Ghi chú |
|---|---|---|---|
| `.com` qua Cloudflare Registrar | `sanhtrochoi.com` | ~11 USD/năm, gia hạn cùng giá (giá gốc, không lời) | Rẻ & ổn định nhất; DNS Cloudflare miễn phí |
| `.vn` / `.com.vn` (nhà đăng ký VN: Mắt Bão, P.A Việt Nam, Tenten…) | `sanhtrochoi.vn` | vài trăm nghìn – ~1 triệu đ/năm | Cần CCCD; tên miền quốc gia |
| `.id.vn` (cá nhân) / `.io.vn` (ứng dụng số) | `trihoang.id.vn` | rẻ; `.id.vn` từng miễn phí 2 năm đầu cho công dân 18–23 tuổi (chương trình tới 31/12/2025 — cần kiểm tra còn ưu đãi không trên tenmien.vn) | Hợp cho dự án cá nhân |
| Tên miền con miễn phí của Render | `*.onrender.com` | 0 đ | Đang dùng |

## Gắn vào Render (TLS/HTTPS miễn phí, tự gia hạn)
1. Render → service → **Settings → Custom Domains → Add** → nhập tên miền (vd. `sanhtrochoi.com` và `www.sanhtrochoi.com`).
2. Ở nơi quản lý DNS:
   - Tên miền gốc (`@`): bản ghi `ALIAS/ANAME` (Cloudflare: `CNAME` flattening) trỏ tới `game-lobby-96o7.onrender.com`, hoặc `A` tới IP Render đưa ra.
   - `www`: `CNAME` → `game-lobby-96o7.onrender.com`.
   - Xóa bản ghi `AAAA` cũ nếu có; nếu có bản ghi `CAA` thì phải cho phép Let's Encrypt.
   - Dùng Cloudflare: để **DNS only (mây xám)** khi xác minh.
3. Bấm **Verify** trên Render → chứng chỉ HTTPS được cấp tự động (vài phút; lỗi 502 lúc đầu là bình thường).
4. Gói Hobby của Render cho 2 tên miền riêng.

## Ảnh hưởng tới app
- Không cần đổi code: CSP dùng `'self'`, cookie/phiên theo origin hiện tại, Socket.IO kết nối cùng origin.
- `TRUST_PROXY=1` vẫn giữ nguyên. Nếu bật proxy Cloudflare (mây cam) thì WebSocket vẫn chạy, nhưng IP người dùng sẽ là IP Cloudflare trừ khi đọc thêm header `CF-Connecting-IP` → giữ **DNS only** cho đơn giản.
- Người dùng cũ dùng link `onrender.com` vẫn vào được; có thể bật chuyển hướng sang tên miền mới sau.

Nguồn: [Render — Custom Domains](https://render.com/docs/custom-domains), [Render — TLS](https://render.com/docs/tls), [CostGoat — giá .com Cloudflare](https://costgoat.com/pricing/cloudflare-domains), [Runsystem — .id.vn miễn phí](https://runsystem.net/en/news/get-your-idvn-domain-free-tentenvn-100-free-eligible-citizens), [Vietnamnet — tên miền .vn mới](https://vietnamnet.vn/en/vietnam-expands-vn-domain-space-with-nearly-70-000-new-registrations-2368994.html).
