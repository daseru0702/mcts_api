// ai_server/server.js
//
// 전시용 보드게임 AI 서버 (게임 무관)
//   npm start  →  http://localhost:3000   (?game=<id> 로 게임 선택)
//
//   GET  /games/index.json → games/ 폴더의 게임 목록
//   POST /api/move   { game, state: Adapter.toJSON(), level: "easy"|"normal"|"hard" }
//                    → { move, stats: { value, simulations, candidates }, ms, model }
//   GET  /api/info?game=<id> → 모델/학습 기록
//
// models/<game>/best.onnx 가 바뀌면 자동으로 다시 불러옵니다 (학습 중에도 실행 가능).
// 모델이 없으면 게임의 휴리스틱 평가기로 동작합니다.

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadGame } from "../common/games.js";
import { listGameIds } from "../common/game_registry.js";
import { MCTS } from "../common/mcts.js";
import { HeuristicEvaluator, OnnxEvaluator } from "../common/evaluators.js";
import { LEVELS } from "../common/levels.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = parseInt(process.env.PORT || "3000", 10);

const modelPath = id => path.join(ROOT, "models", id, "best.onnx");
const historyPath = id => path.join(ROOT, "models", id, "history.json");

// ─── 게임별 모델 로드 & 자동 리로드 ─────────────────────────────────────
const games = new Map();   // id → { game, evaluator, modelInfo }

async function refreshModel(entry) {
  const file = modelPath(entry.game.id);
  try {
    const stat = fs.statSync(file);
    if (entry.modelInfo.mtime === stat.mtimeMs) return;
    entry.evaluator = await OnnxEvaluator.create(file, { threads: 2 });
    entry.modelInfo = { kind: "onnx", path: path.relative(ROOT, file), loadedAt: new Date().toISOString(), mtime: stat.mtimeMs };
    console.log(`✅ [${entry.game.id}] 모델 로드: ${file}`);
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`[${entry.game.id}] 모델 로드 실패:`, e.message);
  }
}

async function getGame(id) {
  if (!listGameIds().includes(id)) return null;
  if (!games.has(id)) {
    const entry = { game: await loadGame(id), evaluator: new HeuristicEvaluator(), modelInfo: { kind: "heuristic" } };
    await refreshModel(entry);
    if (entry.modelInfo.kind === "heuristic") console.log(`ℹ️ [${id}] 모델 없음 — 휴리스틱 MCTS 로 동작합니다`);
    games.set(id, entry);
  }
  return games.get(id);
}

setInterval(() => { for (const entry of games.values()) refreshModel(entry); }, 10_000).unref();

function readHistory(id) {
  try {
    return JSON.parse(fs.readFileSync(historyPath(id), "utf8"));
  } catch {
    return null;
  }
}

async function gameIndex() {
  const list = [];
  for (const id of listGameIds()) {
    const g = await loadGame(id);
    list.push({ id, name: g.name ?? id, title: g.title ?? id });
  }
  return list;
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
app.get("/games/index.json", async (req, res) => res.json(await gameIndex()));
app.use("/", express.static(path.join(ROOT, "client")));
app.use("/games", express.static(path.join(ROOT, "games")));
app.use("/common", express.static(path.join(ROOT, "common")));
// 정적 배포(GitHub Pages)와 같은 경로로 모델/기록 제공
app.get("/models/:game/:file(best.onnx|history.json)", (req, res) => {
  if (!listGameIds().includes(req.params.game)) return res.sendStatus(404);
  res.sendFile(req.params.file === "best.onnx" ? modelPath(req.params.game) : historyPath(req.params.game),
    err => err && !res.headersSent && res.sendStatus(404));
});

app.post("/api/move", async (req, res) => {
  const entry = await getGame(req.body?.game);
  if (!entry) return res.status(400).json({ error: `알 수 없는 게임: ${req.body?.game}` });
  let state;
  try {
    state = new entry.game.Adapter(req.body?.state ?? {});
  } catch (e) {
    return res.status(400).json({ error: `잘못된 상태: ${e.message}` });
  }
  if (state.isTerminal()) return res.status(400).json({ error: "이미 끝난 게임입니다" });
  const level = LEVELS[req.body?.level] ?? LEVELS.normal;

  try {
    const result = await enqueue(async () => {
      const t0 = Date.now();
      const mcts = new MCTS(entry.evaluator, { simulations: level.simulations });
      const root = await mcts.search(state);
      const move = root.moves[mcts.pickMoveIndex(root, level.temperature)];
      return { move, stats: mcts.stats(root, 6), ms: Date.now() - t0 };
    });
    res.json({ ...result, model: entry.modelInfo.kind });
  } catch (e) {
    console.error("🚨 탐색 오류:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/info", async (req, res) => {
  const entry = await getGame(req.query.game);
  if (!entry) return res.status(400).json({ error: `알 수 없는 게임: ${req.query.game}` });
  res.json({ game: entry.game.id, model: entry.modelInfo, levels: LEVELS, history: readHistory(entry.game.id) });
});

// 미리 불러와 두기
for (const id of listGameIds()) await getGame(id);

app.listen(PORT, () => {
  console.log(`🎲 보드게임 AI 서버: http://localhost:${PORT}  (게임: ${listGameIds().join(", ")})`);
});
