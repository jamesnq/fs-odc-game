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

Source viết tay không còn `any` tường minh: `config/typescript-debt.json` rỗng nên mọi file đều có budget 0 và check sẽ chặn `any` mới. `strict` vẫn bật đầy đủ, không dùng `@ts-nocheck` hay tắt `noImplicitAny`. View của từng game là kiểu dùng chung trong `shared/src/views.ts` (server khai báo `view(): XView`, client đọc cùng kiểu); `RoomState` là union theo `game`. Ở boundary dùng `unknown` + narrowing; ép kiểu chỉ còn ở vài chỗ có comment giải thích (tương quan generic mà TypeScript không suy ra được, như `Room.viewFor`, `queryGame` và `request` ở client/test). Tool/skill vendored trong `.claude`, `.agents`, `.codex` và build outputs nằm ngoài phạm vi authored application source.

Docker chỉ mang shared/server đã biên dịch, dữ liệu và client bundle vào runtime; không cần tsx/TypeScript trong production. CI kiểm tra kiểu, unit/integration tests, audit dependencies và build Docker image. File từ điển `.txt` dùng LF kể cả trên Windows để không đưa CR vào khóa âm tiết.
