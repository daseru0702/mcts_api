// games/quoridor/QuoridorAdapter.js
import { QuoridorGame } from './QuoridorGame.js';

export class QuoridorAdapter {
  constructor(game) {
    this.game = game;
  }

  getPossibleMoves() {
    const moves = [
      ...this.game.getLegalPawnMoves(),
      ...this.game.getLegalWallPlacements()
    ];
    return moves;
  }

  applyMove(move) {
    const newGame = this.game.clone();
    newGame.applyMove(move);
    return new QuoridorAdapter(newGame);
  }

  isTerminal() {
    return this.game.isGameOver();
  }

  evaluate() {
    const winner = this.game.getWinner();
    if (winner === this.game.currentPlayer) return Infinity;
    if (winner !== null) return -Infinity;

    // 간단한 거리 기반 평가
    const p1Dist = this.estimateDistance(this.game.pawns[1], 1);
    const p2Dist = this.estimateDistance(this.game.pawns[2], 2);
    return p2Dist - p1Dist;
  }

  clone() {
    return new QuoridorAdapter(this.game.clone());
  }

  estimateDistance(pos, player) {
    // 실제로는 BFS나 Dijkstra 사용, 여기선 단순화
    return player === 1
      ? this.game.boardSize - 1 - pos.y
      : pos.y;
  }

  getCurrentPlayer() {
    return this.game.currentPlayer;
  }
}
