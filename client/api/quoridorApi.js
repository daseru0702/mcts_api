// client/api/quoridorApi.js

const API_URL = "http://localhost:8000/best-move";

export async function getBestMove(game) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameState: serializeGame(game),
      simLimit: 500
    })
  });

  if (!res.ok) {
    throw new Error(`AI 서버 응답 에러: ${res.status}`);
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
