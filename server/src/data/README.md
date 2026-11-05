# Dữ liệu từ điển

`vi-syllables.txt`: danh sách âm tiết tiếng Việt (chữ thường), mỗi dòng một âm tiết.
Dùng để kiểm tra từ trong trò **Nối từ**.

Trích từ gói [`@cspell/dict-vi-vn`](https://github.com/streetsidesoftware/cspell-dicts) v3.0.7 — giấy phép MIT:

> The MIT License (MIT)
>
> Copyright (c) 2017-2025 Street Side Software <support@streetsidesoftware.nl>
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
> to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions
> of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
> THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
> CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
> IN THE SOFTWARE.

---

# Từ điển từ ghép

`vi-words.txt`: 48.465 từ tiếng Việt gồm đúng 2 chữ (chữ thường, Unicode NFC), mỗi dòng một từ.
Dùng cho chế độ **chặt** của trò **Nối từ**: từ phải có trong danh sách này (so khớp không phụ thuộc vị trí bỏ dấu).
Danh sách chỉ được đọc trên server, không gửi xuống trình duyệt.

Lọc từ `Viet74K.txt` của dự án [duyet/vietnamese-wordlist](https://github.com/duyet/vietnamese-wordlist)
(commit `688b0953c8cdb21ee090ce80b83cefdb052fe2cd`): chỉ giữ các mục gồm đúng 2 chữ cái, bỏ mục có số/ký hiệu.

**Giấy phép: GNU GPL phiên bản 2** — toàn văn ở [`LICENSE-vi-words.txt`](LICENSE-vi-words.txt).
Tệp này giữ nguyên giấy phép GPL-2.0 khi phân phối lại.

Hạn chế đã biết: danh sách là mục từ của từ điển nên thiếu một số cụm ghép tự do thông dụng
(vd: "con mèo", "đạp xe", "hành lá"). Khi cần, chủ phòng tắt chế độ chặt để chuyển sang chế độ thoáng
(chỉ kiểm tra từng chữ, từ lạ bị gắn cờ ⚠ để người chơi phản đối).
