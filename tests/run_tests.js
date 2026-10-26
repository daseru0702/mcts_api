// tests/run_tests.js — node tests/run_tests.js
import assert from "assert/strict";
import { QuoridorGame } from "../games/quoridor/QuoridorGame.js";
import { QuoridorAdapter, POLICY_SIZE } from "../games/quoridor/QuoridorAdapter.js";
import { MCTS } from "../common/mcts.js";
import { HeuristicEvaluator } from "../common/evaluators.js";

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

function key(m) {
  return m.type === "move" ? `m${m.x},${m.y}` : `w${m.x},${m.y}${m.orientation}`;
}

function randomGame(maxMoves = 120, wallBias = 0.4) {
  const g = new QuoridorGame();
  const states = [];
  while (!g.isOver() && g.moveCount < maxMoves) {
    states.push(g.clone());
    const pawn = g.getLegalPawnMoves();
    const walls = g.getLegalWallMoves();
    const pool = walls.length && Math.random() < wallBias ? walls : pawn;
    g.applyMove(pool[Math.floor(Math.random() * pool.length)]);
  }
  return states;
}

await test("빠른 벽 생성 = 전수 검사 결과", () => {
  for (let t = 0; t < 30; t++) {
    for (const g of randomGame()) {
      const fast = new Set(g.getLegalWallMoves().map(key));
      const brute = new Set();
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) for (const o of ["h", "v"]) {
        const m = { type: "wall", x, y, orientation: o };
        if (g.isValidWallPlacement(m)) brute.add(key(m));
      }
      assert.deepEqual([...fast].sort(), [...brute].sort());
    }
  }
});

await test("점프와 대각선 이동", () => {
  const g = new QuoridorGame();
  g.pawns[1] = { x: 4, y: 4 };
  g.pawns[2] = { x: 4, y: 5 };
  assert.ok(g.getLegalPawnMoves(1).some(m => m.x === 4 && m.y === 6));
  // 상대 뒤에 가로벽 → 대각선
  g.applyMove({ type: "wall", x: 3, y: 5, orientation: "h" });
  g.currentPlayer = 1;
  const keys = g.getLegalPawnMoves(1).map(key).sort();
  assert.deepEqual(keys, ["m3,4", "m3,5", "m4,3", "m5,4", "m5,5"].sort());
});

await test("벽은 이동을 막고 경로를 완전히 막을 수 없음", () => {
  const g = new QuoridorGame();
  g.applyMove({ type: "wall", x: 3, y: 0, orientation: "h" });
  assert.ok(!g.canStep(4, 0, 0, 1));
  assert.ok(g.canStep(5, 0, 0, 1));
  const g2 = new QuoridorGame();
  // y=0 아래를 전부 막는 시도: 마지막 벽은 불가능해야 함
  for (const x of [0, 2, 4, 6]) {
    g2.currentPlayer = 2;
    assert.ok(g2.isValidWallPlacement({ type: "wall", x, y: 0, orientation: "h" }));
    g2.applyMove({ type: "wall", x, y: 0, orientation: "h" });
  }
  g2.currentPlayer = 2;
  g2.pawns[1] = { x: 8, y: 0 };
  g2.applyMove({ type: "wall", x: 7, y: 0, orientation: "v" });
  g2.currentPlayer = 2;
  assert.ok(!g2.isValidWallPlacement({ type: "wall", x: 7, y: 1, orientation: "v" }) ||
            g2.shortestDistance(1) > 0);
});

await test("JSON 왕복", () => {
  for (const g of randomGame().slice(-5)) {
    const r = QuoridorGame.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    assert.deepEqual(r.getAllMoves().map(key), g.getAllMoves().map(key));
    assert.deepEqual(Array.from(r.hBlock), Array.from(g.hBlock));
    assert.deepEqual(Array.from(r.vBlock), Array.from(g.vBlock));
  }
});

await test("정책 인덱스: 고유, 범위 내, 좌우반전 일관성", () => {
  for (const g of randomGame()) {
    const s = new QuoridorAdapter(g);
    const moves = s.getPossibleMoves();
    const idx = moves.map(m => s.moveToIndex(m));
    assert.equal(new Set(idx).size, idx.length);
    assert.ok(idx.every(i => i >= 0 && i < POLICY_SIZE));

    // 좌우 반전한 게임을 만들어 인코딩/인덱스가 mirror=true 결과와 같은지 확인
    const m = new QuoridorGame();
    m.currentPlayer = g.currentPlayer;
    m.wallCounts = { ...g.wallCounts };
    m.pawns = { 1: { x: 8 - g.pawns[1].x, y: g.pawns[1].y }, 2: { x: 8 - g.pawns[2].x, y: g.pawns[2].y } };
    for (const w of g.placedWalls) {
      m._setWallBlocks(7 - w.x, w.y, w.orientation, 1);
      (w.orientation === "h" ? m.hWalls : m.vWalls)[w.y * 8 + 7 - w.x] = 1;
      m.placedWalls.push({ ...w, x: 7 - w.x });
    }
    const sm = new QuoridorAdapter(m);
    assert.deepEqual(Array.from(sm.encode()), Array.from(s.encode(true)));
    const mirroredIdx = new Set(moves.map(mv => s.moveToIndex(mv, true)));
    assert.deepEqual([...new Set(sm.getPossibleMoves().map(mv => sm.moveToIndex(mv)))].sort(), [...mirroredIdx].sort());
  }
});

await test("canonical 인코딩: P1/P2 대칭 위치는 같은 입력", () => {
  const a = new QuoridorGame();
  const b = new QuoridorGame();
  b.currentPlayer = 2;
  assert.deepEqual(Array.from(new QuoridorAdapter(a).encode()), Array.from(new QuoridorAdapter(b).encode()));
});

await test("MCTS: 한 수 만에 이기는 수를 찾음 (양쪽 플레이어)", async () => {
  for (const p of [1, 2]) {
    const g = new QuoridorGame();
    g.pawns[1] = { x: 0, y: p === 1 ? 7 : 3 };
    g.pawns[2] = { x: 8, y: p === 2 ? 1 : 5 };
    g.currentPlayer = p;
    const mcts = new MCTS(new HeuristicEvaluator(), { simulations: 200 });
    const root = await mcts.search(new QuoridorAdapter(g));
    const mv = mcts.bestMove(root);
    assert.equal(mv.type, "move");
    assert.equal(mv.y, p === 1 ? 8 : 0);
    assert.ok(mcts.stats(root).value > 0.9);
  }
});

console.log(`\n${passed} passed${process.exitCode ? ", 일부 실패" : ""}`);
