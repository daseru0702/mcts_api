// client/ai-worker.js
//
// 브라우저 안에서 AI 탐색 (GitHub Pages 처럼 서버가 없는 배포용, 게임 무관).
// 메시지: { id, game, state, level } → { id, move, stats, ms } | { id, error }
//         게임을 처음 쓸 때 { type: "ready", game, model } 을 보냅니다.

import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.wasm.min.mjs";
import { loadGame } from "./common/games.js";
import { MCTS } from "./common/mcts.js";
import { OnnxEvaluator } from "./common/onnx_evaluator.js";
import { HeuristicEvaluator } from "./common/heuristic_evaluator.js";
import { LEVELS } from "./common/levels.js";

// GitHub Pages 는 cross-origin isolation 이 없어 wasm 스레드를 쓸 수 없습니다
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";

const loaded = new Map();  // game id → Promise<{ game, evaluator }>

function prepare(gameId) {
  if (!loaded.has(gameId)) {
    loaded.set(gameId, (async () => {
      const game = await loadGame(gameId);
      try {
        const url = new URL(`./models/${gameId}/best.onnx`, import.meta.url).href;
        const session = await ort.InferenceSession.create(url, { executionProviders: ["wasm"] });
        postMessage({ type: "ready", game: gameId, model: "onnx" });
        return { game, evaluator: new OnnxEvaluator(ort, session) };
      } catch (e) {
        console.warn(`[${gameId}] 모델 로드 실패, 휴리스틱으로 동작:`, e);
        postMessage({ type: "ready", game: gameId, model: "heuristic" });
        return { game, evaluator: new HeuristicEvaluator() };
      }
    })());
  }
  return loaded.get(gameId);
}

onmessage = async ({ data: { id, game: gameId, state, level, type } }) => {
  if (type === "prepare") { prepare(gameId); return; }
  try {
    const { game, evaluator } = await prepare(gameId);
    const cfg = LEVELS[level] ?? LEVELS.normal;
    const t0 = performance.now();
    const mcts = new MCTS(evaluator, { simulations: cfg.simulations });
    const root = await mcts.search(new game.Adapter(state));
    const move = root.moves[mcts.pickMoveIndex(root, cfg.temperature)];
    postMessage({ id, move, stats: mcts.stats(root, 6), ms: Math.round(performance.now() - t0) });
  } catch (e) {
    postMessage({ id, error: e.message });
  }
};
