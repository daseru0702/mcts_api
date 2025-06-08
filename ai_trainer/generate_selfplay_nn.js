// ai_trainer/generate_selfplay_nn.js

import fs from 'fs';
import path from 'path';
import { GAMES } from '../common/config.js';
import { AdapterFactory } from '../common/AdapterFactory.js';
import { MCTSnn } from '../common/mcts_nn.js';

async function main() {
  const [,, gameName, simArg, gamesArg] = process.argv;
  if (!GAMES[gameName]) {
    console.error('Usage: node generate_selfplay_nn.js <gameName> [simLimit] [numGames] [--out=filename]');
    process.exit(1);
  }

  const cfg      = GAMES[gameName];
  const simLimit = parseInt(simArg, 10)  || cfg.simLimit   || 2000;
  const numGames = parseInt(gamesArg, 10)|| cfg.selfPlayGames || 10;
  const maxMoves = cfg.maxMoves || 200;

  // output directory & filename
  const outDir  = path.resolve(process.cwd(), 'data');
  await fs.promises.mkdir(outDir, { recursive: true });
  const outFlag = process.argv.find(arg => arg.startsWith('--out='));
  const outName = outFlag
    ? outFlag.split('=')[1]
    : `${gameName}_selfplay_nn.ndjson`;
  const outPath = path.join(outDir, outName);
  const ws      = fs.createWriteStream(outPath, { flags: 'w' });

  console.log(`🔄 NN-based Self-play 시작: 게임=${gameName}, 시뮬레이션=${simLimit}, 판 수=${numGames}`);

  // 준비: AdapterFactory + MCTSnn 초기화
  const mcts = new MCTSnn(
    { simulationLimit: simLimit, maxMoves: maxMoves, c_puct: cfg.c_puct },
    path.resolve(cfg.modelDir, gameName, 'model.onnx')
  );
  await mcts.init();

  for (let g = 0; g < numGames; g++) {
    console.log(`\n▶️ Game ${g + 1}/${numGames} 시작`);
    console.time(`Game ${g + 1} 소요`);

    const adapter = await AdapterFactory.create(gameName, null);
    let moveCount = 0;

    while (true) {
      // 상태 직렬화
      const { data }   = adapter.getStateTensor();
      const stateArray = Array.from(data);

      // MCTS 탐색 (await 필수)
      const root = await mcts.runSearch(adapter.clone());

      // π 계산
      const visits = root.children.map(c => c.visits);
      const total  = visits.reduce((a,b) => a + b, 0) || 1;
      const pi     = visits.map(v => v / total);

      // bestMove
      const mv = mcts.bestMove();
      if (!mv) {
        console.warn('⚠️ bestMove() returned null — 탐색 실패, 조기 종료');
        break;
      }

      adapter.applyMove(mv);
      moveCount++;
      console.log(`  🕹 Move ${moveCount}:`, mv);

      // 기록용 객체
      const record = { state: stateArray, pi };

      // 종료 검사
      if (adapter.isTerminal()) {
        const winner = 3 - adapter.getCurrentPlayer();
        record.z = winner;
        console.log(`  🏁 승자: Player ${winner}`);
        ws.write(JSON.stringify(record) + '\n');
        break;
      }

      // 수 제한 검사
      if (moveCount >= maxMoves) {
        console.warn(`⚠️ moveCount >= ${maxMoves}, 강제 종료`);
        ws.write(JSON.stringify(record) + '\n');
        break;
      }

      // 중간 기록
      ws.write(JSON.stringify(record) + '\n');
    }

    console.timeEnd(`Game ${g + 1} 소요`);
  }

  ws.end(() => {
    console.log(`\n✅ NN self-play 파일 생성 완료: ${outPath}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
