// ai_trainer/players.js
//
// 플레이어 스펙 문자열 → MCTS 인스턴스
//   "nn:<model.onnx>:<sims>"   신경망 + PUCT MCTS
//   "heur:<sims>"              최단거리 휴리스틱 + PUCT MCTS
//   "pure:<sims>"              순수 MCTS (랜덤 롤아웃, 기준선)

import { MCTS } from "../common/mcts.js";
import { MCTSPure } from "../common/mcts_pure.js";
import { HeuristicEvaluator, OnnxEvaluator } from "../common/evaluators.js";

export async function createPlayer(spec, { maxMoves = 0 } = {}) {
  const parts = spec.split(":");
  const kind = parts[0];
  if (kind === "nn") {
    const sims = parseInt(parts.at(-1), 10);
    const modelPath = parts.slice(1, -1).join(":");
    const evaluator = await OnnxEvaluator.create(modelPath);
    return { name: spec, mcts: new MCTS(evaluator, { simulations: sims, maxMoves }) };
  }
  if (kind === "heur") {
    const sims = parseInt(parts[1], 10);
    return { name: spec, mcts: new MCTS(new HeuristicEvaluator(), { simulations: sims, maxMoves }) };
  }
  if (kind === "pure") {
    const sims = parseInt(parts[1], 10);
    const pure = new MCTSPure({ simulationLimit: sims, maxMoves: 60 });
    return {
      name: spec,
      mcts: {
        async search(state) { return pure.runSearch(state.clone()); },
        bestMove() { return pure.bestMove(); },
      },
    };
  }
  throw new Error(`알 수 없는 플레이어 스펙: ${spec}`);
}

export function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}
