import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WordChainGame, makeSyllableChecker, makeWordChecker } from '@game/shared/wordchain';
import { bool, clampInt } from './options.js';

// Từ điển (xem server/src/data/README.md): âm tiết tiếng Việt và từ ghép 2 chữ (~62.000 từ, gộp từ 3 nguồn)
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');
const readLines = (file) => fs.readFileSync(path.join(DATA_DIR, file), 'utf8').split('\n').filter(Boolean);
const isValidSyllable = makeSyllableChecker(readLines('vi-syllables.txt'));
export const isKnownWord = makeWordChecker(
  ['vi-words.txt', 'vi-words-noitu.txt', 'vi-words-common.txt'].flatMap(readLines),
);

const HISTORY_MAX = 10;

export class WordChainHandler {
  constructor(room, options) {
    this.room = room;
    this.options = {
      maxSeats: clampInt(options.maxSeats, 2, 8, 6),
      turnSeconds: clampInt(options.turnSeconds, 10, 60, 20),
      lives: clampInt(options.lives, 1, 3, 1),
      dictionary: bool(options.dictionary, true),
      strict: bool(options.strict, true), // từ phải có trong từ điển từ ghép
    };
    this.seats = []; // [{ id, name }] theo thứ tự lượt
    this.ready = new Set();
    this.status = 'waiting'; // waiting | playing | over
    this.game = null;
    this.timer = null;
    this.deadline = 0;
    this.gameNo = 0;
    this.wins = new Map(); // id -> { id, name, games, wins }
    this.history = []; // các ván đã xong (mới nhất trước), tối đa HISTORY_MAX
  }

  get maxPlayers() { return this.options.maxSeats; }
  playerIds() { return this.seats.map((s) => s.id); }
  isPlaying() { return this.status === 'playing'; }
  seated(id) { return this.seats.some((s) => s.id === id); }

  rename(id, name) {
    for (const s of this.seats) if (s.id === id) s.name = name;
    const w = this.wins.get(id);
    if (w) w.name = name;
    const p = this.game?.players.find((x) => x.id === id);
    if (p) p.name = name;
  }

  sit(user) {
    if (this.seated(user.id)) throw new Error('Bạn đã ngồi rồi');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra, đợi ván sau nhé');
    if (this.seats.length >= this.options.maxSeats) throw new Error('Bàn đã đủ người');
    this.seats.push({ id: user.id, name: user.name });
  }

  stand(id) {
    if (!this.seated(id)) return;
    if (this.status === 'playing' && this.game.players.some((p) => p.id === id && !p.out)) {
      const name = this.game.players.find((p) => p.id === id).name;
      const wasTurn = this.game.current.id === id;
      this.game.eliminate(id);
      this.room.system(`${name} rời bàn — bị loại`);
      this._afterTurn(wasTurn);
    }
    this.seats = this.seats.filter((s) => s.id !== id);
    this.ready.delete(id);
  }

  onLeave(id) { this.stand(id); }

  action(id, a) {
    if (!this.seated(id)) throw new Error('Bạn đang ở chế độ xem');
    switch (a.type) {
      case 'ready': {
        if (this.status === 'playing') throw new Error('Ván đang diễn ra');
        if (this.ready.has(id)) this.ready.delete(id);
        else this.ready.add(id);
        if (this.seats.length >= 2 && this.seats.every((s) => this.ready.has(s.id))) this._start();
        return;
      }
      case 'word': {
        this._requirePlaying();
        this.game.submit(id, String(a.text || '').slice(0, 40));
        this._afterTurn(true);
        return;
      }
      case 'object': {
        this._requirePlaying();
        const last = this.game.last;
        const revoked = this.game.object(id);
        const who = this.seats.find((s) => s.id === id)?.name || '?';
        if (revoked) {
          this.room.system(`❌ Từ "${last.text}" của ${last.name} bị phản đối — ${last.name} nối lại`);
          this._afterTurn(true);
        } else if (this.game.objections.has(id)) {
          this.room.system(`${who} phản đối từ "${last.text}" (${this.game.objections.size}/${this.game.objectionsNeeded()})`);
        }
        return;
      }
      case 'giveup': {
        this._requirePlaying();
        const p = this.game.players.find((x) => x.id === id);
        if (!p || p.out) throw new Error('Bạn đã bị loại');
        const wasTurn = this.game.current.id === id;
        this.game.eliminate(id);
        this.room.system(`${p.name} chịu thua`);
        this._afterTurn(wasTurn);
        return;
      }
      default:
        throw new Error('Hành động không hợp lệ');
    }
  }

