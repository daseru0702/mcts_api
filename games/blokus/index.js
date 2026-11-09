// games/blokus/index.js — 블로커스 듀오 설명서(manifest)

import { BlokusAdapter } from "./BlokusAdapter.js";

export default {
  id: "blokus",
  name: "블로커스 듀오",
  title: "Blokus Duo Zero",
  subtitle: "몬테카를로 트리 탐색 + 신경망으로 스스로 학습한 블로커스 듀오 AI",
  order: 2,   // 웹 게임 목록 순서 (첫 게임이 기본 화면)
  Adapter: BlokusAdapter,
  // 한 판은 배치 최대 42수 + 패스 2수 정도라 수 제한에 걸리지 않습니다
  selfplay: { maxMoves: 100, tempMoves: 8 },
  // 둘 곳이 평균 200개라 쿼리도 설정으로는 탐색이 후보 8개쯤에 몰립니다.
  // 처음 보는 수를 부모 가치로 평가(fpu 0)하고, 노이즈를 소수 후보에 몰아주면(α≈10/평균 합법 수) 30개 안팎을 살펴봅니다.
  mcts: { fpuReduction: 0, dirichletAlpha: 0.05 },
  arena: { maxMoves: 100 },

  // 웹 화면: 이 파일 기준 상대 경로
  view: "./view.js",
  hint: "아래에서 조각을 고른 뒤, 초록 점에 꼭짓점이 닿게 놓으세요. R 회전 · F 뒤집기",
  loseTip: "큰 조각부터 놓고, AI가 뻗어 나갈 모서리를 먼저 막아 보세요.",
};
