// common/TreeNode.js

export default class TreeNode {
  constructor(state, parent = null) {
    this.state = state;              // Game state 객체
    this.parent = parent;            // 부모 노드
    this.children = [];              // 자식 노드 목록
    this.untriedMoves = state.getPossibleMoves(); // 아직 확장되지 않은 움직임 목록
    this.visits = 0;                 // 방문 횟수
    this.wins = 0;                   // 승리 합산 값
    this.P = null;                   // policy prior 값 (mcts_nn.js에서 사용)
  }
}
