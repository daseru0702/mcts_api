// bridge/GameBridge.js
import { MCTS } from '../ai/mcts.js';
import { QuoridorAdapter } from '../games/quoridor/QuoridorAdapter.js';
import { QuoridorGame } from '../games/quoridor/QuoridorGame.js';

export class GameBridge {
  constructor({ simulationLimit = 500 } = {}) {
    this.game = new QuoridorGame();
    this.simulationLimit = simulationLimit;
  }

  getGame() {
    return this.game;
  }

  isAITurn() {
    return this.game.currentPlayer === 2; // 예: Player 2가 AI
  }

  async playAITurn() {
    if (!this.isAITurn()) return;

    const adapter = new QuoridorAdapter(this.game.clone());
    const mcts = new MCTS(adapter, { simulationLimit: this.simulationLimit });

    mcts.runSearch();
    const bestMove = mcts.bestMove();

    console.log("[BRIDGE][INFO] AI selects move:", bestMove);
    this.game.applyMove(bestMove);
  }

  playUserMove(move) {
    if (this.isAITurn()) return false;
    const possibleMoves = [
      ...this.game.getLegalPawnMoves(),
      ...this.game.getLegalWallPlacements()
    ];
    const match = possibleMoves.find(m => JSON.stringify(m) === JSON.stringify(move));
    if (match) {
      this.game.applyMove(move);
      return true;
    } else {
      console.warn("[BRIDGE][WARN] Illegal move:", move);
      return false;
    }
  }
}
