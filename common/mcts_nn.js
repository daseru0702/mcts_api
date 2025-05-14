// common/mcts_nn.js

import ort from 'onnxruntime-node';
import TreeNode from './TreeNode.js';

export default class MCTSNN {
  constructor(config, modelPath) {
    this.config = config;
    this.modelPath = modelPath;
    this.session = null;
  }

  async init() {
    this.session = await ort.InferenceSession.create(this.modelPath);
  }

  async runSearch(rootState) {
    const root = new TreeNode(rootState);
    const { policy: P, value: v0 } = await this.evaluate(rootState);
    root.P = P;
    root.untriedMoves = [];

    for (let i = 0; i < this.config.simLimit; i++) {
      const leaf = this.select(root);
      const child = this.expand(leaf);
      const { value } = await this.evaluate(child.state);
      child.value = value;
      this.backpropagate(child, value);
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
    if (!node.untriedMoves || node.untriedMoves.length === 0) {
      node.untriedMoves = node.state.getPossibleMoves();
    }
    const move = node.untriedMoves.pop();
    const nextState = node.state.playMove(move);
    const child = new TreeNode(nextState, node);
    child.P = node.P[move] || 1 / node.untriedMoves.length;
    node.children.push(child);
    return child;
  }

  simulate(node) {
    return node.value;
  }

  async evaluate(state) {
    const tensor = state.getStateTensor();
    const feeds = { input: tensor };
    const results = await this.session.run(feeds);
    const policy = results.policy.data;
    const value = results.value.data[0];
    return { policy, value };
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
      const U = child.P * Math.sqrt(node.visits) / (1 + child.visits);
      const Q = child.wins / child.visits;
      const score = Q + this.config.c_puct * U;
      return score > best.score ? { node: child, score } : best;
    }, { node: null, score: -Infinity }).node;
  }
}
