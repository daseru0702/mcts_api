// ai/mcts.js

export class MCTS {
  constructor(rootState, {
    simulationLimit = 1000,
    explorationConstant = Math.sqrt(2)
  } = {}) {
    this.root = new Node(rootState);
    this.simulationLimit = simulationLimit;
    this.explorationConstant = explorationConstant;
  }

  runSearch() {
    for (let i = 0; i < this.simulationLimit; i++) {
      const path = this.select(this.root);
      const leaf = path[path.length - 1];
      const result = this.simulate(leaf.state);
      this.backpropagate(path, result);
    }
  }

  select(node) {
    const path = [node];
    while (!node.isLeaf()) {
      const next = this.bestUCT(node);
      if (!next) break; // 자식 노드가 없을 경우 방어 처리
      node = next;
      path.push(node);
    }
    if (!node.isTerminal()) {
      this.expand(node);
    }
    return path;
  }

  expand(node) {
    const moves = node.getUntriedMoves();
    for (const move of moves) {
      const newState = node.state.applyMove(move);
      node.children.push(new Node(newState, node, move));
    }
  }

  simulate(state) {
    let current = state.clone();
    while (!current.isTerminal()) {
      const moves = current.getPossibleMoves();
      if (moves.length === 0) break; // 패배 상태 방어
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      current = current.applyMove(randomMove);
    }
    return current.evaluate();  // 점수 (플레이어 관점)
  }

  backpropagate(path, result) {
    for (const node of path) {
      node.visits++;
      node.wins += result;
    }
  }

  bestMove() {
    if (this.root.children.length === 0) return null;
    return this.root.children.reduce((a, b) =>
      a.visits > b.visits ? a : b
    ).move;
  }

  bestUCT(node) {
    if (node.children.length === 0) return null;

    const logVisits = Math.log(node.visits + 1);
    return node.children.reduce((best, child) => {
      const uct = (child.wins / (child.visits + 1e-4)) +
        this.explorationConstant * Math.sqrt(logVisits / (child.visits + 1e-4));
      return uct > best.uct ? { node: child, uct } : best;
    }, { node: null, uct: -Infinity }).node;
  }
}

class Node {
  constructor(state, parent = null, move = null) {
    this.state = state;
    this.parent = parent;
    this.move = move;
    this.children = [];
    this.visits = 0;
    this.wins = 0;
    this._untriedMoves = null;
  }

  isLeaf() {
    return this.children.length === 0;
  }

  isTerminal() {
    return this.state.isTerminal();
  }

  getUntriedMoves() {
    if (this._untriedMoves === null) {
      this._untriedMoves = this.state.getPossibleMoves();
    }
    return this._untriedMoves;
  }
}
