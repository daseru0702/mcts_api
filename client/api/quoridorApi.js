// client/api/quoridorApi.js

export async function getBestMove(game) {
    const res = await fetch("https://<YOUR_VPS>/best-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameState: serializeGame(game),   // QuoridorGame → 순수 JS 객체
        simLimit: 500
      })
    });
    const { move } = await res.json();
    return move; // { type, x, y, orientation? }
  }
  
  // 필요하다면 게임 상태 직렬화 함수
  function serializeGame(game) {
    return {
      boardSize: game.boardSize,
      pawns: game.pawns,
      wallCounts: game.wallCounts,
      currentPlayer: game.currentPlayer,
      placedWalls: game.placedWalls
    };
  }
  