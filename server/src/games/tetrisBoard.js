import { HEIGHT, WIDTH, pieceCells } from '@game/shared/tetris';

const emptyRow = () => '.'.repeat(WIDTH);

export class TetrisBoard {
  constructor(pieceAt) {
    this.pieceAt = pieceAt;
    this.grid = Array.from({ length: HEIGHT }, emptyRow);
    this.lines = 0;
    this.index = 0;
    this.toppedOut = false;
    this.spawn();
  }

  spawn() {
    const kind = this.pieceAt(this.index);
    this.piece = { kind, x: kind === 'O' ? 4 : 3, y: 0, rotation: 0 };
    this.toppedOut = !this.fits(this.piece);
    if (this.toppedOut) this.piece = null;
  }

  fits(piece) {
    return pieceCells(piece).every(([x, y]) => this.grid[y]?.[x] === '.');
  }

  move(dx, dy) {
    const candidate = { ...this.piece, x: this.piece.x + dx, y: this.piece.y + dy };
    if (!this.fits(candidate)) return false;
    this.piece = candidate;
    return true;
  }

  rotate(direction) {
    if (this.piece.kind === 'O') return;
    const rotation = (this.piece.rotation + direction + 4) % 4;
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [0, -2]]) {
      const candidate = { ...this.piece, x: this.piece.x + dx, y: this.piece.y + dy, rotation };
      if (!this.fits(candidate)) continue;
      this.piece = candidate;
      return;
    }
  }

  landing() {
    let candidate = this.piece;
    while (this.fits({ ...candidate, y: candidate.y + 1 })) {
      candidate = { ...candidate, y: candidate.y + 1 };
    }
    return candidate;
  }

  drop() {
    this.piece = this.landing();
    this.lock();
  }

  fall() {
    if (!this.move(0, 1)) this.lock();
  }

  lock() {
    for (const [x, y] of pieceCells(this.piece)) {
      const row = this.grid[y];
      this.grid[y] = row.slice(0, x) + this.piece.kind + row.slice(x + 1);
    }
    const remaining = this.grid.filter((row) => row.includes('.'));
    const cleared = HEIGHT - remaining.length;
    this.lines += cleared;
    this.grid = [...Array.from({ length: cleared }, emptyRow), ...remaining];
    this.index++;
    this.spawn();
  }

  view() {
    return {
      grid: this.grid,
      lines: this.lines,
      piece: this.piece,
      ghost: this.piece ? this.landing() : null,
      next: this.piece ? this.pieceAt(this.index + 1) : null,
    };
  }
}
