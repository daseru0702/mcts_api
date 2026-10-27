// ai_trainer/selfplay.js
//
// 자가대국 데이터 생성 (worker_threads 병렬, 게임 무관)
//
//   node ai_trainer/selfplay.js --out=data/<game>/gen_001.bin [--game=<id>] [--model=models/<game>/best.onnx]
//        [--games=400] [--sims=300] [--workers=14] [--max-moves=..] [--temp-moves=..]
//
// --game 은 games/ 에 게임이 하나뿐이면 생략할 수 있습니다.
// --model 을 생략하면 게임의 휴리스틱 평가기로 0세대 데이터를 만듭니다.
// 출력은 float32 행의 연속:  [state(C*H*W) | pi(policySize) | z(1) | q(1)]
//   z = 최종 승패 (둘 차례 기준), q = 그 국면의 MCTS 평가값 (둘 차례 기준)
// 모든 포지션은 게임이 정한 대칭 변환(Adapter.SYMMETRIES)마다 하나씩 저장됩니다.
// 옆에 같은 이름의 .json 으로 크기 정보(stateShape, policySize)를 남기며, train.py 가 이를 읽습니다.

import fs from "fs";
import os from "os";
import path from "path";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url";
import { loadGame } from "../common/games.js";
import { resolveGameId } from "../common/game_registry.js";
import { MCTS } from "../common/mcts.js";
import { HeuristicEvaluator, OnnxEvaluator } from "../common/evaluators.js";
import { parseArgs } from "./players.js";

function rowLayout(game) {
  const stateSize = game.inputShape.reduce((a, b) => a * b, 1);
  return { stateSize, row: stateSize + game.policySize + 2 };
}

async function playGame(game, mcts, opts) {
  const { stateSize, row } = rowLayout(game);
  const state = new game.Adapter();
  const records = [];

  while (!state.isTerminal() && state.getMoveCount() < opts.maxMoves) {
    const root = await mcts.search(state, { addNoise: true });
    const pi = mcts.visitDistribution(root);
    // 루트 평가값: 모든 자식의 방문 가중 평균 Q (둘 차례 기준)
    const nSum = root.N.reduce((a, b) => a + b, 0);
    const q = nSum > 0 ? root.W.reduce((a, b) => a + b, 0) / nSum : root.value;

    for (const sym of game.symmetries) {
      const piDense = new Float32Array(game.policySize);
      root.moves.forEach((m, a) => { piDense[state.moveToIndex(m, sym)] = pi[a]; });
      records.push({ s: state.encode(sym), pi: piDense, q, player: state.getCurrentPlayer() });
    }

    const temperature = state.getMoveCount() < opts.tempMoves ? 1 : 0;
    const a = mcts.pickMoveIndex(root, temperature);
    state.applyMove(root.moves[a]);
    mcts.advance(a);
  }

  // 결과: 승패면 ±1, 수 제한에 걸리면 게임이 주는 판정값(없으면 0)
  const winner = state.getWinner();
  let zP1;
  if (winner) {
    zP1 = winner === 1 ? 1 : -1;
  } else {
    const v = state.adjudicateValue ? state.adjudicateValue() : 0;
    zP1 = state.getCurrentPlayer() === 1 ? v : -v;
  }

  const buf = new Float32Array(records.length * row);
  records.forEach((r, i) => {
    buf.set(r.s, i * row);
    buf.set(r.pi, i * row + stateSize);
    buf[i * row + row - 2] = r.player === 1 ? zP1 : -zP1;
    buf[i * row + row - 1] = r.q;
  });
  return { buf, moves: state.getMoveCount(), winner };
}

async function workerMain() {
  const { gameId, model, sims, games, maxMoves, tempMoves } = workerData;
  const game = await loadGame(gameId);
  const evaluator = model ? await OnnxEvaluator.create(model) : new HeuristicEvaluator();
  const mcts = new MCTS(evaluator, { simulations: sims, maxMoves });
  for (let i = 0; i < games; i++) {
    const { buf, moves, winner } = await playGame(game, mcts, { maxMoves, tempMoves });
    parentPort.postMessage({ buf, moves, winner }, [buf.buffer]);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gameId = resolveGameId(args.game);
  const game = await loadGame(gameId);
  const out = args.out ?? path.join("data", gameId, "selfplay.bin");
  const games    = parseInt(args.games ?? 400, 10);
  const sims     = parseInt(args.sims ?? 300, 10);
  const workers  = Math.min(parseInt(args.workers ?? Math.max(1, os.cpus().length - 2), 10), games);
  const maxMoves = parseInt(args["max-moves"] ?? game.selfplay.maxMoves ?? 200, 10);
  const tempMoves = parseInt(args["temp-moves"] ?? game.selfplay.tempMoves ?? 10, 10);
  const model    = args.model ? path.resolve(args.model) : null;
  const { stateSize, row } = rowLayout(game);

  await fs.promises.mkdir(path.dirname(path.resolve(out)), { recursive: true });
  const tmpPath = out + ".part";
  const fd = fs.openSync(tmpPath, "w");

  console.log(`🔄 self-play [${gameId}]: ${games}판, sims=${sims}, workers=${workers}, 평가기=${model ?? "heuristic"}`);
  const t0 = Date.now();
  let done = 0, rows = 0, totalMoves = 0;
  const wins = { 0: 0, 1: 0, 2: 0 };

  const self = fileURLToPath(import.meta.url);
  await Promise.all(Array.from({ length: workers }, (_, w) => {
    const share = Math.floor(games / workers) + (w < games % workers ? 1 : 0);
    return new Promise((resolve, reject) => {
      const worker = new Worker(self, { workerData: { gameId, model, sims, games: share, maxMoves, tempMoves } });
      worker.on("message", ({ buf, moves, winner }) => {
        fs.writeSync(fd, Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
        done++;
        rows += buf.length / row;
        totalMoves += moves;
        wins[winner]++;
        if (done % 10 === 0 || done === games) {
          const sec = (Date.now() - t0) / 1000;
          console.log(`  ${done}/${games}판  평균 ${(totalMoves / done).toFixed(1)}수  ` +
            `P1승 ${wins[1]} P2승 ${wins[2]} 무 ${wins[0]}  ${(done / sec * 60).toFixed(1)}판/분`);
        }
      });
      worker.on("error", reject);
      worker.on("exit", code => (code === 0 ? resolve() : reject(new Error(`worker exit ${code}`))));
    });
  }));

  fs.closeSync(fd);
  fs.renameSync(tmpPath, out);
  const meta = { game: gameId, games, sims, model, rows, rowFloats: row, stateShape: game.inputShape,
                 stateSize, policySize: game.policySize, avgMoves: totalMoves / games, wins,
                 seconds: (Date.now() - t0) / 1000 };
  fs.writeFileSync(out.replace(/\.bin$/, ".json"), JSON.stringify(meta, null, 2));
  console.log(`✅ ${rows}개 샘플 저장: ${out} (${meta.seconds.toFixed(0)}초)`);
}

if (isMainThread) {
  main().catch(e => { console.error(e); process.exit(1); });
} else {
  workerMain().catch(e => { console.error(e); process.exit(1); });
}
