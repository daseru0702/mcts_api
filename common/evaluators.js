// common/evaluators.js
//
// MCTS 가 사용하는 평가기 (Node 전용: onnxruntime-node)

import ort from "onnxruntime-node";

/** 신경망 없이 최단거리 휴리스틱으로 평가 (0세대 데이터 생성/기준선용) */
export class HeuristicEvaluator {
  async evaluate(state, moves) {
    return { priors: state.heuristicPriors(moves), value: state.heuristicValue() };
  }
}

/** 균등 사전확률 + 휴리스틱 가치 */
export class UniformEvaluator {
  async evaluate(state, moves) {
    return { priors: moves.map(() => 1 / moves.length), value: state.heuristicValue() };
  }
}

/** train.py 가 내보낸 ONNX 모델 (입력 "input", 출력 "policy" 로짓, "value") */
export class OnnxEvaluator {
  static async create(modelPath, { threads = 1 } = {}) {
    const session = await ort.InferenceSession.create(modelPath, {
      intraOpNumThreads: threads,
      interOpNumThreads: 1,
      graphOptimizationLevel: "all",
    });
    return new OnnxEvaluator(session);
  }

  constructor(session) {
    this.session = session;
  }

  async evaluate(state, moves) {
    const C = state.constructor.IN_CHANNELS, B = state.constructor.BOARD_SIZE;
    const input = new ort.Tensor("float32", state.encode(), [1, C, B, B]);
    const out = await this.session.run({ input });
    const logits = out.policy.data;
    const value = out.value.data[0];

    // 합법 수에 대해서만 softmax
    const raw = moves.map(m => logits[state.moveToIndex(m)]);
    const max = Math.max(...raw);
    const exps = raw.map(l => Math.exp(l - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return { priors: exps.map(e => e / sum), value };
  }
}
