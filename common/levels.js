// common/levels.js — 난이도별 탐색 설정 (서버/브라우저 공용)

export const LEVELS = {
  easy:   { simulations: 40,  temperature: 1 },
  normal: { simulations: 300, temperature: 0 },
  hard:   { simulations: 1200, temperature: 0 },
};
