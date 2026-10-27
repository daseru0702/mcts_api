// games/quoridor/index.js
//
// 게임 설명서(manifest). 공통 코드(학습·서버·웹)는 games/<id>/index.js 만 보고 게임을 다룹니다.
// 새 게임은 같은 모양의 폴더를 추가하면 되고, 공통 코드는 고치지 않습니다.

import { QuoridorAdapter } from "./QuoridorAdapter.js";

export default {
  id: "quoridor",
  name: "쿼리도",
  title: "Quoridor Zero",
  subtitle: "몬테카를로 트리 탐색 + 신경망으로 스스로 학습한 쿼리도 AI",

  // MCTS·신경망이 쓰는 상태 클래스 (인터페이스는 README "게임 추가하기" 참고)
  Adapter: QuoridorAdapter,

  // 자가대국/대결 설정
  selfplay: { maxMoves: 160, tempMoves: 10 },
  arena: { maxMoves: 200 },

  // 웹 화면: 이 파일 기준 상대 경로
  view: "./view.js",
  hint: "초록 점을 눌러 말을 옮기거나, 칸 사이 홈을 눌러 벽을 세우세요.",
  loseTip: "벽으로 AI의 길을 막아 보세요. 난이도를 낮춰도 좋아요.",
};
