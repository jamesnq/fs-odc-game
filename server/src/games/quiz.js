// Đố vui (kiểu Kahoot): cả phòng cùng trả lời câu hỏi trắc nghiệm có giờ, chơi được cả một mình.
// Câu hỏi lấy ngẫu nhiên từ bộ có sẵn (data/quiz-vi.json) hoặc từ bộ câu hỏi người chơi tự soạn.
// Server giữ đáp án và tự đo thời gian trả lời: client không biết đáp án trước khi hết giờ.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQuizText, scoreAnswer, streakBonus, shuffle, shuffleChoices, QUIZ_CATEGORIES } from '@game/shared/quiz';
import { clampInt } from './options.js';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/quiz-vi.json');
/** Bộ câu hỏi có sẵn: [{ c: chủ đề, q, a: đáp án đúng, w: [đáp án sai] }] */
export const BANK = JSON.parse(fs.readFileSync(DATA, 'utf8')).map((x, id) => ({ ...x, id }));
export const CATEGORIES = QUIZ_CATEGORIES.filter((c) => BANK.some((x) => x.c === c));
for (const x of BANK) if (!QUIZ_CATEGORIES.includes(x.c)) throw new Error(`quiz-vi.json: chủ đề lạ "${x.c}"`);

const INTRO_MS = 3000; // đếm ngược trước câu đầu tiên
const REVEAL_MS = 6000; // thời gian xem đáp án + bảng xếp hạng giữa hai câu
const HISTORY_MAX = 10;
const TF = ['Đúng', 'Sai'];

export class QuizHandler {
  constructor(room, options) {
    this.room = room;
    this.options = {
      maxSeats: clampInt(options.maxSeats, 1, 30, 20),
      questions: clampInt(options.questions, 3, 30, 10),
      seconds: clampInt(options.seconds, 5, 60, 20),
      category: CATEGORIES.includes(options.category) ? options.category : 'all',
    };
    this.seats = []; // [{ id, name }]
    this.ready = new Set();
    this.status = 'waiting'; // waiting | playing | over
    this.custom = null; // { title, questions, by } — bộ câu hỏi tự soạn đang dùng
    this.seen = new Set(); // câu có sẵn đã hỏi trong phòng này, tránh lặp lại giữa các ván
    this.game = null;
    this.timer = null;
    this.gameNo = 0;
    this.wins = new Map(); // id -> { id, name, games, wins, best }
    this.history = []; // ván đã xong: { no, endedAt, title, ranking: [{ id, name, score, correct }] }
  }

  get maxPlayers() { return this.options.maxSeats; }
  playerIds() { return this.seats.map((s) => s.id); }
  isPlaying() { return this.status === 'playing'; }
  seated(id) { return this.seats.some((s) => s.id === id); }

  rename(id, name) {
    for (const s of this.seats) if (s.id === id) s.name = name;
    const p = this.game?.players.get(id);
    if (p) p.name = name;
    const w = this.wins.get(id);
    if (w) w.name = name;
  }

  sit(user) {
    if (this.seated(user.id)) throw new Error('Bạn đã ngồi rồi');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra, đợi ván sau nhé');
    if (this.seats.length >= this.options.maxSeats) throw new Error('Bàn đã đủ người');
    this.seats.push({ id: user.id, name: user.name });
  }

  stand(id) {
    if (!this.seated(id)) return;
    this.seats = this.seats.filter((s) => s.id !== id);
    this.ready.delete(id);
    if (this.status !== 'playing') return;
    const p = this.game.players.get(id);
    if (p) p.left = true;
    if (!this.seats.length) return this._finish();
    if (this.game.phase === 'question' && this._allAnswered()) this._reveal();
  }

  onLeave(id) { this.stand(id); }

  // ---------- Hành động ----------

  action(id, a) {
    switch (a.type) {
      case 'loadQuiz': return this._loadQuiz(id, a);
      case 'useBuiltin': return this._useBuiltin(id, a);
      case 'next': return this._next(id);
      case 'setSeconds': {
        this._canEdit(id);
        this.options.seconds = clampInt(a.seconds, 5, 60, this.options.seconds);
        this.ready.clear();
        this.room.system(`Thời gian mỗi câu: ${this.options.seconds} giây`);
        return;
      }
      default: break;
    }
    if (!this.seated(id)) throw new Error('Bạn đang ở chế độ xem');
    switch (a.type) {
      case 'ready': {
        if (this.status === 'playing') throw new Error('Ván đang diễn ra');
        if (this.ready.has(id)) this.ready.delete(id);
        else this.ready.add(id);
        if (this.seats.length && this.seats.every((s) => this.ready.has(s.id))) this._start();
        return;
      }
      case 'answer': return this._answer(id, a.choice);
      default:
        throw new Error('Hành động không hợp lệ');
    }
  }

