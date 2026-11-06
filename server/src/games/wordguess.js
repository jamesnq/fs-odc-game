// Đoán chữ (kiểu Wordle tiếng Việt): đoán từ 2 chữ trong 6 lượt; mỗi chữ chấm theo âm đầu · vần · thanh.
//  - Đua (race): mọi người cùng một từ, mỗi người một bàn; ai đoán đúng ít lượt nhất (rồi nhanh nhất) thắng.
//    Trong lúc chơi chỉ thấy màu ô của người khác, không thấy chữ.
//  - Cùng đoán (coop): cả phòng chung một bàn 6 lượt, ai cũng được đoán.
//  - Từ của ngày: từ bí mật cố định theo ngày (giờ Việt Nam).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWord } from '@game/shared/wordchain';
import { scoreGuess, isSolved, dailyIndex, MAX_GUESSES } from '@game/shared/wordguess';
import { isKnownWord, isValidSyllable } from './wordchain.js';
import { bool, clampInt } from './options.js';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/vi-words-doanchu.txt');
export const ANSWERS = fs.readFileSync(DATA, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const HISTORY_MAX = 10;

export class WordGuessHandler {
  constructor(room, options) {
    this.room = room;
    this.options = {
      mode: options.mode === 'coop' ? 'coop' : 'race',
      maxSeats: clampInt(options.maxSeats, 1, 10, 6),
      minutes: clampInt(options.minutes, 1, 15, 5),
      daily: bool(options.daily, false),
      strict: bool(options.strict, true), // từ đoán phải có trong từ điển
    };
    this.seats = [];
    this.ready = new Set();
    this.status = 'waiting';
    this.game = null;
    this.timer = null;
    this.gameNo = 0;
    this.recent = []; // từ đã ra gần đây, tránh lặp
    this.wins = new Map(); // id -> { id, name, games, wins, solved }
    this.history = []; // { no, endedAt, secret, mode, ranking }
  }

  get maxPlayers() { return this.options.maxSeats; }
  playerIds() { return this.seats.map((s) => s.id); }
  isPlaying() { return this.status === 'playing'; }
  seated(id) { return this.seats.some((s) => s.id === id); }

  rename(id, name) {
    for (const s of this.seats) if (s.id === id) s.name = name;
    const b = this.game?.boards.get(id);
    if (b) b.name = name;
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
    const b = this.game.boards.get(id);
    if (b && !b.done) { b.done = true; b.left = true; }
    if (!this.seats.length || this._allDone()) this._finish();
  }

  onLeave(id) { this.stand(id); }

  action(id, a) {
    if (a.type === 'setMode') return this._setMode(id, a);
    if (!this.seated(id)) throw new Error('Bạn đang ở chế độ xem');
    switch (a.type) {
      case 'ready': {
        if (this.status === 'playing') throw new Error('Ván đang diễn ra');
        if (this.ready.has(id)) this.ready.delete(id);
        else this.ready.add(id);
        if (this.seats.length && this.seats.every((s) => this.ready.has(s.id))) this._start();
        return;
      }
      case 'guess': return this._guess(id, String(a.text || '').slice(0, 30));
      case 'giveup': {
        if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
        if (this.options.mode === 'coop') return this._finish('giveup');
        const b = this.game.boards.get(id);
        if (!b || b.done) throw new Error('Bạn đã xong rồi');
        b.done = true;
        b.gaveUp = true;
        b.at = Date.now();
        this.room.system(`${b.name} chịu thua`);
        if (this._allDone()) this._finish();
        return;
      }
      default:
        throw new Error('Hành động không hợp lệ');
    }
  }

  _setMode(id, a) {
    if (!this.seated(id) && this.room.ownerId !== id) throw new Error('Chỉ người đang chơi hoặc chủ phòng mới được đổi chế độ');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra');
    if (a.mode !== undefined) this.options.mode = a.mode === 'coop' ? 'coop' : 'race';
    if (a.daily !== undefined) this.options.daily = !!a.daily;
    this.ready.clear();
    this.room.system(`Chế độ: ${this.options.mode === 'coop' ? 'Cùng đoán' : 'Đua'}${this.options.daily ? ' · Từ của ngày' : ''}`);
  }

  _pickSecret() {
    if (this.options.daily) return ANSWERS[dailyIndex(ANSWERS.length)];
    let w;
    do w = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    while (this.recent.includes(w) && this.recent.length < ANSWERS.length);
    this.recent.push(w);
    if (this.recent.length > 100) this.recent.shift();
    return w;
  }

  _newBoard(s) { return { id: s.id, name: s.name, guesses: [], done: false, solved: false, at: 0, left: false, gaveUp: false }; }

  _start() {
    this.status = 'playing';
    this.ready.clear();
    this.gameNo++;
    const coop = this.options.mode === 'coop';
    const startAt = Date.now();
    this.game = {
      secret: this._pickSecret(),
      mode: this.options.mode,
      daily: this.options.daily,
      startAt,
      deadline: startAt + this.options.minutes * 60_000,
      boards: new Map(this.seats.map((s) => [s.id, this._newBoard(s)])),
      shared: coop ? { ...this._newBoard({ id: 'team', name: 'Cả đội' }) } : null,
      result: null,
    };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.status !== 'playing') return;
      this._finish('timeout');
      this.room.changed();
    }, this.options.minutes * 60_000);
    this.room.system(`Ván ${this.gameNo} bắt đầu — ${coop ? 'Cùng đoán' : 'Đua'}${this.options.daily ? ' · Từ của ngày' : ''}: đoán từ 2 chữ trong ${MAX_GUESSES} lượt, ${this.options.minutes} phút`);
  }

  _guess(id, input) {
    if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
    const g = this.game;
    const coop = g.mode === 'coop';
    const board = coop ? g.shared : g.boards.get(id);
    if (!board) throw new Error('Bạn không tham gia ván này');
    if (board.done) throw new Error(coop ? 'Ván đã xong' : 'Bạn đã xong lượt đoán');
    const w = parseWord(input);
    const bad = w.syllables.find((s) => !isValidSyllable(s));
    if (bad) throw new Error(`"${bad}" không phải chữ tiếng Việt`);
    if (this.options.strict && !isKnownWord(w)) throw new Error(`"${w.text}" không có trong từ điển`);
    const key = w.keys.join(' ');
    if (board.guesses.some((x) => x.key === key)) throw new Error(`Đã đoán "${w.text}" rồi`);
    const marks = scoreGuess(g.secret, w.text);
    const name = this.seats.find((s) => s.id === id)?.name || '?';
    board.guesses.push({ text: w.text, key, marks, by: id, name });
    if (isSolved(marks)) {
      board.solved = true;
      board.done = true;
      board.at = Date.now();
      if (coop) { board.solvedBy = name; return this._finish('solved'); }
      this.room.system(`🎉 ${name} đoán đúng sau ${board.guesses.length} lượt!`);
    } else if (board.guesses.length >= MAX_GUESSES) {
      board.done = true;
      board.at = Date.now();
      if (coop) return this._finish('out');
      this.room.system(`${name} đã hết ${MAX_GUESSES} lượt`);
    }
    if (this._allDone()) this._finish();
  }

  _allDone() {
    const g = this.game;
    if (g.mode === 'coop') return g.shared.done;
    return [...g.boards.values()].every((b) => b.done);
  }

  /** Xếp hạng chế độ Đua: đoán đúng trước, ít lượt hơn, nhanh hơn. */
  _ranking() {
    return [...this.game.boards.values()].sort((a, b) =>
      (b.solved - a.solved) || (a.solved ? a.guesses.length - b.guesses.length || a.at - b.at : b.guesses.length - a.guesses.length));
  }

  _finish(reason = 'done') {
    if (this.status !== 'playing') return;
    clearTimeout(this.timer);
    const g = this.game;
    this.status = 'over';
    const coop = g.mode === 'coop';
    let ranking = [];
    if (coop) {
      const s = g.shared;
      g.result = { reason, solved: s.solved, solvedBy: s.solvedBy || null, guesses: s.guesses.length };
      for (const b of g.boards.values()) this._record(b, s.solved, s.solved);
      this.room.system(s.solved
        ? `🎉 Cả đội đoán đúng "${g.secret}" sau ${s.guesses.length} lượt (${s.solvedBy} đoán trúng)`
        : `Hết ${reason === 'timeout' ? 'giờ' : 'lượt'}! Từ bí mật là "${g.secret}"`);
    } else {
      ranking = this._ranking();
      const top = ranking[0];
      const multi = ranking.length > 1;
      const winner = top?.solved ? top : null;
      g.result = { reason, winner: winner ? winner.id : null, ranking: ranking.map((b) => b.id) };
      for (const b of ranking) this._record(b, b.solved, multi && b === winner);
      this.room.system(winner
        ? `🏆 ${multi ? `${winner.name} thắng — ` : ''}đoán đúng "${g.secret}" sau ${winner.guesses.length} lượt`
        : `${reason === 'timeout' ? 'Hết giờ! ' : ''}Không ai đoán ra. Từ bí mật là "${g.secret}"`);
    }
    this.history.unshift({
      no: this.gameNo,
      endedAt: Date.now(),
      secret: g.secret,
      mode: g.mode,
      solved: coop ? g.shared.solved : ranking.some((b) => b.solved),
      ranking: coop
        ? [...g.boards.values()].map(({ id, name }) => ({ id, name, guesses: g.shared.guesses.filter((x) => x.by === id).length, solved: g.shared.solved }))
        : ranking.map(({ id, name, guesses, solved }) => ({ id, name, guesses: guesses.length, solved })),
    });
    if (this.history.length > HISTORY_MAX) this.history.pop();
  }

  _record(b, solved, won) {
    const w = this.wins.get(b.id) || { id: b.id, name: b.name, games: 0, wins: 0, solved: 0 };
    w.name = b.name;
    w.games++;
    if (solved) w.solved++;
    if (won) w.wins++;
    this.wins.set(b.id, w);
  }

  view(viewerId) {
    const g = this.game;
    const over = this.status === 'over';
    let game = null;
    if (g) {
      const coop = g.mode === 'coop';
      const showBoard = (b, full) => ({
        id: b.id,
        name: b.name,
        done: b.done,
        solved: b.solved,
        left: b.left,
        gaveUp: b.gaveUp,
        count: b.guesses.length,
        // Bàn của người khác trong lúc đua: chỉ màu ô, giấu chữ
        guesses: b.guesses.map((x) => (full ? { text: x.text, marks: x.marks, name: x.name } : { marks: x.marks })),
      });
      game = {
        mode: g.mode,
        daily: g.daily,
        timeLeft: this.status === 'playing' ? Math.max(0, g.deadline - Date.now()) : 0,
        totalMs: this.options.minutes * 60_000,
        maxGuesses: MAX_GUESSES,
        secret: over ? g.secret : null,
        result: g.result,
        shared: coop ? showBoard(g.shared, true) : null,
        mine: !coop && g.boards.has(viewerId) ? showBoard(g.boards.get(viewerId), true) : null,
        others: coop ? [] : [...g.boards.values()].filter((b) => b.id !== viewerId).map((b) => showBoard(b, over)),
      };
    }
    return {
      options: this.options,
      seats: this.seats,
      ready: [...this.ready],
      status: this.status,
      gameNo: this.gameNo,
      myId: this.seated(viewerId) ? viewerId : null,
      answers: ANSWERS.length,
      game,
      wins: [...this.wins.values()].sort((x, y) => y.wins - x.wins || y.solved - x.solved),
      history: this.history,
    };
  }

  dispose() { clearTimeout(this.timer); }
}
