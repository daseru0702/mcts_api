// games/blokus/pieces.js — 블로커스 조각 21종과 방향(회전·뒤집기) 표
//
// 조각은 (dx, dy) 칸 목록입니다. 회전 4가지 × 뒤집기 2가지 중 모양이 다른 것만 남기면
// 방향은 모두 91가지이고, 정책 인덱스는 "방향 번호 × 196 + 놓는 위치" 입니다.

export const PIECES = [
  { name: "1",  cells: [[0, 0]] },
  { name: "2",  cells: [[0, 0], [1, 0]] },
  { name: "I3", cells: [[0, 0], [1, 0], [2, 0]] },
  { name: "V3", cells: [[0, 0], [1, 0], [0, 1]] },
  { name: "I4", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { name: "L4", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  { name: "T4", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { name: "O4", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: "Z4", cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { name: "F",  cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]] },
  { name: "I5", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { name: "L5", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]] },
  { name: "N",  cells: [[1, 0], [1, 1], [0, 2], [1, 2], [0, 3]] },
  { name: "P",  cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
  { name: "T5", cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
  { name: "U",  cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
  { name: "V5", cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { name: "W",  cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
  { name: "X",  cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
  { name: "Y",  cells: [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3]] },
  { name: "Z5", cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]] },
];
export const PIECE_SIZES = PIECES.map(p => p.cells.length);
export const TOTAL_SQUARES = PIECE_SIZES.reduce((a, b) => a + b, 0); // 89

function normalize(cells) {
  const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
const keyOf = cells => normalize(cells).map(c => c.join(",")).join(";");

/** ORIENTS[o] = { piece, cells: [[dx,dy]], w, h } */
export const ORIENTS = [];
/** PIECE_ORIENTS[piece] = [o, ...] */
export const PIECE_ORIENTS = [];
const orientByKey = new Map();

PIECES.forEach((p, piece) => {
  PIECE_ORIENTS.push([]);
  let cells = p.cells;
  for (let flip = 0; flip < 2; flip++) {
    for (let r = 0; r < 4; r++) {
      const key = keyOf(cells);
      if (!orientByKey.has(key)) {
        const n = normalize(cells);
        const o = ORIENTS.length;
        ORIENTS.push({
          piece, cells: n,
          w: Math.max(...n.map(c => c[0])) + 1,
          h: Math.max(...n.map(c => c[1])) + 1,
        });
        orientByKey.set(key, o);
        PIECE_ORIENTS[piece].push(o);
      }
      cells = cells.map(([x, y]) => [-y, x]); // 90° 회전
    }
    cells = cells.map(([x, y]) => [-x, y]);   // 좌우 뒤집기
  }
});

const mapOrients = f => ORIENTS.map(o => orientByKey.get(keyOf(o.cells.map(f))));
/** 판 180° 회전했을 때의 방향 번호 */
export const ORIENT_ROT180 = mapOrients(([x, y]) => [-x, -y]);
/** 주대각선 기준 뒤집기(x↔y) 했을 때의 방향 번호 */
export const ORIENT_TRANSPOSE = mapOrients(([x, y]) => [y, x]);