  _canEdit(id) {
    if (!this.seated(id) && this.room.ownerId !== id) throw new Error('Chỉ người đang chơi hoặc chủ phòng mới được đổi bộ câu hỏi');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra');
  }

  _loadQuiz(id, a) {
    this._canEdit(id);
    const text = String(a.text || '');
    if (text.length > 30000) throw new Error('Bộ câu hỏi quá dài');
    const { title, questions } = parseQuizText(text);
    const by = this.seats.find((s) => s.id === id)?.name || this.room.nameOf(id);
    this.custom = { title: title || `Bộ câu hỏi của ${by}`, questions, by };
    this.ready.clear();
    this.room.system(`${by} đã nạp bộ câu hỏi "${this.custom.title}" (${questions.length} câu)`);
  }

  _useBuiltin(id, a) {
    this._canEdit(id);
    if (a.category !== undefined) this.options.category = CATEGORIES.includes(a.category) ? a.category : 'all';
    if (a.questions !== undefined) this.options.questions = clampInt(a.questions, 3, 30, this.options.questions);
    if (a.seconds !== undefined) this.options.seconds = clampInt(a.seconds, 5, 60, this.options.seconds);
    const wasCustom = !!this.custom;
    this.custom = null;
    this.ready.clear();
    const cat = this.options.category === 'all' ? 'tất cả chủ đề' : this.options.category;
    this.room.system(`${wasCustom ? 'Chuyển về bộ câu hỏi có sẵn' : 'Đổi cài đặt'}: ${cat}, ${this.options.questions} câu, ${this.options.seconds} giây/câu`);
  }

  /** Chủ phòng bấm "Câu tiếp" để bỏ qua thời gian xem đáp án. */
  _next(id) {
    if (this.room.ownerId !== id && !this.seated(id)) throw new Error('Bạn đang ở chế độ xem');
    if (this.status !== 'playing' || this.game.phase !== 'reveal') throw new Error('Chưa thể sang câu tiếp');
    this._advance();
  }

  _answer(id, choice) {
    const g = this.game;
    if (this.status !== 'playing' || g.phase !== 'question') throw new Error('Chưa tới lúc trả lời');
    const p = g.players.get(id);
    if (!p || p.left) throw new Error('Bạn không tham gia ván này');
    if (g.answers.has(id)) throw new Error('Bạn đã trả lời câu này rồi');
    const q = g.questions[g.index];
    const c = Number(choice);
    if (!Number.isInteger(c) || c < 0 || c >= q.choices.length) throw new Error('Đáp án không hợp lệ');
    g.answers.set(id, { choice: c, ms: Date.now() - g.startAt });
    if (this._allAnswered()) this._reveal();
  }

  // ---------- Diễn biến ván ----------

  _pickQuestions() {
    // Bộ tự soạn: hỏi hết các câu, thứ tự ngẫu nhiên
    if (this.custom) return shuffle(this.custom.questions.map((q) => shuffleChoices(q)));
    const pool = BANK.filter((x) => this.options.category === 'all' || x.c === this.options.category);
    let fresh = pool.filter((x) => !this.seen.has(x.id));
    if (fresh.length < this.options.questions) {
      for (const x of pool) this.seen.delete(x.id); // đã hỏi gần hết: cho lặp lại từ đầu
      fresh = pool;
    }
    return shuffle(fresh.slice()).slice(0, this.options.questions).map((x) => {
      this.seen.add(x.id);
      // Câu Đúng/Sai giữ thứ tự cố định, câu khác xáo thứ tự đáp án
      if (x.w.length === 1 && TF.includes(x.a) && TF.includes(x.w[0])) return { q: x.q, c: x.c, choices: TF, answer: TF.indexOf(x.a) };
      return shuffleChoices({ q: x.q, c: x.c, choices: [x.a, ...x.w], answer: 0 });
    });
  }

  _start() {
    const questions = this._pickQuestions();
    if (!questions.length) throw new Error('Không có câu hỏi nào');
    this.status = 'playing';
    this.ready.clear();
    this.gameNo++;
    this.game = {
      title: this.custom ? this.custom.title : `Bộ có sẵn · ${this.options.category === 'all' ? 'Tất cả chủ đề' : this.options.category}`,
      questions,
      index: -1,
      phase: 'intro',
      startAt: 0,
      deadline: Date.now() + INTRO_MS,
      answers: new Map(),
      reveal: null,
      players: new Map(this.seats.map((s) => [s.id, { id: s.id, name: s.name, score: 0, streak: 0, correct: 0, last: null, left: false }])),
    };
    this.room.system(`Ván ${this.gameNo} bắt đầu: ${this.game.title} — ${questions.length} câu, ${this.options.seconds} giây/câu`);
    this._after(INTRO_MS, () => this._ask(0));
  }

