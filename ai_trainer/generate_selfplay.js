// ai_trainer/generate_selfplay.js

import MCTS from '../common/mcts_pure.js';
import * as AdapterFactory from '../common/AdapterFactory.js';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// 기존 CommonJS config.js 불러오기
const require = createRequire(import.meta.url);
const { simLimit, selfPlayGames, maxMoves } = require('./config.js');

async function main() {
  const gameName = process.argv[2];
  if (!gameName) {
    console.error('Usage: node generate_selfplay.js <gameName>');
    process.exit(1);
  }
  console.log(`🔄 Self-play 시작: 게임=${gameName}, 시뮬레이션=${simLimit}, 판 수=${selfPlayGames}`);

  const mcts = new MCTS({ simLimit, selfPlayGames, maxMoves });
  const adapter = AdapterFactory.create(gameName);

  const outPath = path.resolve(`selfplay_${gameName}_${selfPlayGames}_${simLimit}.ndjson`);
  const outStream = fs.createWriteStream(outPath, { flags: 'w' });

  for (let i = 1; i <= selfPlayGames; i++) {
    console.log(`▶️ Game ${i}/${selfPlayGames} 시작`);
    const root = mcts.runSearch(adapter.initialState());

    // π 계산 (방문 비율)
    const pi = root.children.map(c => c.visits / root.visits);
    // 최종 승패
    const z = root.state.getWinner();
    // 상태 텐서
    const stateTensor = root.state.getStateTensor();

    outStream.write(JSON.stringify({ state: stateTensor, pi, z }) + '\n');
    console.log(`   Game ${i} 완료: pi=[${pi.map(p => p.toFixed(2)).join(', ')}], z=${z}`);
  }

  outStream.close();
  console.log(` Self-play 데이터 출력 완료: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
