// client/games/quoridor/QuoridorGame.js

export class QuoridorGame {
  constructor() {
    this.boardSize = 9;
    this.pawns = { 1: { x: 4, y: 0 }, 2: { x: 4, y: 8 } };
    this.wallCounts = { 1: 10, 2: 10 };
    this.currentPlayer = 1;
    this.placedWalls = [];

    // 교차점 좌표 기반 충돌 방지용 배열 (8×8)
    this.crossPoints = Array.from({ length: 8 }, () =>
      Array(8).fill(false)
    );

    // 노드 그래프 (이동 연결)
    this.nodes = Array.from({ length: this.boardSize }, (_, x) =>
      Array.from({ length: this.boardSize }, (_, y) => ({
        x, y, neighbors: new Set()
      }))
    );

    this.initNeighbors();
  }

  initNeighbors() {
    const dirs = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
    ];
    for (let x = 0; x < this.boardSize; x++) {
      for (let y = 0; y < this.boardSize; y++) {
        for (const { dx, dy } of dirs) {
          const nx = x + dx, ny = y + dy;
          if (this.inBounds(nx, ny)) {
            this.nodes[x][y].neighbors.add(`${dx},${dy}`);
          }
        }
      }
    }
  }

  getLegalPawnMoves(player = this.currentPlayer) {
    const moves = [];
    const { x, y } = this.pawns[player];
    const opp = this.pawns[3 - player];
    const node = this.nodes[x][y];

    for (const dir of node.neighbors) {
      const [dx, dy] = dir.split(',').map(Number);
      const nx = x + dx, ny = y + dy;

      if (nx === opp.x && ny === opp.y) {
        // 점프 혹은 회피
        const ox = opp.x + dx, oy = opp.y + dy;
        if (
          this.inBounds(ox, oy) &&
          this.nodes[opp.x][opp.y].neighbors.has(`${dx},${dy}`)
        ) {
          moves.push({ type: "move", x: ox, y: oy });
        } else {
          const sides = dx === 0 ? [[-1,0],[1,0]] : [[0,-1],[0,1]];
          for (const [sdx, sdy] of sides) {
            const sx = opp.x + sdx, sy = opp.y + sdy;
            if (
              this.inBounds(sx, sy) &&
              this.nodes[opp.x][opp.y].neighbors.has(`${sdx},${sdy}`)
            ) {
              moves.push({ type: "move", x: sx, y: sy });
            }
          }
        }
      } else {
        moves.push({ type: "move", x: nx, y: ny });
      }
    }
    return moves;
  }

  applyMove(move) {
    const p = this.currentPlayer;
    if (move.type === "move") {
      this.pawns[p] = { x: move.x, y: move.y };
    } else { // wall
      this.removeConnectionsForWall(move);
      this.placedWalls.push(move);
      this.crossPoints[move.x][move.y] = true;
      this.wallCounts[p]--;
    }
    this.currentPlayer = 3 - p;
  }

  removeConnectionsForWall({ x, y, orientation }) {
    if (orientation === "h") {
      this.disconnect(x, y, 0, 1);
      this.disconnect(x + 1, y, 0, 1);
    } else {
      this.disconnect(x, y, 1, 0);
      this.disconnect(x, y + 1, 1, 0);
    }
  }

  disconnect(x, y, dx, dy) {
    const nx = x + dx, ny = y + dy;
    if (this.inBounds(x, y) && this.inBounds(nx, ny)) {
      this.nodes[x][y].neighbors.delete(`${dx},${dy}`);
      this.nodes[nx][ny].neighbors.delete(`${-dx},${-dy}`);
    }
  }

  hasPathToGoal(player) {
    const start = this.pawns[player];
    const goalY = player === 1 ? 8 : 0;
    const visited = new Set();
    const queue = [[start.x, start.y]];

    while (queue.length) {
      const [x, y] = queue.shift();
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (y === goalY) return true;
      for (const dir of this.nodes[x][y].neighbors) {
        const [dx, dy] = dir.split(',').map(Number);
        const nx = x + dx, ny = y + dy;
        if (this.inBounds(nx, ny)) queue.push([nx, ny]);
      }
    }
    return false;
  }

  isValidWallPlacement(move) {
    const { x, y, orientation } = move;
    if (x < 0 || y < 0 || x >= 8 || y >= 8) return false;
    if (this.wallCounts[this.currentPlayer] <= 0) return false;
    if (this.placedWalls.some(w => w.x===x&&w.y===y&&w.orientation===orientation)) return false;
    if (this.crossPoints[x][y]) return false;
    if (orientation === "h") {
      if (this.placedWalls.some(w => w.orientation==="h" && (w.x===x-1&&w.y===y || w.x===x+1&&w.y===y))) return false;
    } else {
      if (this.placedWalls.some(w => w.orientation==="v" && (w.x===x&&w.y===y-1 || w.x===x&&w.y===y+1))) return false;
    }
    const test = this.clone();
    test.removeConnectionsForWall(move);
    return test.hasPathToGoal(1) && test.hasPathToGoal(2);
  }

  clone() {
    const copy = new QuoridorGame();
    copy.pawns = { 1: {...this.pawns[1]}, 2: {...this.pawns[2]} };
    copy.wallCounts = {...this.wallCounts};
    copy.currentPlayer = this.currentPlayer;
    copy.placedWalls = this.placedWalls.map(w => ({...w}));
    copy.crossPoints = this.crossPoints.map(row => row.slice());
    // 재구성: remove 연결
    for (const w of copy.placedWalls) {
      copy.removeConnectionsForWall(w);
      copy.crossPoints[w.x][w.y] = true;
    }
    return copy;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize;
  }
}
