// ai_trainer/arena.js
//
// 두 플레이어 대결 (선후공 번갈아가며, worker_threads 병렬)
//
//   node ai_trainer/arena.js --a=nn:models/<game>/best.onnx:200 --b=heur:200 [--game=<id>] [--games=40] [--workers=14]
//
// 마지막 줄에 JSON 결과를 출력합니다: {"a":..., "b":..., "aWins":..., "bWins":..., "draws":..., "aScore":...}

import os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url";
import { loadGame } from "../common/games.js";
import { resolveGameId } from "../common/game_registry.js";
import { createPlayer, parseArgs } from "./players.js";

async function playMatch(game, p1, p2, openingRandom) {
  const state = new game.Adapter();
  const maxMoves = game.arena.maxMoves ?? 200;
  const players = { 1: p1, 2: p2 };
  while (!state.isTerminal() && state.getMoveCount() < maxMoves) {
    const { mcts } = players[state.getCurrentPlayer()];
    const root = await mcts.search(state);
    // 같은 대국이 반복되지 않도록 초반 몇 수는 방문 수 비례로 고릅니다
    const move = state.getMoveCount() < openingRandom && mcts.pickMoveIndex
      ? root.moves[mcts.pickMoveIndex(root, 1)]
      : mcts.bestMove(root);
    state.applyMove(move);
  }
  return { winner: state.getWinner(), moves: state.getMoveCount() };
}

async function workerMain() {
  const { gameId, a, b, gameIds, openingRandom } = workerData;
  const game = await loadGame(gameId);
  const pa = await createPlayer(a), pb = await createPlayer(b);
  for (const id of gameIds) {
    const aIsP1 = id % 2 === 0;
    const { winner, moves } = aIsP1
      ? await playMatch(game, pa, pb, openingRandom)
      : await playMatch(game, pb, pa, openingRandom);
    const aWon = winner !== 0 && (winner === 1) === aIsP1;
    parentPort.postMessage({ result: winner === 0 ? "draw" : aWon ? "a" : "b", moves, aIsP1 });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.a || !args.b) {
    console.error("Usage: node ai_trainer/arena.js --a=<spec> --b=<spec> [--games=40] [--workers=14]");
    process.exit(1);
  }
  const gameId = resolveGameId(args.game);
  const games = parseInt(args.games ?? 40, 10);
  const workers = Math.min(parseInt(args.workers ?? Math.max(1, os.cpus().length - 2), 10), games);
  const openingRandom = parseInt(args["opening-random"] ?? 4, 10);
  const tally = { a: 0, b: 0, draw: 0, aAsP1: 0, aAsP2: 0 };
  let done = 0;

  const self = fileURLToPath(import.meta.url);
  await Promise.all(Array.from({ length: workers }, (_, w) => {
    const gameIds = [];
    for (let i = w; i < games; i += workers) gameIds.push(i);
    return new Promise((resolve, reject) => {
      const worker = new Worker(self, { workerData: { gameId, a: args.a, b: args.b, gameIds, openingRandom } });
      worker.on("message", ({ result, aIsP1 }) => {
        tally[result]++;
        if (result === "a") tally[aIsP1 ? "aAsP1" : "aAsP2"]++;
        done++;
        if (done % 10 === 0) console.log(`  ${done}/${games}  A ${tally.a} : B ${tally.b} (무 ${tally.draw})`);
      });
      worker.on("error", reject);
      worker.on("exit", code => (code === 0 ? resolve() : reject(new Error(`worker exit ${code}`))));
    });
  }));

  const aScore = (tally.a + 0.5 * tally.draw) / games;
  console.log(`🏁 ${args.a}  vs  ${args.b}:  ${tally.a}승 ${tally.b}패 ${tally.draw}무  (A 승률 ${(aScore * 100).toFixed(1)}%)`);
  console.log(JSON.stringify({ a: args.a, b: args.b, aWins: tally.a, bWins: tally.b, draws: tally.draw,
                               aWinsAsP1: tally.aAsP1, aWinsAsP2: tally.aAsP2, aScore }));
}

if (isMainThread) {
  main().catch(e => { console.error(e); process.exit(1); });
} else {
  workerMain().catch(e => { console.error(e); process.exit(1); });
}
