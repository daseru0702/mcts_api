// games/blokus/BlokusAdapter.js — MCTS/신경망용 블로커스 듀오 인터페이스
//
// 신경망 입력과 정책은 "둘 차례인 플레이어" 기준(canonical)입니다.
// Player 2 차례면 판을 180° 돌려서 항상 내 시작점이 (4,4) 쪽에 오게 합니다.
// 대칭 증강: sym=true 이면 주대각선 기준으로 뒤집습니다(x↔y). 두 시작점이 그대로 있어 규칙이 같습니다.
//
//  입력 채널 (IN_CHANNELS × 14 × 14)
//    0: 내 칸               1: 상대 칸
//    2: 내가 조각을 시작할 수 있는 칸   3: 비어 있지만 내 조각과 변으로 닿아 못 쓰는 칸
//    4: 상대가 시작할 수 있는 칸       5: 비어 있지만 상대가 못 쓰는 칸
//    6..26:  내 남은 조각 21종 (상수 평면)
//    27..47: 상대 남은 조각 21종 (상수 평면)
//    48: 상대가 이미 패스했는지 (상수 평면)
//
//  정책 인덱스 (POLICY_SIZE = 91 × 196 + 1 = 17837)
//    방향 번호 × 196 + y × 14 + x   (x, y = 방향 모양의 왼쪽 위 기준점)
//    17836 = 패스

import { BlokusGame, N, CELLS, NUM_PIECES } from "./BlokusGame.js";
import { ORIENTS, PIECE_SIZES, ORIENT_ROT180, ORIENT_TRANSPOSE } from "./pieces.js";

export const IN_CHANNELS = 6 + 2 * NUM_PIECES + 1;
export const PASS_INDEX = ORIENTS.length * CELLS;
export const POLICY_SIZE = PASS_INDEX + 1;

/** 칸 번호를 canonical 좌표 칸 번호로 (rot = 180° 회전, tr = x↔y) */
function tfCell(c, rot, tr) {
  let x = c % N, y = (c / N) | 0;
  if (rot) { x = N - 1 - x; y = N - 1 - y; }
  if (tr) [x, y] = [y, x];
  return y * N + x;
}

export class BlokusAdapter {
  static BOARD_SIZE = N;
  static POLICY_SIZE = POLICY_SIZE;
  /** 정책 앞 91×196 개가 [방향, y, x] 격자 → 학습은 합성곱 정책 출력층을 씁니다 */
  static POLICY_PLANES = ORIENTS.length;
  static INPUT_SHAPE = [IN_CHANNELS, N, N];
  static SYMMETRIES = [false, true];

  constructor(stateOrJson = null) {
    if (stateOrJson instanceof BlokusGame) this.game = stateOrJson;
    else if (stateOrJson && typeof stateOrJson === "object") this.game = BlokusGame.fromJSON(stateOrJson);
    else this.game = new BlokusGame();
  }

  clone() { return new BlokusAdapter(this.game.clone()); }
  getPossibleMoves() { return this.game.getAllMoves(); }
  applyMove(move) { this.game.applyMove(move); return this; }
  isTerminal() { return this.game.isOver(); }
  getWinner() { return this.game.getWinner(); }
  getCurrentPlayer() { return this.game.currentPlayer; }
  getMoveCount() { return this.game.moveCount; }
  isLegalMove(move) { return this.game.isLegalMove(move); }
  toJSON() { return this.game.toJSON(); }

  /** 둘 차례 기준 점수 차 */
  scoreDiff() {
    const me = this.game.currentPlayer;
    return this.game.score(me) - this.game.score(3 - me);
  }

  /** 끝나지 않았는데 수 제한에 걸린 판의 판정값 (둘 차례 기준, [-0.5, 0.5]) */
  adjudicateValue() {
    return this.game.isOver() ? 0 : 0.5 * Math.tanh(this.scoreDiff() / 10);
  }

  // ─── 신경망 인코딩 ─────────────────────────────────────────────

  encode(sym = false) {
    const g = this.game;
    const me = g.currentPlayer, opp = 3 - me;
    const rot = me === 2;
    const out = new Float32Array(IN_CHANNELS * CELLS);
    const map = new Int32Array(CELLS);
    for (let c = 0; c < CELLS; c++) map[c] = tfCell(c, rot, sym);

    for (let c = 0; c < CELLS; c++) {
      const d = map[c], v = g.board[c];
      if (v === me) out[d] = 1;
      else if (v === opp) out[CELLS + d] = 1;
      else {
        if (g.blocked[me][c]) out[3 * CELLS + d] = 1;
        if (g.blocked[opp][c]) out[5 * CELLS + d] = 1;
      }
    }
    for (const c of g.cornerCells(me)) out[2 * CELLS + map[c]] = 1;
    for (const c of g.cornerCells(opp)) out[4 * CELLS + map[c]] = 1;
    for (let k = 0; k < NUM_PIECES; k++) {
      if (g.remaining[me][k]) out.fill(1, (6 + k) * CELLS, (7 + k) * CELLS);
      if (g.remaining[opp][k]) out.fill(1, (6 + NUM_PIECES + k) * CELLS, (7 + NUM_PIECES + k) * CELLS);
    }
    if (g.passed[opp]) out.fill(1, (IN_CHANNELS - 1) * CELLS);
    return out;
  }

  moveToIndex(move, sym = false) {
    if (move.type === "pass") return PASS_INDEX;
    let o = move.orient, x = move.x, y = move.y;
    if (this.game.currentPlayer === 2) {
      const { w, h } = ORIENTS[o];
      x = N - x - w; y = N - y - h; o = ORIENT_ROT180[o];
    }
    if (sym) { [x, y] = [y, x]; o = ORIENT_TRANSPOSE[o]; }
    return o * CELLS + y * N + x;
  }

  // ─── 휴리스틱 (0세대 데이터·비교용) ────────────────────────────

  /** 둘 차례 기준 [-1,1]: 놓은 칸 수 차이 + 시작 가능한 칸 수 차이 */
  heuristicValue() {
    const g = this.game;
    if (g.isOver()) return Math.sign(this.scoreDiff());
    const me = g.currentPlayer, opp = 3 - me;
    const corners = p => (g.passed[p] ? 0 : g.cornerCells(p).length);
    const d = g.placedSquares[me] - g.placedSquares[opp] + 0.3 * (corners(me) - corners(opp)) + 2;
    return Math.tanh(d / 12);
  }

  /** 큰 조각, 상대 시작 칸을 덮는 배치에 가중치 */
  heuristicPriors(moves) {
    const g = this.game;
    const opp = 3 - g.currentPlayer;
    const oppCorner = new Uint8Array(CELLS);
    for (const c of g.cornerCells(opp)) oppCorner[c] = 1;
    const ws = moves.map(m => {
      if (m.type === "pass") return 1;
      const size = PIECE_SIZES[m.piece];
      let cover = 0;
      for (const c of BlokusGame.cellsOf(m)) cover += oppCorner[c];
      return size * size * (1 + cover);
    });
    const sum = ws.reduce((a, b) => a + b, 0);
    return ws.map(w => w / sum);
  }
}
