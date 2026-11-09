// games/blokus/BlokusGame.js — 블로커스 듀오 규칙 엔진 (14×14, 2인)
//
// 규칙
//  - 각자 조각 21개(89칸). Player 1 이 먼저 둡니다.
//  - 첫 조각은 자기 시작점을 덮어야 합니다: Player 1 = (4,4), Player 2 = (9,9)  [0부터 센 좌표]
//  - 이후 조각은 내 조각과 꼭짓점으로 닿아야 하고, 변으로 닿으면 안 됩니다. 상대 조각과는 자유.
//  - 놓을 곳이 없으면 패스(수 하나로 취급, 차례는 그대로 넘어감). 한 번 패스한 플레이어는 다시 둘 수 없으므로
//    두 플레이어가 모두 패스하면 끝납니다.
//  - 점수 = 놓은 칸 수 - 89, 조각을 모두 놓으면 +15, 마지막이 1칸 조각이면 +5 추가. 같으면 무승부.
//
// 수: { type: "place", piece, orient, x, y }  (x, y = 방향 모양의 왼쪽 위 기준점)  |  { type: "pass" }

import { PIECES, PIECE_SIZES, PIECE_ORIENTS, ORIENTS, TOTAL_SQUARES } from "./pieces.js";

export const N = 14;
export const CELLS = N * N;
export const START = { 1: 4 * N + 4, 2: 9 * N + 9 };
export const NUM_PIECES = PIECES.length;

const NEIGHBORS = [], DIAGONALS = [];
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const nb = [], dg = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N) nb.push(ny * N + nx);
    }
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N) dg.push(ny * N + nx);
    }
    NEIGHBORS.push(nb);
    DIAGONALS.push(dg);
  }
}

// 중복 제거용 표시 (방향 × 위치), 호출마다 번호를 올려 지우지 않고 재사용
const seen = new Uint32Array(ORIENTS.length * CELLS);
let stamp = 0;

export class BlokusGame {
  constructor() {
    this.board = new Uint8Array(CELLS);                      // 0 빈칸, 1/2 주인
    this.blocked = { 1: new Uint8Array(CELLS), 2: new Uint8Array(CELLS) }; // 차 있거나 내 조각과 변으로 닿음
    this.diag = { 1: new Uint8Array(CELLS), 2: new Uint8Array(CELLS) };    // 내 조각과 꼭짓점으로 닿음
    this.remaining = { 1: new Uint8Array(NUM_PIECES).fill(1), 2: new Uint8Array(NUM_PIECES).fill(1) };
    this.placedSquares = { 1: 0, 2: 0 };
    this.lastPiece = { 1: -1, 2: -1 };
    this.passed = { 1: false, 2: false };
    this.placements = [];                                     // 화면 표시용 기록
    this.currentPlayer = 1;
    this.moveCount = 0;
  }

  clone() {
    const g = Object.create(BlokusGame.prototype);
    g.board = this.board.slice();
    g.blocked = { 1: this.blocked[1].slice(), 2: this.blocked[2].slice() };
    g.diag = { 1: this.diag[1].slice(), 2: this.diag[2].slice() };
    g.remaining = { 1: this.remaining[1].slice(), 2: this.remaining[2].slice() };
    g.placedSquares = { ...this.placedSquares };
    g.lastPiece = { ...this.lastPiece };
    g.passed = { ...this.passed };
    g.placements = this.placements.slice();
    g.currentPlayer = this.currentPlayer;
    g.moveCount = this.moveCount;
    return g;
  }

  /** player 가 조각을 시작할 수 있는 칸 (첫 수면 시작점) */
  cornerCells(player) {
    if (this.placedSquares[player] === 0) return this.board[START[player]] ? [] : [START[player]];
    const out = [], bl = this.blocked[player], dg = this.diag[player];
    for (let c = 0; c < CELLS; c++) if (dg[c] && !bl[c]) out.push(c);
    return out;
  }

