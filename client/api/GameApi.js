// client/api/gameApi.js

const BASE = '';

export async function getBestMove(gameName, state, simLimit) {
  const res = await fetch(`${BASE}/best-move`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ gameName, state, simLimit })
  });
  const { move } = await res.json();
  return move;
}
