// common/mcts_pure.js

import TreeNode from './TreeNode.js';

export default class MCTSPure {
  /**
   * @param {object} opts
   * @param {number} opts.simLimit  시뮬레이션 반복 수
   * @param {number} opts.maxMoves  플레이아웃 최대 깊이 (draw 처리용)
   * @param {number} [opts.c]       UCB 상수 (기본 Math.SQRT2)
   */
  constructor({ simLimit, maxMoves, c = Math.SQRT2 }) {
    this.simLimit = simLimit;
    this.maxMoves = maxMoves;
    this.c = c;
  }

  // rootAdapter는 Adapter 인스턴스여야 합니다.
  runSearch(rootAdapter) {
    // 항상 clone()을 호출해서 상태를 복사
    const root = new TreeNode(rootAdapter.clone());
    for (let i = 0; i < this.simLimit; i++) {
      const leaf = this.select(root);
      const child = this.expand(leaf);
      const result = this.simulate(child);
      this.backpropagate(child, result);
    }
    return root;
  }

  select(node) {
    // untriedMoves가 남아 있을 때까지 bestChild로만 내려갑니다.
    while (node.untriedMoves.length === 0 && !node.state.isTerminal()) {
      node = this.bestChild(node);
    }
    return node;
  }

  expand(node) {
    if (node.untriedMoves.length === 0) return node;
    // 한 수만 pop해서 확장
    const move = node.untriedMoves.pop();
    // adapter.clone() 후 applyMove
    const childAdapter = node.state.clone();
    childAdapter.applyMove(move);
    const child = new TreeNode(childAdapter, node);
    node.children.push(child);
    return child;
  }

  simulate(node) {
    // adapter.clone()을 이용해 상태 복제
    const sim = node.state.clone();
    let depth = 0;
    const seen = new Set();

    // 최대 깊이(maxMoves) 또는 종료 조건까지 랜덤 플레이아웃
    while (!sim.isTerminal() && depth < this.maxMoves) {
      const moves = sim.getPossibleMoves();
      const m = moves[Math.floor(Math.random() * moves.length)];
      sim.applyMove(m);
      const key = sim.toString();
      if (seen.has(key)) break;
      seen.add(key);
      depth++;
    }

    // 반드시 getWinner() 호출
    return sim.getWinner();  // +1(승), -1(패), 0(무승부)
  }

  backpropagate(node, result) {
    let n = node;
    while (n) {
      n.visits++;
      n.wins += result;
      n = n.parent;
    }
  }

  bestChild(node) {
    return node.children.reduce((best, child) => {
      const Q = child.wins / child.visits;
      const U = this.c * Math.sqrt(Math.log(node.visits) / child.visits);
      const score = Q + U;
      return score > best.score ? { node: child, score } : best;
    }, { node: null, score: -Infinity }).node;
  }
}