  /** player 의 합법 배치 목록 (패스 제외) */
  getPlacements(player = this.currentPlayer) {
    const out = [];
    if (this.passed[player]) return out;
    const rem = this.remaining[player], bl = this.blocked[player];
    const s = ++stamp;
    for (const c of this.cornerCells(player)) {
      const tx = c % N, ty = (c / N) | 0;
      for (let piece = 0; piece < NUM_PIECES; piece++) {
        if (!rem[piece]) continue;
        for (const o of PIECE_ORIENTS[piece]) {
          const { cells, w, h } = ORIENTS[o];
          for (const [cx, cy] of cells) {
            const ax = tx - cx, ay = ty - cy;
            if (ax < 0 || ay < 0 || ax + w > N || ay + h > N) continue;
            const key = o * CELLS + ay * N + ax;
            if (seen[key] === s) continue;
            seen[key] = s;
            let ok = true;
            for (const [dx, dy] of cells) {
              if (bl[(ay + dy) * N + ax + dx]) { ok = false; break; }
            }
            if (ok) out.push({ type: "place", piece, orient: o, x: ax, y: ay });
          }
        }
      }
    }
    return out;
  }

  getAllMoves() {
    const moves = this.getPlacements();
    return moves.length ? moves : [{ type: "pass" }];
  }

  /** 배치가 차지하는 칸 번호 목록 */
  static cellsOf(move) {
    return ORIENTS[move.orient].cells.map(([dx, dy]) => (move.y + dy) * N + move.x + dx);
  }

  isLegalMove(move) {
    const p = this.currentPlayer;
    if (move?.type === "pass") return this.getPlacements(p).length === 0;
    if (move?.type !== "place") return false;
    const { piece, orient, x, y } = move;
    const o = ORIENTS[orient];
    if (!o || o.piece !== piece || !this.remaining[p][piece] || this.passed[p]) return false;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + o.w > N || y + o.h > N) return false;
    const cells = BlokusGame.cellsOf(move);
    if (cells.some(c => this.blocked[p][c])) return false;
    return this.placedSquares[p] === 0 ? cells.includes(START[p]) : cells.some(c => this.diag[p][c]);
  }

  applyMove(move) {
    const p = this.currentPlayer;
    if (move.type === "pass") {
      this.passed[p] = true;
    } else {
      const cells = BlokusGame.cellsOf(move);
      for (const c of cells) {
        this.board[c] = p;
        this.blocked[1][c] = 1;
        this.blocked[2][c] = 1;
      }
      for (const c of cells) {
        for (const n of NEIGHBORS[c]) this.blocked[p][n] = 1;
        for (const d of DIAGONALS[c]) this.diag[p][d] = 1;
      }
      this.remaining[p][move.piece] = 0;
      this.placedSquares[p] += cells.length;
      this.lastPiece[p] = move.piece;
      this.placements.push({ player: p, piece: move.piece, orient: move.orient, x: move.x, y: move.y });
    }
    this.currentPlayer = 3 - p;
    this.moveCount++;
    return this;
  }

  isOver() {
    return this.passed[1] && this.passed[2];
  }

  score(player) {
    let s = this.placedSquares[player] - TOTAL_SQUARES;
    if (this.placedSquares[player] === TOTAL_SQUARES) s += this.lastPiece[player] === 0 ? 20 : 15;
    return s;
  }

  /** 끝난 판의 승자 (1/2), 진행 중이거나 무승부면 0 */
  getWinner() {
    if (!this.isOver()) return 0;
    const d = this.score(1) - this.score(2);
    return d > 0 ? 1 : d < 0 ? 2 : 0;
  }

  toJSON() {
    return {
      placements: this.placements.map(m => ({ ...m })),
      passed: { ...this.passed },
      currentPlayer: this.currentPlayer,
      moveCount: this.moveCount,
    };
  }

  static fromJSON(json) {
    const g = new BlokusGame();
    // 배치 기록을 다시 두어 보드·막힌 칸을 복원합니다
    for (const m of json.placements ?? []) {
      g.currentPlayer = m.player;
      g.applyMove({ type: "place", ...m });
    }
    g.passed = { 1: !!json.passed?.[1], 2: !!json.passed?.[2] };
    g.currentPlayer = json.currentPlayer ?? 1;
    g.moveCount = json.moveCount ?? g.placements.length;
    return g;
  }
}

export { PIECES, PIECE_SIZES, ORIENTS, PIECE_ORIENTS, TOTAL_SQUARES };
