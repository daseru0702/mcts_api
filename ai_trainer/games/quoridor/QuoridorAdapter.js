// ai_trainer/games/quoridor/QuoridorAdapter.js

import { QuoridorGame } from "./QuoridorGame.js";

export class QuoridorAdapter {
  /**
   * @param {Object|null} stateJson  이전 상태(JSON) 또는 null=신규 게임
   */
  constructor(stateJson = null) {
    this.game = stateJson
      ? QuoridorGame.fromJSON(stateJson)  // JSON → 게임 인스턴스 복원
      : new QuoridorGame();
  }

  getPossibleMoves() {
    const pawnMoves = this.game
      .getLegalPawnMoves()
      .map(m => ({ type: "move", x: m.x, y: m.y }));
    const wallMoves = [];
    const N = this.game.boardSize - 1;
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (const orientation of ["h", "v"]) {
          const mv = { type: "wall", x, y, orientation };
          if (this.game.isValidWallPlacement(mv)) {
            wallMoves.push(mv);
          }
        }
      }
    }
    return pawnMoves.concat(wallMoves);
  }

  applyMove(move) {
    this.game.applyMove(move);
    return this;
  }

  clone() {
    return new QuoridorAdapter(this.game.clone().toJSON());
  }

  isTerminal() {
    const p1 = this.game.pawns[1].y === this.game.boardSize - 1;
    const p2 = this.game.pawns[2].y === 0;
    return p1 || p2;
  }

  getReward(player) {
    const pawn = this.game.pawns[player];
    return ((player === 1 && pawn.y === this.game.boardSize - 1) ||
            (player === 2 && pawn.y === 0))
      ? 1 : 0;
  }

  getCurrentPlayer() {
    return this.game.currentPlayer;
  }

  /**
   * MCTSNN.evaluate() 용 입력 텐서 생성
   * @returns {{ data: Float32Array, shape: [1, C, H, W] }}
   */
  getStateTensor() {
    const N = this.game.boardSize;
    // 채널0: 플레이어1 폰, 채널1: 플레이어2 폰
    const c0 = Array.from({ length: N * N }, () => 0);
    const c1 = Array.from({ length: N * N }, () => 0);
    const p1 = this.game.pawns[1], p2 = this.game.pawns[2];
    c0[p1.y * N + p1.x] = 1;
    c1[p2.y * N + p2.x] = 1;

    // 채널2: 가로벽 (N-1 × N), 채널3: 세로벽 (N × N-1)
    const c2 = Array.from({ length: (N-1) * N }, () => 0);
    const c3 = Array.from({ length: N * (N-1) }, () => 0);
    for (const w of this.game.placedWalls) {
      if (w.orientation === "h") {
        c2[w.y * N + w.x] = 1;
      } else {
        c3[w.y * (N-1) + w.x] = 1;
      }
    }

    // [c0, c1, c2, c3] 순서로 flatten
    const flat = Float32Array.from([
      ...c0, ...c1,
      ...c2, ...c3
    ]);

    // ONNX 세션에 맞춰 [1, C, H, W]
    return { data: flat, shape: [1, 4, N, N] };
  }

  /**
   * JSON 형태로 상태 직렬화 (클라이언트↔서버 간 주고받을 때)
   */
  toJSON() {
    return this.game.toJSON();
  }
}
