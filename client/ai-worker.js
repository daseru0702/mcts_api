// client/ai-worker.js
//
// 브라우저 안에서 AI 탐색 (GitHub Pages 처럼 서버가 없는 배포용).
// 메시지: { id, state, level } → { id, move, stats, ms } | { id, error }

import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.wasm.min.mjs";
import { QuoridorAdapter } from "./games/quoridor/QuoridorAdapter.js";
import { MCTS } from "./common/mcts.js";
import { OnnxEvaluator } from "./common/onnx_evaluator.js";
import { LEVELS } from "./common/levels.js";

// GitHub Pages 는 cross-origin isolation 이 없어 wasm 스레드를 쓸 수 없습니다
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";

const heuristic = {
  async evaluate(state, moves) {
    return { priors: state.heuristicPriors(moves), value: state.heuristicValue() };
  },
};

const ready = (async () => {
  try {
    const session = await ort.InferenceSession.create(new URL("./models/best.onnx", import.meta.url).href, {
      executionProviders: ["wasm"],
    });
    postMessage({ type: "ready", model: "onnx" });
    return new OnnxEvaluator(ort, session);
  } catch (e) {
    console.warn("모델 로드 실패, 휴리스틱으로 동작:", e);
    postMessage({ type: "ready", model: "heuristic" });
    return heuristic;
  }
})();

onmessage = async ({ data: { id, state, level } }) => {
  try {
    const evaluator = await ready;
    const cfg = LEVELS[level] ?? LEVELS.normal;
    const t0 = performance.now();
    const mcts = new MCTS(evaluator, { simulations: cfg.simulations });
    const root = await mcts.search(new QuoridorAdapter(state));
    const move = root.moves[mcts.pickMoveIndex(root, cfg.temperature)];
    postMessage({ id, move, stats: mcts.stats(root, 6), ms: Math.round(performance.now() - t0) });
  } catch (e) {
    postMessage({ id, error: e.message });
  }
};
