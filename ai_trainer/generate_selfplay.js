// ai_trainer/generate_selfplay.js

import fs from "fs-extra";
import path from "path";
import { GAMES } from "./config.js";
import { AdapterFactory } from "../common/AdapterFactory.js";
import { MCTSPure as MCTS } from "../common/mcts_pure.js";

async function main() {
  const gameName = process.argv[2];
  if (!GAMES[gameName]) {
    console.error("Usage: node generate_selfplay.js <gameName>");
    process.exit(1);
  }
  const cfg = GAMES[gameName];
  const OUT_DIR = path.resolve("data");
  await fs.ensureDir(OUT_DIR);

  const dataset = { states: [], policies: [], values: [] };
  for (let g = 0; g < 5; g++) {
    // Adapter 생성 (stateJson=null → new game)
    const adapter = await AdapterFactory.create(gameName, null);
    const trajectory = [];
    const treeOpts = { simulationLimit: cfg.simLimit };

    // self-play 한 게임
    while (true) {
      // 상태 직렬화
      const { data, shape } = adapter.getStateTensor();
      trajectory.push({ state: data, shape, player: adapter.getCurrentPlayer() });

      // MCTS 탐색
      const tree = new MCTS(adapter.clone(), treeOpts);
      tree.runSearch();
      const visits = tree.root.children.map(c => c.visits);
      const total  = visits.reduce((a,b) => a+b, 0) || 1;
      const pi     = visits.map(v => v/total);

      // best move
      const mv = tree.bestMove();
      if (!mv) break;
      adapter.applyMove(mv);

      // 종료 검사
      if (adapter.isTerminal()) {
        const winner = adapter.getCurrentPlayer();
        for (const step of trajectory) {
          dataset.states.push(step.state);
          dataset.policies.push(pi);
          dataset.values.push(step.player === winner ? 1 : 0);
        }
        break;
      }
    }
    console.log(`Game ${g+1} done.`);
  }

  const OUT_FILE = path.join(OUT_DIR, `${gameName}_selfplay.json`);
  await fs.writeJson(OUT_FILE, dataset);
  console.log(`Saved to ${OUT_FILE}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
