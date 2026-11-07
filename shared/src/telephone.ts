// Tam sao thất bản (vẽ): mỗi người viết một câu, người sau vẽ câu đó, người sau nữa nhìn tranh
// đoán lại bằng lời, rồi lại vẽ… Mỗi "câu chuyện" đi qua mọi người đúng một lần; cuối ván cả bàn
// xem lại từng câu chuyện bị "thất bản" thế nào.

/** Bước k: chẵn là viết / đoán bằng lời, lẻ là vẽ. */
export const stepKind = (k: number) => (k % 2 === 0 ? 'text' : 'draw');

/** Ở bước k, người thứ i làm tiếp câu chuyện số (i − k) mod n (câu chuyện c do người c mở đầu). */
export const chainOf = (i: number, k: number, n: number) => (((i - k) % n) + n) % n;

/** Câu trả lời bằng lời: gộp khoảng trắng, bỏ ký tự điều khiển, tối đa 80 ký tự. */
// eslint-disable-next-line no-control-regex -- Intentionally sanitize ASCII control characters in player text.
export const cleanText = (s: unknown) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
