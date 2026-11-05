// Engine trò Nối từ (tiếng Việt):
//  - Mỗi từ gồm đúng 2 âm tiết. Âm tiết đầu của từ mới phải trùng âm tiết cuối của từ trước
//    (vd: "con mèo" → "mèo con" → "con đường").
//  - So sánh âm tiết theo chữ gốc + thanh điệu, không phụ thuộc vị trí bỏ dấu ("hòa" = "hoà").
//  - Không được lặp lại từ đã dùng trong ván.
//  - Người chơi lần lượt theo vòng; hết giờ mất 1 mạng, hết mạng bị loại. Người cuối cùng còn lại thắng.
//  - Người chơi khác có thể phản đối từ vừa nối (từ vô nghĩa). Quá nửa số người còn lại phản đối
//    thì từ bị gỡ và người đó phải nối lại.

export const WORD_SYLLABLES = 2;
const TONE_MARKS = { '̀': 1, '́': 2, '̃': 3, '̉': 4, '̣': 5 }; // huyền sắc ngã hỏi nặng

/**
 * Khóa so sánh của một âm tiết: chữ gốc (giữ mũ/trăng/móc/đ) + số thanh điệu.
 * "hòa" và "hoà" cho cùng khóa "hoa1".
 */
export function syllableKey(s) {
  let tone = 0;
  const base = [...String(s).toLowerCase().normalize('NFD')]
    .filter((ch) => {
      if (TONE_MARKS[ch]) { tone = TONE_MARKS[ch]; return false; }
      return true;
    })
    .join('')
    .normalize('NFC');
  return base + tone;
}

/** Tách và chuẩn hóa từ người chơi nhập. Trả về { text, syllables, keys } hoặc ném lỗi. */
export function parseWord(input) {
  const text = String(input || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Hãy nhập một từ');
  const syllables = text.split(' ');
  if (syllables.length !== WORD_SYLLABLES) throw new Error(`Từ phải gồm đúng ${WORD_SYLLABLES} chữ (vd: "con mèo")`);
  for (const s of syllables) {
    if (!/^\p{L}+$/u.test(s)) throw new Error(`"${s}" không phải chữ hợp lệ`);
    if (s.length > 7) throw new Error(`"${s}" quá dài`);
  }
  return { text, syllables, keys: syllables.map(syllableKey) };
}

/** Tạo hàm kiểm tra âm tiết từ danh sách âm tiết của từ điển. */
export function makeSyllableChecker(list) {
  const keys = new Set(list.map(syllableKey));
  return (s) => keys.has(syllableKey(s));
}

export class WordChainGame {
  /**
   * @param players [{ id, name }] theo thứ tự lượt
   * @param opts { lives, isValidSyllable? }
   */
  constructor(players, { lives = 1, isValidSyllable = null } = {}) {
    if (players.length < 2) throw new Error('Cần ít nhất 2 người chơi');
    this.players = players.map((p) => ({ id: p.id, name: p.name, lives, out: false, words: 0, outAt: 0 }));
    this.turn = 0;
    this.chain = []; // { text, syllables, keys, by, name, ts }
    this.used = new Set(); // khóa của các từ đã dùng
    this.objections = new Set(); // id người phản đối từ cuối
    this.isValidSyllable = isValidSyllable;
    this.result = null; // { winner: id, ranking: [id...] }
    this.outOrder = [];
  }

  get current() { return this.players[this.turn]; }
  get last() { return this.chain[this.chain.length - 1] || null; }
  get active() { return this.players.filter((p) => !p.out); }
  /** Âm tiết từ mới phải bắt đầu bằng (null nếu là từ đầu tiên). */
  get required() { return this.last ? this.last.syllables[WORD_SYLLABLES - 1] : null; }
  indexOf(id) { return this.players.findIndex((p) => p.id === id); }

  submit(id, input) {
    if (this.result) throw new Error('Ván đã kết thúc');
    if (this.current.id !== id) throw new Error('Chưa tới lượt bạn');
    const w = parseWord(input);
    if (this.last && w.keys[0] !== this.last.keys[WORD_SYLLABLES - 1]) {
      throw new Error(`Từ phải bắt đầu bằng "${this.required}"`);
    }
    if (this.isValidSyllable) {
      const bad = w.syllables.find((s) => !this.isValidSyllable(s));
      if (bad) throw new Error(`"${bad}" không có trong từ điển tiếng Việt`);
    }
    const key = w.keys.join(' ');
    if (this.used.has(key)) throw new Error(`"${w.text}" đã được dùng rồi`);
    this.used.add(key);
    this.chain.push({ ...w, by: id, name: this.current.name, ts: Date.now() });
    this.current.words++;
    this.objections = new Set();
    this._advance();
    return w;
  }

  /** Người chơi khác phản đối từ vừa nối. Trả về true nếu từ bị gỡ. */
  object(id) {
    if (this.result) throw new Error('Ván đã kết thúc');
    const last = this.last;
    if (!last) throw new Error('Chưa có từ nào để phản đối');
    const p = this.players[this.indexOf(id)];
    if (!p || p.out) throw new Error('Chỉ người chơi còn trong ván mới được phản đối');
    if (last.by === id) throw new Error('Không thể phản đối từ của chính mình');
    if (this.objections.has(id)) this.objections.delete(id);
    else this.objections.add(id);
    if (this.objections.size > this.objectionsNeeded() - 1) {
      this._revoke();
      return true;
    }
    return false;
  }

  /** Số phiếu phản đối cần để gỡ từ: quá nửa số người còn lại (trừ người nối từ đó). */
  objectionsNeeded() {
    const last = this.last;
    const voters = this.active.filter((p) => !last || p.id !== last.by).length;
    return Math.floor(voters / 2) + 1;
  }

  _revoke() {
    const w = this.chain.pop();
    this.used.delete(w.keys.join(' '));
    this.objections = new Set();
    const i = this.indexOf(w.by);
    this.players[i].words--;
    // Trả lượt về cho người vừa bị gỡ từ (nếu còn trong ván)
    if (!this.players[i].out) this.turn = i;
  }

  /** Hết giờ: người tới lượt mất 1 mạng (hết mạng thì bị loại) và lượt chuyển tiếp. */
  timeout() {
    if (this.result) return;
    this._loseLife(this.current, false);
  }

  /** Bỏ cuộc / rời bàn: bị loại ngay. */
  eliminate(id) {
    const p = this.players[this.indexOf(id)];
    if (!p || p.out || this.result) return;
    this._loseLife(p, true);
  }

  _loseLife(p, all) {
    const wasTurn = this.current === p;
    p.lives = all ? 0 : p.lives - 1;
    if (p.lives <= 0) {
      p.out = true;
      p.outAt = Date.now();
      this.outOrder.push(p.id);
      this.objections.delete(p.id);
    }
    if (this._checkEnd()) return;
    if (wasTurn) this._advance();
  }

  _advance() {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.turn + k) % n;
      if (!this.players[i].out) { this.turn = i; return; }
    }
  }

  _checkEnd() {
    const alive = this.active;
    if (alive.length > 1) return false;
    const winner = alive[0] || null;
    this.result = {
      winner: winner ? winner.id : null,
      ranking: [...(winner ? [winner.id] : []), ...this.outOrder.slice().reverse()],
    };
    return true;
  }
}
