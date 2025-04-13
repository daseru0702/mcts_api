// games/quoridor/QuoridorGame.js

export class QuoridorGame {
    constructor() {
      this.boardSize = 9;
      this.pawns = {
        1: { x: 4, y: 0 }, // Player 1 시작 위치
        2: { x: 4, y: 8 }, // Player 2 시작 위치
      };
      this.walls = {
        horizontal: new Set(), // Set of "x,y" 문자열
        vertical: new Set()
      };
      this.wallCounts = {
        1: 10,
        2: 10
      };
      this.currentPlayer = 1;
    }
  
    getLegalPawnMoves(player = this.currentPlayer) {
      // 예시: 상하좌우 이동 (점프, 벽 체크는 Adapter에서 구현해도 됨)
      const moves = [];
      const { x, y } = this.pawns[player];
      const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
      ];
      for (const { dx, dy } of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny)) {
          moves.push({ type: "move", x: nx, y: ny });
        }
      }
      return moves;
    }
  
    getLegalWallPlacements(player = this.currentPlayer) {
      const moves = [];
      if (this.wallCounts[player] <= 0) return moves;
      for (let x = 0; x < this.boardSize - 1; x++) {
        for (let y = 0; y < this.boardSize - 1; y++) {
          const hkey = `${x},${y}`;
          const vkey = `${x},${y}`;
          if (!this.walls.horizontal.has(hkey))
            moves.push({ type: "wall", x, y, orientation: "h" });
          if (!this.walls.vertical.has(vkey))
            moves.push({ type: "wall", x, y, orientation: "v" });
        }
      }
      return moves;
    }
  
    applyMove(move) {
      const player = this.currentPlayer;
      if (move.type === "move") {
        this.pawns[player] = { x: move.x, y: move.y };
      } else if (move.type === "wall") {
        const key = `${move.x},${move.y}`;
        if (move.orientation === "h") {
          this.walls.horizontal.add(key);
        } else {
          this.walls.vertical.add(key);
        }
        this.wallCounts[player]--;
      }
      this.currentPlayer = 3 - player; // 턴 전환 (1 <-> 2)
    }
  
    isGameOver() {
      return (
        this.pawns[1].y === this.boardSize - 1 ||
        this.pawns[2].y === 0
      );
    }
  
    getWinner() {
      if (this.pawns[1].y === this.boardSize - 1) return 1;
      if (this.pawns[2].y === 0) return 2;
      return null;
    }
  
    clone() {
      const newGame = new QuoridorGame();
      newGame.pawns = {
        1: { ...this.pawns[1] },
        2: { ...this.pawns[2] }
      };
      newGame.walls = {
        horizontal: new Set(this.walls.horizontal),
        vertical: new Set(this.walls.vertical)
      };
      newGame.wallCounts = { ...this.wallCounts };
      newGame.currentPlayer = this.currentPlayer;
      return newGame;
    }
  
    inBounds(x, y) {
      return x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize;
    }
  }
  