// common/mcts_nn.js

import ort from 'onnxruntime-node';
import TreeNode from './TreeNode.js';

export class MCTSnn {
  /**
   * @param {{ simulationLimit: number, maxMoves?: number, c_puct?: number }} opts
   * @param {string} modelPath
   */
  constructor(opts, modelPath) {
    this.simLimit   = opts.simulationLimit;
    this.maxMoves   = opts.maxMoves     || Infinity;
    this.c_puct     = opts.c_puct       || 1.0;
    this.modelPath  = modelPath;
    this.session    = null;
    this.root       = null;
  }

  /** 한 번만 호출해서 ONNX 세션을 띄워둡니다 */
  async init() {
    this.session = await ort.InferenceSession.create(this.modelPath);
  }

  /**
   * state → { policy: Float32Array, value: number }
   * state.getStateTensor()는 [1,C,H,W] 모양의 ONNX 텐서를 반환해야 합니다.
   */
  async evaluate(state) {
    const tensor = state.getStateTensor();
    const feeds  = { input: tensor };
    const out    = await this.session.run(feeds);
    return {
      policy: out.policy.data,    // Float32Array(policyOutputDim)
      value:  out.value.data[0],  // number in [–1,1]
    };
  }

  /**
   * PUCT 기반 MCTS with neural net priors & values
   * @param {object} rootState – Adapter.clone() 한 인스턴스
   * @returns {TreeNode}
   */
  async runSearch(rootState) {
    this.root = new TreeNode(rootState);

    // 루트 평가: prior P0, value v0
    const { policy: P0, value: v0 } = await this.evaluate(rootState);
    this.root.P            = P0;
    this.root.value        = v0;
    this.root.untriedMoves = [];   // select 단계에서만 expand

    for (let i = 0; i < this.simLimit; i++) {
      // 1) selection
      let node = this._select(this.root);

      // 2) expansion + 네트워크 평가
      if (!node.state.isTerminal()) {
        node = await this._expandNN(node);
      }

      // 3) backpropagate
      this._backpropagate(node, node.value);
    }

    return this.root;
  }

  /** PUCT용 selection */
  _select(node) {
    while (!node.state.isTerminal()) {
      if (node.untriedMoves && node.untriedMoves.length > 0) {
        return node;
      }
      node = this._bestUCT(node);
    }
    return node;
  }

  /** 네트워크 prior로 expansion + 자식 노드 value 초기화 */
  async _expandNN(node) {
    // a) 아직 prior를 뽑지 않았다면
    if (!node.untriedMoves || node.untriedMoves.length === 0) {
      const { policy: P, value: v } = await this.evaluate(node.state);
      node.P     = P;
      node.value = v;
      node.untriedMoves = node.state.getPossibleMoves();
    }

    // b) 한 수 꺼내 자식 생성
    const mv = node.untriedMoves.pop();
    const nextState = node.state.clone();
    nextState.applyMove(mv);
    const child = new TreeNode(nextState, node, mv);

    // c) prior 할당 (move → flat index 매핑 필요)
    const idx    = this._moveToIndex(mv, node.state);
    child.P      = node.P[idx];

    node.children.push(child);
    return child;
  }

  /** PUCT 수식으로 가장 높은 자식 반환 */
  _bestUCT(node) {
    const N = node.visits;
    return node.children.reduce((best, c) => {
      const Q     = c.wins / c.visits;
      const U     = this.c_puct * c.P * Math.sqrt(N) / (1 + c.visits);
      const score = Q + U;
      return score > best.score
        ? { node: c, score }
        : best;
    }, { node: null, score: -Infinity }).node;
  }

  /** backpropagate: value를 wins에 더하고 visits 증가 */
  _backpropagate(node, value) {
    while (node) {
      node.visits += 1;
      node.wins   += value;
      node = node.parent;
    }
  }

  /** 최종 행동 선택: visits가 가장 많은 자식의 move */
  bestMove() {
    if (!this.root?.children.length) return null;
    return this.root.children.reduce((best, c) =>
      c.visits > best.visits ? c : best
    , this.root.children[0]).move;
  }

  /**
   * move 객체를 policy 배열의 flat index로 바꿔주는 함수
   * 게임마다 맞춰서 구현해야 합니다.
   */
  _moveToIndex(move, state) {
    const { boardSize } = state;
    if (move.type === 'move') {
      // 예: pawn 이동 → x*boardSize + y
      return move.x * boardSize + move.y;
    } else {
      // 예: 벽 배치 → base + offset
      const N    = boardSize - 1;
      const base = boardSize * boardSize;
      const idx  = move.x * N + move.y;
      return move.orientation === 'h'
        ? base + idx
        : base + (N * N) + idx;
    }
  }
}
