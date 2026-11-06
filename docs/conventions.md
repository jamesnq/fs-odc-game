# Convention cơ bản

Quy ước này ưu tiên code dễ đọc và khớp repo hiện tại, không áp một style guide lớn gây đổi hàng loạt code cũ.

## TypeScript và ESM

- `.ts` cho engine/server/script; `.tsx` cho React có JSX. Export package dùng ESM và declarations. Import tương đối viết `.js` (TypeScript/tsx/Vite phân giải source `.ts/.tsx`); không import `dist` vào source, ngoại trừ worker entry được build riêng có giải thích.
- `strict` bật đầy đủ. Boundary HTTP/socket/storage/Redis dùng kiểu input rõ ràng, xem dữ liệu không đáng tin là `unknown`, kiểm tra trước khi sử dụng. Tránh type assertion; nếu phải assert tại serialization/test double, chỉ assert ở boundary và ghi lý do.
- Dùng `interface` cho shape dữ liệu, `type` cho union/alias; dùng union có `type` discriminator cho action. Không dùng `any` mới hoặc empty catch để nuốt lỗi nghiệp vụ. Catch cố ý best-effort (storage cleanup, âm thanh tùy chọn) cần comment giải thích.
- Khai báo kiểu cho exported API, props và state phức tạp. Để compiler suy luận local variable/callback đơn giản. `readonly` cho input không được mutate; engine có mutation phải thể hiện rõ API và test.
- `null` biểu diễn trạng thái nghiệp vụ vắng mặt (chưa có ván/kết quả), `undefined` cho option chưa truyền. Đừng đổi wire format chỉ để đẹp kiểu.

## Naming và trình bày

- Class, interface, type và React component: `PascalCase`; function/variable/method: `camelCase`; hằng cố định có ý nghĩa toàn module: `UPPER_SNAKE_CASE`.
- React component file: `SnakeGame.tsx`, `Modal.tsx`; module/helper file: `snakeRender.ts`, `botPool.ts`; test: `name.test.ts`; compile-time test: `name.types.ts`.
- Boolean có ý nghĩa rõ (`isPlaying`, `enabled`, `hasOnlineMember`). Function dùng động từ (`createRoom`, `resumeRoom`), tránh `data2`, `handleStuff`, `utils` chứa mọi thứ.
- 2 spaces, single quotes, semicolon, trailing comma hợp lý; khớp block xung quanh. Group imports: Node, package, nội bộ; dùng `import type`. Comment giải thích lý do/invariant thay vì diễn giải lại code.
- Giữ tiếng Việt ở UI và lỗi cho người chơi; tên API/identifier tiếng Anh. Error log vận hành không chứa token, password, private cards hoặc đáp án.

## Clean code và tái sử dụng

- Một function/component chịu một trách nhiệm; tách phần chuyển đổi dữ liệu, side effect và render khi chúng đã khác nhiệm vụ. Dùng guard clause; tránh nested ternary hoặc state flag trùng lặp khi union trạng thái rõ hơn.
- Engine không truy cập network/DOM/React. Adapter điều phối engine; UI gọi contract. Không copy luật giữa client/server. Shared UI vào `components/`, renderer riêng game giữ trong `games/`.
- Khi hai nơi có logic cùng ý nghĩa và cùng invariant, trích helper có tên cụ thể. Không gom code chỉ vì trông giống nhau nếu lifecycle/luật khác nhau; không thêm generic registry, base class hoặc dependency trước khi có nhu cầu thật.
- Timer, listener, worker, socket và resource phải có cleanup; request bất đồng bộ cần xét stale result/disconnect/dispose. React hook ở top level, dependency phản ánh giá trị đọc; dùng ref có chủ đích cho callback/lifecycle dài.
- Giữ public view tách private engine state; tối ưu bằng đo đạc, không bỏ validation/fencing/rate limits để benchmark đẹp hơn.

## Checks

`npm run check` = policy TS-only/nợ kiểu + ESLint + strict typecheck. ESLint dùng [flat config](https://eslint.org/docs/latest/use/configure/configuration-files) và [recommended TypeScript rules](https://typescript-eslint.io/getting-started/), thêm Rules of Hooks. Typecheck bắt cú pháp/kiểu, lint bắt lỗi cấu trúc/unused/dead assignment, tests xác nhận hành vi.

Baseline `config/typescript-debt.json` chỉ ghi nhận `any` còn lại từ migration. File mới không được có `any`; file cũ không được tăng số lượng. Không tăng baseline để chữa check đỏ. Khi giảm nợ, hạ budget tương ứng trong cùng PR. Không đồng nghĩa code cũ đã typed end-to-end.
