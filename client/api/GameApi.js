// client/api/gameApi.js

export async function getBestMove(gameName, state, simLimit = 200) {
    const res = await fetch("/best-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameName, gameState: state, simLimit })
    });
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return res.json(); // { move }
  }
  