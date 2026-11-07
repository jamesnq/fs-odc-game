export const WIDTH = 10;
export const HEIGHT = 20;
export const LINE_TARGET = { min: 1, max: 100, default: 20 };
export const INPUT_INTERVAL = 80;

// Các khối dùng khung vuông để xoay quanh tâm cố định.
export const SHAPES = {
  I: ['....', 'IIII', '....', '....'],
  J: ['J..', 'JJJ', '...'],
  L: ['..L', 'LLL', '...'],
  O: ['OO', 'OO'],
  S: ['.SS', 'SS.', '...'],
  T: ['.T.', 'TTT', '...'],
  Z: ['ZZ.', '.ZZ', '...'],
};

export function pieceCells({ kind, x = 0, y = 0, rotation = 0 }) {
  const shape = SHAPES[kind];
  const last = shape.length - 1;
  const cells = [];
  for (let row = 0; row <= last; row++) {
    for (let col = 0; col <= last; col++) {
      if (shape[row][col] === '.') continue;
      const [dx, dy] = [[col, row], [last - row, col], [last - col, last - row], [row, last - col]][rotation];
      cells.push([x + dx, y + dy]);
    }
  }
  return cells;
}
