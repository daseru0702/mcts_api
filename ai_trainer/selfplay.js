// ai_trainer/selfplay.js
//
// 자가대국 데이터 생성 (worker_threads 병렬, 게임 무관)
//
//   node ai_trainer/selfplay.js --out=data/<game>/gen_001.bin [--game=<id>] [--model=models/<game>/best.onnx]
//        [--games=400] [--sims=300] [--workers=14] [--max-moves=..] [--temp-moves=..]
//
// --game 은 games/ 에 게임이 하나뿐이면 생략할 수 있습니다.
// --model 을 생략하면 게임의 휴리스틱 평가기로 0세대 데이터를 만듭니다.
// 출력 형식 "sparse-u8-v1" — 정책이 큰 게임도 작게 저장하도록 방문한 수만 저장합니다.
//   한 파일 안에 다섯 구역이 차례로 있고, 각 구역은 4바이트 단위로 맞춥니다.
//     states  uint8   [rows, C*H*W]   encode() 값 × 255 (encode 는 0~1 사이 값이어야 함)
//     zq      float32 [rows, 2]       z = 최종 승패, q = 그 국면의 MCTS 평가값 (둘 다 둘 차례 기준)
//     counts  int32   [rows]          행마다 방문한 수의 개수
//     idx     int32   [nnz]           정책 인덱스
//     val     float32 [nnz]           방문 비율
// 모든 포지션은 게임이 정한 대칭 변환(Adapter.SYMMETRIES)마다 하나씩 저장됩니다.
// 옆에 같은 이름의 .json 으로 형식과 크기 정보(stateShape, policySize, rows, nnz)를 남기며, train.py 가 이를 읽습니다.
// (예전 형식: float32 행 [state | pi | z | q] 의 연속, .json 에 format 이 없음 — train.py 는 둘 다 읽습니다)

import fs from "fs";
import os from "os";
import path from "path";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url";
import { loadGame } from "../common/games.js";
import { resolveGameId } from "../common/game_registry.js";
import { MCTS } from "../common/mcts.js";
// onnxruntime-node 는 모델을 쓸 때만 불러옵니다 (휴리스틱 작업 스레드에 네이티브 모듈을 올리지 않음)
import { HeuristicEvaluator } from "../common/heuristic_evaluator.js";
import { parseArgs } from "./players.js";

export const FORMAT = "sparse-u8-v1";
const SECTIONS = ["states", "zq", "counts", "idx", "val"];
const pad4 = n => (n + 3) & ~3;
const stateSizeOf = game => game.inputShape.reduce((a, b) => a * b, 1);

