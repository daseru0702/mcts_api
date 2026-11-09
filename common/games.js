// common/games.js
//
// 게임 이름으로 games/<id>/index.js 를 불러옵니다 (브라우저/Node 공용).
// 공통 코드는 특정 게임을 import 하지 않고 항상 이 함수를 거칩니다.

const REQUIRED_METHODS = [
  "clone", "getPossibleMoves", "applyMove", "isTerminal", "getWinner",
  "getCurrentPlayer", "getMoveCount", "encode", "moveToIndex", "toJSON",
];

const cache = new Map();

export async function loadGame(id) {
  if (!/^[a-z0-9_-]+$/.test(id ?? "")) throw new Error(`잘못된 게임 이름: ${id}`);
  if (cache.has(id)) return cache.get(id);

  const url = new URL(`../games/${id}/index.js`, import.meta.url);
  const game = (await import(url.href)).default;
  const A = game?.Adapter;
  if (!A) throw new Error(`${id}: index.js 가 Adapter 를 내보내지 않습니다`);
  const missing = REQUIRED_METHODS.filter(m => typeof A.prototype[m] !== "function");
  if (missing.length) throw new Error(`${id}: Adapter 에 필요한 메서드가 없습니다: ${missing.join(", ")}`);
  if (!Array.isArray(A.INPUT_SHAPE) || A.INPUT_SHAPE.length !== 3) throw new Error(`${id}: Adapter.INPUT_SHAPE = [C, H, W] 가 필요합니다`);
  if (!Number.isInteger(A.POLICY_SIZE)) throw new Error(`${id}: Adapter.POLICY_SIZE 가 필요합니다`);
  // 선택: 정책 앞부분이 [POLICY_PLANES, H, W] 격자 모양이면 학습이 합성곱 정책 출력층을 씁니다
  //       (인덱스 = 평면 × H×W + y × W + x, 나머지 POLICY_SIZE - POLICY_PLANES×H×W 개는 패스 같은 특수 수)
  const planes = A.POLICY_PLANES ?? 0;
  const [, H, W] = A.INPUT_SHAPE;
  if (!Number.isInteger(planes) || planes < 0 || planes * H * W > A.POLICY_SIZE) {
    throw new Error(`${id}: Adapter.POLICY_PLANES × H × W 가 POLICY_SIZE 보다 큽니다`);
  }

  const loaded = {
    selfplay: {}, arena: {}, mcts: {}, ...game,
    id,
    inputShape: A.INPUT_SHAPE,
    policySize: A.POLICY_SIZE,
    policyPlanes: planes,
    symmetries: A.SYMMETRIES ?? [false],
    viewUrl: game.view ? new URL(game.view, url).href : null,
  };
  cache.set(id, loaded);
  return loaded;
}
