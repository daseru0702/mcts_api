// games/blokus/tests.js — 블로커스 듀오 규칙 테스트 (npm test 가 실행)
import assert from "assert/strict";
import { BlokusGame, N, START } from "./BlokusGame.js";
import { BlokusAdapter, POLICY_SIZE, PASS_INDEX } from "./BlokusAdapter.js";
import { PIECES, ORIENTS, TOTAL_SQUARES, ORIENT_ROT180, ORIENT_TRANSPOSE } from "./pieces.js";
import { MCTS } from "../../common/mcts.js";
import { UniformEvaluator } from "../../common/heuristic_evaluator.js";

const cellSet = cells => new Set(cells);
const xy = c => [c % N, (c / N) | 0];

function randomGame(stopAt = Infinity) {
  const s = new BlokusAdapter();
  while (!s.isTerminal() && s.getMoveCount() < stopAt) {
    const ms = s.getPossibleMoves();
    s.applyMove(ms[Math.floor(Math.random() * ms.length)]);
  }
  return s;
}

export default async function (test) {
  await test("조각 21종 89칸, 방향 91가지", () => {
    assert.equal(PIECES.length, 21);
    assert.equal(TOTAL_SQUARES, 89);
    assert.equal(ORIENTS.length, 91);
    assert.equal(POLICY_SIZE, 91 * 196 + 1);
  });

  await test("첫 수는 자기 시작점을 덮어야 함", () => {
    const g = new BlokusGame();
    const ms = g.getPlacements();
    assert.ok(ms.length > 0);
    assert.ok(ms.every(m => BlokusGame.cellsOf(m).includes(START[1])));
    g.applyMove(ms[0]);
    assert.ok(g.getPlacements().every(m => BlokusGame.cellsOf(m).includes(START[2])));
  });

  await test("내 조각과 변으로 닿으면 안 되고 꼭짓점으로는 닿아야 함", () => {
    for (let t = 0; t < 20; t++) {
      const s = randomGame(6 + t);
      if (s.isTerminal()) continue;
      const g = s.game, p = g.currentPlayer;
      for (const m of g.getPlacements()) {
        const cells = BlokusGame.cellsOf(m);
        const near = (c, ds) => ds.some(([dx, dy]) => {
          const [x, y] = xy(c), nx = x + dx, ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < N && ny < N && g.board[ny * N + nx] === p;
        });
        assert.ok(cells.every(c => g.board[c] === 0), "빈칸에만");
        assert.ok(!cells.some(c => near(c, [[1, 0], [-1, 0], [0, 1], [0, -1]])), "변으로 닿음");
        if (g.placedSquares[p] > 0) assert.ok(cells.some(c => near(c, [[1, 1], [1, -1], [-1, 1], [-1, -1]])), "꼭짓점 안 닿음");
        assert.ok(g.isLegalMove(m));
      }
    }
  });

  await test("빠른 합법 수 생성 = 모든 방향·위치 전수 검사", () => {
    for (let t = 0; t < 8; t++) {
      const s = randomGame(t * 4);
      if (s.isTerminal()) continue;
      const g = s.game, all = [];
      for (let o = 0; o < ORIENTS.length; o++) {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const m = { type: "place", piece: ORIENTS[o].piece, orient: o, x, y };
          if (g.isLegalMove(m)) all.push(`${o},${x},${y}`);
        }
      }
      const fast = g.getPlacements().map(m => `${m.orient},${m.x},${m.y}`);
      assert.deepEqual(fast.sort(), all.sort());
    }
  });

  await test("합법 수 목록에 중복이 없고, 같은 조각은 두 번 못 놓음", () => {
    const s = randomGame(10);
    const ms = s.getPossibleMoves();
    const keys = ms.map(m => JSON.stringify(m));
    assert.equal(new Set(keys).size, keys.length);
    const used = s.game.placements.filter(m => m.player === s.getCurrentPlayer()).map(m => m.piece);
    assert.ok(ms.every(m => m.type === "pass" || !used.includes(m.piece)));
  });

  await test("놓을 곳이 없으면 패스만 가능, 둘 다 패스하면 끝, 점수로 승패", () => {
    for (let t = 0; t < 5; t++) {
      const s = randomGame();
      const g = s.game;
      assert.ok(g.passed[1] && g.passed[2]);
      const d = g.score(1) - g.score(2);
      assert.equal(s.getWinner(), d > 0 ? 1 : d < 0 ? 2 : 0);
      assert.ok(s.getMoveCount() <= 44);
    }
    const g = new BlokusGame();
    g.passed[1] = true;
    assert.deepEqual(g.getAllMoves(), [{ type: "pass" }]);
  });

  await test("무승부(점수 같음)는 승자 0, MCTS 끝 노드 가치 0", async () => {
    const s = new BlokusAdapter({ placements: [], passed: { 1: true, 2: true }, currentPlayer: 1, moveCount: 2 });
    assert.ok(s.isTerminal());
    assert.equal(s.getWinner(), 0);
    const root = await new MCTS(new UniformEvaluator(), { simulations: 5 }).search(s);
    assert.equal(root.terminalValue, 0);
  });

  await test("정책 인덱스: 대칭·180° 회전한 칸 모양과 일치", () => {
    const decode = idx => {
      const o = Math.floor(idx / 196), a = idx % 196;
      const ax = a % N, ay = (a / N) | 0;
      return ORIENTS[o].cells.map(([dx, dy]) => (ay + dy) * N + ax + dx);
    };
    for (let t = 0; t < 10; t++) {
      const s = randomGame(3 + t);
      if (s.isTerminal()) continue;
      const rot = s.getCurrentPlayer() === 2;
      for (const sym of [false, true]) {
        for (const m of s.getPossibleMoves()) {
          const idx = s.moveToIndex(m, sym);
          if (m.type === "pass") { assert.equal(idx, PASS_INDEX); continue; }
          const want = cellSet(BlokusGame.cellsOf(m).map(c => {
            let [x, y] = xy(c);
            if (rot) { x = N - 1 - x; y = N - 1 - y; }
            if (sym) [x, y] = [y, x];
            return y * N + x;
          }));
          assert.deepEqual(cellSet(decode(idx)), want);
        }
      }
    }
    assert.ok(ORIENT_ROT180.every(o => o >= 0) && ORIENT_TRANSPOSE.every(o => o >= 0));
  });

  await test("encode: 내 칸은 항상 시작점 (4,4) 쪽 기준", () => {
    const s = new BlokusAdapter();
    s.applyMove(s.getPossibleMoves().find(m => m.piece === 0)); // P1: (4,4) 에 1칸
    s.applyMove(s.getPossibleMoves().find(m => m.piece === 0)); // P2: (9,9) 에 1칸
    const e = s.encode(false); // P1 차례
    assert.equal(e[4 * N + 4], 1);
    assert.equal(e[196 + 9 * N + 9], 1);
    s.applyMove(s.getPossibleMoves()[0]);
    const e2 = s.encode(false); // P2 차례: 자기 (9,9) 가 (4,4) 로 보임
    assert.equal(e2[4 * N + 4], 1);
  });
}
