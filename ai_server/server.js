// ai_server/server.js
//
// 전시용 쿼리도 AI 서버
//   npm start  →  http://localhost:3000
//
//   POST /api/move   { state: QuoridorGame.toJSON(), level: "easy"|"normal"|"hard" }
//                    → { move, stats: { value, simulations, candidates }, ms, model }
//   GET  /api/info   → 모델/학습 기록
//
// models/quoridor/best.onnx 가 바뀌면 자동으로 다시 불러옵니다 (학습 중에도 실행 가능).
// 모델이 없으면 휴리스틱 평가기로 동작합니다.

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { QuoridorAdapter } from "../games/quoridor/QuoridorAdapter.js";
import { MCTS } from "../common/mcts.js";
import { HeuristicEvaluator, OnnxEvaluator } from "../common/evaluators.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MODEL_PATH = process.env.MODEL_PATH || path.join(ROOT, "models", "quoridor", "best.onnx");
const HISTORY_PATH = path.join(ROOT, "models", "quoridor", "history.json");
const PORT = parseInt(process.env.PORT || "3000", 10);

const LEVELS = {
  easy:   { simulations: 40,  temperature: 1 },
  normal: { simulations: 300, temperature: 0 },
  hard:   { simulations: 1200, temperature: 0 },
};

// ─── 모델 로드 & 자동 리로드 ─────────────────────────────────────────────
let evaluator = new HeuristicEvaluator();
let modelInfo = { kind: "heuristic", loadedAt: null, mtime: null };

async function loadModel() {
  try {
    const stat = fs.statSync(MODEL_PATH);
    if (modelInfo.mtime === stat.mtimeMs) return;
    evaluator = await OnnxEvaluator.create(MODEL_PATH, { threads: 2 });
    modelInfo = { kind: "onnx", path: path.relative(ROOT, MODEL_PATH), loadedAt: new Date().toISOString(), mtime: stat.mtimeMs };
    console.log(`✅ 모델 로드: ${MODEL_PATH}`);
  } catch (e) {
    if (e.code !== "ENOENT") console.error("모델 로드 실패:", e.message);
    else if (modelInfo.kind !== "heuristic") console.warn("모델 파일 없음 — 기존 모델 유지");
  }
}
await loadModel();
if (modelInfo.kind === "heuristic") console.log("ℹ️ 모델 없음 — 휴리스틱 MCTS 로 동작합니다");
setInterval(loadModel, 10_000).unref();

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  } catch {
    return null;
  }
}

// 탐색은 CPU 를 많이 쓰므로 요청을 한 번에 하나씩 처리합니다
let queue = Promise.resolve();
function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

// ─── HTTP ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "64kb" }));
app.use("/", express.static(path.join(ROOT, "client")));
app.use("/games", express.static(path.join(ROOT, "games")));

app.post("/api/move", async (req, res) => {
  let state;
  try {
    state = new QuoridorAdapter(req.body?.state ?? {});
  } catch (e) {
    return res.status(400).json({ error: `잘못된 상태: ${e.message}` });
  }
  if (state.isTerminal()) return res.status(400).json({ error: "이미 끝난 게임입니다" });
  const level = LEVELS[req.body?.level] ?? LEVELS.normal;

  try {
    const result = await enqueue(async () => {
      const t0 = Date.now();
      const mcts = new MCTS(evaluator, { simulations: level.simulations });
      const root = await mcts.search(state);
      const move = root.moves[mcts.pickMoveIndex(root, level.temperature)];
      return { move, stats: mcts.stats(root, 6), ms: Date.now() - t0 };
    });
    res.json({ ...result, model: modelInfo.kind });
  } catch (e) {
    console.error("🚨 탐색 오류:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/info", (req, res) => {
  res.json({ model: modelInfo, levels: LEVELS, history: readHistory() });
});

app.listen(PORT, () => {
  console.log(`🎲 쿼리도 AI 서버: http://localhost:${PORT}`);
});
