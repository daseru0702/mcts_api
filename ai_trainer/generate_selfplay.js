// ai_trainer/generate_selfplay.js

import fs from 'fs';
import path from 'path';
import { AdapterFactory } from '../common/AdapterFactory.js';
import { MCTSPure }    from '../common/mcts_pure.js';

async function main() {
  const [,, gameName, simLimitArg, numGamesArg] = process.argv;
  const simLimit  = parseInt(simLimitArg,  10) || 2000;
  const numGames  = parseInt(numGamesArg,  10) || 10;
  const maxMoves  = 200;

  console.log(`🔄 Self-play 시작: 게임=${gameName}, 시뮬레이션=${simLimit}, 판 수=${numGames}`);

  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  const outPath = path.join(dataDir, `${gameName}_selfplay.ndjson`);
  const ws = fs.createWriteStream(outPath);

  for (let g = 0; g < numGames; g++) {
    console.log(`\n▶️ Game ${g + 1}/${numGames} 시작`);
    console.time(`Game ${g + 1} 소요`);

    const adapter = await AdapterFactory.create(gameName, null);
    const mcts    = new MCTSPure({ simLimit, maxMoves });

    let moveCount = 0;
    while (true) {
      const { data }   = adapter.getStateTensor();
      const stateArray = Array.from(data);

      // adapter.clone()로 복제된 상태에서만 탐색합니다
      const root = mcts.runSearch(adapter.clone());

      const visits = root.children.map(c => c.visits);
      const total  = visits.reduce((a, b) => a + b, 0) || 1;
      const pi     = visits.map(v => v / total);

      const mv = mcts.bestMove(root);
      if (!mv) {
        console.warn('  ⚠️ bestMove() returned null, 조기 종료');
        break;
      }
      adapter.applyMove(mv);
      moveCount++;
      console.log(`  🕹 Move ${moveCount}:`, mv);

      if (adapter.isTerminal()) {
        const lastPlayer = 3 - adapter.getCurrentPlayer();
        console.log(`  🏁 승자: Player ${lastPlayer}`);
        ws.write(JSON.stringify({ state: stateArray, pi, z: lastPlayer }) + "\n");
        break;
      }
      if (moveCount >= maxMoves) {
        console.warn(`  ⚠️ moveCount >= ${maxMoves}, 강제 종료`);
        break;
      }
      ws.write(JSON.stringify({ state: stateArray, pi }) + "\n");
    }

    console.timeEnd(`Game ${g + 1} 소요`);
  }

  ws.end();
  console.log(`\n✅ NDJSON self-play 파일 생성 완료: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
