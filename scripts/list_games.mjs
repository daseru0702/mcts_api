// scripts/list_games.mjs — games/index.json 내용을 출력 (정적 배포용, 서버는 같은 내용을 동적으로 제공)
import { loadGame } from "../common/games.js";
import { listGameIds } from "../common/game_registry.js";

const list = [];
for (const id of listGameIds()) {
  const g = await loadGame(id);
  list.push({ id, name: g.name ?? id, title: g.title ?? id });
}
console.log(JSON.stringify(list, null, 2));
