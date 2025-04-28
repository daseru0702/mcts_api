// games/quoridor/QuoridorAdapter.js

import { QuoridorGame } from "./QuoridorGame.js";

export class QuoridorAdapter {
  /**
   * @param {QuoridorGame} game 기존 게임 인스턴스 (없으면 새로 생성)
   */
  constructor(game = null) {
    // 시뮬레이션 중 원본을 변경하지 않기 위해 항상 복제된 상태로 시작
    this.game = (game || new QuoridorGame()).clone();
    // 시뮬레이션에서 평가할 때 기준이 될 플레이어
    this.rootPlayer = this.game.currentPlayer;
  }

  /**
   * MCTS 에서 탐색할 수 있는 모든 액션 목록 반환
   * 이동(move) + 벽(wall) 설치
   * @returns {Array<Object>} move 객체들의 배열
   */
  getPossibleMoves() {
    // 1) 폰 이동
    const pawnMoves = this.game
      .getLegalPawnMoves()
      .map(m => ({ type: "move", x: m.x, y: m.y }));

    // 2) 벽 설치 (가로/세로, 보드 크기-1 범위)
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

  /**
   * Adapter 에 정의된 move 구조를 받아 새로운 Adapter 인스턴스로 적용
   * (원본 게임 상태는 변경되지 않음)
   * @param {Object} move {type, x, y, orientation?}
   * @returns {QuoridorAdapter} 새로운 Adapter
   */
  applyMove(move) {
    const next = this.clone();
    next.game.applyMove(move);
    return next;
  }

  /**
   * 현재 상태 깊은 복제 (MCTS 시뮬레이션용)
   * @returns {QuoridorAdapter}
   */
  clone() {
    const copy = new QuoridorAdapter(this.game.clone());
    copy.rootPlayer = this.rootPlayer;
    return copy;
  }

  /**
   * 게임 종료 여부
   * @returns {boolean}
   */
  isTerminal() {
    const p1 = this.game.pawns[1].y === this.game.boardSize - 1;
    const p2 = this.game.pawns[2].y === 0;
    return p1 || p2;
  }

  /**
   * 종료 상태에서 승리한 플레이어 관점 보상 반환
   * @param {number} player (1 혹은 2)
   * @returns {number} 승리하면 1, 아니면 0
   */
  getReward(player) {
    const pawn = this.game.pawns[player];
    const win =
      (player === 1 && pawn.y === this.game.boardSize - 1) ||
      (player === 2 && pawn.y === 0);
    return win ? 1 : 0;
  }

  /**
   * MCTS 에서 현재 턴 플레이어를 조회할 때 사용
   * @returns {number} 1 또는 2
   */
  getCurrentPlayer() {
    return this.game.currentPlayer;
  }

  /**
   * MCTS.simulate() 마지막에 호출되는 평가 함수
   * @returns {number} rootPlayer 관점의 보상 (1 또는 0)
   */
  evaluate() {
    return this.getReward(this.rootPlayer);
  }
}
