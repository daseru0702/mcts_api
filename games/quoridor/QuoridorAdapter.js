// games/quoridor/QuoridorAdapter.js

import { QuoridorGame } from "./QuoridorGame.js";

export class QuoridorAdapter {
  constructor(stateOrJson = null) {
    if (stateOrJson instanceof QuoridorGame) {
      this.game = stateOrJson;

    } else if (Array.isArray(stateOrJson)) {
      // flat 배열이 넘어왔을 때
      this.game = new QuoridorGame();
      this.setStateFromArray(stateOrJson);

    } else if (stateOrJson && typeof stateOrJson === "object") {
      // JSON restore
      this.game = QuoridorGame.fromJSON(stateOrJson);

    } else {
      this.game = new QuoridorGame();
    }
  }

  clone() {
    const clonedGame = this.game.clone();
    return new QuoridorAdapter(clonedGame);
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

  getStateTensor() {
    const N = this.game.boardSize;  // 9
  
    // --- 채널 0,1: 폰 위치 (N×N) ---
    const c0 = new Float32Array(N*N).fill(0);
    const c1 = new Float32Array(N*N).fill(0);
    const p1 = this.game.pawns[1], p2 = this.game.pawns[2];
    c0[p1.y * N + p1.x] = 1;
    c1[p2.y * N + p2.x] = 1;
  
    // --- 채널 2: 수평벽 (N×N)에 유효 위치만 1 찍기) ---
    const c2 = new Float32Array(N*N).fill(0);
    // 수평벽은 x∈[0,N-2], y∈[0,N-1]
    for (const w of this.game.placedWalls) {
      if (w.orientation === "h") {
        // row = w.y, col = w.x
        c2[w.y * N + w.x] = 1;
      }
    }
  
    // --- 채널 3: 수직벽 (N×N)에 유효 위치만 1 찍기) ---
    const c3 = new Float32Array(N*N).fill(0);
    // 수직벽은 x∈[0,N-1], y∈[0,N-2]
    for (const w of this.game.placedWalls) {
      if (w.orientation === "v") {
        // row = w.y, col = w.x
        c3[w.y * N + w.x] = 1;
      }
    }
  
    // --- 4채널 모두 합치기 ---
    const flat = Float32Array.from([
      ...c0, ...c1,
      ...c2, ...c3
    ]);
  
    return { data: flat, shape: [1, 4, N, N] };
  }
  

  // 서버: flat array → TensorFlow 텐서 → QuoridorGame 상태로 복원
  setStateFromArray(flatArr) {
    const N = this.game.boardSize;
    const C = flatArr.length / (N * N);  // 채널 수
    if (flatArr.length !== 4 * N * N) {
      throw new Error(`flatArr 길이 불일치: expected ${4*N*N}, got ${flatArr.length}`);
    }

    // 채널별로 분리
    const [c0, c1, c2, c3] = [
      flatArr.slice(0,   N*N),
      flatArr.slice(N*N, 2*N*N),
      flatArr.slice(2*N*N, 2*N*N + (N-1)*N),
      flatArr.slice(2*N*N + (N-1)*N)
    ];

    // 플레이어 위치 복원
    this.game.pawns[1] = { x: c0.findIndex(v => v===1) % N,
                           y: Math.floor(c0.findIndex(v => v===1) / N) };
    this.game.pawns[2] = { x: c1.findIndex(v => v===1) % N,
                           y: Math.floor(c1.findIndex(v => v===1) / N) };

    // 벽 복원
    this.game.placedWalls = [];
    // 가로
    for (let idx = 0; idx < c2.length; idx++) {
      if (c2[idx] === 1) {
        const y = Math.floor(idx / N), x = idx % N;
        this.game.placedWalls.push({ type:"wall", x, y, orientation:"h" });
      }
    }
    // 세로
    for (let idx = 0; idx < c3.length; idx++) {
      if (c3[idx] === 1) {
        const y = Math.floor(idx / (N-1)), x = idx % (N-1);
        this.game.placedWalls.push({ type:"wall", x, y, orientation:"v" });
      }
    }

    // currentPlayer 복원 (3 - 마지막으로 둔 사람)
    const last = this.game.placedWalls.length +  // wall 개수
                 (this.game.pawns[1].x === 4 && this.game.pawns[1].y===0 ? 0 : 1) +
                 (this.game.pawns[2].x === 4 && this.game.pawns[2].y===8 ? 0 : 1);
    // (이건 예시 로직; 필요하면 getCurrentPlayer 로 대체하세요)
    this.game.currentPlayer = (last % 2 === 0 ? 1 : 2);
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

  _findIndex(arr, N) {
    const idx = arr.findIndex(v => v === 1);
    return [ Math.floor(idx / N), idx % N ];
  }
}
