// ai_trainer/generate_selfplay.js

import MCTS from '../common/mcts_pure.js';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// CommonJS 로딩
const require = createRequire(import.meta.url);

// config.js 에서 GAMES 객체만 가져오기
const { GAMES } = require('./config.js');

// AdapterFactory.js 에서 named export 'AdapterFactory' 클래스 가져오기
const AdapterFactoryModule = require('../common/AdapterFactory.js');
const AdapterFactory = AdapterFactoryModule.AdapterFactory;

// 유틸 함수: adapter.initialState() 또는 adapter.initialState 프로퍼티 대응
function getInitialState(adapter) {
  return typeof adapter.initialState === 'function'
    ? adapter.initialState()
    : adapter.initialState;
}

async function main() {
  const gameName = process.argv[2];
  if (!gameName || !GAMES[gameName]) {
    console.error(
      'Usage: node ai_trainer/generate_selfplay.js <gameName>\n' +
      'Available games: ' + Object.keys(GAMES).join(', ')
    );
    process.exit(1);
  }

  // 해당 게임 설정
  const { simLimit, selfPlayGames, maxMoves, selfplayFile } = GAMES[gameName];
  console.log(`🔄 Self-play 시작: 게임=${gameName}, 시뮬레이션=${simLimit}, 판 수=${selfPlayGames}`);

  // MCTS 인스턴스와 Adapter 생성
  const mcts    = new MCTS({ simLimit, selfPlayGames, maxMoves });
  const adapter = AdapterFactory.create(gameName);

  // 출력 파일 스트림 준비
  const outPath  = path.resolve(selfplayFile || `selfplay_${gameName}_${selfPlayGames}_${simLimit}.ndjson`);
  const outStream = fs.createWriteStream(outPath, { flags: 'w' });

  for (let i = 1; i <= selfPlayGames; i++) {
    console.log(`▶️ Game ${i}/${selfPlayGames} 시작`);

    // 초기 상태 확보
    const rootState = getInitialState(adapter);
    // MCTS 탐색 실행
    const root = mcts.runSearch(rootState);

    // π 계산 (방문 비율)
    const pi = root.children.map(c => c.visits / root.visits);
    // z 계산 (최종 승패: +1/−1/0)
    const z  = root.state.getWinner();
    // 상태 텐서
    const s  = root.state.getStateTensor();

    // NDJSON로 한 줄 기록
    outStream.write(JSON.stringify({ state: s, pi, z }) + '\n');
    console.log(
      `   Game ${i} 완료: pi=[${pi.map(p => p.toFixed(2)).join(', ')}], z=${z}`
    );
  }

  outStream.close();
  console.log(`✔️ Self-play 데이터 출력 완료: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
