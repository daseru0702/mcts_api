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

  const loaded = {
    selfplay: {}, arena: {}, ...game,
    id,
    inputShape: A.INPUT_SHAPE,
    policySize: A.POLICY_SIZE,
    symmetries: A.SYMMETRIES ?? [false],
    viewUrl: game.view ? new URL(game.view, url).href : null,
  };
  cache.set(id, loaded);
  return loaded;
}
