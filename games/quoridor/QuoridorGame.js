// games/quoridor/QuoridorGame.js
//
// 9×9 쿼리도 규칙 엔진 (브라우저/Node 공용, 의존성 없음)
//  - 좌표: x = 열(0~8), y = 행(0~8). 칸 인덱스 i = y*9 + x
//  - Player 1 은 y=0 에서 출발해 y=8 도달 시 승리, Player 2 는 y=8 → y=0
//  - 벽 (x,y) 은 교차점 기준 (x,y ∈ 0~7)
//      h: (x,y)-(x,y+1) 과 (x+1,y)-(x+1,y+1) 사이 이동을 막음
//      v: (x,y)-(x+1,y) 과 (x,y+1)-(x+1,y+1) 사이 이동을 막음

const N = 9;
const W = N - 1;
const CELLS = N * N;

// BFS용 공유 버퍼 (게임 인스턴스마다 할당하지 않도록)
const bfsQueue = new Int16Array(CELLS);
const bfsDist  = new Int16Array(CELLS);
const bfsPrev  = new Int16Array(CELLS);

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

export class QuoridorGame {
  constructor() {
    this.boardSize = N;
    this.pawns = { 1: { x: 4, y: 0 }, 2: { x: 4, y: 8 } };
    this.wallCounts = { 1: 10, 2: 10 };
    this.currentPlayer = 1;
    this.placedWalls = [];
    this.moveCount = 0;

    // hBlock[i] = 1 이면 칸 i 와 그 아래칸(y+1) 사이가 막힘
    // vBlock[i] = 1 이면 칸 i 와 그 오른쪽칸(x+1) 사이가 막힘
    this.hBlock = new Uint8Array(CELLS);
    this.vBlock = new Uint8Array(CELLS);
    // 교차점별 설치된 벽
    this.hWalls = new Uint8Array(W * W);
    this.vWalls = new Uint8Array(W * W);
  }

  inBounds(x, y) {
    return x >= 0 && x < N && y >= 0 && y < N;
  }

