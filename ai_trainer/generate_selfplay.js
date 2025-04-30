// ai_trainer/generate_selfplay.js

import fs from "fs";
import path from "path";

// 게임 로직 및 MCTS 모듈 불러오기
import { QuoridorGame } from "../client/games/quoridor/QuoridorGame.js";
import { QuoridorAdapter } from "../ai_server/games/quoridor/QuoridorAdapter.js";
import { MCTS } from "../ai_server/games/quoridor/mcts.js";

// 설정
const NUM_GAMES = 100;         // 생성할 self-play 게임 수
const SIM_LIMIT = 200;         // 각 턴당 MCTS 시뮬레이션 횟수
const OUT_DIR   = path.resolve("ai_trainer/data");
const OUT_FILE  = path.join(OUT_DIR, "quoridor_selfplay.json");

// 상태 직렬화 함수: [채널][y][x] 이중 배열로 반환
function serializeState(game) {
  const N = game.boardSize;
  // 채널 0: 플레이어1 위치
  const c0 = Array.from({ length: N }, () => Array(N).fill(0));
  c0[game.pawns[1].y][game.pawns[1].x] = 1;
  // 채널 1: 플레이어2 위치
  const c1 = Array.from({ length: N }, () => Array(N).fill(0));
  c1[game.pawns[2].y][game.pawns[2].x] = 1;
  // 채널 2: 가로벽 (8×9)
  const c2 = Array.from({ length: N-1 }, () => Array(N).fill(0));
  game.placedWalls
    .filter(w => w.orientation === "h")
    .forEach(w => { c2[w.y][w.x] = 1; });
  // 채널 3: 세로벽 (9×8)
  const c3 = Array.from({ length: N }, () => Array(N-1).fill(0));
  game.placedWalls
    .filter(w => w.orientation === "v")
    .forEach(w => { c3[w.y][w.x] = 1; });

  return [c0, c1, c2, c3];
}

async function main() {
  // 출력 폴더 및 파일 준비
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const dataset = { states: [], policies: [], values: [] };

  for (let g = 0; g < NUM_GAMES; g++) {
    const game = new QuoridorGame();
    const trajectory = [];

    // 한 게임 self-play
    while (true) {
      // 1) 상태 직렬화
      const state = serializeState(game);

      // 2) MCTS 탐색
      const adapter = new QuoridorAdapter(game.clone());
      const tree    = new MCTS(adapter, { simulationLimit: SIM_LIMIT });
      tree.runSearch();

      // 3) 방문 횟수 → π 분포
      const visits = tree.root.children.map(c => c.visits);
      const total  = visits.reduce((a,b) => a + b, 0) || 1;
      const pi     = visits.map(v => v / total);

      // 4) 궤적에 저장
      trajectory.push({ state, pi, player: game.currentPlayer });

      // 5) 최적 수 둔 뒤 게임 진행
      const mv = tree.bestMove();
      game.applyMove(mv);

      // 6) 종결 조건 검사
      if (game.pawns[1].y === game.boardSize - 1 || game.pawns[2].y === 0) {
        const winner = (game.pawns[1].y === game.boardSize - 1) ? 1 : 2;
        // 가중치와 값 저장
        for (const { state, pi, player } of trajectory) {
          dataset.states.push(state);
          dataset.policies.push(pi);
          dataset.values.push(player === winner ? 1 : 0);
        }
        break;
      }
    }

    console.log(`Completed self-play game ${g+1}/${NUM_GAMES}`);
  }

  // JSON으로 쓰기
  fs.writeFileSync(OUT_FILE, JSON.stringify(dataset));
  console.log(`Saved self-play data to ${OUT_FILE}`);
}

main();
