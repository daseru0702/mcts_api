// ai_trainer/generate_selfplay.js

import fs from 'fs';
import path from 'path';
import { GAMES } from '../common/config.js';
import { AdapterFactory } from '../common/AdapterFactory.js';
import { MCTSPure } from '../common/mcts_pure.js';

async function main() {
  const [,, gameName, simArg, gamesArg] = process.argv;
  if (!GAMES[gameName]) {
    console.error('Usage: node generate_selfplay.js <gameName> [simLimit] [numGames]');
    process.exit(1);
  }

  // config.js에서 불러오는 기본값
  const cfg       = GAMES[gameName];
  const simLimit  = parseInt(simArg,  10) || cfg.simLimit || 2000;
  const numGames  = parseInt(gamesArg,10) || cfg.selfPlayGames || 10;
  const maxMoves  = cfg.maxMoves || 200;

  // 출력 디렉터리 준비
  const outDir = path.resolve(process.cwd(), 'data');
  await fs.promises.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${gameName}_selfplay.ndjson`);
  const ws = fs.createWriteStream(outPath, { flags: 'w' });

  console.log(`🔄 Self-play 시작: 게임=${gameName}, 시뮬레이션=${simLimit}, 판 수=${numGames}`);

  for (let g = 0; g < numGames; g++) {
    console.log(`\n▶️ Game ${g + 1}/${numGames} 시작`);
    console.time(`Game ${g + 1} 소요`);

    // ★ 여기서 AdapterFactory.create가 config.js의 adapter 경로를 사용합니다
    const adapter = await AdapterFactory.create(gameName);
    const mcts    = new MCTSPure({ simLimit, maxMoves });

    let moveCount = 0;
    while (true) {
      // 1) 상태 직렬화
      const { data }   = adapter.getStateTensor();
      const stateArray = Array.from(data);

      // 2) MCTS 탐색 (clone 추천)
      const root = mcts.runSearch(adapter.clone());

      // 3) π 계산
      const visits = root.children.map(c => c.visits);
      const total  = visits.reduce((a, b) => a + b, 0) || 1;
      const pi     = visits.map(v => v / total);

      // 4) best move 선택
      const mv = mcts.bestMove(root);
      if (!mv) {
        console.warn('⚠️ bestMove() returned null — 탐색 실패, 조기 종료');
        break;
      }
      adapter.applyMove(mv);
      moveCount++;
      console.log(`  🕹 Move ${moveCount}:`, mv);

      // 기록용 객체
      const record = { state: stateArray, pi };

      // 5) 종료 검사
      if (adapter.isTerminal()) {
        const winner = 3 - adapter.getCurrentPlayer();
        record.z = winner;
        console.log(`  🏁 승자: Player ${winner}`);
        ws.write(JSON.stringify(record) + '\n');
        break;
      }

      // 6) 수 제한 검사
      if (moveCount >= maxMoves) {
        console.warn(`⚠️ moveCount >= ${maxMoves}, 강제 종료`);
        ws.write(JSON.stringify(record) + '\n');
        break;
      }

      // 7) 중간 기록
      ws.write(JSON.stringify(record) + '\n');
    }

    console.timeEnd(`Game ${g + 1} 소요`);
  }

  ws.end(() => {
    console.log(`\n✅ NDJSON self-play 파일 생성 완료: ${outPath}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
