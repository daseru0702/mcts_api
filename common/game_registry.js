// common/game_registry.js — games/ 폴더에 있는 게임 목록 (Node 전용)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const GAMES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "games");

export function listGameIds() {
  return fs.readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(GAMES_DIR, d.name, "index.js")))
    .map(d => d.name)
    .sort();
}

/** --game 값이 없으면 게임이 하나뿐일 때 그 게임을 씁니다 */
export function resolveGameId(arg) {
  const ids = listGameIds();
  if (arg) {
    if (!ids.includes(arg)) throw new Error(`게임 '${arg}' 이 없습니다. 가능한 게임: ${ids.join(", ")}`);
    return arg;
  }
  if (ids.length === 1) return ids[0];
  throw new Error(`--game=<이름> 을 지정하세요. 가능한 게임: ${ids.join(", ")}`);
}
