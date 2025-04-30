// ai_server/games/quoridor/mcts.js

import ort from "onnxruntime-node";

const MODEL_PATH     = "./models/quoridor.onnx";

// 1) 시작하자마자 세션 로딩을 시작해서,
//    나중에 evaluate()에서 await만 해 주면 됩니다.
const sessionPromise = ort.InferenceSession.create(MODEL_PATH);

export class MCTS {
  constructor(rootState, {
    simulationLimit      = 200,
    explorationConstant  = Math.sqrt(2),
  } = {}) {
    this.root                  = new Node(rootState);
    this.simulationLimit       = simulationLimit;
    this.explorationConstant   = explorationConstant;
  }

  async runSearch() {
    for (let i = 0; i < this.simulationLimit; i++) {
      const path   = this.select(this.root);
      const leaf   = path[path.length - 1];
      if (!leaf.state.isTerminal()) this.expand(leaf);
      const value  = await this.evaluate(leaf.state);
      this.backpropagate(path, value);
    }
  }

  select(node) { /* ... unchanged ... */ }
  expand(node) { /* ... unchanged ... */ }
  backpropagate(path, result) { /* ... unchanged ... */ }
  bestMove()   { /* ... unchanged ... */ }
  bestUCT(node){ /* ... unchanged ... */ }

  // 2) evaluate만 async로 남겨 두고 세션을 await
  async evaluate(state) {
    // stateSerializer 직렬화를 사용합니다.
    const inputTensor = stateSerializer(state); // Float32Array [1,4,9,9]
    const session     = await sessionPromise;
    const feeds       = { x: new ort.Tensor("float32", inputTensor, [1,4,9,9]) };
    const outputs     = await session.run(feeds);
    const rawValue    = outputs.value.data[0];       // in [-1,1]
    return (rawValue + 1) / 2;                      // [0,1]로 스케일
  }
}

// Node 클래스도 그대로 둡니다
class Node {
  constructor(state, parent=null, move=null) {
    this.state    = state;
    this.parent   = parent;
    this.move     = move;
    this.children = [];
    this.visits   = 0;
    this.wins     = 0;
    this.P        = 1;      // prior
    this._untried = null;
  }
  isLeaf()     { return !this.children.length; }
  isTerminal(){ return this.state.isTerminal(); }
  getUntriedMoves() {
    if (this._untried === null) {
      this._untried = this.state.getPossibleMoves();
    }
    return this._untried;
  }
}
