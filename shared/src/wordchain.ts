export interface WordPlayer {
  id: string;
  name: string;
  bot?: string | null;
}

export type ParsedWord = {text: string; syllables: string[]; keys: string[]};
export interface WordChainPlayer extends WordPlayer {
  bot: string | null;
  lives: number;
  out: boolean;
  words: number;
  outAt: number;
}

export interface WordEntry extends ParsedWord {
  known: boolean | null;
  by: string;
  name: string;
  ts: number;
}

export interface WordChainResult {
  winner: string | null;
  ranking: string[];
  reason: 'last' | 'deadEnd';
  word?: string;
}

export interface WordChainOptions {
  lives?: number;
  isValidSyllable?: ((s: string) => boolean) | null;
  isKnownWord?: ((word: ParsedWord) => boolean) | null;
  strict?: boolean;
  first?: number;
  countNext?: ((key: string, used: Set<string>) => number) | null;
  firstMinNext?: number;
}

// Engine trò Nối từ (tiếng Việt):
//  - Mỗi từ gồm đúng 2 âm tiết. Âm tiết đầu của từ mới phải trùng âm tiết cuối của từ trước
//    (vd: "con mèo" → "mèo con" → "con đường").
//  - So sánh âm tiết theo chữ gốc + thanh điệu, không phụ thuộc vị trí bỏ dấu ("hòa" = "hoà").
//  - Không được lặp lại từ đã dùng trong ván.
//  - Người chơi lần lượt theo vòng; hết giờ mất 1 mạng, hết mạng bị loại. Người cuối cùng còn lại thắng.
//  - Có từ điển: từ mở đầu phải dễ nối (đủ nhiều từ nối tiếp); nối một từ (có trong từ điển) mà
//    từ điển không còn từ nào nối tiếp được nữa thì người đó thắng luôn.
//  - Người chơi khác có thể phản đối từ vừa nối (từ vô nghĩa). Quá nửa số người còn lại phản đối
//    thì từ bị gỡ và người đó phải nối lại.

export const WORD_SYLLABLES = 2;
/** Từ mở đầu phải có ít nhất chừng này từ nối tiếp trong từ điển (không cho ra từ quá khó). */
export const FIRST_MIN_NEXT = 10;
const TONE_MARKS: Record<string, number> = { '̀': 1, '́': 2, '̃': 3, '̉': 4, '̣': 5 }; // huyền sắc ngã hỏi nặng

/**
 * Khóa so sánh của một âm tiết: chữ gốc (giữ mũ/trăng/móc/đ) + số thanh điệu.
 * "hòa" và "hoà" cho cùng khóa "hoa1".
 */
