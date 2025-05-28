import fs from 'fs';
import path from 'path';
import { GAMES } from './config.js';
import { AdapterFactory } from '../common/AdapterFactory.js';
import { MCTSPure } from '../common/mcts_pure.js';

async function main() {
  const gameName = process.argv[2];
  if (!GAMES[gameName]) {
    console.error('Usage: node generate_selfplay.js <gameName>');
    process.exit(1);
  }
  const cfg = GAMES[gameName];
  const numGames = cfg.selfPlayGames ?? 5;
  const maxMoves = cfg.maxMoves ?? 200;

  const OUT_DIR = path.resolve('data');
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${gameName}_selfplay.ndjson`);
  const ws = fs.createWriteStream(outPath, { flags: 'w' });

  console.log(`Self-play 시작: 게임=${gameName}, 시뮬레이션=${cfg.simLimit}, 판 수=${numGames}`);
  console.time('총 self-play 시간');

  for (let g = 0; g < numGames; g++) {
    console.log(`\n▶ Game ${g + 1}/${numGames} 시작`);
    console.time(`Game ${g + 1} 소요`);

    const adapter = await AdapterFactory.create(gameName, null);
    const mcts = new MCTSPure({ simulationLimit: cfg.simLimit, maxMoves });

    let moveCount = 0;
    while (true) {
      const { data } = adapter.getStateTensor();
      const stateArray = Array.from(data);

      const root = mcts.runSearch(adapter.clone());
      const visits = root.children.map(c => c.visits);
      const total = visits.reduce((a, b) => a + b, 0) || 1;
      const pi = visits.map(v => v / total);

      const mv = mcts.bestMove(root);
      if (!mv) {
        console.warn('  bestMove() returned null, 조기 종료');
        break;
      }
      adapter.applyMove(mv);
      moveCount++;
      console.log(`  Move ${moveCount}:`, mv);

      // 기록
      const record = { state: stateArray, pi };
      if (adapter.isTerminal()) {
        const lastPlayer = 3 - adapter.getCurrentPlayer();
        record.z = lastPlayer;
        console.log(`  승자: Player ${lastPlayer}`);
        ws.write(JSON.stringify(record) + '\n');
        break;
      }
      if (moveCount >= maxMoves) {
        console.warn(`  moveCount >= ${maxMoves}, 강제 종료`);
        ws.write(JSON.stringify(record) + '\n');
        break;
      }
      ws.write(JSON.stringify(record) + '\n');
    }

    console.timeEnd(`Game ${g + 1} 소요`);
  }

  ws.end(() => {
    console.log(`\n NDJSON self-play 파일 생성 완료: ${outPath}`);
    console.timeEnd('총 self-play 시간');
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
