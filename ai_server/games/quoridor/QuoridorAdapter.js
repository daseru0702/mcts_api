// ai_server/games/quoridor/QuoridorAdapter.js

import { QuoridorGame } from "./QuoridorGame.js";

export class QuoridorAdapter {
  /**
   * @param {QuoridorGame|Object|null} stateOrJson
   *   - QuoridorGame 인스턴스
   *   - state JSON object (from toJSON), or
   *   - null → 신규 게임
   */
  constructor(stateOrJson = null) {
    if (stateOrJson instanceof QuoridorGame) {
      // 이미 게임 인스턴스가 넘어오면 그대로 사용
      this.game = stateOrJson;
    } else if (stateOrJson) {
      // JSON 직렬화된 상태가 넘어왔다면 복원
      this.game = QuoridorGame.fromJSON(stateOrJson);
    } else {
      // 빈 값이면 새로 생성
      this.game = new QuoridorGame();
    }
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
    return new QuoridorAdapter(this.game.clone());
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
    // 서버 API에서 상태 직렬화가 필요하다면,
    // QuoridorGame 쪽에 toJSON이 없으면 직접 뽑아주세요.
    return this.game.toJSON
      ? this.game.toJSON()
      : {  };
  }
}
