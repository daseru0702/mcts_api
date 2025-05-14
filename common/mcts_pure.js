// common/mcts_pure.js

import TreeNode from './TreeNode.js';

export default class MCTSPure {
  constructor(config) {
    this.config = config;
  }

  runSearch(rootState) {
    const root = new TreeNode(rootState);
    for (let i = 0; i < this.config.simLimit; i++) {
      const leaf = this.select(root);
      const child = this.expand(leaf);
      const result = this.simulate(child);
      this.backpropagate(child, result);
    }
    return root;
  }

  select(node) {
    while (node.untriedMoves.length === 0 && !node.state.isTerminal()) {
      node = this.bestChild(node);
    }
    return node;
  }

  expand(node) {
    if (node.untriedMoves.length === 0) return node;
    const move = node.untriedMoves.pop();
    const nextState = node.state.playMove(move);
    const child = new TreeNode(nextState, node);
    node.children.push(child);
    return child;
  }

  simulate(node) {
    let state = node.state.clone();
    let depth = 0;
    const maxDepth = this.config.maxMoves;
    const seen = new Set();

    while (!state.isTerminal() && depth < maxDepth) {
      const moves = state.getPossibleMoves();
      const m = moves[Math.floor(Math.random() * moves.length)];
      state = state.playMove(m);
      const key = state.toString();
      if (seen.has(key)) break;
      seen.add(key);
      depth++;
    }

    return state.getWinner(); // +1, -1, 0(draw)
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
      const ucb1 = (child.wins / child.visits) +
        this.config.c * Math.sqrt(Math.log(node.visits) / child.visits);
      return ucb1 > best.score ? { node: child, score: ucb1 } : best;
    }, { node: null, score: -Infinity }).node;
  }
}
