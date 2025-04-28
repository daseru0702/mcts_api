// games/quoridor/QuoridorGame.js

export class QuoridorGame {
  constructor() {
    this.boardSize = 9;
    this.pawns = { 1: { x: 4, y: 0 }, 2: { x: 4, y: 8 } };
    this.wallCounts = { 1: 10, 2: 10 };
    this.currentPlayer = 1;
    this.placedWalls = [];
    this.crossPoints = Array.from({ length: 8 }, () => Array(8).fill(false));
    this.nodes = Array.from({ length: this.boardSize }, (_, x) =>
      Array.from({ length: this.boardSize }, (_, y) => ({ x, y, neighbors: new Set() }))
    );
    this.initNeighbors();
  }

  initNeighbors() {
    const dirs = [ [0,-1], [0,1], [-1,0], [1,0] ];
    for (let x = 0; x < this.boardSize; x++) {
      for (let y = 0; y < this.boardSize; y++) {
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (this.inBounds(nx, ny)) this.nodes[x][y].neighbors.add(`${dx},${dy}`);
        }
      }
    }
  }

  getLegalPawnMoves(player = this.currentPlayer) {
    const moves = [];
    const { x, y } = this.pawns[player];
    const opp = this.pawns[3 - player];
    for (const dir of this.nodes[x][y].neighbors) {
      const [dx, dy] = dir.split(',').map(Number), nx = x + dx, ny = y + dy;
      // 상대 말 점프/회피 로직 포함
      if (nx === opp.x && ny === opp.y) {
        const ox = opp.x + dx, oy = opp.y + dy;
        if (this.inBounds(ox, oy) && this.nodes[opp.x][opp.y].neighbors.has(`${dx},${dy}`)) {
          moves.push({ type: "move", x: ox, y: oy });
        } else {
          const sides = dx === 0 ? [[-1,0],[1,0]] : [[0,-1],[0,1]];
          for (const [sdx, sdy] of sides) {
            const sx = opp.x + sdx, sy = opp.y + sdy;
            if (this.inBounds(sx, sy) && this.nodes[opp.x][opp.y].neighbors.has(`${sdx},${sdy}`)) {
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
    } else {
      this.removeConnectionsForWall(move);
      this.placedWalls.push(move);
      this.crossPoints[move.x][move.y] = true;
      this.wallCounts[p]--;
    }
    this.currentPlayer = 3 - p;
  }

  isValidWallPlacement(move) {
    const { x, y, orientation } = move;

    if (x < 0 || y < 0 || x >= 8 || y >= 8) return false;

    // ⛔ 벽 다 썼으면 설치 불가
    if (this.wallCounts[this.currentPlayer] <= 0) return false;

    // ⛔ 중복 벽
    if (this.wallExistsAt(x, y, orientation)) return false;

    // ⛔ 교차 충돌
    if (this.crossPoints[x][y]) return false;

    // ⛔ 연속된 벽 중첩
    if (orientation === "h") {
      if (this.wallExistsAt(x - 1, y, "h") || this.wallExistsAt(x + 1, y, "h")) return false;
    } else {
      if (this.wallExistsAt(x, y - 1, "v") || this.wallExistsAt(x, y + 1, "v")) return false;
    }

    const testGame = this.clone();
    testGame.removeConnectionsForWall(move);
    return testGame.hasPathToGoal(1) && testGame.hasPathToGoal(2);
  }

  wallExistsAt(x, y, orientation) {
    return this.placedWalls.some(w => w.x === x && w.y === y && w.orientation === orientation);
  }

  removeConnectionsForWall(move) {
    const { x, y, orientation } = move;
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

    while (queue.length > 0) {
      const [x, y] = queue.shift();
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (y === goalY) return true;

      for (const dir of this.nodes[x][y].neighbors) {
        const [dx, dy] = dir.split(',').map(Number);
        const nx = x + dx, ny = y + dy;
        if (this.inBounds(nx, ny)) {
          queue.push([nx, ny]);
        }
      }
    }

    return false;
  }

  clone() {
    const copy = new QuoridorGame();
    copy.pawns = {
      1: { ...this.pawns[1] },
      2: { ...this.pawns[2] }
    };
    copy.wallCounts = { ...this.wallCounts };
    copy.currentPlayer = this.currentPlayer;
    copy.placedWalls = [...this.placedWalls];
    for (const move of copy.placedWalls) {
      copy.removeConnectionsForWall(move);
      copy.crossPoints[move.x][move.y] = true;
    }
    return copy;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize;
  }
}
