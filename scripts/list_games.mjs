// scripts/list_games.mjs — games/index.json 내용을 출력 (정적 배포용, 서버는 같은 내용을 동적으로 제공)
import { loadGame } from "../common/games.js";
import { listGameIds } from "../common/game_registry.js";

const list = [];
for (const id of listGameIds()) {
  const g = await loadGame(id);
  if (!g.viewUrl) continue; // 화면(view.js)이 아직 없는 게임은 웹 목록에서 제외
  list.push({ id, name: g.name ?? id, title: g.title ?? id, order: g.order ?? 99 });
}
// 첫 게임이 기본 화면입니다 (manifest 의 order 가 작은 순)
list.sort((a, b) => a.order - b.order);
console.log(JSON.stringify(list, null, 2));
