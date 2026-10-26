// common/mcts.js
//
// AlphaZero 방식 PUCT MCTS (게임 무관, 브라우저/Node 공용)
//  - 노드 확장 시 evaluator 로 (사전확률, 가치)를 한 번만 구합니다.
//  - 가치는 항상 "그 노드에서 둘 차례인 플레이어" 기준이며, 역전파할 때 부호를 뒤집습니다.
//  - 끝난 노드는 직전에 둔 플레이어가 이긴 것이므로 둘 차례 기준 -1 입니다.
//
// evaluator: { async evaluate(state, moves) → { priors: number[] (moves 와 같은 순서), value } }

class Node {
  constructor(state, maxMoves) {
    this.state = state;
    this.moves = null;
    this.P = null;
    this.N = null;
    this.W = null;
    this.children = null;
    this.visits = 0;
    this.value = 0;
    this.expanded = false;
    if (state.isTerminal()) {
      this.terminal = true;
      this.terminalValue = -1;
    } else if (maxMoves && state.getMoveCount() >= maxMoves) {
      this.terminal = true;
      this.terminalValue = 0;
    } else {
      this.terminal = false;
    }
  }
}

export class MCTS {
  /**
   * @param {object} evaluator
   * @param {{ simulations?: number, cPuct?: number, fpuReduction?: number,
   *           dirichletAlpha?: number, dirichletEps?: number, maxMoves?: number }} opts
   */
  constructor(evaluator, opts = {}) {
    this.evaluator    = evaluator;
    this.simulations  = opts.simulations ?? 400;
    this.cPuct        = opts.cPuct ?? 1.5;
    this.fpuReduction = opts.fpuReduction ?? 0.25;
    this.dirAlpha     = opts.dirichletAlpha ?? 0.3;
    this.dirEps       = opts.dirichletEps ?? 0.25;
    this.maxMoves     = opts.maxMoves ?? 0;
    this.root         = null;
  }

  async _expand(node) {
    const moves = node.state.getPossibleMoves();
    const { priors, value } = await this.evaluator.evaluate(node.state, moves);
    const k = moves.length;
    node.moves = moves;
    node.P = Float32Array.from(priors);
    node.N = new Float32Array(k);
    node.W = new Float32Array(k);
    node.children = new Array(k).fill(null);
    node.value = value;
    node.expanded = true;
    return value;
  }

  _select(node) {
    const sqrtN = Math.sqrt(Math.max(node.visits, 1));
    const fpu = node.value - this.fpuReduction;
    let best = 0, bestScore = -Infinity;
    for (let a = 0; a < node.moves.length; a++) {
      const n = node.N[a];
      const q = n > 0 ? node.W[a] / n : fpu;
      const score = q + this.cPuct * node.P[a] * sqrtN / (1 + n);
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  _addDirichlet(node) {
    const noise = node.moves.map(() => sampleGamma(this.dirAlpha));
    const sum = noise.reduce((a, b) => a + b, 0) || 1;
    for (let a = 0; a < node.P.length; a++) {
      node.P[a] = (1 - this.dirEps) * node.P[a] + this.dirEps * noise[a] / sum;
    }
  }

  /**
   * @param {object} rootState 탐색 시작 상태 (변경하지 않음)
   * @param {{ simulations?: number, addNoise?: boolean }} opts
   */
  async search(rootState, opts = {}) {
    const sims = opts.simulations ?? this.simulations;
    // advance() 로 남겨둔 서브트리가 있으면 재사용 (자가대국 속도 향상)
    let root = this._reuse;
    this._reuse = null;
    if (!root || root.state.getMoveCount() !== rootState.getMoveCount()) {
      root = new Node(rootState.clone(), this.maxMoves);
    }
    this.root = root;
    if (root.terminal) return root;
    if (!root.expanded) await this._expand(root);
    if (opts.addNoise) this._addDirichlet(root);
    if (root.moves.length === 1) {
      root.N[0] = Math.max(root.N[0], 1);
      return root;
    }

    for (let i = root.visits; i < sims; i++) {
      let node = root;
      const path = [];
      while (node.expanded && !node.terminal) {
        const a = this._select(node);
        path.push(node, a);
        let child = node.children[a];
        if (!child) {
          const s = node.state.clone();
          s.applyMove(node.moves[a]);
          child = node.children[a] = new Node(s, this.maxMoves);
        }
        node = child;
      }

      let v = node.terminal ? node.terminalValue : await this._expand(node);
      for (let k = path.length - 2; k >= 0; k -= 2) {
        v = -v;
        const parent = path[k], a = path[k + 1];
        parent.N[a] += 1;
        parent.W[a] += v;
        parent.visits += 1;
      }
    }
    return root;
  }

  /** 방문 수 비율 (moves 와 같은 순서) */
  visitDistribution(root = this.root) {
    const total = root.N.reduce((a, b) => a + b, 0) || 1;
    return Array.from(root.N, n => n / total);
  }

  /**
   * @param {number} temperature 0 이면 최다 방문, 1 이면 방문 수 비례 샘플링
   * @returns {number} root.moves 의 인덱스
   */
  pickMoveIndex(root = this.root, temperature = 0) {
    if (temperature <= 1e-3) {
      let best = 0;
      for (let a = 1; a < root.N.length; a++) {
        const better = root.N[a] > root.N[best] ||
          (root.N[a] === root.N[best] && root.P[a] > root.P[best]);
        if (better) best = a;
      }
      return best;
    }
    const w = Array.from(root.N, n => Math.pow(n, 1 / temperature));
    const sum = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let a = 0; a < w.length; a++) {
      r -= w[a];
      if (r <= 0) return a;
    }
    return w.length - 1;
  }

  /** 다음 search() 에서 root.moves[a] 의 서브트리를 재사용하도록 표시 */
  advance(a, root = this.root) {
    const child = root?.children?.[a];
    this._reuse = child && child.expanded ? child : null;
    if (this._reuse) this._reuse.parent = null;
  }

  bestMove(root = this.root) {
    if (!root?.moves?.length) return null;
    return root.moves[this.pickMoveIndex(root, 0)];
  }

  /** UI 표시용 통계: 루트 가치와 상위 후보 수 */
  stats(root = this.root, top = 5) {
    const total = root.N.reduce((a, b) => a + b, 0);
    const order = Array.from(root.N.keys()).sort((a, b) => root.N[b] - root.N[a]);
    const best = order[0];
    const value = root.N[best] > 0 ? root.W[best] / root.N[best] : root.value;
    return {
      value,
      simulations: total,
      candidates: order.slice(0, top).map(a => ({
        move: root.moves[a],
        visits: root.N[a],
        q: root.N[a] > 0 ? root.W[a] / root.N[a] : null,
        prior: root.P[a],
      })),
    };
  }
}

// ─── Dirichlet 노이즈용 감마 샘플러 (Marsaglia–Tsang) ─────────────────────

function sampleNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleGamma(alpha) {
  if (alpha < 1) {
    return sampleGamma(alpha + 1) * Math.pow(Math.random(), 1 / alpha);
  }
  const d = alpha - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      x = sampleNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