  _after(ms, fn) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.status !== 'playing') return;
      fn();
      this.room.changed();
    }, ms);
  }

  _ask(i) {
    const g = this.game;
    g.index = i;
    g.phase = 'question';
    g.answers = new Map();
    g.reveal = null;
    g.startAt = Date.now();
    const ms = this.options.seconds * 1000;
    g.deadline = g.startAt + ms;
    this._after(ms + 300, () => this._reveal()); // 300ms bù trễ mạng cho câu trả lời sát giờ
  }

  _active() { return [...this.game.players.values()].filter((p) => !p.left); }
  _allAnswered() { return this._active().every((p) => this.game.answers.has(p.id)); }

  _reveal() {
    const g = this.game;
    if (g.phase !== 'question') return;
    const q = g.questions[g.index];
    const total = this.options.seconds * 1000;
    const counts = q.choices.map(() => 0);
    for (const p of g.players.values()) {
      const a = g.answers.get(p.id);
      if (a) counts[a.choice]++;
      const correct = !!a && a.choice === q.answer;
      const points = scoreAnswer(correct, a?.ms ?? total, total);
      p.streak = correct ? p.streak + 1 : 0;
      const bonus = correct ? streakBonus(p.streak) : 0;
      p.score += points + bonus;
      if (correct) p.correct++;
      p.last = { answered: !!a, choice: a ? a.choice : null, correct, points, bonus, ms: a?.ms ?? null };
    }
    g.phase = 'reveal';
    g.reveal = { answer: q.answer, counts };
    g.deadline = Date.now() + REVEAL_MS;
    this._after(REVEAL_MS, () => this._advance());
  }

  _advance() {
    const g = this.game;
    if (g.index + 1 < g.questions.length) this._ask(g.index + 1);
    else this._finish();
  }

  _ranking() {
    return [...this.game.players.values()].sort((a, b) => b.score - a.score || b.correct - a.correct);
  }

  _finish() {
    clearTimeout(this.timer);
    const g = this.game;
    this.status = 'over';
    g.phase = 'over';
    g.deadline = 0;
    const ranking = this._ranking();
    const top = ranking[0];
    const multi = ranking.length > 1;
    for (const p of ranking) {
      const w = this.wins.get(p.id) || { id: p.id, name: p.name, games: 0, wins: 0, best: 0 };
      w.name = p.name;
      w.games++;
      if (multi && p === top && p.score > 0) w.wins++;
      w.best = Math.max(w.best, p.score);
      this.wins.set(p.id, w);
    }
    this.history.unshift({
      no: this.gameNo,
      endedAt: Date.now(),
      title: g.title,
      total: g.questions.length,
      ranking: ranking.map(({ id, name, score, correct }) => ({ id, name, score, correct })),
    });
    if (this.history.length > HISTORY_MAX) this.history.pop();
    this.room.system(multi
      ? `🏆 ${top.name} thắng với ${top.score} điểm (${top.correct}/${g.questions.length} câu đúng)`
      : `Kết thúc: ${top.name} được ${top.score} điểm, đúng ${top.correct}/${g.questions.length} câu`);
  }

  // ---------- Hiển thị ----------

  view(viewerId) {
    const g = this.game;
    const playing = this.status === 'playing';
    let game = null;
    if (g) {
      const q = g.index >= 0 ? g.questions[g.index] : null;
      const showQ = q && (g.phase === 'question' || g.phase === 'reveal');
      const me = g.players.get(viewerId);
      const mine = g.answers.get(viewerId);
      game = {
        title: g.title,
        index: g.index,
        total: g.questions.length,
        phase: g.phase,
        timeLeft: playing ? Math.max(0, g.deadline - Date.now()) : 0,
        totalMs: g.phase === 'question' ? this.options.seconds * 1000 : g.phase === 'reveal' ? REVEAL_MS : INTRO_MS,
        question: showQ ? { q: q.q, c: q.c || null, choices: q.choices } : null,
        answered: g.answers.size,
        players: this._active().length,
        myChoice: mine ? mine.choice : null,
        reveal: g.phase === 'reveal' || g.phase === 'over' ? g.reveal : null,
        me: me ? { score: me.score, streak: me.streak, correct: me.correct, last: g.phase === 'reveal' ? me.last : null } : null,
        leaderboard: this._ranking().map(({ id, name, score, streak, correct, last, left }) => ({
          id, name, score, streak, correct, left, gained: g.phase === 'reveal' && last ? last.points + last.bonus : null,
        })),
      };
    }
    return {
      options: this.options,
      categories: CATEGORIES,
      bankSize: BANK.length,
      seats: this.seats,
      ready: [...this.ready],
      status: this.status,
      gameNo: this.gameNo,
      myId: this.seated(viewerId) ? viewerId : null,
      source: this.custom
        ? { type: 'custom', title: this.custom.title, count: this.custom.questions.length, by: this.custom.by }
        : { type: 'builtin', category: this.options.category },
      game,
      wins: [...this.wins.values()].sort((x, y) => y.wins - x.wins || y.best - x.best),
      history: this.history,
    };
  }

  dispose() { clearTimeout(this.timer); }
}
