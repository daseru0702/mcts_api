// common/TreeNode.js

export default class TreeNode {
  /**
   * @param {object} state    – Adapter 인스턴스
   * @param {TreeNode|null} parent
   * @param {any|null} move   – 이 노드를 만든 수
   */
  constructor(state, parent = null, move = null) {
    this.state = state;
    this.parent = parent;
    this.move = move;
    this.children = [];
    this.untriedMoves = state.getPossibleMoves();
    this.visits = 0;
    this.wins = 0;
  }
}
