// common/mcts_nn.js

import ort from "onnxruntime-node";
import path from "path";
import { fileURLToPath } from "url";
import { serializeState } from "../ai_server/stateSerializer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const MODEL_PATH = path.resolve(__dirname, "../../ai_server/models/quoridor.onnx");

// 세션을 미리 로딩해둡니다.
const sessionPromise = ort.InferenceSession.create(MODEL_PATH);

export class MCTSNN {
  constructor(rootState, {
    simulationLimit     = 200,
    explorationConstant = Math.sqrt(2),
  } = {}) {
    this.root                = new Node(rootState);
    this.simulationLimit     = simulationLimit;
    this.explorationConstant = explorationConstant;
  }

  async runSearch() {
    const session = await sessionPromise;
    for (let i = 0; i < this.simulationLimit; i++) {
      const path = this.select(this.root);
      const leaf = path[path.length - 1];

      if (!leaf.state.isTerminal()) {
        this.expand(leaf);
      }

      const value = await this.evaluate(leaf.state, session);
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
    const moves = node.state.getPossibleMoves();
    for (const mv of moves) {
      const nextState = node.state.clone().applyMove(mv);
      node.children.push(new Node(nextState, node, mv));
    }
  }

  async evaluate(state, session) {
    const arr   = serializeState(state);          // Float32Array [1,4,9,9]
    const tensor= new ort.Tensor("float32", arr, [1,4,9,9]);
    const output= await session.run({ x: tensor });
    const rawV  = output.value.data[0];            // in [-1,1]
    return (rawV + 1) / 2;                         // scale to [0,1]
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
      .reduce((a, b) => a.visits > b.visits ? a : b)
      .move;
  }

  bestUCT(node) {
    const logN = Math.log(node.visits + 1);
    let bestScore = -Infinity, bestChild = null;

    for (const child of node.children) {
      const Q = child.visits > 0 ? (child.wins / child.visits) : 0;
      const U = this.explorationConstant * Math.sqrt(logN / (child.visits + 1e-8));
      const score = Q + U * (child.P ?? 1);
      if (score > bestScore) {
        bestScore  = score;
        bestChild = child;
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
