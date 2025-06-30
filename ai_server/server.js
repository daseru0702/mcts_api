// ai_server/server.js
import express            from 'express';
import path               from 'path';
import { fileURLToPath }  from 'url';
import * as tf            from '@tensorflow/tfjs-node-gpu';
import { GAMES }          from '../common/config.js';
import { AdapterFactory } from '../common/AdapterFactory.js';
import { MCTSTFJS }       from '../common/mcts_tfjs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use( '/common', express.static(path.join(__dirname, '../common')) );
app.use('/',      express.static(path.join(__dirname, '../client')));
app.use('/games', express.static(path.join(__dirname, '../games')));

// ─── 1) 모델 파일 시스템 경로 & tf.io.handler 준비 ───────────────────────
const cfg = GAMES.quoridor;
const modelJsonFsPath = path.resolve(__dirname, '..', 'models', 'quoridor', 'tfjs_model', 'model.json');
// Windows 경로 구분자 '\' 를 '/' 로 바꿔 줍니다
const normalizedPath = modelJsonFsPath.split(path.sep).join('/');
// 파일 시스템 핸들러 생성
const fsHandler = tf.io.fileSystem(normalizedPath);

// ─── 2) MCTSTFJS 인스턴스 생성 & 모델 로드 ───────────────────────────────
const mcts = new MCTSTFJS(
  {
    simulationLimit: cfg.simLimit,
    maxMoves:        cfg.maxMoves,
    c_puct:          cfg.c_puct
  },
  null  // URL 대신 fsHandler 로 로드할 것이므로 넘기지 않습니다
);

// init() 을 오버라이드하여 tf.loadLayersModel(fsHandler) 사용
mcts.init = async () => {
  mcts.model = await tf.loadLayersModel(fsHandler);
};

await mcts.init();
console.log('✅ TF-JS MCTS 모델 로드 완료:', normalizedPath);

// ─── 3) API 엔드포인트 ───────────────────────────────────────────────────
app.post('/best-move', async (req, res) => {
  console.log('/best-move body=', req.body);
  try {
    const { gameName, state, simLimit } = req.body;
    if (!GAMES[gameName]) {
      return res.status(400).json({ error: `Unknown game: ${gameName}` });
    }

    // 어댑터에 config 전달
    const adapter = await AdapterFactory.create(gameName, state);
    adapter.setStateFromArray(state);

    // 요청별 시뮬레이션 횟수 조정
    mcts.simLimit = simLimit || cfg.simLimit;

    // 비동기 MCTS 탐색 & 수 선택
    const root = await mcts.runSearch(adapter.clone());
    const move = mcts.bestMove();

    return res.json({ move });
  } catch (err) {
    console.error('🚨 AI 서버 에러:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── 4) 서버 시작 ─────────────────────────────────────────────────────────
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🎲 AI 서버 실행: http://localhost:${PORT}`);
});
