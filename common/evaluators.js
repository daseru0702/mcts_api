// common/evaluators.js
//
// MCTS 가 사용하는 평가기 (Node 전용: onnxruntime-node)

import ort from "onnxruntime-node";
import { OnnxEvaluator as SharedOnnxEvaluator } from "./onnx_evaluator.js";

export { HeuristicEvaluator, UniformEvaluator } from "./heuristic_evaluator.js";

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
