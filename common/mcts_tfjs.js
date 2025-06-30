// common/mcts_tfjs.js

import * as tf from '@tensorflow/tfjs-node-gpu';
import TreeNode from './TreeNode.js';

export class MCTSTFJS {
  constructor(opts, modelDir) {
    this.simLimit = opts.simulationLimit;
    this.maxMoves = opts.maxMoves     || Infinity;
    this.c_puct   = opts.c_puct       || 1.0;
    this.modelDir = modelDir;
    this.model    = null;
    this.root     = null;
  }

  async init() {
    // file:// 절대 경로로 model.json 로드
    const url = `file://${this.modelDir}/model.json`;
    this.model = await tf.loadLayersModel(url);
  }

  // state → { policy:Float32Array, value:number }
  async evaluate(state) {
    const { data, shape } = state.getStateTensor();  // [1,C,H,W]
    const x = tf.tensor(data, shape, 'float32');
    const [P, v] = this.model.predict(x);
    const policy = await P.data();
    const value  = (await v.data())[0];
    x.dispose(); P.dispose(); v.dispose();
    return { policy, value };
  }

  /**
   * PUCT 기반 MCTS + neural priors/values
   * @param {object} rootState — Adapter.clone() 한 인스턴스
   */
  async runSearch(rootState) {
    this.root = new TreeNode(rootState);

    // 루트 노드 평가
    const { policy: P0, value: v0 } = await this.evaluate(rootState);
    this.root.P            = P0;
    this.root.value        = v0;
    this.root.untriedMoves = rootState.getPossibleMoves();

    for (let i = 0; i < this.simLimit; i++) {
      // 1) selection
      let node = this._select(this.root);
      // 2) expansion + NN 평가
      if (!node.state.isTerminal()) {
        node = await this._expandTFJS(node);
      }
      // 3) backpropagate
      this._backpropagate(node, node.value);
    }

    return this.root;
  }

  /** UCT 기준으로 내려가는 단계 */
  _select(node) {
    while (!node.state.isTerminal()) {
      if (node.untriedMoves && node.untriedMoves.length > 0) {
        return node;
      }
      if (!node.children || node.children.length === 0) {
        return node;
      }
      node = this._bestUCT(node);
    }
    return node;
  }

  /** NN Prior로 Expansion 후 자식에 value 초기화 */
  async _expandTFJS(node) {
    // a) 아직 prior 없는 경우
    if (!node.untriedMoves || node.untriedMoves.length === 0) {
      const { policy: P, value: v } = await this.evaluate(node.state);
      node.P            = P;
      node.value        = v;
      node.untriedMoves = node.state.getPossibleMoves();
    }
    // b) 한 수 꺼내 자식 노드 생성
    const mv = node.untriedMoves.pop();
    const next = node.state.clone();
    next.applyMove(mv);
    const child = new TreeNode(next, node, mv);
    // c) Prior 할당
    const idx      = this._moveToIndex(mv, node.state);
    child.P        = node.P[idx];
    node.children.push(child);
    return child;
  }

  /** UCT 계산하여 최적 자식 반환 */
  _bestUCT(node) {
    const N = node.visits;
    return node.children.reduce((best, c) => {
      const Q     = c.wins / c.visits;
      const U     = this.c_puct * c.P * Math.sqrt(N) / (1 + c.visits);
      const score = Q + U;
      return score > best.score ? { node: c, score } : best;
    }, { node: null, score: -Infinity }).node;
  }

  /** 결과 value를 루트까지 전파 */
  _backpropagate(node, value) {
    while (node) {
      node.visits++;
      node.wins   += value;
      node = node.parent;
    }
  }

  /** 방문 수가 가장 많은 자식의 move 반환 */
  bestMove() {
    if (!this.root?.children.length) return null;
    return this.root.children.reduce((best, c) =>
      c.visits > best.visits ? c : best
    , this.root.children[0]).move;
  }

  /**
   * move → policy 배열의 flat index 매핑
   * Quoridor 기준 예시로 구현하세요.
   */
  _moveToIndex(move, state) {
    const N = state.boardSize;
    if (move.type === 'move') {
      return move.x * N + move.y;
    } else {
      const M    = N - 1;
      const base = N * N;
      const idx  = move.x * M + move.y;
      return move.orientation === 'h'
        ? base + idx
        : base + M*M + idx;
    }
  }
}
