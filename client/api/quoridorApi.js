// client/api/quoridorApi.js

const API_URL = "http://localhost:3000/best-move";

export async function getBestMove(gameName, stateTensor, simLimit = 1000) {
  const raw = stateTensor.dataSync ? stateTensor.dataSync() : stateTensor.data;
  const stateArr = Array.from(raw);

  const res = await fetch(`http://localhost:3000/best-move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameName, state: stateArr, simLimit }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`AI 서버 응답 에러: ${res.status} ${err.error||''}`);
  }
  const { move } = await res.json();
  return move;
}

function serializeGame(game) {
  return {
    boardSize:      game.boardSize,
    pawns:          game.pawns,
    wallCounts:     game.wallCounts,
    currentPlayer:  game.currentPlayer,
    placedWalls:    game.placedWalls
  };
}
