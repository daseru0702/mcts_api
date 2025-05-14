// common/mcts_nn.js

import ort from "onnxruntime-node";

export class MCTSNN {
  constructor(rootState, sessionPromise, {
    simulationLimit     = 200,
    explorationConstant = Math.sqrt(2),
  } = {}) {
    this.root                = new Node(rootState);
    this.sessionPromise      = sessionPromise;
    this.simulationLimit     = simulationLimit;
    this.explorationConstant = explorationConstant;
  }

  async runSearch() {
    const session = await this.sessionPromise;
    for (let i = 0; i < this.simulationLimit; i++) {
      const path = this.select(this.root);
      const leaf = path[path.length - 1];
      if (!leaf.state.isTerminal()) this.expand(leaf);
      const v = await this.evaluate(leaf.state, session);
      this.backpropagate(path, v);
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
    const moves = node.getUntriedMoves();
    if (moves.length === 0) return;
    // 우선순위가 있을 경우, moves.shift() 혹은 pop() 으로 한 개만
    const mv = moves.pop();
    const nextState = node.state.clone().applyMove(mv);
    node.children.push(new Node(nextState, node, mv));
  }

  // state.getStateTensor() must return { data: Float32Array, shape: [1, C, H, W] }
  async evaluate(state, session) {
    // Adapter.getStateTensor() 에서 모든 게임별 직렬화를 처리
    const { data, shape } = state.getStateTensor();  
    const tensor = new ort.Tensor("float32", data, shape);
    const output = await session.run({ x: tensor });
    const rawV   = output.value.data[0];            // in [-1,1]
    return (rawV + 1) / 2;                          // scale to [0,1]
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
      // include prior c.P if your adapter sets it
      const U = this.explorationConstant * Math.sqrt(logN / (c.visits + 1e-8)) * (c.P ?? 1);
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
  constructor(state, parent = null, move = null, prior = 1) {
    this.state    = state;
    this.parent   = parent;
    this.move     = move;
    this.children = [];
    this.visits   = 0;
    this.wins     = 0;
    this.P        = prior;
  }
  isLeaf()     { return this.children.length === 0; }
  isTerminal(){ return this.state.isTerminal(); }
}
