// ai_trainer/generate_selfplay.js

import MCTS from '../common/mcts_pure.js';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// 1) createRequire 로 CommonJS 및 ESM 빌드 모듈 모두 불러오기
const require = createRequire(import.meta.url);
const configModule         = require('./config.js');
const adapterFactoryModule = require('../common/AdapterFactory.js');

// 2) 로드된 모듈 확인 (실제 키 이름을 로그로 보고 확인하세요)
console.log('⚙️ Loaded config module keys:', Object.keys(configModule));
console.log('⚙️ Loaded AdapterFactory module keys:', Object.keys(adapterFactoryModule));

// 3) config.js 에 simLimit, selfPlayGames, maxMoves, selfplayFile 등이 있으면 그대로,  
//    아니라면 configModule.GAMES[gameName] 형태를 쓰도록 선택
//    (아래는 configModule.GAMES 가 있을 때 예시)
const GAMES = configModule.GAMES || null;

// 4) AdapterFactory.create 또는 default export 함수 골라내기
let createAdapter;
if (typeof adapterFactoryModule === 'function') {
  // module.exports = function createAdapter(...) 형태
  createAdapter = adapterFactoryModule;
} else if (typeof adapterFactoryModule.create === 'function') {
  // exports.create = function(...) 형태
  createAdapter = adapterFactoryModule.create;
} else if (adapterFactoryModule.default && typeof adapterFactoryModule.default.create === 'function') {
  // ESM default export class with static create()
  createAdapter = adapterFactoryModule.default.create.bind(adapterFactoryModule.default);
} else {
  throw new Error('⚠️ AdapterFactory 모듈에서 생성 함수를 찾을 수 없습니다.');
}

async function main() {
  const gameName = process.argv[2];
  if (!gameName) {
    console.error('Usage: node generate_selfplay.js <gameName>');
    process.exit(1);
  }
  // configModule.GAMES 사용 예
  const gameConfig = GAMES ? GAMES[gameName] : configModule;
  const { simLimit, selfPlayGames, maxMoves, selfplayFile } = gameConfig;

  console.log(`🔄 Self-play 시작: 게임=${gameName}, 시뮬레이션=${simLimit}, 판 수=${selfPlayGames}`);

  const mcts    = new MCTS({ simLimit, selfPlayGames, maxMoves });
  const adapter = createAdapter(gameName);

  const outPath  = path.resolve(selfplayFile || `selfplay_${gameName}_${selfPlayGames}_${simLimit}.ndjson`);
  const outStream = fs.createWriteStream(outPath, { flags: 'w' });

  for (let i = 1; i <= selfPlayGames; i++) {
    console.log(`▶️ Game ${i}/${selfPlayGames} 시작`);

    // adapter.initialState 가 함수인지, 프로퍼티인지 유연하게 처리
    const rootState = typeof adapter.initialState === 'function'
      ? adapter.initialState()
      : adapter.initialState;

    const root = mcts.runSearch(rootState);

    const pi = root.children.map(c => c.visits / root.visits);
    const z  = root.state.getWinner();
    const s  = root.state.getStateTensor();

    outStream.write(JSON.stringify({ state: s, pi, z }) + '\n');
    console.log(`   Game ${i} 완료: pi=[${pi.map(p=>p.toFixed(2)).join(', ')}], z=${z}`);
  }

  outStream.close();
  console.log(`✔️ Self-play 데이터 출력 완료: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
