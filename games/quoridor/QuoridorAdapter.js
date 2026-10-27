// games/quoridor/QuoridorAdapter.js
//
// MCTS/신경망이 사용하는 게임 공통 인터페이스.
// 신경망 입력과 정책 인덱스는 "현재 둘 차례인 플레이어" 기준(canonical)입니다.
// Player 2 차례일 때는 보드를 상하 반전해서 항상 "내가 y=0 → y=8 로 간다"로 보이게 합니다.
//
//  입력 채널 (IN_CHANNELS × 9 × 9)
//    0: 내 말            1: 상대 말
//    2: 가로벽(교차점)    3: 세로벽(교차점)
//    4: 내 남은 벽/10     5: 상대 남은 벽/10   (상수 평면)
//    6: 내 목표까지 거리맵/20  7: 상대 목표까지 거리맵/20  (도달 불가 = 1)
//
//  정책 인덱스 (POLICY_SIZE = 81 + 64 + 64 = 209)
//    [0, 81)    말 이동 도착칸  y*9 + x
//    [81, 145)  가로벽         81 + y*8 + x
//    [145, 209) 세로벽         145 + y*8 + x

import { QuoridorGame } from "./QuoridorGame.js";

const N = 9;
const W = 8;
const PLANE = N * N;
export const IN_CHANNELS = 8;
export const POLICY_SIZE = PLANE + 2 * W * W;

export class QuoridorAdapter {
  static IN_CHANNELS = IN_CHANNELS;
  static BOARD_SIZE = N;
  static POLICY_SIZE = POLICY_SIZE;
  /** 신경망 입력 [채널, 세로, 가로] — 공통 코드(평가기·학습)는 이 값만 사용 */
  static INPUT_SHAPE = [IN_CHANNELS, N, N];
  /** 데이터 증강에 쓰는 대칭 변환: encode(sym)/moveToIndex(move, sym) 에 그대로 전달 */
  static SYMMETRIES = [false, true];

  constructor(stateOrJson = null) {
    if (stateOrJson instanceof QuoridorGame) {
      this.game = stateOrJson;
    } else if (stateOrJson && typeof stateOrJson === "object") {
      this.game = QuoridorGame.fromJSON(stateOrJson);
    } else {
      this.game = new QuoridorGame();
    }
  }

  clone() {
    return new QuoridorAdapter(this.game.clone());
  }

  getPossibleMoves() {
    return this.game.getAllMoves();
  }

  applyMove(move) {
    this.game.applyMove(move);
    return this;
  }

  isTerminal() {
    return this.game.isOver();
  }

  /** 승자 (1/2), 진행 중이면 0 */
  getWinner() {
    return this.game.getWinner();
  }

  getCurrentPlayer() {
    return this.game.currentPlayer;
  }

  getMoveCount() {
    return this.game.moveCount;
  }

  isLegalMove(move) {
    return this.game.isLegalMove(move);
  }

  /** 수 제한으로 끝난 판의 판정값 (둘 차례 기준, [-0.5, 0.5]): 최단거리 차이 */
  adjudicateValue() {
    const g = this.game;
    const me = g.currentPlayer;
    return 0.5 * Math.tanh((g.shortestDistance(3 - me) - g.shortestDistance(me)) / 3);
  }

  /** 끝난 게임에서 player 기준 보상 (+1 승 / -1 패) */
  getReward(player) {
    const w = this.getWinner();
    return w === 0 ? 0 : (w === player ? 1 : -1);
  }

  // ─── 신경망 인코딩 ─────────────────────────────────────────────

  /**
   * @param {boolean} mirror 좌우 반전 (데이터 증강용)
   * @returns {Float32Array} 길이 IN_CHANNELS*81
   */
  encode(mirror = false) {
    const g = this.game;
    const me = g.currentPlayer, opp = 3 - me;
    const flip = me === 2;
    const cy = y => (flip ? N - 1 - y : y);
    const cx = x => (mirror ? N - 1 - x : x);
    const wy = y => (flip ? W - 1 - y : y);
    const wx = x => (mirror ? W - 1 - x : x);

    const out = new Float32Array(IN_CHANNELS * PLANE);
    const pm = g.pawns[me], po = g.pawns[opp];
    out[0 * PLANE + cy(pm.y) * N + cx(pm.x)] = 1;
    out[1 * PLANE + cy(po.y) * N + cx(po.x)] = 1;
    for (const w of g.placedWalls) {
      const ch = w.orientation === "h" ? 2 : 3;
      out[ch * PLANE + wy(w.y) * N + wx(w.x)] = 1;
    }
    out.fill(g.wallCounts[me] / 10, 4 * PLANE, 5 * PLANE);
    out.fill(g.wallCounts[opp] / 10, 5 * PLANE, 6 * PLANE);

    const dMe = g.distanceMap(me), dOpp = g.distanceMap(opp);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const src = y * N + x;
        const dst = cy(y) * N + cx(x);
        out[6 * PLANE + dst] = dMe[src] < 0 ? 1 : Math.min(dMe[src] / 20, 1);
        out[7 * PLANE + dst] = dOpp[src] < 0 ? 1 : Math.min(dOpp[src] / 20, 1);
      }
    }
    return out;
  }

  /** 수 → canonical 정책 인덱스 (현재 차례 기준) */
  moveToIndex(move, mirror = false) {
    const flip = this.game.currentPlayer === 2;
    if (move.type === "move") {
      const y = flip ? N - 1 - move.y : move.y;
      const x = mirror ? N - 1 - move.x : move.x;
      return y * N + x;
    }
    const y = flip ? W - 1 - move.y : move.y;
    const x = mirror ? W - 1 - move.x : move.x;
    return (move.orientation === "h" ? PLANE : PLANE + W * W) + y * W + x;
  }

  // ─── 휴리스틱 (신경망이 없을 때 0세대 데이터 생성/비교용) ─────────────

  /** 현재 차례 플레이어 기준 [-1,1] 가치 추정: 최단거리 차이 + 남은 벽 */
  heuristicValue() {
    const g = this.game;
    const me = g.currentPlayer, opp = 3 - me;
    const dMe = g.shortestDistance(me);
    const dOpp = g.shortestDistance(opp);
    // 내가 먼저 두므로 한 수(0.5) 이득을 줍니다
    const diff = (dOpp - dMe) + 0.5 + 0.3 * (g.wallCounts[me] - g.wallCounts[opp]);
    return Math.tanh(diff / 4);
  }

  /** 합법 수마다 사전확률: 최단경로를 줄이는 이동, 상대 경로를 늘리는 벽에 가중치 */
  heuristicPriors(moves) {
    const g = this.game;
    const me = g.currentPlayer, opp = 3 - me;
    const dMap = g.distanceMap(me);
    const myDist = dMap[g.pawns[me].y * N + g.pawns[me].x];
    const oppDist = g.shortestDistance(opp);
    const weights = moves.map(m => {
      if (m.type === "move") {
        const d = dMap[m.y * N + m.x];
        return d < myDist ? 6 : d === myDist ? 0.8 : 0.3;
      }
      // 벽: 상대 최단거리가 늘어나는 만큼 가중치
      g._setWallBlocks(m.x, m.y, m.orientation, 1);
      const gain = g.shortestDistance(opp) - oppDist;
      const cost = g.shortestDistance(me) - myDist;
      g._setWallBlocks(m.x, m.y, m.orientation, 0);
      const score = gain - cost;
      return score > 0 ? 0.6 * score : 0.02;
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  }

  toJSON() {
    return this.game.toJSON();
  }
}
