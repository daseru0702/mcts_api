// ai_trainer/generate_selfplay.js

import fs from "fs-extra";
import path from "path";
import { GAMES } from "./config.js";
import { AdapterFactory } from "../common/AdapterFactory.js";
import { MCTSPure as MCTS } from "../common/mcts_pure.js";

async function main() {
  const gameName = process.argv[2];
  if (!GAMES[gameName]) {
    console.error("Usage: node generate_selfplay.js <gameName>");
    process.exit(1);
  }
  const cfg = GAMES[gameName];

  // 출력 디렉터리 준비
  const OUT_DIR = path.resolve("data");
  await fs.ensureDir(OUT_DIR);

  console.log(`\n🔄 Self-play 시작: 게임=${gameName}, 시뮬레이션 한계=${cfg.simLimit}, 게임 수=${cfg.selfPlayGames || 5}`);
  console.time("총 self-play 시간");

  // 데이터 담을 그릇
  const dataset = { states: [], policies: [], values: [] };

  // 몇 판을 돌릴지 config에 없으면 기본 5판
  const numGames = cfg.selfPlayGames ?? 5;

  for (let g = 0; g < numGames; g++) {
    console.log(`\n▶️ **Game ${g+1}/${numGames}** 시작`);
    console.time(`Game ${g+1} 시간`);

    // 새 Adapter 생성 (stateJson = null)
    const adapter = await AdapterFactory.create(gameName, null);
    const trajectory = [];

    // MCTS 옵션
    const treeOpts = { simulationLimit: cfg.simLimit };

    // 한 게임 진행
    let moveCount = 0;
    while (true) {
      // 1) 현재 상태 직렬화
      const { data, shape } = adapter.getStateTensor();
      trajectory.push({ state: data, shape, player: adapter.getCurrentPlayer() });

      // 2) MCTS 탐색
      const tree = new MCTS(adapter.clone(), treeOpts);
      // 디버그: 매 50시뮬레이션마다 로그
      for (let i = 0; i < treeOpts.simulationLimit; i++) {
        tree.runSearch(); // pure MCTS는 sync
        if (i > 0 && i % 50 === 0) {
          process.stdout.write(`  · sim ${i}/${treeOpts.simulationLimit}\r`);
        }
      }
      process.stdout.write("\n");
      
      // 3) 방문 기록으로 정책 분포 계산
      const visits = tree.root.children.map(c => c.visits);
      const total  = visits.reduce((a,b) => a+b, 0) || 1;
      const pi     = visits.map(v => v/total);

      // 4) best move
      const mv = tree.bestMove();
      if (!mv) {
        console.warn("  ⚠️ bestMove() returned null — 이 게임 조기 종료");
        break;
      }
      adapter.applyMove(mv);
      moveCount++;
      console.log(`  🕹  Move ${moveCount}:`, mv);

      // 5) 종료 검사
      if (adapter.isTerminal()) {
        const winner = adapter.getCurrentPlayer();
        console.log(`  🏁 게임 종료! 승자: Player ${winner}`);
        // trajectory에 기록된 모든 step에 값(value) 채우기
        for (const step of trajectory) {
          dataset.states.push(step.state);
          dataset.policies.push(pi);
          dataset.values.push(step.player === winner ? 1 : 0);
        }
        break;
      }
    }

    console.timeEnd(`Game ${g+1} 시간`);
  }

  // 파일로 저장
  const OUT_FILE = path.join(OUT_DIR, `${gameName}_selfplay.json`);
  await fs.writeJson(OUT_FILE, dataset);
  console.log(`\n✅ Self-play 데이터 저장 완료: ${OUT_FILE}`);
  console.timeEnd("총 self-play 시간");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
