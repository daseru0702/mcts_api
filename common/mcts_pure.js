// common/mcts_pure.js

export class MCTSPure {
  constructor(rootState, {
    simulationLimit     = 200,
    explorationConstant = Math.sqrt(2),
  } = {}) {
    this.root                = new Node(rootState);
    this.simulationLimit     = simulationLimit;
    this.explorationConstant = explorationConstant;
  }

  runSearch() {
    for (let i = 0; i < this.simulationLimit; i++) {
      const path = this.select(this.root);
      const leaf = path[path.length - 1];

      if (!leaf.state.isTerminal()) {
        this.expand(leaf);
      }

      const value = this.simulate(leaf.state);
      this.backpropagate(path, value);
    }
  }

  select(node) {
    const path = [node];
    while (!node.isLeaf()) {
      const next = this.bestUCT(node);
      if (!next) break;
      node = next;
      path.push(node);
    }
    return path;
  }

  expand(node) {
    for (const mv of node.state.getPossibleMoves()) {
      const nextState = node.state.clone().applyMove(mv);
      node.children.push(new Node(nextState, node, mv));
    }
  }

  simulate(state) {
    let s = state.clone();
    while (!s.isTerminal()) {
      const moves = s.getPossibleMoves();
      const mv    = moves[Math.floor(Math.random() * moves.length)];
      s = s.applyMove(mv);
    }
    // 승리자 계산 (state.currentPlayer 관점)
    const winner = (s.currentPlayer === state.currentPlayer) ? 2 : 1;
    return (winner === state.currentPlayer) ? 1 : 0;
  }

  backpropagate(path, value) {
    for (const n of path) {
      n.visits++;
      n.wins += value;
    }
  }

  bestMove() {
    if (this.root.children.length === 0) return null;
    return this.root.children
      .reduce((a,b) => a.visits > b.visits ? a : b)
      .move;
  }

  bestUCT(node) {
    const logN = Math.log(node.visits + 1);
    let bestScore = -Infinity, bestChild = null;
    for (const c of node.children) {
      const Q = c.visits > 0 ? c.wins / c.visits : 0;
      const U = this.explorationConstant * Math.sqrt(logN / (c.visits + 1e-8));
      const score = Q + U;
      if (score > bestScore) {
        bestScore = score;
        bestChild = c;
      }
    }
    return bestChild;
  }
}

class Node {
  constructor(state, parent = null, move = null) {
    this.state    = state;
    this.parent   = parent;
    this.move     = move;
    this.children = [];
    this.visits   = 0;
    this.wins     = 0;
  }
  isLeaf()     { return this.children.length === 0; }
  isTerminal(){ return this.state.isTerminal(); }
}
