// client/games/quoridor/QuoridorAdapter.js

import { QuoridorGame } from "./QuoridorGame.js";

export class QuoridorAdapter {
  constructor(stateJson = null) {
    this.game = stateJson
      ? QuoridorGame.fromJSON(stateJson)
      : new QuoridorGame();
  }

  getPossibleMoves() {
    // ...
  }
  applyMove(move) { /* ... */ }
  clone() { /* ... */ }
  isTerminal() { /* ... */ }
  getCurrentPlayer() { /* ... */ }

  // **여기 추가**: MCTSNN.evaluate 에서 사용
  getStateTensor() {
    const N = this.game.boardSize;
    // 채널0,1: pawn 위치
    const c0 = Array.from({ length: N }, () => Array(N).fill(0));
    const c1 = Array.from({ length: N }, () => Array(N).fill(0));
    c0[this.game.pawns[1].y][this.game.pawns[1].x] = 1;
    c1[this.game.pawns[2].y][this.game.pawns[2].x] = 1;
    // 채널2: 가로벽 (N-1 x N)
    const c2 = Array.from({ length: N-1 }, () => Array(N).fill(0));
    // 채널3: 세로벽 (N x N-1)
    const c3 = Array.from({ length: N }, () => Array(N-1).fill(0));
    for (const w of this.game.placedWalls) {
      if (w.orientation === "h") c2[w.y][w.x] = 1;
      else                      c3[w.y][w.x] = 1;
    }
    // Float32Array 로 flatten
    const flat = Float32Array.from([].concat(...[
      c0.flat(), c1.flat(), c2.flat(), c3.flat()
    ]));
    const totalChan = 4, size = N * N;
    return { data: flat, shape: [1, totalChan, N, N] };
  }
}
