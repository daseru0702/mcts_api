// common/mcts_pure.js

import TreeNode from './TreeNode.js';

export class MCTSPure {
  /**
   * @param {{ simulationLimit: number, maxMoves?: number }} opts
   */
  constructor(opts) {
    this.simLimit = opts.simulationLimit;
    // maxMoves는 선택적입니다. rollout 중 무한 루프 방지용
    this.maxMoves = opts.maxMoves || Infinity;
    this.C = Math.sqrt(2);
  }

  /**
   * MCTS 메인 루프: 루트 상태에서 시뮬레이션 simLimit번 반복
   * @param {object} rootState – Adapter.clone() 한 인스턴스
   * @returns {TreeNode} 루트 노드
   */
  runSearch(rootState) {
    this.root = new TreeNode(rootState);
    for (let i = 0; i < this.simLimit; i++) {
      // 1) selection & expansion
      const node = this._select(this.root);
      // 2) rollout
      const result = this._simulate(node);
      // 3) backpropagation
      this._backpropagate(node, result);
    }
    return this.root;
  }

  /** UCB1 기준으로 가장 확장할 노드로 내려갑니다. */
  _select(node) {
    while (!node.state.isTerminal()) {
      if (node.untriedMoves.length > 0) {
        return this._expand(node);
      }
      node = this._bestUCT(node);
    }
    return node;
  }

  /** 미확장 자식 하나를 뽑아서 생성합니다. */
  _expand(node) {
    const moves = node.untriedMoves;
    const idx = Math.floor(Math.random() * moves.length);
    const move = moves.splice(idx, 1)[0];
    const nextState = node.state.clone();
    nextState.applyMove(move);
    const child = new TreeNode(nextState, node, move);
    node.children.push(child);
    return child;
  }

  /** UCT 계산해서 자식 중 최고 점수 노드를 반환합니다. */
  _bestUCT(node) {
    return node.children.reduce((best, c) => {
      const uct = (c.wins / c.visits)
                + this.C * Math.sqrt(Math.log(node.visits) / c.visits);
      return uct > best.uct ? { node: c, uct } : best;
    }, { node: null, uct: -Infinity }).node;
  }

  /**
   * Rollout: 임의로 플레이하다가 터미널 상태가 되면 승자를 반환
   * @param {TreeNode} node
   * @returns {number} 승자 플레이어 번호 (1 또는 2)
   */
  _simulate(node) {
    const state = node.state.clone();
    let moves = 0;
    while (!state.isTerminal() && moves < this.maxMoves) {
      const pm = state.getPossibleMoves();
      const mv = pm[Math.floor(Math.random() * pm.length)];
      state.applyMove(mv);
      moves++;
    }
    // 터미널: 현재 차례인 플레이어가 못 두는 상태이므로,
    // 마지막에 둔 플레이어가 승자입니다.
    // state.getCurrentPlayer()는 "다음" 차례이므로 3 - current 가 바로 승자.
    return 3 - state.getCurrentPlayer();
  }

  /** 시뮬레이션 결과를 루트부터 node까지 전파합니다. */
  _backpropagate(node, winner) {
    while (node) {
      node.visits += 1;
      // node.parent.state.getCurrentPlayer()가 이 노드를 만든 시점의 플레이어
      const player = node.parent ? node.parent.state.getCurrentPlayer() : null;
      if (player === winner) {
        node.wins += 1;
      }
      node = node.parent;
    }
  }

  /**
   * 최종 행동 선택: 방문 수(visits)가 가장 많은 자식의 move를 반환
   * @param {TreeNode} root
   */
  bestMove(root = this.root) {
    if (!root.children.length) return null;
    return root.children.reduce((best, c) => {
      return c.visits > best.visits ? c : best;
    }, root.children[0]).move;
  }
}
