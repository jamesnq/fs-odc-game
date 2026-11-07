# TypeScript

Repo dùng TypeScript strict cho cả shared, server, client, tests, scripts và ESLint config. Node.js 22.13 trở lên; CI và Docker dùng Node 22. Cài bằng `npm ci`.

- `npm run dev`: build shared một lần, sau đó watch shared, server và Vite.
- `npm run typecheck`: build declarations shared, kiểm tra ba workspace cùng toàn bộ test/script. Bao gồm các trường hợp phải lỗi kiểu trong `shared/test/contracts.types.ts`.
- `npm run check`: source policy + ESLint + strict typecheck. `check:source` chặn JS viết tay, suppression TypeScript và tăng nợ `any`; CI đối chiếu baseline với base commit để không thể tăng budget trong PR.
- `npm run lint` / `npm run lint:fix`: ESLint flat config với recommended JS/TS rules và Rules of Hooks; CI không chấp nhận warning.
- `npm test`: build shared/server rồi chạy unit tests luật chơi, handler, worker và recovery bằng tsx. Hai tests Redis thật cần `TEST_REDIS_URL`; CI cung cấp Redis.
- `npm run build`: biên dịch shared/server thành ESM, xuất declarations, chép dữ liệu server, kiểm tra kiểu và bundle client.
- `npm start`: chạy `server/dist/index.js`; cần build trước.
- `npm run test:integration`: tự chạy server biên dịch với hai sảnh có mật khẩu trên cổng 3191, chạy suite Socket.IO hiện có và dọn process. Có thể đổi cổng bằng `TEST_PORT`.
- `npm run test:e2e -- <url>`: kiểm tra server đã chạy. Các script tùy chọn WebRTC: `npx tsx server/test/voice-browser.ts` và `npx tsx server/test/ice-check.ts`; cần trình duyệt Playwright/Chrome và môi trường mạng phù hợp.

`@game/shared/*` có exports ESM trỏ vào `dist/*.js` và `types` trỏ vào `dist/*.d.ts`. Import tương đối trong source Node dùng đuôi `.js`; compiler/tsx phân giải về `.ts`. Vite nạp entry `.tsx`.

`shared/src/contracts.ts` khai báo hai chiều Socket.IO, payload request, ack, game action theo discriminator, query, trạng thái lobby/phòng và SDP/ICE. Client request giữ tương quan event → payload → response; server đăng ký handler với cùng contracts. Kiểu tĩnh không thay thế kiểm tra dữ liệu/rate limit/auth lúc chạy.

Migration giữ một số `any` tường minh ở state/view nội bộ đa hình của game, React context/props cũ và test harness giả lập. `strict` vẫn bật đầy đủ, không dùng `@ts-nocheck` hay tắt `noImplicitAny`. Các phần này chưa phải schema game được kiểm tra kiểu end-to-end; có thể siết tiếp theo từng game mà không đổi wire format. `config/typescript-debt.json` chỉ ghi nhận nợ đã có theo file: code mới không được có `any`, file cũ không được tăng budget. Tool/skill vendored trong `.claude`, `.agents`, `.codex` và build outputs nằm ngoài phạm vi authored application source.

Docker chỉ mang shared/server đã biên dịch, dữ liệu và client bundle vào runtime; không cần tsx/TypeScript trong production. CI kiểm tra kiểu, unit/integration tests, audit dependencies và build Docker image. File từ điển `.txt` dùng LF kể cả trên Windows để không đưa CR vào khóa âm tiết.
