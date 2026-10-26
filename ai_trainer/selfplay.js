// ai_trainer/selfplay.js
//
// 자가대국 데이터 생성 (worker_threads 병렬)
//
//   node ai_trainer/selfplay.js --out=data/gen_001.bin [--model=models/quoridor/best.onnx]
//        [--games=400] [--sims=300] [--workers=14] [--max-moves=160] [--temp-moves=10]
//
// --model 을 생략하면 휴리스틱 평가기로 0세대 데이터를 만듭니다.
// 출력은 float32 행의 연속:  [state(IN_CHANNELS*81) | pi(POLICY_SIZE) | z(1)]
// 모든 포지션은 좌우 반전본이 함께 저장됩니다 (데이터 2배).

import fs from "fs";
import os from "os";
import path from "path";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url";
import { QuoridorAdapter, IN_CHANNELS, POLICY_SIZE } from "../games/quoridor/QuoridorAdapter.js";
import { MCTS } from "../common/mcts.js";
import { HeuristicEvaluator, OnnxEvaluator } from "../common/evaluators.js";
import { parseArgs } from "./players.js";

const STATE_SIZE = IN_CHANNELS * 81;
const ROW = STATE_SIZE + POLICY_SIZE + 1;

async function playGame(mcts, opts) {
  const state = new QuoridorAdapter();
  const records = [];

  while (!state.isTerminal() && state.getMoveCount() < opts.maxMoves) {
    const root = await mcts.search(state, { addNoise: true });
    const pi = mcts.visitDistribution(root);

    for (const mirror of [false, true]) {
      const piDense = new Float32Array(POLICY_SIZE);
      root.moves.forEach((m, a) => { piDense[state.moveToIndex(m, mirror)] = pi[a]; });
      records.push({ s: state.encode(mirror), pi: piDense, player: state.getCurrentPlayer() });
    }

    const temperature = state.getMoveCount() < opts.tempMoves ? 1 : 0;
    const a = mcts.pickMoveIndex(root, temperature);
    state.applyMove(root.moves[a]);
    mcts.advance(a);
  }

  // 결과: 승패면 ±1, 수 제한에 걸리면 최단거리 차이로 판정한 약한 신호
  const winner = state.getWinner();
  let zP1;
  if (winner) {
    zP1 = winner === 1 ? 1 : -1;
  } else {
    const g = state.game;
    zP1 = 0.5 * Math.tanh((g.shortestDistance(2) - g.shortestDistance(1)) / 3);
  }

  const buf = new Float32Array(records.length * ROW);
  records.forEach((r, i) => {
    buf.set(r.s, i * ROW);
    buf.set(r.pi, i * ROW + STATE_SIZE);
    buf[i * ROW + ROW - 1] = r.player === 1 ? zP1 : -zP1;
  });
  return { buf, moves: state.getMoveCount(), winner };
}

async function workerMain() {
  const { model, sims, games, maxMoves, tempMoves } = workerData;
  const evaluator = model ? await OnnxEvaluator.create(model) : new HeuristicEvaluator();
  const mcts = new MCTS(evaluator, { simulations: sims, maxMoves });
  for (let i = 0; i < games; i++) {
    const { buf, moves, winner } = await playGame(mcts, { maxMoves, tempMoves });
    parentPort.postMessage({ buf, moves, winner }, [buf.buffer]);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) {
    console.error("Usage: node ai_trainer/selfplay.js --out=data/gen_001.bin [--model=...onnx] [--games=400] [--sims=300] [--workers=14]");
    process.exit(1);
  }
  const games    = parseInt(args.games ?? 400, 10);
  const sims     = parseInt(args.sims ?? 300, 10);
  const workers  = Math.min(parseInt(args.workers ?? Math.max(1, os.cpus().length - 2), 10), games);
  const maxMoves = parseInt(args["max-moves"] ?? 160, 10);
  const tempMoves = parseInt(args["temp-moves"] ?? 10, 10);
  const model    = args.model ? path.resolve(args.model) : null;

  await fs.promises.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  const tmpPath = args.out + ".part";
  const fd = fs.openSync(tmpPath, "w");

  console.log(`🔄 self-play: ${games}판, sims=${sims}, workers=${workers}, 평가기=${model ?? "heuristic"}`);
  const t0 = Date.now();
  let done = 0, rows = 0, totalMoves = 0;
  const wins = { 0: 0, 1: 0, 2: 0 };

  const self = fileURLToPath(import.meta.url);
  await Promise.all(Array.from({ length: workers }, (_, w) => {
    const share = Math.floor(games / workers) + (w < games % workers ? 1 : 0);
    return new Promise((resolve, reject) => {
      const worker = new Worker(self, { workerData: { model, sims, games: share, maxMoves, tempMoves } });
      worker.on("message", ({ buf, moves, winner }) => {
        fs.writeSync(fd, Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
        done++;
        rows += buf.length / ROW;
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
  fs.renameSync(tmpPath, args.out);
  const meta = { games, sims, model, rows, rowFloats: ROW, stateSize: STATE_SIZE, policySize: POLICY_SIZE,
                 avgMoves: totalMoves / games, wins, seconds: (Date.now() - t0) / 1000 };
  fs.writeFileSync(args.out.replace(/\.bin$/, ".json"), JSON.stringify(meta, null, 2));
  console.log(`✅ ${rows}개 샘플 저장: ${args.out} (${meta.seconds.toFixed(0)}초)`);
}

if (isMainThread) {
  main().catch(e => { console.error(e); process.exit(1); });
} else {
  workerMain().catch(e => { console.error(e); process.exit(1); });
}
