// common/evaluators.js
//
// MCTS 가 사용하는 평가기 (Node 전용: onnxruntime-node)

import ort from "onnxruntime-node";
import { OnnxEvaluator as SharedOnnxEvaluator } from "./onnx_evaluator.js";

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

/** train.py 가 내보낸 ONNX 모델 (onnxruntime-node) */
export class OnnxEvaluator extends SharedOnnxEvaluator {
  static async create(modelPath, { threads = 1 } = {}) {
    const session = await ort.InferenceSession.create(modelPath, {
      intraOpNumThreads: threads,
      interOpNumThreads: 1,
      graphOptimizationLevel: "all",
    });
    return new OnnxEvaluator(ort, session);
  }
}
