// ai_server/server.js

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import { QuoridorGame } from "./games/quoridor/QuoridorGame.js";
import { QuoridorAdapter } from "./games/quoridor/QuoridorAdapter.js";
import { MCTS } from "../common/mcts.js";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// POST /best-move
// 요청 body: { gameState: {...}, simLimit?: number }
// 응답   : { move: { type, x, y, orientation? } }

app.post("/best-move", async (req, res) => {
  const { gameState, simLimit } = req.body;

  // 1) JS QuoridorGame 인스턴스 복원
  const game = new QuoridorGame();
  Object.assign(game, gameState);

  // 2) Adapter 생성 (immutable 적용 전제)
  const adapter = new QuoridorAdapter(game);

  // 3) MCTS 탐색
  const tree = new MCTS(adapter, { simulationLimit: simLimit });
  // 동기 탐색 (메인 스레드에 부담이 적다면)
  tree.runSearch();

  // 4) 최적 수 반환
  res.json({ move: tree.bestMove() });
});

// 서버 시작
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Quoridor AI server running on http://0.0.0.0:${PORT}`);
});