export function syllableKey(s: unknown) {
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
export function parseWord(input: unknown) {
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

/** Tạo hàm kiểm tra một từ (đã parse) có trong danh sách từ ghép không — không phụ thuộc vị trí bỏ dấu. */
export function makeWordChecker(list: readonly string[]) {
  const keys = new Set(list.map((t) => String(t).trim().split(/\s+/).map(syllableKey).join(' ')));
  return (w: ReturnType<typeof parseWord>) => keys.has(w.keys.join(' '));
}

/**
 * Từ điển có chỉ mục theo chữ đầu: kiểm tra từ có trong từ điển và đếm số từ còn nối tiếp được.
 * @param list danh sách từ 2 chữ
 * @param isValidSyllable (tùy chọn) bỏ các mục có chữ không phải tiếng Việt (vd "acid amin")
 */
export function makeDictionary(list: readonly string[], isValidSyllable: ((s: string) => boolean) | null = null) {
  const keys = new Set<string>();
  const byFirst = new Map<string, string[]>(); // khóa chữ đầu -> [khóa từ]
  for (const t of list) {
    const parts = String(t).trim().toLowerCase().normalize('NFC').split(/\s+/);
    if (parts.length !== WORD_SYLLABLES) continue;
    if (isValidSyllable && !parts.every(isValidSyllable)) continue;
    const ks = parts.map(syllableKey);
    const key = ks.join(' ');
    if (keys.has(key)) continue;
    keys.add(key);
    if (!byFirst.has(ks[0])) byFirst.set(ks[0], []);
    byFirst.get(ks[0])!.push(key);
  }
  return {
    size: keys.size,
    has: (w: ReturnType<typeof parseWord>) => keys.has(w.keys.join(' ')),
    /** Số từ bắt đầu bằng chữ có khóa `first` mà chưa nằm trong `used`. */
    countNext(first: string, used: Set<string> | null = null) {
      const arr = byFirst.get(first);
      if (!arr) return 0;
      if (!used || !used.size) return arr.length;
      let n = 0;
      for (const k of arr) if (!used.has(k)) n++;
      return n;
    },
  };
}

/** Tạo hàm kiểm tra âm tiết từ danh sách âm tiết của từ điển. */
export function makeSyllableChecker(list: readonly string[]) {
  const keys = new Set(list.map(syllableKey));
  return (s: unknown) => keys.has(syllableKey(s));
}

export class WordChainGame {
  declare players: WordChainPlayer[];
  declare turn: number;
  declare chain: WordEntry[];
  declare used: Set<string>;
  declare objections: Set<string>;
  declare isValidSyllable: WordChainOptions['isValidSyllable'];
  declare isKnownWord: WordChainOptions['isKnownWord'];
  declare strict: boolean;
  declare countNext: WordChainOptions['countNext'];
  declare firstMinNext: number;
  declare result: WordChainResult | null;
  declare outOrder: string[];

  /**
   * @param players [{ id, name }] theo thứ tự lượt
   * @param opts { lives, isValidSyllable?, isKnownWord?, strict?, first? }
   *   isKnownWord: từ có trong từ điển từ ghép không; strict: bắt buộc phải có (không thì chỉ gắn cờ)
   *   first: chỉ số người ra từ đầu tiên (mặc định 0)
   *   countNext(firstKey, used): số từ trong từ điển còn nối tiếp được — bật luật "từ mở đầu không quá khó"
   *     (ít nhất firstMinNext từ nối tiếp) và "nối từ cụt thì thắng luôn"
   */
  constructor(players: readonly WordPlayer[], { lives = 1, isValidSyllable = null, isKnownWord = null, strict = false, first = 0, countNext = null, firstMinNext = FIRST_MIN_NEXT }: WordChainOptions = {}) {
    if (players.length < 2) throw new Error('Cần ít nhất 2 người chơi');
    this.players = players.map((p) => ({ id: p.id, name: p.name, bot: p.bot || null, lives, out: false, words: 0, outAt: 0 }));
    this.turn = Number.isInteger(first) && first >= 0 && first < players.length ? first : 0;
    this.chain = []; // { text, syllables, keys, by, name, ts }
    this.used = new Set(); // khóa của các từ đã dùng
    this.objections = new Set(); // id người phản đối từ cuối
    this.isValidSyllable = isValidSyllable;
    this.isKnownWord = isKnownWord;
    this.strict = strict && !!isKnownWord;
    this.countNext = countNext;
    this.firstMinNext = firstMinNext;
    this.result = null; // { winner: id, ranking: [id...], reason: 'last'|'deadEnd', word? }
    this.outOrder = [];
  }

  get current() { return this.players[this.turn]; }
  get last() { return this.chain[this.chain.length - 1] || null; }
  get active() { return this.players.filter((p) => !p.out); }
  /** Âm tiết từ mới phải bắt đầu bằng (null nếu là từ đầu tiên). */
  get required() { return this.last ? this.last.syllables[WORD_SYLLABLES - 1] : null; }
  indexOf(id: string) { return this.players.findIndex((p) => p.id === id); }

  submit(id: string, input: unknown) {
    if (this.result) throw new Error('Ván đã kết thúc');
    if (this.current.id !== id) throw new Error('Chưa tới lượt bạn');
    const w = parseWord(input);
    if (this.last && w.keys[0] !== this.last.keys[WORD_SYLLABLES - 1]) {
      throw new Error(`Từ phải bắt đầu bằng "${this.required}"`);
    }
    if (this.isValidSyllable) {
      const isValidSyllable = this.isValidSyllable;
      const bad = w.syllables.find((s) => !isValidSyllable(s));
      if (bad) throw new Error(`"${bad}" không có trong từ điển tiếng Việt`);
    }
    // Từ ghép phải có trong từ điển (chế độ chặt); chế độ thoáng chỉ gắn cờ để mọi người dễ phản đối
    const known = this.isKnownWord ? this.isKnownWord(w) : null;
    if (this.strict && !known) throw new Error(`"${w.text}" không có trong từ điển`);
    const key = w.keys.join(' ');
    if (this.used.has(key)) throw new Error(`"${w.text}" đã được dùng rồi`);
    // Số từ còn nối tiếp được sau từ này (tính cả việc từ này đã được dùng)
    const next = this.countNext ? this.countNext(w.keys[WORD_SYLLABLES - 1], new Set([...this.used, key])) : null;
    if (!this.last && next !== null && next < this.firstMinNext) {
      throw new Error(`Từ mở đầu quá khó: chỉ có ${next} từ bắt đầu bằng "${w.syllables[WORD_SYLLABLES - 1]}". Hãy chọn từ dễ nối hơn`);
    }
    this.used.add(key);
    const by = this.current;
    this.chain.push({ ...w, known, by: id, name: by.name, ts: Date.now() });
    by.words++;
    this.objections = new Set();
    // Nối từ (có trong từ điển) mà không còn từ nào nối tiếp được → thắng luôn
    if (next === 0 && known !== false) {
      const others: string[] = [];
      const n = this.players.length;
      for (let k = 1; k < n; k++) {
        const p = this.players[(this.turn + k) % n];
        if (!p.out) others.push(p.id);
      }
      this.result = { winner: id, ranking: [id, ...others, ...this.outOrder.slice().reverse()], reason: 'deadEnd', word: w.text };
      return w;
    }
    this._advance();
    return w;
  }

  /** Người chơi khác phản đối từ vừa nối. Trả về true nếu từ bị gỡ. */
  object(id: string) {
    if (this.result) throw new Error('Ván đã kết thúc');
    const last = this.last;
    if (!last) throw new Error('Chưa có từ nào để phản đối');
    const p = this.players[this.indexOf(id)];
    if (!p || p.out) throw new Error('Chỉ người chơi còn trong ván mới được phản đối');
    if (p.bot) throw new Error('Máy không bỏ phiếu phản đối');
    if (last.by === id) throw new Error('Không thể phản đối từ của chính mình');
    if (this.objections.has(id)) this.objections.delete(id);
    else this.objections.add(id);
    if (this.objections.size > this.objectionsNeeded() - 1) {
      this._revoke();
      return true;
    }
    return false;
  }

  /** Số phiếu phản đối cần để gỡ từ: quá nửa số người còn lại (trừ người nối từ đó và máy — máy không bỏ phiếu). */
  objectionsNeeded() {
    const last = this.last;
    const voters = this.active.filter((p) => !p.bot && (!last || p.id !== last.by)).length;
    return Math.floor(voters / 2) + 1;
  }

  _revoke() {
    const w = this.chain.pop()!;
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
  eliminate(id: string) {
    const p = this.players[this.indexOf(id)];
    if (!p || p.out || this.result) return;
    this._loseLife(p, true);
  }

  _loseLife(p: WordChainPlayer, all: boolean) {
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
      reason: 'last',
    };
    return true;
  }
}