  /** (x,y) 에서 (x+dx, y+dy) 로 벽에 막히지 않고 이동 가능한지 */
  canStep(x, y, dx, dy) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= N || ny < 0 || ny >= N) return false;
    if (dy === 1)  return !this.hBlock[y * N + x];
    if (dy === -1) return !this.hBlock[ny * N + x];
    if (dx === 1)  return !this.vBlock[y * N + x];
    return !this.vBlock[y * N + nx];
  }

  goalRow(player) {
    return player === 1 ? N - 1 : 0;
  }

  getWinner() {
    if (this.pawns[1].y === N - 1) return 1;
    if (this.pawns[2].y === 0) return 2;
    return 0;
  }

  isOver() {
    return this.getWinner() !== 0;
  }

  getLegalPawnMoves(player = this.currentPlayer) {
    const moves = [];
    const { x, y } = this.pawns[player];
    const opp = this.pawns[3 - player];

    for (const [dx, dy] of DIRS) {
      if (!this.canStep(x, y, dx, dy)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx !== opp.x || ny !== opp.y) {
        moves.push({ type: "move", x: nx, y: ny });
        continue;
      }
      // 상대 말을 뛰어넘기
      if (this.canStep(nx, ny, dx, dy)) {
        moves.push({ type: "move", x: nx + dx, y: ny + dy });
        continue;
      }
      // 뒤가 막혔으면 대각선으로
      const sides = dx === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
      for (const [sdx, sdy] of sides) {
        if (this.canStep(nx, ny, sdx, sdy)) {
          moves.push({ type: "move", x: nx + sdx, y: ny + sdy });
        }
      }
    }
    return moves;
  }

  /** 벽 겹침/교차 규칙만 검사 (경로 차단 여부는 별도) */
  _wallFits(x, y, orientation) {
    if (x < 0 || y < 0 || x >= W || y >= W) return false;
    const k = y * W + x;
    if (this.hWalls[k] || this.vWalls[k]) return false;
    if (orientation === "h") {
      if (x > 0 && this.hWalls[k - 1]) return false;
      if (x < W - 1 && this.hWalls[k + 1]) return false;
    } else {
      if (y > 0 && this.vWalls[k - W]) return false;
      if (y < W - 1 && this.vWalls[k + W]) return false;
    }
    return true;
  }

  _setWallBlocks(x, y, orientation, val) {
    if (orientation === "h") {
      this.hBlock[y * N + x] = val;
      this.hBlock[y * N + x + 1] = val;
    } else {
      this.vBlock[y * N + x] = val;
      this.vBlock[(y + 1) * N + x] = val;
    }
  }

  isValidWallPlacement(move, player = this.currentPlayer) {
    const { x, y, orientation } = move;
    if (this.wallCounts[player] <= 0) return false;
    if (!this._wallFits(x, y, orientation)) return false;
    this._setWallBlocks(x, y, orientation, 1);
    const ok = this.shortestDistance(1) >= 0 && this.shortestDistance(2) >= 0;
    this._setWallBlocks(x, y, orientation, 0);
    return ok;
  }

  /**
   * 현재 플레이어가 둘 수 있는 모든 벽.
   * 각 플레이어의 최단경로 하나를 구해두고, 그 경로를 끊지 않는 벽은 BFS 없이 통과시킵니다.
   */
  getLegalWallMoves(player = this.currentPlayer) {
    const walls = [];
    if (this.wallCounts[player] <= 0) return walls;

    const pathH = new Uint8Array(CELLS);
    const pathV = new Uint8Array(CELLS);
    for (const p of [1, 2]) this._markShortestPath(p, pathH, pathV);

    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        for (const orientation of ["h", "v"]) {
          if (!this._wallFits(x, y, orientation)) continue;
          const cuts = orientation === "h"
            ? pathH[y * N + x] || pathH[y * N + x + 1]
            : pathV[y * N + x] || pathV[(y + 1) * N + x];
          if (cuts) {
            this._setWallBlocks(x, y, orientation, 1);
            const ok = this.shortestDistance(1) >= 0 && this.shortestDistance(2) >= 0;
            this._setWallBlocks(x, y, orientation, 0);
            if (!ok) continue;
          }
          walls.push({ type: "wall", x, y, orientation });
        }
      }
    }
    return walls;
  }

  getAllMoves() {
    return this.getLegalPawnMoves().concat(this.getLegalWallMoves());
  }

  /** 말 위치에서 목표 행까지 BFS. 도달 불가면 -1 (상대 말은 무시) */
  shortestDistance(player) {
    return this._bfsFrom(player, false);
  }

  _bfsFrom(player, keepPrev) {
    const start = this.pawns[player].y * N + this.pawns[player].x;
    const goal = this.goalRow(player);
    bfsDist.fill(-1);
    let head = 0, tail = 0;
    bfsQueue[tail++] = start;
    bfsDist[start] = 0;
    if (keepPrev) bfsPrev[start] = -1;
    while (head < tail) {
      const c = bfsQueue[head++];
      const cx = c % N, cy = (c / N) | 0;
      if (cy === goal) return keepPrev ? c : bfsDist[c];
      for (const [dx, dy] of DIRS) {
        if (!this.canStep(cx, cy, dx, dy)) continue;
        const n = c + dy * N + dx;
        if (bfsDist[n] !== -1) continue;
        bfsDist[n] = bfsDist[c] + 1;
        if (keepPrev) bfsPrev[n] = c;
        bfsQueue[tail++] = n;
      }
    }
    return -1;
  }

  _markShortestPath(player, pathH, pathV) {
    let c = this._bfsFrom(player, true);
    if (c < 0) return;
    while (bfsPrev[c] !== -1) {
      const p = bfsPrev[c];
      const d = c - p;
      if (d === N) pathH[p] = 1;
      else if (d === -N) pathH[c] = 1;
      else if (d === 1) pathV[p] = 1;
      else pathV[c] = 1;
      c = p;
    }
  }

  /** 모든 칸에서 player 의 목표 행까지의 거리 (도달 불가 = -1) */
  distanceMap(player) {
    const dist = new Int16Array(CELLS).fill(-1);
    const goal = this.goalRow(player);
    let head = 0, tail = 0;
    for (let x = 0; x < N; x++) {
      const c = goal * N + x;
      dist[c] = 0;
      bfsQueue[tail++] = c;
    }
    while (head < tail) {
      const c = bfsQueue[head++];
      const cx = c % N, cy = (c / N) | 0;
      for (const [dx, dy] of DIRS) {
        if (!this.canStep(cx, cy, dx, dy)) continue;
        const n = c + dy * N + dx;
        if (dist[n] !== -1) continue;
        dist[n] = dist[c] + 1;
        bfsQueue[tail++] = n;
      }
    }
    return dist;
  }

  /** 검증 없이 수를 적용합니다 (합법 수만 넘겨야 함) */
  applyMove(move) {
    const p = this.currentPlayer;
    if (move.type === "move") {
      this.pawns[p] = { x: move.x, y: move.y };
    } else {
      const { x, y, orientation } = move;
      this._setWallBlocks(x, y, orientation, 1);
      (orientation === "h" ? this.hWalls : this.vWalls)[y * W + x] = 1;
      this.placedWalls.push({ type: "wall", x, y, orientation });
      this.wallCounts[p]--;
    }
    this.currentPlayer = 3 - p;
    this.moveCount++;
  }

  isLegalMove(move) {
    if (!move || this.isOver()) return false;
    if (move.type === "move") {
      return this.getLegalPawnMoves().some(m => m.x === move.x && m.y === move.y);
    }
    if (move.type === "wall") {
      return (move.orientation === "h" || move.orientation === "v") &&
        Number.isInteger(move.x) && Number.isInteger(move.y) &&
        this.isValidWallPlacement(move);
    }
    return false;
  }

  clone() {
    const g = Object.create(QuoridorGame.prototype);
    g.boardSize = N;
    g.pawns = { 1: { ...this.pawns[1] }, 2: { ...this.pawns[2] } };
    g.wallCounts = { 1: this.wallCounts[1], 2: this.wallCounts[2] };
    g.currentPlayer = this.currentPlayer;
    g.placedWalls = this.placedWalls.slice();
    g.moveCount = this.moveCount;
    g.hBlock = this.hBlock.slice();
    g.vBlock = this.vBlock.slice();
    g.hWalls = this.hWalls.slice();
    g.vWalls = this.vWalls.slice();
    return g;
  }

  toJSON() {
    return {
      boardSize:     this.boardSize,
      pawns:         this.pawns,
      wallCounts:    this.wallCounts,
      placedWalls:   this.placedWalls,
      currentPlayer: this.currentPlayer,
      moveCount:     this.moveCount,
    };
  }

  /** JSON 으로부터 복원. 형식이 잘못됐으면 예외를 던집니다. */
  static fromJSON(json) {
    const g = new QuoridorGame();
    const cell = p => {
      if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || !g.inBounds(p.x, p.y)) {
        throw new Error("잘못된 말 위치");
      }
      return { x: p.x, y: p.y };
    };
    if (json.pawns) g.pawns = { 1: cell(json.pawns[1]), 2: cell(json.pawns[2]) };
    if (json.currentPlayer !== undefined) {
      if (json.currentPlayer !== 1 && json.currentPlayer !== 2) throw new Error("잘못된 currentPlayer");
      g.currentPlayer = json.currentPlayer;
    }
    for (const w of json.placedWalls || []) {
      if (!g._wallFits(w.x, w.y, w.orientation) || (w.orientation !== "h" && w.orientation !== "v")) {
        throw new Error(`잘못된 벽: ${JSON.stringify(w)}`);
      }
      g._setWallBlocks(w.x, w.y, w.orientation, 1);
      (w.orientation === "h" ? g.hWalls : g.vWalls)[w.y * W + w.x] = 1;
      g.placedWalls.push({ type: "wall", x: w.x, y: w.y, orientation: w.orientation });
    }
    if (json.wallCounts) {
      g.wallCounts = { 1: json.wallCounts[1] | 0, 2: json.wallCounts[2] | 0 };
    } else {
      // 벽 수가 없으면 설치된 벽을 반씩 나눠 가진 것으로 가정
      const used = g.placedWalls.length;
      g.wallCounts = { 1: 10 - Math.ceil(used / 2), 2: 10 - Math.floor(used / 2) };
    }
    g.moveCount = json.moveCount | 0;
    return g;
  }
}