  _requirePlaying() {
    if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
  }

  _start() {
    // Mỗi ván chọn ngẫu nhiên người ra từ đầu tiên
    this.game = new WordChainGame(this.seats, {
      first: Math.floor(Math.random() * this.seats.length),
      lives: this.options.lives,
      isValidSyllable: this.options.dictionary ? isValidSyllable : null,
      isKnownWord,
      strict: this.options.dictionary && this.options.strict,
    });
    this.status = 'playing';
    this.ready.clear();
    this.gameNo++;
    this.room.system(`Ván ${this.gameNo} bắt đầu: ${this.seats.map((s) => s.name).join(' → ')}. ${this.game.current.name} ra từ đầu tiên!`);
    this._resetTimer();
  }

  /** Sau mỗi thay đổi lượt: kiểm tra kết thúc, đặt lại đồng hồ nếu cần. */
  _afterTurn(resetTimer) {
    if (this.game.result) return this._finish();
    if (resetTimer) this._resetTimer();
  }

  _resetTimer() {
    clearTimeout(this.timer);
    const ms = this.options.turnSeconds * 1000;
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => this._onTimeout(), ms);
  }

  _onTimeout() {
    if (this.status !== 'playing') return;
    const p = this.game.current;
    this.game.timeout();
    this.room.system(`⏰ ${p.name} hết giờ${p.out ? ' — bị loại' : ` — còn ${p.lives} mạng`}`);
    this._afterTurn(true);
    this.room.changed();
  }

  _finish() {
    clearTimeout(this.timer);
    this.deadline = 0;
    this.status = 'over';
    const { winner, ranking } = this.game.result;
    for (const p of this.game.players) {
      const w = this.wins.get(p.id) || { id: p.id, name: p.name, games: 0, wins: 0 };
      w.name = p.name;
      w.games++;
      if (p.id === winner) w.wins++;
      this.wins.set(p.id, w);
    }
    const name = (id) => this.game.players.find((p) => p.id === id)?.name;
    // Lưu lại cả chuỗi từ của ván để xem lại theo từng ván
    this.history.unshift({
      no: this.gameNo,
      endedAt: Date.now(),
      players: this.game.players.map(({ id, name: n }) => ({ id, name: n })),
      winner,
      ranking,
      words: this.game.chain.map(({ syllables, by, known }) => ({ s: syllables, by, known })),
    });
    if (this.history.length > HISTORY_MAX) this.history.pop();
    this.room.system(`🏆 ${winner ? `${name(winner)} thắng` : 'Không ai thắng'} sau ${this.game.chain.length} từ. Xếp hạng: ${ranking.map(name).join(', ')}`);
  }

  view(viewerId) {
    const g = this.game;
    return {
      options: this.options,
      seats: this.seats,
      ready: [...this.ready],
      status: this.status,
      gameNo: this.gameNo,
      myId: this.seated(viewerId) ? viewerId : null,
      turnLeft: this.status === 'playing' ? Math.max(0, this.deadline - Date.now()) : 0,
      turnTotal: this.options.turnSeconds * 1000,
      game: g && {
        players: g.players.map(({ id, name, lives, out, words }) => ({ id, name, lives, out, words })),
        currentId: this.status === 'playing' ? g.current.id : null,
        required: g.required,
        chain: g.chain.slice(-80).map(({ text, syllables, by, name, ts, known }) => ({ text, syllables, by, name, ts, known })),
        total: g.chain.length,
        objections: [...g.objections],
        objectionsNeeded: g.last ? g.objectionsNeeded() : 0,
        result: g.result,
      },
      wins: [...this.wins.values()].sort((x, y) => y.wins - x.wins || x.games - y.games),
      history: this.history,
    };
  }

  dispose() { clearTimeout(this.timer); }
}
