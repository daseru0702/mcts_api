// tests/run_tests.js — npm test
//
// games/ 의 모든 게임에 대해
//   1) 어댑터 규약 테스트 (공통 코드가 기대하는 동작)
//   2) games/<id>/tests.js 가 있으면 그 게임의 규칙 테스트
// 를 실행합니다. 새 게임을 추가하면 자동으로 포함됩니다.
import assert from "assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { loadGame } from "../common/games.js";
import { listGameIds } from "../common/game_registry.js";
import { MCTS } from "../common/mcts.js";
import { HeuristicEvaluator } from "../common/heuristic_evaluator.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    console.error(`  ✘ ${name}\n`, e);
    process.exitCode = 1;
  }
}

function randomPlayout(game, maxMoves) {
  const s = new game.Adapter();
  const states = [];
  while (!s.isTerminal() && s.getMoveCount() < maxMoves) {
    states.push(s.clone());
    const moves = s.getPossibleMoves();
    s.applyMove(moves[Math.floor(Math.random() * moves.length)]);
  }
  return { states, final: s };
}

async function contractTests(game) {
  const A = game.Adapter;
  const stateSize = game.inputShape.reduce((a, b) => a * b, 1);
  const maxMoves = game.selfplay.maxMoves ?? 200;

  await test("encode() 길이 = INPUT_SHAPE, 정책 인덱스는 고유하고 범위 안", () => {
    for (let t = 0; t < 10; t++) {
      for (const s of randomPlayout(game, maxMoves).states) {
        const moves = s.getPossibleMoves();
        assert.ok(moves.length > 0, "끝나지 않은 상태에는 합법 수가 있어야 함");
        for (const sym of game.symmetries) {
          assert.equal(s.encode(sym).length, stateSize);
          const idx = moves.map(m => s.moveToIndex(m, sym));
          assert.equal(new Set(idx).size, idx.length, "같은 상태의 서로 다른 수가 같은 인덱스");
          assert.ok(idx.every(i => Number.isInteger(i) && i >= 0 && i < game.policySize));
        }
      }
    }
  });

  await test("clone() 은 독립적, toJSON() → new Adapter() 왕복", () => {
    const { states } = randomPlayout(game, maxMoves);
    for (const s of states.slice(-5)) {
      const before = JSON.stringify(s.toJSON());
      const c = s.clone();
      c.applyMove(c.getPossibleMoves()[0]);
      assert.equal(JSON.stringify(s.toJSON()), before, "clone 에 둔 수가 원본을 바꿈");
      const r = new A(JSON.parse(before));
      assert.deepEqual(r.getPossibleMoves(), s.getPossibleMoves());
      assert.equal(r.getCurrentPlayer(), s.getCurrentPlayer());
    }
  });

  await test("끝난 상태의 getWinner() 는 1 또는 2, 진행 중은 0", () => {
    for (let t = 0; t < 10; t++) {
      const { states, final } = randomPlayout(game, maxMoves * 5);
      assert.ok(states.every(s => s.getWinner() === 0));
      if (final.isTerminal()) assert.ok([1, 2].includes(final.getWinner()));
    }
  });

  await test("MCTS 가 합법 수를 고름 (휴리스틱 평가기)", async () => {
    const s = new A();
    const mcts = new MCTS(new HeuristicEvaluator(), { simulations: 50 });
    const root = await mcts.search(s);
    const mv = mcts.bestMove(root);
    assert.ok(s.getPossibleMoves().some(m => JSON.stringify(m) === JSON.stringify(mv)));
  });
}

for (const id of listGameIds()) {
  const game = await loadGame(id);
  console.log(`\n[${id}] 어댑터 규약`);
  await contractTests(game);
  const own = path.join(ROOT, "games", id, "tests.js");
  if (fs.existsSync(own)) {
    console.log(`[${id}] 게임 규칙`);
    await (await import(pathToFileURL(own).href)).default(test);
  }
}

console.log(`\n${passed} passed${process.exitCode ? ", 일부 실패" : ""}`);