async function playGame(game, mcts, opts) {
  const state = new game.Adapter();
  const records = [];

  while (!state.isTerminal() && state.getMoveCount() < opts.maxMoves) {
    const root = await mcts.search(state, { addNoise: true });
    const pi = mcts.visitDistribution(root);
    // 루트 평가값: 모든 자식의 방문 가중 평균 Q (둘 차례 기준)
    const nSum = root.N.reduce((a, b) => a + b, 0);
    const q = nSum > 0 ? root.W.reduce((a, b) => a + b, 0) / nSum : root.value;

    for (const sym of game.symmetries) {
      const idx = [], val = [];
      root.moves.forEach((m, a) => { if (pi[a] > 0) { idx.push(state.moveToIndex(m, sym)); val.push(pi[a]); } });
      records.push({ s: state.encode(sym), idx, val, q, player: state.getCurrentPlayer() });
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

  // 구역별 버퍼 (메인 스레드가 구역 파일에 이어 붙임)
  const stateSize = stateSizeOf(game), rows = records.length;
  const nnz = records.reduce((a, r) => a + r.idx.length, 0);
  const out = {
    states: new Uint8Array(rows * stateSize),
    zq: new Float32Array(rows * 2),
    counts: new Int32Array(rows),
    idx: new Int32Array(nnz),
    val: new Float32Array(nnz),
  };
  let k = 0;
  records.forEach((r, i) => {
    for (let j = 0; j < stateSize; j++) {
      const v = r.s[j];
      out.states[i * stateSize + j] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
    }
    out.zq[2 * i] = r.player === 1 ? zP1 : -zP1;
    out.zq[2 * i + 1] = r.q;
    out.counts[i] = r.idx.length;
    out.idx.set(r.idx, k);
    out.val.set(r.val, k);
    k += r.idx.length;
  });
  return { out, rows, nnz, moves: state.getMoveCount(), winner };
}

async function workerMain() {
  const { gameId, model, sims, games, maxMoves, tempMoves } = workerData;
  const game = await loadGame(gameId);
  const evaluator = model
    ? await (await import("../common/evaluators.js")).OnnxEvaluator.create(model)
    : new HeuristicEvaluator();
  const mcts = new MCTS(evaluator, { ...game.mcts, simulations: sims, maxMoves });
  for (let i = 0; i < games; i++) {
    const res = await playGame(game, mcts, { maxMoves, tempMoves });
    // 버퍼를 넘기지(transfer) 않고 복사해서 보냅니다 — 넘긴 채로 스레드가 끝나면 Node 18 이 죽는 경우가 있었음
    parentPort.postMessage(res);
  }
  // 메인 스레드가 모든 메시지를 받았다고 알려줄 때까지 기다렸다가 끝냅니다
  const bye = new Promise(resolve => parentPort.once("message", resolve));
  parentPort.postMessage({ done: true });
  await bye;
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
  const stateSize = stateSizeOf(game);

  await fs.promises.mkdir(path.dirname(path.resolve(out)), { recursive: true });
  // 구역마다 임시 파일에 쌓았다가 마지막에 하나로 합칩니다
  const parts = Object.fromEntries(SECTIONS.map(name => [name, `${out}.${name}.part`]));
  const fds = Object.fromEntries(SECTIONS.map(name => [name, fs.openSync(parts[name], "w")]));

  console.log(`🔄 self-play [${gameId}]: ${games}판, sims=${sims}, workers=${workers}, 평가기=${model ?? "heuristic"}`);
  const t0 = Date.now();
  let done = 0, rows = 0, nnz = 0, totalMoves = 0;
  const wins = { 0: 0, 1: 0, 2: 0 };

  const self = fileURLToPath(import.meta.url);
  await Promise.all(Array.from({ length: workers }, (_, w) => {
    const share = Math.floor(games / workers) + (w < games % workers ? 1 : 0);
    return new Promise((resolve, reject) => {
      const worker = new Worker(self, { workerData: { gameId, model, sims, games: share, maxMoves, tempMoves } });
      worker.on("message", msg => {
        if (msg.done) { worker.postMessage("bye"); return; }
        const { out: o, rows: r, nnz: z, moves, winner } = msg;
        for (const name of SECTIONS) fs.writeSync(fds[name], Buffer.from(o[name].buffer, o[name].byteOffset, o[name].byteLength));
        done++;
        rows += r;
        nnz += z;
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

  const tmpPath = out + ".part";
  const fd = fs.openSync(tmpPath, "w");
  const offsets = {};
  let pos = 0;
  for (const name of SECTIONS) {
    fs.closeSync(fds[name]);
    offsets[name] = pos;
    // 2GB 를 넘을 수 있으므로 나눠서 복사
    const src = fs.openSync(parts[name], "r");
    const chunk = Buffer.allocUnsafe(64 << 20);
    for (let n; (n = fs.readSync(src, chunk, 0, chunk.length, null)) > 0;) {
      fs.writeSync(fd, chunk, 0, n);
      pos += n;
    }
    fs.closeSync(src);
    const pad = pad4(pos) - pos;
    if (pad) { fs.writeSync(fd, Buffer.alloc(pad)); pos += pad; }
    fs.unlinkSync(parts[name]);
  }
  fs.closeSync(fd);
  fs.renameSync(tmpPath, out);
  const meta = { format: FORMAT, game: gameId, games, sims, model, rows, nnz, offsets,
                 stateShape: game.inputShape, stateSize, policySize: game.policySize,
                 policyPlanes: game.policyPlanes, avgMoves: totalMoves / games, wins,
                 seconds: (Date.now() - t0) / 1000 };
  fs.writeFileSync(out.replace(/\.bin$/, ".json"), JSON.stringify(meta, null, 2));
  console.log(`✅ ${rows}개 샘플 저장: ${out} (${meta.seconds.toFixed(0)}초)`);
}

// 오류는 동기로 바로 써야 파이프(파이프라인 로그)에서 사라지지 않습니다
const die = e => { fs.writeSync(2, `❌ selfplay 오류: ${e?.stack ?? e}\n`); process.exit(1); };
if (isMainThread) {
  main().catch(die);
} else {
  workerMain().catch(die);
}
