// ai_trainer/generate_selfplay.js

import fs from "fs";
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
  const numGames = cfg.selfPlayGames ?? 5;
  const maxMoves = cfg.maxMoves     ?? 200;

  // 출력 디렉터리 준비
  const OUT_DIR = path.resolve("data");
  await fs.promises.mkdir(OUT_DIR, { recursive: true });

  // NDJSON 형식으로 스트리밍 (메모리 절약)
  const outPath = path.join(OUT_DIR, `${gameName}_selfplay.ndjson`);
  const ws = fs.createWriteStream(outPath, { flags: "w" });

  console.log(`\n🔄 Self-play 시작: 게임=${gameName}, 시뮬레이션=${cfg.simLimit}, 판 수=${numGames}`);
  console.time("총 self-play 시간");

  for (let g = 0; g < numGames; g++) {
    console.log(`\n▶️ Game ${g + 1}/${numGames} 시작`);
    console.time(`Game ${g + 1} 소요`);

    const adapter    = await AdapterFactory.create(gameName, null);
    const treeOpts   = { simulationLimit: cfg.simLimit };
    let moveCount    = 0;

    while (true) {
      // 1) 상태 직렬화
      const { data, shape } = adapter.getStateTensor();
      const stateArray = Array.from(data);

      // 2) MCTS 탐색
      const tree = new MCTS(adapter.clone(), treeOpts);
      tree.runSearch();

      // 3) 정책(pi) 계산
      const visits = tree.root.children.map(c => c.visits);
      const total  = visits.reduce((a,b) => a + b, 0) || 1;
      const pi     = visits.map(v => v / total);

      // 4) best move
      const mv = tree.bestMove();
      if (!mv) {
        console.warn("  ⚠️ bestMove() returned null, 조기 종료");
        break;
      }
      adapter.applyMove(mv);
      moveCount++;
      console.log(`  🕹 Move ${moveCount}:`, mv);

      // 5) 종료 검사
      if (adapter.isTerminal()) {
        const lastPlayer = 3 - adapter.getCurrentPlayer();
        console.log(`  🏁 승자: Player ${lastPlayer}`);
        // 승패 값 계산
        const value = (player => player === lastPlayer ? 1 : 0);

        // NDJSON으로 한 줄씩 쓰기
        ws.write(JSON.stringify({ state: stateArray, pi, value: lastPlayer }));
        ws.write("\n");
        break;
      }

      // 6) 수 제한 검사
      if (moveCount >= maxMoves) {
        console.warn(`  ⚠️ moveCount >= ${maxMoves}, 강제 종료`);
        break;
      }

      // 7) 각 수마다 기록 (state, pi, value=? 아직 미정 => 쓰지 않음)
      //    끝나고 마지막 승자와 매핑해서 쓰기
      ws.write(JSON.stringify({ state: stateArray, pi }));
      ws.write("\n");
    }

    console.timeEnd(`Game ${g + 1} 소요`);
  }

  ws.end(() => {
    console.log(`\n✅ NDJSON self-play 파일 생성 완료: ${outPath}`);
    console.timeEnd("총 self-play 시간");
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
