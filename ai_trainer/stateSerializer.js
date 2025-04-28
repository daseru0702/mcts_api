// ai_trainer/stateSerializer.js

export function serializeState(game) {
  // 채널 4개: player1 pawn, player2 pawn, h-walls, v-walls
  const C=4, N=9, size=C*N*N;
  const buf = new Float32Array(size);
  // 0: player1 위치
  const p1 = game.pawns[1]; buf[p1.y*N + p1.x] = 1;
  // 1: player2 위치
  const p2 = game.pawns[2]; buf[N*N + p2.y*N + p2.x] = 1;
  // 2: 가로벽
  for (const w of game.placedWalls.filter(w=>w.orientation==="h")) {
    // (x,y) → flatten index in channel2
    buf[2*N*N + w.y*(2*N-1) + w.x] = 1;
  }
  // 3: 세로벽
  for (const w of game.placedWalls.filter(w=>w.orientation==="v")) {
    buf[3*N*N + w.y*N + w.x] = 1;
  }
  return buf;
}
