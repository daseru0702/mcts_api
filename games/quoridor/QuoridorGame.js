// games/quoridor/QuoridorGame.js

export class QuoridorGame {
    constructor() {
      this.boardSize = 9;
  
      this.pawns = {
        1: { x: 4, y: 0 },
        2: { x: 4, y: 8 }
      };
  
      this.wallCounts = { 1: 10, 2: 10 };
      this.currentPlayer = 1;
      this.placedWalls = [];
  
      this.crossPoints = Array.from({ length: 8 }, () =>
        Array(8).fill(false)
      );
  
      this.nodes = Array.from({ length: this.boardSize }, (_, x) =>
        Array.from({ length: this.boardSize }, (_, y) => ({
          x, y, neighbors: new Set()
        }))
      );
  
      this.initNeighbors();
    }
  
    initNeighbors() {
      const directions = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
      ];
      for (let x = 0; x < this.boardSize; x++) {
        for (let y = 0; y < this.boardSize; y++) {
          for (const { dx, dy } of directions) {
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
      const opponent = this.pawns[3 - player];
      const node = this.nodes[x][y];
  
      for (const dir of node.neighbors) {
        const [dx, dy] = dir.split(',').map(Number);
        const nx = x + dx, ny = y + dy;
  
        if (nx === opponent.x && ny === opponent.y) {
          const ox = opponent.x + dx;
          const oy = opponent.y + dy;
          if (
            this.inBounds(ox, oy) &&
            this.nodes[opponent.x][opponent.y].neighbors.has(`${dx},${dy}`)
          ) {
            moves.push({ type: "move", x: ox, y: oy });
          } else {
            const sides = dx === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
            for (const [sdx, sdy] of sides) {
              const sx = opponent.x + sdx;
              const sy = opponent.y + sdy;
              if (
                this.inBounds(sx, sy) &&
                this.nodes[opponent.x][opponent.y].neighbors.has(`${sdx},${sdy}`)
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
      const player = this.currentPlayer;
      if (move.type === "move") {
        this.pawns[player] = { x: move.x, y: move.y };
      } else if (move.type === "wall") {
        this.removeConnectionsForWall(move);
        this.placedWalls.push(move);
        this.crossPoints[move.x][move.y] = true;
        this.wallCounts[player]--;
      }
      this.currentPlayer = 3 - player;
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
  
    isValidWallPlacement(move) {
      const { x, y, orientation } = move;
  
      if (x < 0 || y < 0 || x >= 8 || y >= 8) return false;
  
      // ❌ 완전히 같은 벽 중복 설치
      if (this.wallExistsAt(x, y, orientation)) return false;
  
      // ❌ 교차점에 이미 다른 방향의 벽 있음
      if (this.crossPoints[x][y]) return false;
  
      // ❌ 연속 벽 중첩 설치 (3칸 이상 방지)
      if (orientation === "h") {
        if (this.wallExistsAt(x - 1, y, "h") || this.wallExistsAt(x + 1, y, "h")) return false;
      } else {
        if (this.wallExistsAt(x, y - 1, "v") || this.wallExistsAt(x, y + 1, "v")) return false;
      }
  
      // ✅ 경로가 살아있는지 확인
      const testGame = this.clone();
      testGame.removeConnectionsForWall(move);
      return testGame.hasPathToGoal(1) && testGame.hasPathToGoal(2);
    }
  
    wallExistsAt(x, y, orientation) {
      return this.placedWalls.some(w => w.x === x && w.y === y && w.orientation === orientation);
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
  