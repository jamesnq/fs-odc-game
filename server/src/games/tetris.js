import { randomInt, randomUUID } from 'node:crypto';
import { INPUT_INTERVAL, LINE_TARGET, SHAPES } from '@game/shared/tetris';
import { TetrisBoard } from './tetrisBoard.js';
import { ReadyGate } from './ready.js';

const GRAVITY_MS = 750;
const COUNTDOWN_MS = 3000;
const INPUTS = new Map([
  ['left', (board) => board.move(-1, 0)],
  ['right', (board) => board.move(1, 0)],
  ['down', (board) => board.move(0, 1)],
  ['clockwise', (board) => board.rotate(1)],
  ['counterclockwise', (board) => board.rotate(-1)],
  ['drop', (board) => board.drop()],
]);

function pieceStream() {
  const pieces = [];
  return (index) => {
    while (index >= pieces.length) {
      const bag = Object.keys(SHAPES);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      pieces.push(...bag);
    }
    return pieces[index];
  };
}

export class TetrisHandler {
  constructor(room, options) {
    this.room = room;
    const rawTarget = options.targetLines ?? LINE_TARGET.default;
    const targetLines = typeof rawTarget === 'number' || typeof rawTarget === 'string' ? Number(rawTarget) : NaN;
    if (!Number.isInteger(targetLines) || targetLines < LINE_TARGET.min || targetLines > LINE_TARGET.max) {
      throw new Error(`Số hàng mục tiêu phải là số nguyên từ ${LINE_TARGET.min} đến ${LINE_TARGET.max}`);
    }
    this.options = { targetLines };
    this.maxPlayers = 2;
    this.seats = [null, null];
    this.boards = [null, null];
    this.ready = new ReadyGate(room);
    this.status = 'waiting';
    this.round = null;
    this.startsAt = null;
    this.result = null;
    this.timer = null;
  }

  seatOf(id) { return this.seats.findIndex((seat) => seat?.id === id); }
  playerIds() { return this.seats.filter(Boolean).map((seat) => seat.id); }
  isPlaying() { return this.status === 'playing'; }

  sit(user) {
    if (this.seatOf(user.id) !== -1) return;
    const index = this.seats.indexOf(null);
    if (index === -1) throw new Error('Bàn đã đủ 2 người');
    this.seats[index] = { id: user.id, name: user.name };
    this.boards[index] = null;
  }

  stand(id) {
    const index = this.seatOf(id);
    if (index === -1) return;
    if (this.isPlaying()) this.finish(1 - index, 'Đối thủ rời bàn');
    this.seats[index] = null;
    this.boards[index] = null;
    this.ready.clear();
    if (!this.seats.some(Boolean)) {
      this.status = 'waiting';
      this.result = null;
    }
  }

  onLeave(id) { this.stand(id); }

  rename(id, name) {
    const index = this.seatOf(id);
    if (index !== -1) this.seats[index].name = name;
    if (this.result?.winnerId === id) this.result.winnerName = name;
  }

  start() {
    const pieceAt = pieceStream();
    this.boards = this.seats.map(() => new TetrisBoard(pieceAt));
    this.ready.clear();
    this.lastInput = [-Infinity, -Infinity];
    this.round = randomUUID();
    this.startsAt = Date.now() + COUNTDOWN_MS;
    this.result = null;
    this.status = 'playing';
    this.room.system(`Bắt đầu đua xóa ${this.options.targetLines} hàng`);
    this.schedule(COUNTDOWN_MS + GRAVITY_MS);
  }

  schedule(delay) {
    this.timer = setTimeout(() => {
      this.boards.forEach((board) => board.fall());
      this.checkResult();
      this.room.changed(!this.isPlaying());
      if (this.isPlaying()) this.schedule(GRAVITY_MS);
    }, delay);
    this.timer.unref();
  }

  finish(winner, reason) {
    this.dispose();
    this.status = 'over';
    const seat = this.seats[winner];
    this.result = { winnerId: seat?.id ?? null, winnerName: seat?.name ?? null, reason };
    this.room.system(`${seat ? `${seat.name} thắng` : 'Hòa'} — ${reason}`);
  }

  checkResult() {
    const reached = this.boards.map((board) => board.lines >= this.options.targetLines);
    if (reached.some(Boolean)) {
      this.finish(reached.every(Boolean) ? null : reached.indexOf(true), `Đã xóa đủ ${this.options.targetLines} hàng`);
      return;
    }
    const toppedOut = this.boards.map((board) => board.toppedOut);
    if (toppedOut.some(Boolean)) {
      this.finish(toppedOut.every(Boolean) ? null : toppedOut.indexOf(false),
        toppedOut.every(Boolean) ? 'Cả hai bàn đều đầy' : 'Bàn đối thủ đã đầy');
    }
  }

  action(id, action) {
    if (action.type === 'start') {
      if (this.isPlaying()) throw new Error('Ván đang diễn ra');
      this.ready.check(id, this.seats.filter(Boolean));
      if (!this.seats.every((seat) => this.room.isOnline(seat.id))) throw new Error('Cần hai người chơi đang kết nối');
      this.start();
      return;
    }
    const index = this.seatOf(id);
    if (index === -1) throw new Error('Bạn đang ở chế độ xem');
    if (action.type === 'ready') {
      if (this.isPlaying()) throw new Error('Ván đang diễn ra');
      this.ready.toggle(id);
      return;
    }
    const apply = action.type === 'input' && INPUTS.get(action.input);
    if (!apply) throw new Error('Hành động không hợp lệ');
    const now = Date.now();
    if (!this.isPlaying() || action.round !== this.round || now < this.startsAt) return false;
    if (now - this.lastInput[index] < INPUT_INTERVAL) return false;
    this.lastInput[index] = now;
    apply(this.boards[index]);
    this.checkResult();
    return !this.isPlaying();
  }

  view(id) {
    return {
      options: this.options,
      status: this.status,
      seats: this.seats,
      boards: this.boards.map((board) => board?.view() ?? null),
      ...this.ready.view(this.playerIds()),
      mySeat: this.seatOf(id),
      round: this.round,
      startsAt: this.startsAt,
      result: this.result,
    };
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
